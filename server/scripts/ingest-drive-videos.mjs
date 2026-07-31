/**
 * Streams the class recordings out of Google Drive into the S3 archive, gives
 * every file a canonical name on the way, and records the archive key on the
 * matching course module.
 *
 * This is the "move 29 GB once" step. S3 becomes the master copy: the delivery
 * pipeline (MediaConvert -> CloudFront) reads from here, so re-encoding, adding
 * a bitrate rung or turning on DRM later never touches Google Drive again.
 *
 * The transfer is streamed and multipart — the largest lecture is 6.25 GB and
 * buffering it would blow the heap.
 *
 *   node scripts/ingest-drive-videos.mjs --check         # verify credentials + Drive share
 *   node scripts/ingest-drive-videos.mjs                 # dry run, plans the work
 *   node scripts/ingest-drive-videos.mjs --apply         # do it
 *   node scripts/ingest-drive-videos.mjs --apply --only W3D2,W3D3
 *   node scripts/ingest-drive-videos.mjs --apply --force # re-upload even if archived
 *
 * Safe to stop and re-run. Before uploading, each object is checked in S3 and
 * skipped when it is already there at the right size, so an interrupted run
 * resumes instead of paying for the same gigabytes twice.
 *
 * Setup (one time):
 *   1. Create a Google Cloud service account and download its JSON key.
 *   2. Share the "Class video" Drive folder with the service account's email
 *      (viewer is enough).
 *   3. GOOGLE_SERVICE_ACCOUNT_KEY — the path to the JSON locally, or the JSON
 *      itself / base64 of it on a host where you can only set env vars.
 *   4. AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
 *      AWS_VIDEO_ARCHIVE_BUCKET
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { JWT } from "google-auth-library";
import { connectDB } from "../db.js";
import { PaidCourse } from "../models/PaidCourse.js";
import {
  objectSize,
  uploadStream,
  archiveBucket,
  verifyWriteAccess,
} from "../utils/awsS3.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");
const CHECK = process.argv.includes("--check");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? "" : String(process.argv[i + 1] || "");
}
const ONLY = argValue("--only")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function gb(bytes) {
  return `${(Number(bytes || 0) / 1024 ** 3).toFixed(2)} GB`;
}

/**
 * Check every credential up front and report them together.
 *
 * Discovering these one at a time, as a stack trace, three minutes into a
 * 30 GB run is a miserable way to find out the bucket name is missing.
 */
const REQUIRED = [
  ["GOOGLE_SERVICE_ACCOUNT_KEY", "Google service account JSON (path, JSON, or base64)"],
  ["AWS_REGION", "e.g. us-east-1"],
  ["AWS_VIDEO_ARCHIVE_BUCKET", "bucket the masters land in"],
];

// Not required when running on EC2 under an instance role — the SDK picks
// credentials up from instance metadata instead.
const REQUIRED_UNLESS_INSTANCE_ROLE = [
  ["AWS_ACCESS_KEY_ID", "app IAM user (omit if using an EC2 instance role)"],
  ["AWS_SECRET_ACCESS_KEY", "app IAM user (omit if using an EC2 instance role)"],
];

// Accepts either COURSE_-prefixed or bare names, matching utils/awsS3.js.
function envValue(name) {
  return (
    String(process.env[`COURSE_${name}`] || "").trim() ||
    String(process.env[name] || "").trim()
  );
}

function onInstanceRole() {
  // Set by ECS/EKS, or detectable on EC2 via the metadata service. Keep it
  // simple: an explicit opt-in beats probing 169.254.169.254 on a laptop.
  // Read through envValue like every other variable here, so the bare name
  // works and a dashboard's trailing whitespace doesn't defeat the compare.
  return envValue("AWS_USE_INSTANCE_ROLE") === "true";
}

function preflight({ warnOnly = false } = {}) {
  const required = onInstanceRole()
    ? REQUIRED
    : [...REQUIRED, ...REQUIRED_UNLESS_INSTANCE_ROLE];
  const missing = required.filter(([name]) => !envValue(name));
  if (!missing.length) {
    if (warnOnly) console.log("\nCredentials look complete — --apply is ready to run.");
    return;
  }

  const label = warnOnly ? "Not ready to --apply yet" : "Cannot start";
  console.log(`\n${label} — ${missing.length} setting(s) missing from server/.env:\n`);
  for (const [name, hint] of missing) console.log(`  ${name.padEnd(28)} ${hint}`);
  console.log(
    "\nCOURSE_-prefixed names win over the bare ones (COURSE_AWS_REGION over" +
      "\nAWS_REGION), which keeps this pipeline's IAM user separate from any" +
      "\nother AWS credentials already set here.",
  );
  console.log("\nSee docs/COURSE_VIDEO_PIPELINE.md for how to obtain each one.");

  if (!warnOnly) process.exit(1);
}

// ── canonical naming ────────────────────────────────────────────────────────
/**
 * Drive holds "Week 2 Day 1 Class.mp4" next to a bare "Day 3.mp4". Neither
 * survives being moved out of its folder, so the archive gets one scheme
 * driven by the module itself:
 *
 *   courses/bim-bld-arch/2025/w2d1-setting-up-a-cloud-based-cde.mp4
 *
 * Sortable, unique, and readable without opening the file.
 */
function slugify(text) {
  return String(text || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    // Trim to a word boundary so a long title ends "…adlm" rather than "…adlm-plu".
    .replace(/^(.{0,70})(-.*)?$/s, "$1")
    .replace(/-+$/g, "");
}

function archiveKey({ courseSku, cohort, moduleCode, moduleTitle }) {
  // Titles read "Week 1 · Day 1 — Introduction to BIM…"; the part after the
  // em dash is the actual subject, which is what belongs in the filename.
  const subject = String(moduleTitle || "").split("—").slice(1).join("—").trim();
  const slug = slugify(subject || moduleTitle || moduleCode);
  const name = `${moduleCode.toLowerCase()}${slug ? `-${slug}` : ""}.mp4`;
  return `courses/${courseSku}/${cohort}/${name}`;
}

// ── Google Drive ────────────────────────────────────────────────────────────
/**
 * Accepts the credential in whichever form the environment makes easy:
 *
 *   - a path to the downloaded JSON      (local development)
 *   - the JSON itself, minified          (hosting dashboards that accept it)
 *   - base64 of the JSON                 (dashboards that mangle quotes and
 *                                         newlines — the safest for deploys)
 */
function loadServiceAccount() {
  // Through envValue, not process.env — preflight accepts the COURSE_-prefixed
  // name, so reading the bare one here let the check pass and the run die on
  // the first file instead.
  const raw = envValue("GOOGLE_SERVICE_ACCOUNT_KEY");
  if (!raw) {
    throw new Error(
      "Missing required environment variable: COURSE_GOOGLE_SERVICE_ACCOUNT_KEY " +
        "(or GOOGLE_SERVICE_ACCOUNT_KEY)",
    );
  }

  let json;
  if (raw.startsWith("{")) {
    json = raw;
  } else if (/^[A-Za-z0-9+/=\s]+$/.test(raw) && raw.length > 200) {
    json = Buffer.from(raw, "base64").toString("utf8");
  } else {
    if (!fs.existsSync(raw)) {
      throw new Error(
        `The service account key points at "${raw}", which does not exist. ` +
          `Give it a path to the JSON key, the JSON itself, or base64 of it.`,
      );
    }
    json = fs.readFileSync(raw, "utf8");
  }

  try {
    const key = JSON.parse(json);
    if (!key.client_email || !key.private_key) {
      throw new Error("missing client_email / private_key");
    }
    return key;
  } catch (err) {
    throw new Error(`Service account key could not be parsed: ${err.message}`);
  }
}

let jwtClient = null;

/**
 * A Drive access token, refreshed as needed.
 *
 * Google's tokens last an hour. Minting one at the start of the run and
 * reusing it meant that as soon as a single file took longer than that — the
 * 5.82 GB lecture does — every subsequent file failed with a 401 that looked
 * like a broken credential.
 *
 * The JWT client caches internally and re-mints when the token is close to
 * expiry, so calling this before each file is cheap and always valid.
 */
async function driveToken() {
  if (!jwtClient) {
    const key = loadServiceAccount();
    jwtClient = new JWT({
      email: key.client_email,
      key: key.private_key,
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });
  }
  // getAccessToken() resolves to { token }, not { access_token } — reading the
  // wrong property looked exactly like an auth failure while the credential
  // was fine all along.
  const { token } = await jwtClient.getAccessToken();
  if (!token) throw new Error("Could not mint a Drive access token");
  return token;
}

class DrivePermissionError extends Error {}

function driveContentUrl(fileId) {
  return (
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}` +
    `?alt=media&supportsAllDrives=true`
  );
}

/**
 * Turns Drive's content-read failures into something actionable.
 *
 * `cannotDownloadFile` is the one worth naming: it means the file carries
 * "Viewers and commenters cannot download, print, or copy". Metadata still
 * reads fine under that setting, so the account looks correctly shared right
 * up until the first byte of content is requested.
 */
async function driveReadError(res, fileId) {
  const body = await res.text();
  if (res.status === 403 && body.includes("cannotDownloadFile")) {
    return new DrivePermissionError(
      `Drive is refusing to send the file contents (cannotDownloadFile).\n` +
        `  The share is fine — metadata reads work — but these files are set to\n` +
        `  "Viewers and commenters cannot download, print, or copy", and that\n` +
        `  restriction only exempts writers.\n\n` +
        `  Fix either way:\n` +
        `    • Change the service account from Viewer to Editor on "BIM Training",\n` +
        `      run the ingest, then set it back to Viewer. Nothing changes for\n` +
        `      the people you actually share the folder with.\n` +
        `    • Or turn the restriction off: folder → Share → gear icon → untick\n` +
        `      "Viewers and commenters can see the option to download, print, and copy".`,
    );
  }
  if (res.status === 403 || res.status === 404) {
    return new DrivePermissionError(
      `Drive returned ${res.status} for file ${fileId}: ${body.slice(0, 300)}`,
    );
  }
  return new Error(`Drive read failed (${res.status}): ${body.slice(0, 300)}`);
}

async function openDriveFile(fileId, token) {
  const res = await fetch(driveContentUrl(fileId), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok || !res.body) throw await driveReadError(res, fileId);
  // The SDK's multipart uploader wants a Node stream, not a web one.
  return Readable.fromWeb(res.body);
}

/** Reads the first kilobyte, to prove content — not just metadata — is readable. */
async function probeDriveDownload(fileId, token) {
  const res = await fetch(driveContentUrl(fileId), {
    headers: { Authorization: `Bearer ${token}`, Range: "bytes=0-1023" },
  });
  if (!res.ok) throw await driveReadError(res, fileId);
  await res.arrayBuffer();
}

// ── plan ────────────────────────────────────────────────────────────────────
const manifest = JSON.parse(
  fs.readFileSync(path.join(here, "drive-video-manifest.json"), "utf8"),
);
const cohort = manifest.cohort || "2025";

await connectDB();
const course = await PaidCourse.findOne({ sku: manifest.courseSku });
if (!course) {
  console.error(`No course with sku "${manifest.courseSku}".`);
  process.exit(1);
}

const byCode = new Map((course.modules || []).map((m) => [m.code, m]));
const planned = [];
const skipped = [];

for (const item of manifest.items) {
  if (ONLY.length && !ONLY.includes(item.moduleCode)) continue;
  const module = byCode.get(item.moduleCode);
  if (!module) {
    skipped.push(`${item.moduleCode}: no such module on the course`);
    continue;
  }
  if (module.sourceKey && !FORCE) {
    skipped.push(`${item.moduleCode}: already archived (${module.sourceKey})`);
    continue;
  }
  planned.push({
    ...item,
    key: archiveKey({
      courseSku: manifest.courseSku,
      cohort,
      moduleCode: item.moduleCode,
      moduleTitle: module.title,
    }),
  });
}

const totalBytes = planned.reduce((sum, i) => sum + Number(i.bytes || 0), 0);

console.log(`course:   ${course.title} (${manifest.courseSku})`);
console.log(`archive:  s3://${envValue("AWS_VIDEO_ARCHIVE_BUCKET") || "<bucket unset>"}`);
console.log(`to move:  ${planned.length} recordings, ${gb(totalBytes)}\n`);
for (const item of planned) {
  console.log(`  ${gb(item.bytes).padStart(8)}  ${item.name}`);
  console.log(`            -> ${item.key}`);
}
if (skipped.length) {
  console.log(`\nskipped (${skipped.length}):`);
  for (const line of skipped) console.log(`  ${line}`);
}
for (const decision of manifest.needsDecision || []) {
  console.log(`\n⚠ ${decision.moduleCode} has no file assigned — ${decision.issue}`);
  if (decision.candidate) {
    console.log(`  candidate: ${decision.candidate.name} — ${decision.candidate.question}`);
  }
}

// --check answers the two questions that actually block a run: is the
// credential readable, and did the Drive share actually land? Both fail in
// ways that are cheap to find now and expensive to find 20 GB in.
if (CHECK) {
  let key;
  try {
    key = loadServiceAccount();
    console.log(`\nservice account: ${key.client_email}`);
  } catch (err) {
    console.error(`\n✗ ${err.message}`);
    process.exit(1);
  }

  try {
    const token = await driveToken();
    const probe = manifest.items[0];
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${probe.fileId}` +
        `?fields=id,name,size&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.status === 404 || res.status === 403) {
      console.error(
        `✗ Drive returned ${res.status} for "${probe.name}".\n` +
          `  The credential works but this account cannot see the file.\n` +
          `  Share the "Class video" folder with ${key.client_email} as Viewer.`,
      );
      process.exit(1);
    }
    if (!res.ok) {
      console.error(`✗ Drive error ${res.status}: ${await res.text()}`);
      process.exit(1);
    }
    const file = await res.json();

    // Metadata is not enough. A folder can be shared correctly and still refuse
    // to hand over bytes, so pull the first kilobyte of real content.
    await probeDriveDownload(probe.fileId, token);
    console.log(`✓ Drive download confirmed — read "${file.name}" (${gb(file.size)})`);
  } catch (err) {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  }

  const awsMissing = [...REQUIRED, ...(onInstanceRole() ? [] : REQUIRED_UNLESS_INSTANCE_ROLE)]
    .filter(([name]) => name.startsWith("AWS_") && !envValue(name));
  if (awsMissing.length) {
    preflight({ warnOnly: true });
    process.exit(0);
  }

  try {
    const bucket = await verifyWriteAccess();
    console.log(`✓ S3 write access confirmed — s3://${bucket}`);
  } catch (err) {
    console.error(`✗ S3 check failed: ${err.message}`);
    process.exit(1);
  }

  preflight({ warnOnly: true });
  process.exit(0);
}

if (!APPLY) {
  console.log("\nDry run. Re-run with --apply to move these into S3.");
  preflight({ warnOnly: true });
  process.exit(0);
}

preflight();

// ── run ─────────────────────────────────────────────────────────────────────
const bucket = archiveBucket();
let done = 0;

for (const item of planned) {
  const label = `${item.moduleCode} (${gb(item.bytes)})`;
  try {
    const existing = await objectSize(item.key, bucket);
    if (existing !== null && existing === Number(item.bytes) && !FORCE) {
      console.log(`= ${label} already in S3, recording key only`);
    } else {
      console.log(`\n→ ${label} ${item.name}`);
      process.stdout.write("  connecting…");

      // Report on a clock rather than only at 10% marks. On a slow uplink the
      // first 10% of a 6 GB file is 20 minutes of total silence, which is
      // indistinguishable from a hang.
      const startedAt = Date.now();
      let lastTickAt = 0;
      let lastLine = 0;

      // Fetched per file, not once per run — see driveToken().
      const body = await openDriveFile(item.fileId, await driveToken());
      await uploadStream({
        key: item.key,
        body,
        bucket,
        metadata: {
          "drive-file-id": String(item.fileId),
          "drive-name": String(item.name),
          "module-code": String(item.moduleCode),
        },
        onProgress: ({ loaded }) => {
          const now = Date.now();
          if (now - lastTickAt < 15000) return;
          lastTickAt = now;

          const done = Number(loaded || 0);
          const total = Number(item.bytes) || 1;
          const pct = Math.min(100, Math.floor((done / total) * 100));
          const mbps = done / 1024 / 1024 / ((now - startedAt) / 1000);
          const etaSec = mbps > 0 ? (total - done) / 1024 / 1024 / mbps : 0;
          const eta =
            etaSec > 90 ? `${Math.round(etaSec / 60)}m left` : `${Math.round(etaSec)}s left`;

          const line =
            `  ${String(pct).padStart(3)}%  ` +
            `${(done / 1024 ** 3).toFixed(2)}/${(total / 1024 ** 3).toFixed(2)} GB  ` +
            `${mbps.toFixed(1)} MB/s  ${eta}`;
          // Overwrite in place so a two-hour file doesn't produce 480 lines.
          process.stdout.write(`\r${line.padEnd(Math.max(lastLine, line.length))}`);
          lastLine = line.length;
        },
      });
      process.stdout.write("\r".padEnd(lastLine + 1) + "\r");
    }

    const module = course.modules.find((m) => m.code === item.moduleCode);
    module.sourceKey = item.key;
    module.sourceName = item.name;
    module.sourceBytes = Number(item.bytes) || 0;
    await course.save();

    done += 1;
    console.log(`  ✓ ${label} → ${item.key}`);
  } catch (err) {
    console.error(`  ✗ ${label} failed: ${err.message}`);

    // A permission failure is not per-file — every remaining item will fail
    // identically. Stop rather than printing the same wall of text 17 more
    // times and leaving the real message scrolled off the top.
    if (err instanceof DrivePermissionError) {
      console.error(
        `\nStopping: this affects every file, not just ${item.moduleCode}.` +
          `\nFix the access above, then re-run — nothing has been uploaded.`,
      );
      break;
    }
    console.error("    (re-run to retry — archived modules are skipped)");
  }
}

console.log(`\n${done}/${planned.length} recordings archived to s3://${bucket}.`);
process.exit(0);
