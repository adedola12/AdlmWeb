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
 *   3. GOOGLE_SERVICE_ACCOUNT_KEY=/path/to/key.json (or the JSON inline)
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
import { objectSize, uploadStream, archiveBucket } from "../utils/awsS3.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");

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
function loadServiceAccount() {
  const raw = String(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "").trim();
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not set");
  const json = raw.startsWith("{") ? raw : fs.readFileSync(raw, "utf8");
  return JSON.parse(json);
}

async function driveToken() {
  const key = loadServiceAccount();
  const client = new JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  const { access_token: token } = await client.getAccessToken();
  if (!token) throw new Error("Could not mint a Drive access token");
  return token;
}

async function openDriveFile(fileId, token) {
  const url =
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}` +
    `?alt=media&supportsAllDrives=true`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok || !res.body) {
    throw new Error(`Drive read failed (${res.status}): ${await res.text()}`);
  }
  // The SDK's multipart uploader wants a Node stream, not a web one.
  return Readable.fromWeb(res.body);
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
console.log(`archive:  s3://${process.env.AWS_VIDEO_ARCHIVE_BUCKET || "<AWS_VIDEO_ARCHIVE_BUCKET unset>"}`);
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

if (!APPLY) {
  console.log("\nDry run. Re-run with --apply to move these into S3.");
  process.exit(0);
}

// ── run ─────────────────────────────────────────────────────────────────────
const bucket = archiveBucket();
const token = await driveToken();
let done = 0;

for (const item of planned) {
  const label = `${item.moduleCode} (${gb(item.bytes)})`;
  try {
    const existing = await objectSize(item.key, bucket);
    if (existing !== null && existing === Number(item.bytes) && !FORCE) {
      console.log(`= ${label} already in S3, recording key only`);
    } else {
      console.log(`\n→ ${label} ${item.name}`);
      let lastPct = 0;
      const body = await openDriveFile(item.fileId, token);
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
          const pct = Math.floor((Number(loaded || 0) / Number(item.bytes)) * 100);
          if (pct >= lastPct + 10) {
            lastPct = pct;
            process.stdout.write(`  ${pct}%…`);
          }
        },
      });
      process.stdout.write("\n");
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
    console.error("    (re-run to retry — archived modules are skipped)");
  }
}

console.log(`\n${done}/${planned.length} recordings archived to s3://${bucket}.`);
process.exit(0);
