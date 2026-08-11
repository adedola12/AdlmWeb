// MS Project file parsers.
//
// Two paths:
//   parseMsProjectXml(buffer)  — parses Microsoft Project's native XML
//     export (Save As → .xml). This is the documented, public format
//     (http://schemas.microsoft.com/project) and we can parse it without
//     pulling in a heavy XML library: each <Task>...</Task> block is
//     self-contained and we extract well-known leaf elements via tagged
//     regexes. Good enough for our schema; if a field is missing we use
//     sensible defaults.
//
//   parseMsProjectMpp(buffer) — attempts to parse the proprietary binary
//     .mpp format. There is no pure-JS library that reads modern .mpp
//     files reliably; we sniff for the OLE2 / compound-file signature so
//     we can return a clear, actionable error message. If a Java runtime
//     with the mpxj CLI is available on the server (env MPXJ_CLI_PATH),
//     we shell out to it.
//
// Both return the same normalized shape:
//   {
//     ok: boolean,
//     format: "msproject-xml" | "msproject-mpp",
//     tasks: PmTaskInput[],
//     projectStart?: Date,
//     projectFinish?: Date,
//     baselineDate?: Date,
//     skipped: number,
//     error?: string,
//   }

import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import crypto from "crypto";

const MS_DAY = 24 * 60 * 60 * 1000;

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function decodeXmlEntities(s) {
  if (typeof s !== "string") return "";
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function pickTag(block, tag) {
  // Match the FIRST occurrence of <tag>...</tag> in the block. MS Project
  // uses simple elements (no attributes on the leaves we care about), and
  // nested <Task> won't appear inside another <Task>.
  const m = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`).exec(block);
  return m ? decodeXmlEntities(m[1].trim()) : "";
}

function pickAllBlocks(xml, tag) {
  const out = [];
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "g");
  let m;
  while ((m = re.exec(xml))) {
    out.push(m[1]);
  }
  return out;
}

function parseMsProjectDate(s) {
  if (!s) return null;
  // MS Project XML uses ISO-8601 ("2026-05-21T08:00:00"). Pass through Date.
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

// MS Project XML <Duration> values look like "PT240H0M0S" (ISO 8601 duration).
// Convert to whole days (8h work day).
function parseMsProjectDuration(s) {
  if (!s) return 0;
  const re = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
  const m = re.exec(String(s));
  if (!m) return 0;
  const hours = safeNum(m[1]) + safeNum(m[2]) / 60 + safeNum(m[3]) / 3600;
  // Assume 8h work day to convert hours → days. Edge cases (e.g. elapsed
  // duration) round to nearest day.
  return Math.max(0, Math.round((hours / 8) * 100) / 100);
}

function parseMsProjectPercent(s) {
  const n = safeNum(s);
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

function mapMsProjectPriority(n) {
  const p = safeNum(n);
  if (p >= 800) return "critical";
  if (p >= 600) return "high";
  if (p >= 400) return "medium";
  return "low";
}

// MS Project <TotalSlack> is in MINUTES. Convert to days (8h working
// day, same as parseMsProjectDuration). Returns 0 for missing/invalid
// values; 0 also doubles as the natural "on critical path" signal.
function parseMsProjectSlackDays(raw) {
  const n = safeNum(raw);
  if (n <= 0) return 0;
  // minutes → hours → days
  return Math.max(0, Math.round((n / 60 / 8) * 100) / 100);
}

// Smart priority resolver — most schedulers leave Priority at the
// default 500 (Normal), so importing them all as "medium" loses the
// critical-path signal entirely. This combines the two MS Project
// signals:
//   • If a task is on the critical path AND the user-set priority is
//     below "high", promote it to "high" (or keep "critical" if MS
//     Project already said so).
//   • Tasks with very tight slack (≤ 1 day) but not flagged Critical
//     are also lifted to "high" — they're effectively near-critical.
// The original MS-Project-priority value is preserved on the
// `mspPriority` field so users can revert it from the edit modal.
function resolveTaskPriority({ mspPriority, isCritical, slackDays }) {
  const base = mapMsProjectPriority(mspPriority);
  // Already escalated by the user — leave as-is.
  if (base === "critical") return base;
  if (isCritical) {
    // On the critical path AND not already critical → promote.
    return base === "high" ? "high" : "high";
  }
  if (slackDays > 0 && slackDays <= 1 && base === "low") {
    // Near-critical with low priority looks like a bug. Lift to medium.
    return "medium";
  }
  return base;
}

export function parseMsProjectXml(buffer) {
  const xml = Buffer.isBuffer(buffer) ? buffer.toString("utf8") : String(buffer || "");
  if (!xml.includes("<Project")) {
    return {
      ok: false,
      format: "msproject-xml",
      tasks: [],
      skipped: 0,
      error: "Not a MS Project XML export (no <Project> root element).",
    };
  }

  // Top-level project header
  const projectStart = parseMsProjectDate(
    pickTag(xml, "StartDate") || pickTag(xml, "ProjectStart"),
  );
  const projectFinish = parseMsProjectDate(
    pickTag(xml, "FinishDate") || pickTag(xml, "ProjectFinish"),
  );
  const baselineDate = parseMsProjectDate(pickTag(xml, "CurrentDate"));

  // Tasks live inside <Tasks>...<Task>...</Task><Task>...</Task></Tasks>
  const tasksWrapper = /<Tasks>([\s\S]*?)<\/Tasks>/.exec(xml);
  const taskXml = tasksWrapper ? tasksWrapper[1] : xml;
  const blocks = pickAllBlocks(taskXml, "Task");

  // Build a UID → taskId map so predecessor links resolve.
  const uidToId = new Map();
  const provisional = [];
  let skipped = 0;

  for (const block of blocks) {
    const uid = pickTag(block, "UID");
    const id = pickTag(block, "ID");
    const name = pickTag(block, "Name");
    if (!name) {
      // MS Project emits an empty <Task><UID>0</UID></Task> at the top for
      // the project summary; skip silently.
      skipped += 1;
      continue;
    }
    const taskId = `mp-${uid || id || crypto.randomBytes(4).toString("hex")}`;
    if (uid) uidToId.set(uid, taskId);

    provisional.push({ taskId, uid, block, name });
  }

  const tasks = [];
  for (const { taskId, block, name } of provisional) {
    const startDate = parseMsProjectDate(pickTag(block, "Start"));
    const endDate = parseMsProjectDate(pickTag(block, "Finish"));
    const baselineStart =
      parseMsProjectDate(pickTag(block, "BaselineStart")) || startDate;
    const baselineEnd =
      parseMsProjectDate(pickTag(block, "BaselineFinish")) || endDate;
    const durationDays = parseMsProjectDuration(pickTag(block, "Duration"));
    const percentComplete = parseMsProjectPercent(pickTag(block, "PercentComplete"));
    // IMPORTANT: MS Project's <Cost> field is the computed cost from
    // resource rates × work hours. Even when the user doesn't see a Cost
    // column in Project, Project still writes a value here (often a large
    // resource-derived total). We deliberately do NOT fall back to <Cost> —
    // only an explicit <BaselineCost> (which requires the user to save a
    // baseline) is treated as an imported cost. Tasks without a baseline
    // come in with cost 0 and the user links them to BoQ items.
    const baselineCostRaw = pickTag(block, "BaselineCost");
    const baselineCost = baselineCostRaw ? safeNum(baselineCostRaw) : 0;
    const actualCost = safeNum(pickTag(block, "ActualCost"));
    const mspPriorityRaw = pickTag(block, "Priority");
    // Critical path + slack — MSPDI emits <Critical>1</Critical> for
    // every task that has zero total slack. We trust the flag when
    // present, fall back to TotalSlack == 0 otherwise.
    const isCritical =
      pickTag(block, "Critical") === "1" ||
      safeNum(pickTag(block, "TotalSlack")) === 0;
    const totalSlackDays = parseMsProjectSlackDays(pickTag(block, "TotalSlack"));
    // Resolve the effective priority: combines MSPDI Priority (0-1000)
    // with the critical-path flag so default-Normal tasks on the
    // critical path don't all import as "medium". See resolver above.
    const priority = resolveTaskPriority({
      mspPriority: mspPriorityRaw,
      isCritical,
      slackDays: totalSlackDays,
    });
    const isMilestone = pickTag(block, "Milestone") === "1";
    const isSummary = pickTag(block, "Summary") === "1";
    const wbs = pickTag(block, "WBS") || pickTag(block, "OutlineNumber");
    const notes = pickTag(block, "Notes");

    // PredecessorLink blocks within a Task carry <PredecessorUID> values.
    const predecessors = [];
    const predRe = /<PredecessorLink>([\s\S]*?)<\/PredecessorLink>/g;
    let pm;
    while ((pm = predRe.exec(block))) {
      const predUid = pickTag(pm[1], "PredecessorUID");
      const mapped = uidToId.get(predUid);
      if (mapped) predecessors.push(mapped);
    }

    let status = "not-started";
    if (percentComplete >= 100) status = "completed";
    else if (percentComplete > 0) status = "in-progress";

    tasks.push({
      taskId,
      wbs,
      name,
      description: notes,
      startDate,
      endDate,
      baselineStart,
      baselineEnd,
      durationDays,
      percentComplete,
      predecessors,
      baselineCost,
      actualCost,
      status,
      priority,
      // Critical-path metadata from MS Project. Surfaced in the WBS
      // table as a 🔥/badge and used by the dashboard to highlight
      // schedule risk independently of the cost-side EVM metrics.
      criticalPath: isCritical,
      totalSlackDays,
      isMilestone,
      isSummary,
      notes,
      source: "msproject-xml",
    });
  }

  return {
    ok: true,
    format: "msproject-xml",
    tasks,
    projectStart,
    projectFinish,
    baselineDate,
    skipped,
  };
}

// Try to detect and parse a binary .mpp file. Returns a structured result
// either way — the caller decides whether to surface the error to the user
// or fall back to XML import.
export async function parseMsProjectMpp(buffer, { filename = "" } = {}) {
  if (!Buffer.isBuffer(buffer)) {
    return {
      ok: false,
      format: "msproject-mpp",
      tasks: [],
      skipped: 0,
      error: "Expected a Buffer for .mpp parsing.",
    };
  }

  // OLE2 compound file signature: D0 CF 11 E0 A1 B1 1A E1
  const OLE2_SIG = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  if (buffer.length < 8 || !buffer.slice(0, 8).equals(OLE2_SIG)) {
    return {
      ok: false,
      format: "msproject-mpp",
      tasks: [],
      skipped: 0,
      error:
        "File does not look like a valid .mpp file (OLE2 signature missing). If this came from MS Project, use File → Save As → XML and upload that instead.",
    };
  }

  // ── Path 1: HTTP service (MPXJ_API_URL) ───────────────────────────────
  // Preferred for cloud deployments (Vercel, Render Node, etc.) where you
  // can't co-locate Java. POST the .mpp body to the service and read MS
  // Project XML from the response. Auth header is optional (MPXJ_API_KEY).
  let apiUrl = process.env.MPXJ_API_URL;
  if (apiUrl) {
    // Sanitize common env-var setup mistakes before handing to fetch:
    //   • Trim leading/trailing whitespace + newlines.
    //   • Strip a "KEY = " / "KEY:" prefix — happens when operators paste
    //     a whole .env line ("MPXJ_API_URL = https://…") into Render's
    //     VALUE field, which expects just the value.
    //   • Strip surrounding quotes — same paste-from-dotenv mistake.
    apiUrl = String(apiUrl)
      .trim()
      .replace(/^MPXJ_API_URL\s*[:=]\s*/i, "")
      .replace(/^['"]|['"]$/g, "")
      .trim();

    // Validate the URL is well-formed before passing it to fetch — gives
    // a clearer error than the cryptic "Failed to parse URL" thrown by
    // the URL constructor.
    try {
      // eslint-disable-next-line no-new
      new URL(apiUrl);
    } catch {
      return {
        ok: false,
        format: "msproject-mpp",
        tasks: [],
        skipped: 0,
        errorCode: "MPP_SERVICE_UNREACHABLE",
        error: `MPXJ_API_URL is not a valid URL (got: "${apiUrl.slice(0, 120)}"). Expected something like https://adlm-mpxj-converter.onrender.com/convert — no "MPXJ_API_URL =" prefix, no quotes. Fix it in Render → Environment → MPXJ_API_URL.`,
      };
    }

    // Normalize: ensure the URL ends in /convert. Render shows the bare
    // service hostname in its dashboard ("https://x.onrender.com"), so
    // operators routinely paste that without the path — the Java service
    // then 404s with "POST /convert with .mpp body". Auto-appending here
    // makes the env var forgiving while still letting power users point
    // at a custom path.
    const targetUrl = /\/convert(?:\?|$)/.test(apiUrl)
      ? apiUrl
      : apiUrl.replace(/\/+$/, "") + "/convert";
    try {
      const headers = {
        "Content-Type": "application/octet-stream",
        "X-Filename": String(filename || "input.mpp").replace(/[^\w.\-]/g, "_"),
      };
      if (process.env.MPXJ_API_KEY) {
        // Same sanitisation as MPXJ_API_URL — strip whitespace, prefix
        // ("MPXJ_API_KEY = "), and surrounding quotes. The Java service
        // does a strict string equality check on the header, so any stray
        // characters here would silently fail authentication.
        const cleanKey = String(process.env.MPXJ_API_KEY)
          .trim()
          .replace(/^MPXJ_API_KEY\s*[:=]\s*/i, "")
          .replace(/^['"]|['"]$/g, "")
          .trim();
        if (cleanKey) headers["X-API-Key"] = cleanKey;
      }

      // ── SigV4, for the Lambda Function URL deployment ──────────────────
      // The converter moved off Render (which died) onto a Lambda Function
      // URL with IAM auth, so requests must be signed. Render's deployment
      // used a shared X-API-Key instead; that path above is left intact, so
      // this function still works against a plain HTTP converter — a local
      // `docker run`, or App Runner — with no signing at all.
      //
      // Detected from the hostname rather than a feature flag: a Function URL
      // is unmistakable, and an operator who repoints MPXJ_API_URL at
      // something else should not also have to remember to turn signing off.
      let signedHeaders = headers;
      const isLambdaUrl = /\.lambda-url\.[a-z0-9-]+\.on\.aws$/i.test(
        new URL(targetUrl).hostname,
      );
      if (isLambdaUrl) {
        try {
          // Pull named exports defensively, for two separate reasons.
          //
          // 1. These packages are CommonJS with no statically-detectable named
          //    exports, so a dynamic import can put everything under `.default`
          //    and a plain destructure silently yields undefined. esbuild hides
          //    that when it bundles for Lambda, which is the trap: it would
          //    work in production and throw under a local `node index.js`.
          // 2. The credential provider is called `defaultProvider` in
          //    @aws-sdk/credential-provider-node, but `fromNodeProviderChain`
          //    in @aws-sdk/credential-providers, and both names show up in
          //    documentation for "the default chain". Accept either.
          const pick = (mod, ...names) => {
            for (const n of names) {
              const fn = mod?.[n] ?? mod?.default?.[n];
              if (typeof fn === "function") return fn;
            }
            throw new Error(
              `none of [${names.join(", ")}] found; module exports: ${Object.keys(
                mod || {},
              )
                .slice(0, 8)
                .join(", ")}`,
            );
          };
          const [sigMod, shaMod, credMod] = await Promise.all([
            import("@smithy/signature-v4"),
            import("@aws-crypto/sha256-js"),
            import("@aws-sdk/credential-provider-node"),
          ]);
          const SignatureV4 = pick(sigMod, "SignatureV4");
          const Sha256 = pick(shaMod, "Sha256");
          const credentialProvider = pick(
            credMod,
            "defaultProvider",
            "fromNodeProviderChain",
          );

          const u = new URL(targetUrl);
          const signer = new SignatureV4({
            service: "lambda",
            region:
              process.env.MPXJ_SIGV4_REGION ||
              process.env.AWS_REGION ||
              "eu-west-1",
            credentials: credentialProvider(),
            sha256: Sha256,
          });
          const signed = await signer.sign({
            method: "POST",
            protocol: u.protocol,
            hostname: u.hostname,
            path: u.pathname,
            // `host` must be part of the signed set or Lambda rejects it.
            headers: { ...headers, host: u.hostname },
            body: buffer,
          });
          signedHeaders = signed.headers;
        } catch (signErr) {
          // Be explicit. An unsigned request to an IAM-auth Function URL comes
          // back as a bare 403 with no body, which reads like a broken
          // deployment rather than a missing credential.
          return {
            ok: false,
            format: "msproject-mpp",
            tasks: [],
            skipped: 0,
            errorCode: "MPP_SERVICE_FAILED",
            error: `Could not sign the request to the MPXJ converter (${
              signErr?.message || signErr
            }). The converter is on an IAM-authenticated Lambda Function URL, so this host needs AWS credentials with lambda:InvokeFunctionUrl. Meanwhile, export MS Project XML and upload that instead.`,
          };
        }
      }

      const controller = new AbortController();
      // Under the API function's own 60s ceiling, and under the converter's
      // 50s timeout, so whichever gives out first this side still returns a
      // real error rather than being killed mid-flight.
      const timeout = setTimeout(() => controller.abort(), 55_000);
      const res = await fetch(targetUrl, {
        method: "POST",
        headers: signedHeaders,
        body: buffer,
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return {
          ok: false,
          format: "msproject-mpp",
          tasks: [],
          skipped: 0,
          errorCode: "MPP_SERVICE_FAILED",
          error: `MPXJ converter service returned ${res.status}: ${
            text.slice(0, 200) || "no body"
          }. Check MPXJ_API_URL / MPXJ_API_KEY, or fall back to MS Project XML export.`,
        };
      }
      const xmlBuf = Buffer.from(await res.arrayBuffer());
      const parsed = parseMsProjectXml(xmlBuf);
      return { ...parsed, format: "msproject-mpp" };
    } catch (e) {
      return {
        ok: false,
        format: "msproject-mpp",
        tasks: [],
        skipped: 0,
        errorCode: "MPP_SERVICE_UNREACHABLE",
        error: `Could not reach MPXJ converter service: ${
          e?.message || e
        }. The service may be down or the URL is wrong. Fall back to MS Project XML export.`,
      };
    }
  }

  // ── Path 2: Local CLI (MPXJ_CLI_PATH) ─────────────────────────────────
  // Self-hosted servers can run Java + MPXJ on the same box and point at a
  // wrapper script that takes (input_mpp_path output_xml_path).
  const cli = process.env.MPXJ_CLI_PATH;
  if (cli) {
    let tmpDir;
    try {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mpp-"));
      const safeName = String(filename || "input.mpp").replace(/[^\w.\-]/g, "_");
      const inPath = path.join(tmpDir, safeName.endsWith(".mpp") ? safeName : `${safeName}.mpp`);
      const outPath = path.join(tmpDir, "out.xml");
      await fs.writeFile(inPath, buffer);

      await new Promise((resolve, reject) => {
        const child = spawn(cli, [inPath, outPath], { stdio: "ignore" });
        const timeout = setTimeout(() => {
          child.kill("SIGKILL");
          reject(new Error("mpxj CLI timed out after 30s."));
        }, 30_000);
        child.on("error", (e) => {
          clearTimeout(timeout);
          reject(e);
        });
        child.on("exit", (code) => {
          clearTimeout(timeout);
          if (code === 0) resolve();
          else reject(new Error(`mpxj CLI exited with code ${code}`));
        });
      });

      const xml = await fs.readFile(outPath);
      const parsed = parseMsProjectXml(xml);
      return { ...parsed, format: "msproject-mpp" };
    } catch (e) {
      return {
        ok: false,
        format: "msproject-mpp",
        tasks: [],
        skipped: 0,
        error: `mpxj CLI failed: ${e?.message || e}. Fall back to MS Project XML export.`,
      };
    } finally {
      if (tmpDir) {
        try { await fs.rm(tmpDir, { recursive: true, force: true }); }
        catch { /* ignore cleanup failures */ }
      }
    }
  }

  // No conversion path configured — return a friendly, actionable error
  // with a stable code so the client can show the XML helper modal.
  return {
    ok: false,
    format: "msproject-mpp",
    tasks: [],
    skipped: 0,
    errorCode: "MPP_NOT_ENABLED",
    error:
      "Direct .mpp parsing is not enabled on this server. Open the file in MS Project, choose File → Save As → XML, then upload the .xml. (Admins: set MPXJ_API_URL or MPXJ_CLI_PATH to enable native .mpp import.)",
  };
}

// Convenience entry point that dispatches based on file extension /
// content sniff. Used by the import route.
export async function parseMsProjectFile(buffer, { filename = "" } = {}) {
  const lower = String(filename || "").toLowerCase();
  if (lower.endsWith(".xml")) {
    return parseMsProjectXml(buffer);
  }
  if (lower.endsWith(".mpp")) {
    return parseMsProjectMpp(buffer, { filename });
  }
  // Fallback: sniff content.
  if (Buffer.isBuffer(buffer)) {
    const head = buffer.slice(0, 8);
    const OLE2_SIG = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    if (head.equals(OLE2_SIG)) return parseMsProjectMpp(buffer, { filename });
    const asText = buffer.slice(0, 256).toString("utf8");
    if (asText.includes("<Project")) return parseMsProjectXml(buffer);
  }
  return {
    ok: false,
    format: "unknown",
    tasks: [],
    skipped: 0,
    error:
      "Unsupported file type. Upload a MS Project XML (.xml) export or .mpp file.",
  };
}
