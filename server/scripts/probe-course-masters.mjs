/**
 * Reads the real pixel dimensions of every archived lecture master.
 *
 *   node scripts/probe-course-masters.mjs
 *
 * Why this exists: awsMediaConvert.js caps the HLS ladder at 720p on the
 * stated grounds that "these are 720p screen recordings". Two masters picked at
 * random turned out to be 3840x2160, so that premise is wrong and the ladder
 * has been throwing away three quarters of the picture. Before adding 1080p and
 * 2160p rungs, this checks EVERY master rather than generalising from two —
 * MediaConvert has no no-upscale option, so a 2160p rung emitted from a genuine
 * 720p source would upscale it and burn encoding time on invented pixels.
 *
 * Reads only the file header over a ranged GET, not the whole 5 GB object: MP4
 * dimensions live in the `tkhd` box inside `moov`, which for these files sits
 * at the front. Falls back to the tail when it does not.
 */
import "dotenv/config";
import { connectDB } from "../db.js";
import { PaidCourse } from "../models/PaidCourse.js";
import { s3Client, archiveBucket } from "../utils/awsS3.js";
import { GetObjectCommand } from "@aws-sdk/client-s3";

const HEAD_BYTES = 8 * 1024 * 1024;

async function range(key, from, to) {
  const res = await s3Client().send(
    new GetObjectCommand({ Bucket: archiveBucket(), Key: key, Range: `bytes=${from}-${to}` }),
  );
  return Buffer.from(await res.Body.transformToByteArray());
}

/**
 * Walk MP4 boxes looking for every `tkhd`, and return the largest width/height
 * found. A file has one track header per track; the audio track reports 0x0,
 * so taking the maximum picks the video without having to match track types.
 */
function dimensionsFrom(buf) {
  let best = { w: 0, h: 0 };

  const walk = (start, end, depth) => {
    let p = start;
    while (p + 8 <= end && depth < 6) {
      const size = buf.readUInt32BE(p);
      const type = buf.toString("latin1", p + 4, p + 8);
      // size 0 means "to end of file"; size 1 means a 64-bit size follows.
      const box = size === 0 ? end - p : size === 1 ? Number(buf.readBigUInt64BE(p + 8)) : size;
      if (box < 8 || p + box > end) break;

      if (type === "tkhd") {
        // version byte, then 3 flag bytes; width/height are the last 8 bytes
        // of the box, as 16.16 fixed point.
        const w = buf.readUInt32BE(p + box - 8) / 65536;
        const h = buf.readUInt32BE(p + box - 4) / 65536;
        if (w > best.w) best = { w: Math.round(w), h: Math.round(h) };
      } else if (["moov", "trak", "mdia", "minf", "stbl"].includes(type)) {
        walk(p + 8, p + box, depth + 1);
      }
      p += box;
    }
  };

  walk(0, buf.length, 0);
  return best.w ? best : null;
}

await connectDB();
const courses = await PaidCourse.find({}).select("sku title modules").lean();

const rows = [];
for (const c of courses) {
  for (const m of c.modules || []) {
    if (!m.sourceKey) continue;
    let dims = null;
    let note = "";
    try {
      dims = dimensionsFrom(await range(m.sourceKey, 0, HEAD_BYTES - 1));
      if (!dims) {
        // moov at the tail (not faststart) — try the last chunk instead.
        const size = Number(m.sourceBytes || 0);
        if (size > HEAD_BYTES) {
          dims = dimensionsFrom(await range(m.sourceKey, size - HEAD_BYTES, size - 1));
          if (dims) note = "(moov at tail)";
        }
      }
    } catch (e) {
      note = `read failed: ${e?.message || e}`;
    }
    rows.push({ sku: c.sku, code: m.code, dims, note });
    console.log(
      `${c.sku}/${m.code}`.padEnd(26) +
        (dims ? `${dims.w}x${dims.h}` : "unknown").padEnd(12) +
        note,
    );
  }
}

const known = rows.filter((r) => r.dims);
const buckets = {};
for (const r of known) {
  const k = `${r.dims.w}x${r.dims.h}`;
  buckets[k] = (buckets[k] || 0) + 1;
}
console.log("\n--- summary ---");
for (const [k, n] of Object.entries(buckets).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(12)} ${n}`);
}
const unknown = rows.length - known.length;
if (unknown) console.log(`  ${String("unknown").padEnd(12)} ${unknown}`);
const minH = Math.min(...known.map((r) => r.dims.h));
console.log(`\nsmallest master: ${minH}p — rungs above this would upscale.`);
process.exit(0);
