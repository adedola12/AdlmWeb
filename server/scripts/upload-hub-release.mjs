#!/usr/bin/env node
/**
 * Uploads an Installer Hub release ZIP to R2 and prints the URL to publish.
 *
 * WHY THIS EXISTS
 *   Every other product has a deploy-*-via-api.ps1. The Hub had nothing, so
 *   shipping it was a manual dashboard upload that nobody did — which is how
 *   the released Hub drifted to v1.0.0 while its catalog pin said v1.0.1, and
 *   how it ended up bundling a Revit plugin two versions behind the catalog it
 *   also bundles.
 *
 * WHAT IT DOES NOT DO
 *   It does not publish. The dashboard's download button reads
 *   Setting.installerHubUrl in Mongo, and this script only puts the object in
 *   R2 and tells you the URL. Setting that field is a deliberate second step:
 *   it is the moment every user starts downloading the new build, and it
 *   belongs to a person, not a script.
 *
 * WHY adlm/installer-hub STAYS PUBLIC
 *   Unlike adlm/installers, this prefix has to be fetchable by someone with no
 *   account — it is how you get the Hub in the first place. It is deliberately
 *   out of scope for migrate-installers-to-private-bucket.mjs.
 *
 * USAGE
 *   node scripts/upload-hub-release.mjs <path-to-zip>
 *   node scripts/upload-hub-release.mjs <path-to-zip> --name ADLMInstallerHub-v1.0.2.zip
 *
 * Credentials come from SSM and are never printed.
 */
import { createReadStream, statSync } from "node:fs";
import { basename } from "node:path";
import { execFileSync } from "node:child_process";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

const SSM_PREFIX = (process.env.SSM_PREFIX || "/adlm/cloud/prod").replace(/\/+$/, "");
const AWS_REGION = process.env.AWS_REGION || "eu-west-1";
const KEY_PREFIX = "adlm/installer-hub";

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
  const filePath = args.find((a) => !a.startsWith("--"));
  if (!filePath) throw new Error("Usage: node scripts/upload-hub-release.mjs <path-to-zip> [--name <filename>]");

  const nameIdx = args.indexOf("--name");
  const fileName = (nameIdx >= 0 ? args[nameIdx + 1] : basename(filePath))
    .replace(/[^a-zA-Z0-9._-]/g, "_");

  const stat = statSync(filePath);
  const accountId = ssm("R2_ACCOUNT_ID");
  const bucket = ssm("R2_BUCKET");
  const publicBase = ssm("R2_PUBLIC_BASE_URL").replace(/\/+$/, "");

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: ssm("R2_ACCESS_KEY_ID"),
      secretAccessKey: ssm("R2_SECRET_ACCESS_KEY"),
    },
  });

  // Same name, different bytes is the trap this warns about: the timestamp
  // prefix means a re-upload never overwrites, so two builds can sit side by
  // side under one version number and only the linked one is real.
  const existing = await client.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: `${KEY_PREFIX}/`, MaxKeys: 100 }),
  );
  const clashes = (existing.Contents || []).filter((o) => o.Key.endsWith(`-${fileName}`));
  if (clashes.length) {
    console.log(`\nNOTE: ${clashes.length} object(s) already carry this filename:`);
    for (const c of clashes) {
      console.log(`  ${mb(c.Size).padStart(10)}  ${new Date(c.LastModified).toISOString().slice(0, 10)}  ${c.Key}`);
    }
    console.log(
      `  Yours is ${mb(stat.size)}. A differing size means a DIFFERENT build under the\n` +
        "  same version number. Consider bumping the version instead.",
    );
  }

  const key = `${KEY_PREFIX}/${Date.now()}-${fileName}`;
  console.log(`\nUploading ${mb(stat.size)} -> ${bucket}/${key}`);

  const upload = new Upload({
    client,
    params: {
      Bucket: bucket,
      Key: key,
      Body: createReadStream(filePath),
      ContentType: "application/zip",
      CacheControl: "public, max-age=31536000, immutable",
    },
    queueSize: 4,
    partSize: 16 * 1024 * 1024,
  });

  let lastPct = -1;
  upload.on("httpUploadProgress", (p) => {
    if (!p.total) return;
    const pct = Math.floor((p.loaded / p.total) * 100);
    if (pct >= lastPct + 10) {
      lastPct = pct;
      process.stdout.write(`  ${pct}%\n`);
    }
  });

  await upload.done();

  const url = `${publicBase}/${key.split("/").map(encodeURIComponent).join("/")}`;
  console.log(`\nUploaded.\n\n  ${url}\n`);
  console.log("NOT published yet. To make this the download every user gets, set");
  console.log("Setting.installerHubUrl to that URL (admin settings, or the API).");
}

main().catch((e) => {
  console.error(`\n${e?.message || e}\n`);
  process.exit(1);
});
