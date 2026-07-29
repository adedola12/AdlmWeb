/**
 * Streams the class recordings out of Google Drive and into Bunny Stream,
 * then writes the resulting `bunny:LIB:VIDEO` reference onto the matching
 * course module — so the platform, not Google Classroom, becomes where
 * students watch.
 *
 * The Drive -> Bunny transfer is streamed, never buffered: the largest
 * recording is 6.25 GB and would blow the heap otherwise.
 *
 *   node scripts/ingest-drive-videos.mjs                 # dry run, plans the work
 *   node scripts/ingest-drive-videos.mjs --apply         # do it
 *   node scripts/ingest-drive-videos.mjs --apply --only W3D2,W3D3
 *   node scripts/ingest-drive-videos.mjs --apply --force # re-upload modules that already have video
 *
 * Safe to stop and re-run: modules that already carry a videoUrl are skipped
 * unless --force, so an interrupted run picks up where it left off.
 *
 * Setup (one time):
 *   1. Create a Google Cloud service account, download its JSON key.
 *   2. Share the "Class video" Drive folder with the service account's email
 *      (viewer is enough).
 *   3. Put the key somewhere the server can read it and set
 *      GOOGLE_SERVICE_ACCOUNT_KEY=/path/to/key.json  (or paste the JSON
 *      itself into that variable).
 *   BUNNY_STREAM_API_KEY and BUNNY_STREAM_LIB_ID are already in .env.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JWT } from "google-auth-library";
import { connectDB } from "../db.js";
import { PaidCourse } from "../models/PaidCourse.js";

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

const BUNNY_KEY = process.env.BUNNY_STREAM_API_KEY;
const BUNNY_LIB = process.env.BUNNY_STREAM_LIB_ID;

function gb(bytes) {
  return `${(Number(bytes || 0) / 1024 ** 3).toFixed(2)} GB`;
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
  return res.body;
}

// ── Bunny Stream ────────────────────────────────────────────────────────────
async function bunnyCreate(title) {
  const res = await fetch(`https://video.bunnycdn.com/library/${BUNNY_LIB}/videos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", AccessKey: BUNNY_KEY },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`Bunny create failed: ${await res.text()}`);
  const json = await res.json();
  return json.guid;
}

async function bunnyUpload(videoId, stream) {
  const res = await fetch(
    `https://video.bunnycdn.com/library/${BUNNY_LIB}/videos/${videoId}`,
    {
      method: "PUT",
      headers: { AccessKey: BUNNY_KEY, "Content-Type": "application/octet-stream" },
      body: stream,
      duplex: "half", // required by undici when the body is a stream
    },
  );
  if (!res.ok) throw new Error(`Bunny upload failed: ${await res.text()}`);
}

// ── main ────────────────────────────────────────────────────────────────────
const manifest = JSON.parse(
  fs.readFileSync(path.join(here, "drive-video-manifest.json"), "utf8"),
);

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
  if (module.videoUrl && !FORCE) {
    skipped.push(`${item.moduleCode}: already has video (${module.videoUrl})`);
    continue;
  }
  planned.push(item);
}

const totalBytes = planned.reduce((sum, i) => sum + Number(i.bytes || 0), 0);

console.log(`course:   ${course.title} (${manifest.courseSku})`);
console.log(`to move:  ${planned.length} recordings, ${gb(totalBytes)}`);
for (const item of planned) {
  console.log(`  ${item.moduleCode}  ${gb(item.bytes).padStart(8)}  ${item.name}`);
}
if (skipped.length) {
  console.log(`\nskipped (${skipped.length}):`);
  for (const line of skipped) console.log(`  ${line}`);
}
for (const decision of manifest.needsDecision || []) {
  console.log(
    `\n⚠ ${decision.moduleCode} has no file assigned — ${decision.issue}`,
  );
  if (decision.candidate) {
    console.log(`  candidate: ${decision.candidate.name} — ${decision.candidate.question}`);
  }
}

if (!APPLY) {
  console.log("\nDry run. Re-run with --apply to move these to Bunny.");
  process.exit(0);
}
if (!BUNNY_KEY || !BUNNY_LIB) {
  console.error("BUNNY_STREAM_API_KEY / BUNNY_STREAM_LIB_ID missing.");
  process.exit(1);
}

const token = await driveToken();
let done = 0;

for (const item of planned) {
  const label = `${item.moduleCode} (${gb(item.bytes)})`;
  try {
    console.log(`\n→ ${label} creating container…`);
    const videoId = await bunnyCreate(`${manifest.courseSku}-${item.moduleCode}`);

    console.log(`  streaming ${item.name}…`);
    const stream = await openDriveFile(item.fileId, token);
    await bunnyUpload(videoId, stream);

    const shorthand = `bunny:${BUNNY_LIB}:${videoId}`;
    const module = course.modules.find((m) => m.code === item.moduleCode);
    module.videoUrl = shorthand;
    await course.save();

    done += 1;
    console.log(`  ✓ ${label} → ${shorthand}`);
  } catch (err) {
    console.error(`  ✗ ${label} failed: ${err.message}`);
    console.error("    (re-run to retry — finished modules are skipped)");
  }
}

console.log(`\n${done}/${planned.length} recordings ingested.`);
process.exit(0);
