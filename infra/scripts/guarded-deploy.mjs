#!/usr/bin/env node
/**
 * `cdk deploy`, with a refusal in front of it.
 *
 * WHY THIS EXISTS
 *
 * AdlmApi is one shared stack and everyone deploys the whole thing. CDK is
 * declarative, so a deploy does not apply your changes to the live stack — it
 * makes the live stack look like YOUR checkout. Anything the stack has that
 * your checkout does not define is deleted, silently, as part of a deploy you
 * thought was about something else.
 *
 * That is not hypothetical. On 2026-09-12 the SES mail infrastructure —
 * MailIdentity, MailConfigSet, MarketingConfigSet, MailEventsTopic,
 * MailEventsDlq, MailEventsFn, VideoPollFn and their roles — was deployed from
 * a working tree and never committed. The next push to main ran the Deploy API
 * workflow from a checkout of main, which does not define any of it, and
 * CloudFormation removed all ten resources in three minutes. The verified
 * sending identity for adlmstudio.net went with them. Nothing failed; the run
 * is green in the log.
 *
 * WHAT IT CHECKS
 *
 * Synthesize, then read the template CloudFormation is actually holding, and
 * compare the resource logical IDs. Anything in the deployed template that the
 * synthesized template does not have is a deletion, and a deletion is refused.
 *
 * Deliberately NOT a text scrape of `cdk diff`: the diff format is presentation,
 * it changes between CDK versions, and it uses the same `[-]` marker for a
 * removed resource and a removed property. Logical IDs are the actual contract.
 *
 * USAGE
 *
 *   npm run deploy -- --all           check, then deploy
 *   npm run deploy -- AdlmApi         one stack
 *   npm run check:deletions           check only, deploy nothing
 *
 * `--against <template.json>` compares with a template file rather than with
 * CloudFormation, for checking a branch on a machine with no AWS credentials.
 *
 * Every other argument is handed to `cdk deploy` untouched, so
 * `-c certificateArn=...` and friends work as they always did.
 *
 * WHEN A DELETION IS THE POINT
 *
 * Sometimes you really are removing a resource. Say so:
 *
 *   npm run deploy -- --all --allow-deletions
 *
 * or set ALLOW_STACK_DELETIONS=1. Either one prints what it is about to remove
 * and then removes it. The flag exists so that deleting infrastructure is a
 * sentence somebody typed, not a side effect of being on the wrong branch.
 *
 * PERMISSIONS
 *
 * Reading the deployed template needs cloudformation:GetTemplate. A developer
 * has it. The GitHub Actions role does not — it may only assume `cdk-*` — so on
 * an AccessDenied we assume the CDK lookup role, which CDK itself assumes during
 * synth and which carries ReadOnlyAccess. If BOTH fail we refuse rather than
 * deploy unchecked: a guard that quietly stops guarding is worse than no guard.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const INFRA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(INFRA_DIR, "cdk.out");
const QUALIFIER = process.env.CDK_QUALIFIER || "hnb659fds";
const WIN = process.platform === "win32";

// GitHub Actions renders colour in its log; a pipe into a file should not
// carry it, and NO_COLOR turns it off everywhere.
const ESC = String.fromCharCode(27);
const COLOUR = !process.env.NO_COLOR && (process.env.CI === "true" || !!process.stderr.isTTY);
const paint = (code) => (s) => (COLOUR ? `${ESC}[${code}m${s}${ESC}[0m` : String(s));
const bold = paint(1);
const red = paint(31);
const yellow = paint(33);
const dim = paint(2);

const argv = process.argv.slice(2);
const checkOnly = argv.includes("--check-only");
const allowDeletions =
  argv.includes("--allow-deletions") || process.env.ALLOW_STACK_DELETIONS === "1";

// --against <file>: compare with a template on disk instead of asking
// CloudFormation. Lets you check a branch with no AWS credentials — and it is
// how the refusal itself is tested, by handing it a template holding a resource
// this checkout does not define.
// Accept both spellings. `--against x.json` and `--against=x.json` must behave
// the same: the equals form used to be missed entirely, so `--against=x.json`
// silently fell through to comparing against whatever stack the ambient AWS
// credentials pointed at — the opposite of what was asked, and invisible.
const againstEqAt = argv.findIndex((a) => a.startsWith("--against="));
const againstSpAt = argv.indexOf("--against");
const againstAt = againstEqAt >= 0 ? againstEqAt : againstSpAt;
const againstFile =
  againstEqAt >= 0 ? argv[againstEqAt].slice("--against=".length) : againstSpAt >= 0 ? argv[againstSpAt + 1] : "";
if (againstAt >= 0 && !againstFile) {
  console.error("--against needs a path to a template JSON file.");
  process.exit(1);
}

// Ours, not CDK's. Everything else is passed to `cdk deploy` verbatim.
const OURS = new Set(["--check-only", "--allow-deletions"]);
const againstValueAt = againstEqAt >= 0 ? -1 : againstSpAt >= 0 ? againstSpAt + 1 : -1;
const cdkArgs = argv.filter(
  (a, i) => !OURS.has(a) && i !== againstAt && i !== againstValueAt,
);

// `cdk synth` and `cdk list` take neither --require-approval nor --all (they
// already cover every stack), so strip both before reusing these arguments.
function forReadOnly(args) {
  const out = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--require-approval") {
      i += 1; // and its value
      continue;
    }
    if (args[i].startsWith("--require-approval=") || args[i] === "--all") continue;
    out.push(args[i]);
  }
  return out;
}
const readOnlyArgs = forReadOnly(cdkArgs);

function cdk(args, opts = {}) {
  return spawnSync("npx", ["cdk", ...args], {
    cwd: INFRA_DIR,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    shell: WIN, // npx is a .cmd here
    ...opts,
  });
}

function aws(args, env = process.env) {
  return spawnSync("aws", args, { encoding: "utf8", env, shell: WIN });
}

/** The stacks this invocation is about, as CDK itself resolves them. */
function selectedStacks() {
  // `cdk list` honours --all and bare stack selectors, so it answers exactly
  // the question "what would `cdk deploy <these args>` touch" without us having
  // to reimplement CDK's selector matching.
  const r = cdk(["list", ...readOnlyArgs], { stdio: ["ignore", "pipe", "inherit"] });
  if (r.status !== 0) throw new Error("`cdk list` failed.");
  return r.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** environment + template file for each synthesized stack. */
function manifest() {
  const path = join(OUT_DIR, "manifest.json");
  if (!existsSync(path)) throw new Error(`No ${path} — synth did not run.`);
  const m = JSON.parse(readFileSync(path, "utf8"));
  const byName = new Map();
  for (const [id, a] of Object.entries(m.artifacts || {})) {
    if (a.type !== "aws:cloudformation:stack") continue;
    byName.set(id, {
      // properties.stackName is only written when it differs from the artifact id.
      stackName: a.properties?.stackName || id,
      region: String(a.environment || "").split("/").pop() || "",
      templateFile: a.properties?.templateFile || `${id}.template.json`,
    });
  }
  return byName;
}

function callerAccount() {
  const r = aws(["sts", "get-caller-identity", "--output", "json"]);
  if (r.status !== 0) throw new Error(`sts:GetCallerIdentity failed:\n${r.stderr}`);
  return JSON.parse(r.stdout).Account;
}

/**
 * The template CloudFormation is holding, or null if the stack does not exist.
 * Falls back to the CDK lookup role when the caller cannot read templates
 * directly — which is the GitHub Actions case.
 */
function deployedTemplate(stackName, region) {
  if (againstFile) {
    const parsed = JSON.parse(readFileSync(againstFile, "utf8"));
    // Accept either a bare template or the envelope `aws cloudformation
    // get-template` prints (a top-level TemplateBody), so a file saved straight
    // from the CLI compares correctly instead of looking empty.
    return parsed && parsed.TemplateBody ? parsed.TemplateBody : parsed;
  }

  const args = [
    "cloudformation",
    "get-template",
    "--stack-name",
    stackName,
    "--template-stage",
    "Processed",
    "--region",
    region,
    "--output",
    "json",
  ];

  let r = aws(args);
  if (r.status === 0) return JSON.parse(r.stdout).TemplateBody;

  const err = String(r.stderr || "");
  // A stack that has never been deployed cannot lose anything.
  if (/does not exist/i.test(err)) return null;

  if (/AccessDenied|not authorized|ExpiredToken|InvalidClientTokenId/i.test(err)) {
    const account = callerAccount();
    const roleArn = `arn:aws:iam::${account}:role/cdk-${QUALIFIER}-lookup-role-${account}-${region}`;
    const assumed = aws([
      "sts",
      "assume-role",
      "--role-arn",
      roleArn,
      "--role-session-name",
      "adlm-deploy-guard",
      "--output",
      "json",
    ]);
    if (assumed.status !== 0) {
      throw new Error(
        `Cannot read the deployed template for ${stackName}, and cannot assume\n${roleArn}\n\n` +
          `${err}\n${assumed.stderr || ""}`,
      );
    }
    const c = JSON.parse(assumed.stdout).Credentials;
    r = aws(args, {
      ...process.env,
      AWS_ACCESS_KEY_ID: c.AccessKeyId,
      AWS_SECRET_ACCESS_KEY: c.SecretAccessKey,
      AWS_SESSION_TOKEN: c.SessionToken,
    });
    if (r.status === 0) return JSON.parse(r.stdout).TemplateBody;
    if (/does not exist/i.test(String(r.stderr || ""))) return null;
  }

  throw new Error(`Could not read the deployed template for ${stackName} in ${region}:\n${r.stderr || r.stdout}`);
}

function main() {
  console.log(dim("[guard] synthesizing…"));
  const synth = cdk(["synth", "--quiet", ...readOnlyArgs], { stdio: ["ignore", "ignore", "inherit"] });
  if (synth.status !== 0) {
    console.error(red("[guard] synth failed — nothing deployed."));
    process.exit(synth.status ?? 1);
  }

  const stacks = selectedStacks();
  if (!stacks.length) {
    console.error(red("[guard] no stacks selected — refusing to deploy nothing."));
    process.exit(1);
  }

  const arts = manifest();
  const removals = [];

  for (const id of stacks) {
    const art = arts.get(id);
    if (!art) {
      console.error(red(`[guard] ${id} is not in cdk.out/manifest.json — refusing.`));
      process.exit(1);
    }

    const synthesized = JSON.parse(readFileSync(join(OUT_DIR, art.templateFile), "utf8"));
    const live = deployedTemplate(art.stackName, art.region);

    if (!live) {
      console.log(dim(`[guard] ${id}: not deployed yet — nothing to lose.`));
      continue;
    }

    // A deployed CloudFormation stack always has a non-empty Resources map.
    // If we got a live template back but it has no resources, we did NOT read
    // the stack correctly — an unwrapped envelope, a truncated body, an error
    // object that happened to be JSON. Treating that as "0 resources, so 0
    // deletions" is the one way this guard could wave through the exact wipe it
    // exists to stop, so refuse instead of proceeding blind.
    if (!live.Resources || typeof live.Resources !== "object" || !Object.keys(live.Resources).length) {
      throw new Error(
        `${id}: the live template came back with no Resources. Refusing rather than ` +
          `assuming the stack is empty — re-check credentials or the --against file.`,
      );
    }

    const have = new Set(Object.keys(synthesized.Resources || {}));
    const liveIds = Object.keys(live.Resources);
    const gone = liveIds
      .filter((logicalId) => !have.has(logicalId))
      .map((logicalId) => ({ stack: id, logicalId, type: live.Resources[logicalId]?.Type || "?" }));

    removals.push(...gone);
    console.log(
      dim(
        `[guard] ${id}: ${liveIds.length} deployed, ${have.size} in this checkout, ` +
          `${gone.length} would be deleted.`,
      ),
    );
  }

  if (removals.length && !allowDeletions) {
    console.error("");
    console.error(red(bold(`[guard] REFUSING: this deploy would DELETE ${removals.length} live resource(s).`)));
    console.error("");
    for (const r of removals) console.error(red(`    ${r.stack}  ${r.logicalId}`) + dim(`  (${r.type})`));
    console.error("");
    console.error("This almost always means your checkout is missing infrastructure that");
    console.error("somebody deployed without committing, or that you are on a branch which");
    console.error("predates it. Pull or merge the branch that defines those resources and");
    console.error("run this again.");
    console.error("");
    console.error(`If the deletion IS the point, say so: ${bold("--allow-deletions")}`);
    console.error("");
    process.exit(1);
  }

  if (removals.length) {
    console.error("");
    console.error(yellow(bold(`[guard] --allow-deletions given; DELETING ${removals.length} resource(s):`)));
    for (const r of removals) console.error(yellow(`    ${r.stack}  ${r.logicalId}  (${r.type})`));
    console.error("");
  }

  if (checkOnly) {
    console.log(dim("[guard] --check-only; not deploying."));
    return;
  }

  const deploy = cdk(["deploy", ...cdkArgs], { stdio: "inherit", encoding: undefined });
  process.exit(deploy.status ?? 1);
}

try {
  main();
} catch (e) {
  console.error(red(`[guard] ${e?.message || e}`));
  process.exit(1);
}
