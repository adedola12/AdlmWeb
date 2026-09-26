// infra/lambda/release-watch/index.mjs
//
// Hourly release-gate watcher (see infra/lib/adlm-release-gate-stack.ts).
//
// Uses GitHub's public API only, so nothing the repo owner controls on GitHub
// (Actions settings, secrets, tokens) can silence it. For every watched repo
// (REPOS = "owner/name@branch,..."), it checks:
//   1. the release branch is still protected
//   2. it was not force-pushed (history rewritten)
//   3. every new commit on it belongs to a merged pull request that the
//      release approver approved
// Findings go to the approver and the owner by SES, and to the locked bucket.
//
// State: the last commit vetted per repo, in SSM. AdlmWeb keeps the name it
// started with (<prefix>/last-main-sha); every other repo uses
// <prefix>/last-sha--<owner>--<name>. A GitHub rate-limit or outage leaves the
// state untouched, so nothing is skipped; the next run picks up from there.

import { SSMClient, GetParameterCommand, PutParameterCommand } from "@aws-sdk/client-ssm";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

const ssm = new SSMClient({});
const s3 = new S3Client({});
const ses = new SESv2Client({});

const { REPOS, BUCKET, PARAM_PREFIX, FROM, OWNER_EMAIL } = process.env;
// ~2 API calls per commit. Unauthenticated GitHub allows 60 calls an hour, so
// a quiet hour across three repos stays well under it; a busy one carries over.
const MAX_COMMITS_PER_REPO = 8;
const LEGACY_STATE = { "adedola12/AdlmWeb": "last-main-sha" };

export function parseRepos(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [repo, branch] = s.split("@");
      return { repo, branch: branch || "main" };
    });
}

export function stateName(repo) {
  return LEGACY_STATE[repo] || `last-sha--${repo.replace("/", "--")}`;
}

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

async function audit(repo, kind, record) {
  const at = new Date().toISOString();
  const [y, m, d] = at.slice(0, 10).split("-");
  const slug = repo.split("/")[1] || repo;
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: `watcher/${y}/${m}/${d}/${at.replace(/[:.]/g, "")}-${slug}-${kind}.json`,
      Body: JSON.stringify({ at, source: "release-watch", kind, repo, ...record }, null, 2),
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

async function approvedByApprover(repo, branch, sha, approverLogin) {
  const pulls = (await gh(`repos/${repo}/commits/${sha}/pulls`)) || [];
  const merged = pulls.filter((p) => p.merged_at && p.base?.ref === branch);
  for (const pr of merged) {
    const reviews = (await gh(`repos/${repo}/pulls/${pr.number}/reviews?per_page=100`)) || [];
    const ok = reviews.some(
      (r) => r.state === "APPROVED" && String(r.user?.login || "").toLowerCase() === approverLogin.toLowerCase(),
    );
    if (ok) return { ok: true, pr: pr.number };
  }
  return { ok: false, pr: merged[0]?.number || null };
}

async function watchRepo({ repo, branch }, approverLogin) {
  const stateKey = stateName(repo);
  const last = await param(stateKey);

  let info;
  try {
    info = await gh(`repos/${repo}/branches/${encodeURIComponent(branch)}`);
  } catch (err) {
    console.warn(`[release-watch] ${repo}: GitHub unavailable, will retry next hour:`, err.message);
    return { repo, ok: false, reason: err.message, findings: [] };
  }
  if (!info) {
    return { repo, ok: true, findings: [`Branch ${branch} no longer exists on ${repo}.`] };
  }

  const head = info.commit?.sha;
  const findings = [];
  if (!info.protected) {
    findings.push(`${branch} is NOT a protected branch. Anyone with push access can ship without review.`);
  }

  let vetted = last;
  if (!last) {
    vetted = head;
    await audit(repo, "watch-started", { branch, head, approverLogin });
  } else if (head && head !== last && approverLogin) {
    let cmp;
    try {
      cmp = await gh(`repos/${repo}/compare/${last}...${head}`);
    } catch (err) {
      console.warn(`[release-watch] ${repo}: compare failed, will retry:`, err.message);
      cmp = undefined;
    }
    if (cmp === null || cmp?.status === "diverged" || cmp?.status === "behind") {
      findings.push(
        `${branch} was force-pushed: the last vetted commit ${last.slice(0, 7)} is no longer in its history (now ${head.slice(0, 7)}). History was rewritten.`,
      );
      vetted = head;
    } else if (cmp) {
      try {
        for (const c of (cmp.commits || []).slice(0, MAX_COMMITS_PER_REPO)) {
          const verdict = await approvedByApprover(repo, branch, c.sha, approverLogin);
          if (!verdict.ok) {
            const title = String(c.commit?.message || "").split("\n")[0];
            const who = c.author?.login || c.commit?.author?.email || "unknown";
            findings.push(
              `Commit ${c.sha.slice(0, 7)} "${title}" by ${who} reached ${branch} without ${approverLogin}'s approval` +
                (verdict.pr ? ` (PR #${verdict.pr} merged unapproved).` : " (no pull request)."),
            );
          }
          vetted = c.sha;
        }
      } catch (err) {
        // Rate limit mid-way: keep what was vetted, carry on next hour.
        console.warn(`[release-watch] ${repo}: stopped early:`, err.message);
      }
    }
  }

  if (findings.length) {
    await audit(repo, "violation", { branch, head, vetted, findings });
  } else if (vetted && vetted !== last) {
    await audit(repo, "vetted", { branch, from: last, to: vetted });
  }
  if (vetted && vetted !== last) await setParam(stateKey, vetted);
  return { repo, branch, ok: true, head, vetted, findings };
}

export async function handler() {
  token = await param("github-token", true);
  const approverEmail = await param("approver-email");
  const approverLogin = await param("approver-github");
  const repos = parseRepos(REPOS);

  const results = [];
  for (const r of repos) {
    const out = await watchRepo(r, approverLogin);
    if (!approverLogin) {
      out.findings.push("No release approver is set in SSM (approver-github). Approvals cannot be checked.");
    }
    results.push(out);
  }

  const withFindings = results.filter((r) => r.findings.length);
  if (withFindings.length) {
    const total = withFindings.reduce((n, r) => n + r.findings.length, 0);
    await mail([approverEmail, OWNER_EMAIL], `ADLM release gate: ${total} problem(s) found`, [
      "The release gate watcher found the following:",
      ...withFindings.flatMap((r) => [
        `${r.repo} (${r.branch || "?"}): https://github.com/${r.repo}/commits/${r.branch || ""}`,
        ...r.findings.map((f) => `- ${f}`),
      ]),
      "This alert is also recorded permanently in the locked audit log.",
    ]);
  }
  return { ok: true, results };
}
