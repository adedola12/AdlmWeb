#!/usr/bin/env node
/**
 * Uploads an Installer Hub release into ADLM's PRIVATE file store, at the one
 * key the paid gate serves it from.
 *
 * WHY THIS EXISTS
 *   Every other product has a deploy-*-via-api.ps1. The Hub had nothing, so
 *   shipping it was a manual dashboard upload that nobody did — which is how
 *   the released Hub drifted to v1.0.0 while its catalog pin said v1.0.1.
 *
 * WHERE IT GOES (R3, changed 2026-09-27)
 *   The Hub is for paid accounts only. /me/downloads/installer-hub checks the
 *   account and hands out a short-lived signed link to
 *   DOWNLOADS["installer-hub"].key in util/fileStore.js (S3 when FILES_BUCKET
 *   is set, else the private R2 installers bucket). This script used to put
 *   each build in the PUBLIC R2 prefix adlm/installer-hub and print a public
 *   URL to paste into Setting.installerHubUrl; anyone with that URL skipped
 *   the gate. It now writes to the private key only and prints no URL. The
 *   upload replaces the live Hub in place (S3 keeps the previous version for
 *   30 days), and every signed-in paid account gets it within five minutes.
 *   Same result as `node scripts/upload-download.mjs installer-hub <file>`,
 *   with credentials read from SSM instead of .env.
 *
 * USAGE
 *   node scripts/upload-hub-release.mjs <path-to-Setup.exe>
 *   node scripts/upload-hub-release.mjs <path-to-Setup.exe> --files-bucket <name>
 *
 *   Pass --files-bucket (or FILES_BUCKET) once the AdlmFiles stack is live
 *   and the API has FILES_BUCKET: the file has to go where the API reads it.
 *   Without it the file goes to the private R2 bucket (R2_INSTALLERS_BUCKET).
 *
 * Credentials come from SSM and are never printed. Values already in the
 * environment win over SSM.
 */
import { readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";

const SSM_PREFIX = (process.env.SSM_PREFIX || "/adlm/cloud/prod").replace(/\/+$/, "");
const AWS_REGION = process.env.AWS_REGION || "eu-west-1";

// What util/fileStore.js needs to reach the private R2 bucket. R2_BUCKET and
// R2_PUBLIC_BASE_URL are read only because isR2Configured() asks for them;
// nothing is written to the public bucket.
const R2_VARS = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_BASE_URL",
  "R2_INSTALLERS_BUCKET",
];

const ssm = (name) =>
  execFileSync(
    "aws",
    ["ssm", "get-parameter", "--name", `${SSM_PREFIX}/${name}`, "--with-decryption",
     "--query", "Parameter.Value", "--output", "text", "--region", AWS_REGION],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();

const mb = (n) => `${(n / 1048576).toFixed(2)} MB`;

async function main() {
  const args = process.argv.slice(2);
  const filePath = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--files-bucket");
  if (!filePath) {
    throw new Error("Usage: node scripts/upload-hub-release.mjs <path-to-Setup.exe> [--files-bucket <name>]");
  }
  const fbIdx = args.indexOf("--files-bucket");
  if (fbIdx >= 0 && args[fbIdx + 1]) process.env.FILES_BUCKET = args[fbIdx + 1];

  const { hubUploadProblem, HUB_KEY, HUB_CONTENT_TYPE } = await import("../util/hubStorage.js");
  const stat = statSync(filePath);
  const problem = hubUploadProblem({ filename: filePath, size: stat.size });
  if (problem) throw new Error(problem);

  if (!String(process.env.FILES_BUCKET || "").trim()) {
    for (const name of R2_VARS) {
      if (!String(process.env[name] || "").trim()) process.env[name] = ssm(name);
    }
  }

  const { presignUpload, headFile, fileStoreBackend } = await import("../util/fileStore.js");
  const backend = fileStoreBackend();
  if (!backend) {
    throw new Error("No private file storage is configured (FILES_BUCKET or R2_INSTALLERS_BUCKET). Nothing uploaded.");
  }

  const body = readFileSync(filePath);
  const sha256 = crypto.createHash("sha256").update(body).digest("hex");
  console.log(`\nUploading ${mb(stat.size)} -> private ${backend} store, ${HUB_KEY}`);

  const { uploadUrl } = await presignUpload({ key: HUB_KEY, contentType: HUB_CONTENT_TYPE, expiresIn: 3600 });
  const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": HUB_CONTENT_TYPE }, body });
  if (!put.ok) throw new Error(`Upload refused: ${put.status} ${await put.text()}`);

  const landed = await headFile({ key: HUB_KEY });
  console.log(`\nUploaded: ${HUB_KEY} on ${backend}, ${landed?.size ?? "?"} bytes, sha256 ${sha256}`);
  console.log("Paid accounts get it from /me/downloads/installer-hub within five minutes.");
  console.log("There is no public URL: do not paste anything into Setting.installerHubUrl.");
}

main().catch((e) => {
  console.error(`\n${e?.message || e}\n`);
  process.exit(1);
});
