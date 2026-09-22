#!/usr/bin/env node
// server/scripts/release-gate.mjs
//
// Names, replaces and offboards the release approver. The ONLY place that
// changes who signs releases off: there is no web route for it on purpose.
// Every change is recorded (Mongo + the locked S3 audit bucket) and emailed
// to the outgoing approver, the incoming approver and the owner.
//
//   node scripts/release-gate.mjs status
//
//   node scripts/release-gate.mjs set-approver \
//     --email enochrichard6@gmail.com --name "Richard Enoch" --github RichardEnoch --confirm
//
//   node scripts/release-gate.mjs offboard --reason "Left ADLM on 30 Sep 2026" \
//     [--successor-email x@y --successor-name "..." --successor-github handle] [--confirm]
//
// Without --confirm every command is a dry run that prints what it would do.
// The GitHub steps shell out to `gh`, signed in as the repo owner.
// Mail goes through SES only; a refusal is reported, never rerouted.
import "dotenv/config";
import { execFileSync } from "node:child_process";
import mongoose from "mongoose";
import { SSMClient, PutParameterCommand } from "@aws-sdk/client-ssm";
import { User } from "../models/User.js";
import { ReleaseGateConfig } from "../models/ReleaseGateConfig.js";
import {
  GATE_ID,
  esc,
  gateMail,
  getGateConfig,
  ownerEmail,
  recordGateEvent,
} from "../util/releaseGate.js";

const REPO = process.env.RELEASE_GATE_REPO || "adedola12/AdlmWeb";
const ENVIRONMENT = "production";

const [, , cmd, ...rest] = process.argv;
const args = {};
for (let i = 0; i < rest.length; i++) {
  const k = rest[i];
  if (!k.startsWith("--")) continue;
  const next = rest[i + 1];
  if (next === undefined || next.startsWith("--")) args[k.slice(2)] = true;
  else args[k.slice(2)] = rest[++i];
}
const CONFIRM = args.confirm === true;
const BY = String(args.by || process.env.USERNAME || "owner-cli");

function say(...a) {
  console.log(...a);
}
async function step(label, fn) {
  if (!CONFIRM) {
    say(`  [dry run] ${label}`);
    return null;
  }
  say(`  - ${label}`);
  return await fn();
}
function gh(argv, input) {
  return execFileSync("gh", argv, { encoding: "utf8", input, stdio: [input ? "pipe" : "ignore", "pipe", "pipe"] });
}

// The hourly watcher (infra/lambda/release-watch) reads who to check and
// who to tell from SSM, independently of the database.
async function setWatcherApprover(email, github) {
  const ssm = new SSMClient({ region: process.env.RELEASE_AUDIT_REGION || "eu-west-1" });
  for (const [name, value] of [["approver-email", email], ["approver-github", github]]) {
    await ssm.send(new PutParameterCommand({ Name: `/adlm/release-gate/${name}`, Value: value || "-", Type: "String", Overwrite: true }));
  }
}

// ── GitHub helpers ──────────────────────────────────────────────────────────

function ghUserId(login) {
  return Number(gh(["api", `users/${login}`, "--jq", ".id"]).trim());
}

function setEnvironmentReviewer(login) {
  // prevent_self_review: the person who triggered the deploy cannot approve it.
  // can_admins_bypass=false: the owner cannot click past it either.
  const body = {
    wait_timer: 0,
    prevent_self_review: true,
    can_admins_bypass: false,
    reviewers: login ? [{ type: "User", id: ghUserId(login) }] : [],
    deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
  };
  try {
    gh(["api", "-X", "PUT", `repos/${REPO}/environments/${ENVIRONMENT}`, "--input", "-"], JSON.stringify(body));
    return true;
  } catch (err) {
    // GitHub only accepts a reviewer who already has access, so a fresh
    // invitee cannot be set until they accept. Lock out admin bypass anyway;
    // main's branch protection still requires their review of every merge.
    gh(
      ["api", "-X", "PUT", `repos/${REPO}/environments/${ENVIRONMENT}`, "--input", "-"],
      JSON.stringify({ wait_timer: 0, can_admins_bypass: false, reviewers: [], deployment_branch_policy: body.deployment_branch_policy }),
    );
    say(`  ! ${login} is not a reviewer yet (${String(err.stderr || err.message).trim().split("\n").pop()}).`);
    say("    Re-run set-approver after they accept the GitHub invite.");
    return false;
  }
}

function codeownersFor(login) {
  const who = login ? `@${login}` : "@adedola12";
  return [
    "# Every change needs the release approver's review before it reaches main.",
    "# Managed by server/scripts/release-gate.mjs. See docs/RELEASE_GATE.md.",
    `* ${who}`,
    `/.github/ ${who}`,
    `/docs/RELEASE_GATE.md ${who}`,
    "",
  ].join("\n");
}

// Rewriting CODEOWNERS on a protected main needs protection lifted for one
// commit. The watcher workflow sees the protection change and emails the
// approver, so even this step is visible; it is logged here first as well.
async function rewriteCodeowners(login, reason) {
  await recordGateEvent("github.codeowners-rewrite", { repo: REPO, newOwner: login || "(none)", reason, actor: BY });
  const cur = JSON.parse(gh(["api", `repos/${REPO}/contents/.github/CODEOWNERS`]));
  gh(["api", "-X", "DELETE", `repos/${REPO}/branches/main/protection/enforce_admins`]);
  try {
    gh(
      ["api", "-X", "PUT", `repos/${REPO}/contents/.github/CODEOWNERS`, "--input", "-"],
      JSON.stringify({
        message: `chore(release-gate): release approver is now ${login || "unassigned"}\n\n${reason}`,
        content: Buffer.from(codeownersFor(login)).toString("base64"),
        sha: cur.sha,
        branch: "main",
      }),
    );
  } finally {
    gh(["api", "-X", "POST", `repos/${REPO}/branches/main/protection/enforce_admins`]);
  }
}

// ── Commands ────────────────────────────────────────────────────────────────

async function status() {
  const cfg = await getGateConfig();
  say("Release approver:", cfg.approverEmail ? `${cfg.approverName} <${cfg.approverEmail}> (GitHub ${cfg.approverGithub || "-"})` : "NONE - releases are blocked");
  say("Owner notified at:", ownerEmail());
  say("Audit bucket:", process.env.RELEASE_AUDIT_BUCKET || "NOT SET");
  for (const h of cfg.history.slice(-10)) say(" ", h.at?.toISOString?.() || h.at, h.action, h.fromEmail, "->", h.toEmail, h.note);
}

async function nameApprover({ email, name, github, reason, action }) {
  email = String(email || "").trim().toLowerCase();
  const user = await User.findOne({ email }).select("role email username disabled");
  if (!user) throw new Error(`No ADLM account for ${email}. They must sign up at www.adlmstudio.net first.`);
  if (user.disabled) throw new Error(`${email} is disabled.`);
  if (user.role === "admin") {
    throw new Error(`${email} is a super-admin. The approver must be someone other than the people whose releases they check.`);
  }
  if (email === ownerEmail()) throw new Error("The owner cannot be the release approver.");

  const before = await getGateConfig();
  say(`Naming ${name || email} <${email}> (GitHub ${github || "-"}) as release approver.`);

  // Design Access already opens the sign-off desk, and designMode.js unmasks
  // that one path for the named approver, so a designer keeps their role.
  if (user.role === "design" || user.role === "release_approver") {
    say(`  keeping role ${user.role} (it opens the sign-off desk)`);
  } else {
    await step(`set ${email} role ${user.role} -> release_approver`, async () => {
      user.role = "release_approver";
      await user.save();
    });
  }
  await step(`ReleaseGateConfig approver ${before.approverEmail || "(none)"} -> ${email}`, () =>
    ReleaseGateConfig.findByIdAndUpdate(
      GATE_ID,
      {
        $set: { approverEmail: email, approverName: name || "", approverGithub: github || "" },
        $push: { history: { by: BY, action, fromEmail: before.approverEmail, toEmail: email, note: reason || "" } },
      },
      { upsert: true },
    ),
  );
  await step(`SSM watcher approver -> ${email} / ${github || "-"}`, () => setWatcherApprover(email, github));
  if (github) {
    await step(`GitHub: invite ${github} to ${REPO} (push)`, () =>
      gh(["api", "-X", "PUT", `repos/${REPO}/collaborators/${github}`, "-f", "permission=push"]),
    );
    await step(`GitHub: ${ENVIRONMENT} environment reviewer -> ${github}, admins cannot bypass`, () => setEnvironmentReviewer(github));
  }
  if (!CONFIRM) return;

  await recordGateEvent(action, { approverEmail: email, previousApprover: before.approverEmail, github, reason, actor: BY });
  const sent = await gateMail({
    to: [email, before.approverEmail, ownerEmail()],
    subject: `${name || email} is now the ADLM release approver`,
    title: "You are the ADLM release approver",
    lines: [
      `${esc(name || email)}, from now on no ADLM update reaches customers until you sign it off.`,
      "Website and API changes: you review the pull request on GitHub, and API deploys wait for your approval in GitHub Actions.",
      "Plugin releases (HERON, QUIV, RateGen, MEP and the rest): you approve them on the Release sign-off page. While a build is pending, your own Installer Hub offers it to you to install and test.",
      "Website changes can be tried first at https://preview.adlmstudio.net, which only staff and the approver can open when signed in.",
      "If anyone forces a release through without you, you are emailed immediately and asked to review it.",
    ],
    cta: { label: "Open Release sign-off", href: `${String(process.env.PUBLIC_SITE_URL || "https://www.adlmstudio.net").replace(/\/+$/, "")}/admin/releases` },
  });
  say(sent ? "  - notification sent (SES)" : "  ! SES refused the notification. Nothing was rerouted; see the error above.");
}

async function offboard() {
  const reason = String(args.reason || "").trim();
  if (reason.length < 5) throw new Error('--reason is required, e.g. --reason "Left ADLM on 30 Sep 2026"');
  const cfg = await getGateConfig();
  if (!cfg.approverEmail) throw new Error("There is no release approver to offboard.");
  const leaving = cfg.approverEmail;
  const leavingGithub = cfg.approverGithub;
  const successor = args["successor-email"] ? String(args["successor-email"]).toLowerCase() : "";

  say(`Offboarding ${cfg.approverName || leaving} <${leaving}> (GitHub ${leavingGithub || "-"}).`);
  say(successor ? `Successor: ${successor}` : "No successor: releases stay BLOCKED until one is named (emergency path still works).");

  const user = await User.findOne({ email: leaving }).select("role refreshVersion");
  if (user) {
    await step(`website: ${leaving} role ${user.role} -> user, sign out every session`, async () => {
      user.role = "user";
      user.refreshVersion = (user.refreshVersion || 1) + 1;
      await user.save();
    });
  }
  await step(`ReleaseGateConfig approver ${leaving} -> ${successor || "(none)"}`, () =>
    ReleaseGateConfig.findByIdAndUpdate(GATE_ID, {
      $set: { approverEmail: "", approverName: "", approverGithub: "" },
      $push: { history: { by: BY, action: "approver.offboarded", fromEmail: leaving, toEmail: "", note: reason } },
    }),
  );
  await step("SSM watcher approver -> (none)", () => setWatcherApprover("", ""));
  if (leavingGithub) {
    await step(`GitHub: remove ${leavingGithub} from ${REPO}`, () =>
      gh(["api", "-X", "DELETE", `repos/${REPO}/collaborators/${leavingGithub}`]),
    );
    await step(`GitHub: clear ${ENVIRONMENT} environment reviewer`, () => setEnvironmentReviewer(args["successor-github"] || ""));
  }

  if (CONFIRM) {
    await recordGateEvent("approver.offboarded", { approverEmail: leaving, github: leavingGithub, reason, successor, actor: BY });
    const sent = await gateMail({
      to: [leaving],
      subject: "You are no longer an ADLM Studio team member",
      title: "Your ADLM Studio access has ended",
      lines: [
        `Hello ${esc(cfg.approverName || "")},`,
        "This is to confirm that you are no longer a member of the ADLM Studio team, and that your role as release approver has ended.",
        "Your staff access to the ADLM website and admin area, and your access to the ADLM code repositories, have been removed. Your personal account and anything you bought yourself are not affected.",
        "Thank you for the work you did with us. If you believe this message was sent in error, reply to it.",
      ],
    });
    say(sent ? `  - offboarding notice sent to ${leaving} (SES)` : "  ! SES refused the offboarding notice. Nothing was rerouted; send it again once SES accepts.");
    await gateMail({
      to: [ownerEmail()],
      subject: `Release approver offboarded: ${leaving}`,
      title: "Release approver offboarded",
      lines: [`${esc(leaving)} is no longer the release approver.`, `Reason: ${esc(reason)}`, successor ? `Successor: ${esc(successor)}` : "<strong>No successor named: releases are blocked.</strong>"],
    });
  }

  if (leavingGithub) {
    if (args["successor-github"]) {
      await step(`GitHub: CODEOWNERS -> @${args["successor-github"]} (lifts enforce_admins for one commit; watcher emails)`, () =>
        rewriteCodeowners(args["successor-github"], reason),
      );
    } else {
      say("  CODEOWNERS still names the leaver. GitHub ignores owners without access, so main now needs");
      say("  a successor's approval to merge anything: run set-approver for the successor.");
    }
  }

  if (successor) {
    await nameApprover({
      email: successor,
      name: args["successor-name"],
      github: args["successor-github"],
      reason,
      action: "approver.named",
    });
  }
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI is not set");
  await mongoose.connect(uri, { dbName: process.env.DB_NAME || "adlmWeb" });
  try {
    if (cmd === "status") await status();
    else if (cmd === "set-approver") {
      if (!args.email) throw new Error("--email is required");
      await nameApprover({ email: args.email, name: args.name, github: args.github, reason: args.reason, action: "approver.named" });
    } else if (cmd === "offboard") await offboard();
    else say("usage: release-gate.mjs status | set-approver --email --name --github [--confirm] | offboard --reason [--successor-*] [--confirm]");
    if (!CONFIRM && cmd !== "status") say("\nDry run. Add --confirm to do it.");
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error("release-gate:", err?.message || err);
  process.exit(1);
});
