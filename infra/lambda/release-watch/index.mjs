// infra/lambda/release-watch/index.mjs
//
// Hourly release-gate watcher (see infra/lib/adlm-release-gate-stack.ts).
//
// Uses GitHub's public API only, so nothing the repo owner controls on GitHub
// (Actions settings, secrets, tokens) can silence it. Checks:
//   1. main is still a protected branch
//   2. main was not force-pushed (history rewritten)
//   3. every new commit on main belongs to a merged pull request that the
//      release approver approved
// Findings go to the approver and the owner by SES, and to the locked bucket.
//
// State: the last commit it has vetted, in SSM (<prefix>/last-main-sha).
// A GitHub rate-limit or outage leaves that untouched, so nothing is skipped;
// the next run picks up from the same place.

import { SSMClient, GetParameterCommand, PutParameterCommand } from "@aws-sdk/client-ssm";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

const ssm = new SSMClient({});
const s3 = new S3Client({});
const ses = new SESv2Client({});

const { REPO, BUCKET, PARAM_PREFIX, FROM, OWNER_EMAIL } = process.env;
const MAX_COMMITS = 20; // ~2 API calls each; keeps an unauthenticated run under 60/h

async function param(name, decrypt = false) {
  try {
    const out = await ssm.send(new GetParameterCommand({ Name: `${PARAM_PREFIX}/${name}`, WithDecryption: decrypt }));
    const v = out.Parameter?.Value?.trim() || "";
    return v === "-" ? "" : v; // SSM cannot hold an empty string; "-" means unset

  } catch (err) {
    if (err?.name === "ParameterNotFound") return "";
    throw err;
  }
}

async function setParam(name, value) {
  await ssm.send(new PutParameterCommand({ Name: `${PARAM_PREFIX}/${name}`, Value: value, Type: "String", Overwrite: true }));
}

let token = "";
async function gh(pathname) {
  const res = await fetch(`https://api.github.com/${pathname}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "adlm-release-watch",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = new Error(`GitHub ${res.status} on ${pathname}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function audit(kind, record) {
  const at = new Date().toISOString();
  const [y, m, d] = at.slice(0, 10).split("-");
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: `watcher/${y}/${m}/${d}/${at.replace(/[:.]/g, "")}-${kind}.json`,
      Body: JSON.stringify({ at, source: "release-watch", kind, repo: REPO, ...record }, null, 2),
      ContentType: "application/json",
      ChecksumAlgorithm: "SHA256",
    }),
  );
}

async function mail(to, subject, lines) {
  const recipients = [...new Set(to.filter(Boolean).map((x) => x.toLowerCase()))];
  if (!recipients.length) return;
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  try {
    await ses.send(
      new SendEmailCommand({
        FromEmailAddress: FROM,
        Destination: { ToAddresses: recipients },
        Content: {
          Simple: {
            Subject: { Data: subject },
            Body: {
              Text: { Data: lines.join("\n\n") },
              Html: { Data: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.55">${lines.map((l) => `<p>${esc(l)}</p>`).join("")}</div>` },
            },
          },
        },
      }),
    );
  } catch (err) {
    // SES only, by the owner's rule: report and stop, never reroute.
    console.error("[release-watch] SES refused:", subject, err?.name, err?.message);
  }
}

async function approvedByApprover(sha, approverLogin) {
  const pulls = (await gh(`repos/${REPO}/commits/${sha}/pulls`)) || [];
  const merged = pulls.filter((p) => p.merged_at && p.base?.ref === "main");
  for (const pr of merged) {
    const reviews = (await gh(`repos/${REPO}/pulls/${pr.number}/reviews?per_page=100`)) || [];
    const ok = reviews.some(
      (r) => r.state === "APPROVED" && String(r.user?.login || "").toLowerCase() === approverLogin.toLowerCase(),
    );
    if (ok) return { ok: true, pr: pr.number };
  }
  return { ok: false, pr: merged[0]?.number || null };
}

export async function handler() {
  token = await param("github-token", true);
  const approverEmail = await param("approver-email");
  const approverLogin = await param("approver-github");
  const last = await param("last-main-sha");
  const to = [approverEmail, OWNER_EMAIL];

  let branch;
  try {
    branch = await gh(`repos/${REPO}/branches/main`);
  } catch (err) {
    console.warn("[release-watch] GitHub unavailable, will retry next hour:", err.message);
    return { ok: false, reason: err.message };
  }
  const head = branch?.commit?.sha;
  const findings = [];

  if (!branch?.protected) {
    findings.push("main is NOT a protected branch. Anyone with push access can ship without review.");
  }

  if (!approverLogin) {
    findings.push("No release approver is set in SSM (approver-github). The watcher cannot check approvals.");
  }

  let vetted = last;
  if (!last) {
    vetted = head;
    await audit("watch-started", { head, approverLogin, approverEmail });
  } else if (head && head !== last && approverLogin) {
    let cmp;
    try {
      cmp = await gh(`repos/${REPO}/compare/${last}...${head}`);
    } catch (err) {
      console.warn("[release-watch] compare failed, will retry:", err.message);
      cmp = undefined;
    }
    if (cmp === null || cmp?.status === "diverged" || cmp?.status === "behind") {
      findings.push(
        `main was force-pushed: the last vetted commit ${last.slice(0, 7)} is no longer in its history (now ${head.slice(0, 7)}). History was rewritten.`,
      );
      vetted = head;
    } else if (cmp) {
      const commits = (cmp.commits || []).slice(0, MAX_COMMITS);
      try {
        for (const c of commits) {
          const verdict = await approvedByApprover(c.sha, approverLogin);
          if (!verdict.ok) {
            const title = String(c.commit?.message || "").split("\n")[0];
            const who = c.author?.login || c.commit?.author?.email || "unknown";
            findings.push(
              `Commit ${c.sha.slice(0, 7)} "${title}" by ${who} reached main without ${approverLogin}'s approval` +
                (verdict.pr ? ` (PR #${verdict.pr} merged unapproved).` : " (no pull request)."),
            );
          }
          vetted = c.sha;
        }
      } catch (err) {
        // Rate limit mid-way: keep what was vetted, carry on next hour.
        console.warn("[release-watch] stopped early:", err.message);
      }
    }
  }

  if (findings.length) {
    await audit("violation", { head, vetted, findings });
    await mail(to, `ADLM release gate: ${findings.length} problem(s) on main`, [
      `The release gate watcher found the following on ${REPO}:`,
      ...findings.map((f) => `- ${f}`),
      `Repository: https://github.com/${REPO}/commits/main`,
      "This alert is also recorded permanently in the locked audit log.",
    ]);
  } else if (vetted && vetted !== last) {
    await audit("vetted", { from: last, to: vetted });
  }

  if (vetted && vetted !== last) await setParam("last-main-sha", vetted);
  return { ok: true, head, vetted, findings };
}
