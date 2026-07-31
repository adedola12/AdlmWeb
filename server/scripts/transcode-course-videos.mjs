/**
 * Turns the archived masters into adaptive HLS with MediaConvert.
 *
 * Runs in two phases because MediaConvert is asynchronous:
 *
 *   node scripts/transcode-course-videos.mjs                # plan
 *   node scripts/transcode-course-videos.mjs --apply        # submit jobs
 *   node scripts/transcode-course-videos.mjs --status       # poll, record results
 *   node scripts/transcode-course-videos.mjs --status --watch
 *
 * Submitting is cheap and idempotent-ish: a module that already has an hlsKey
 * is skipped unless --force, so re-running after a partial failure only
 * re-encodes what actually failed.
 */
import "dotenv/config";
import { connectDB } from "../db.js";
import { PaidCourse } from "../models/PaidCourse.js";
import { submitHlsJob, getJobState } from "../utils/awsMediaConvert.js";

const APPLY = process.argv.includes("--apply");
const STATUS = process.argv.includes("--status");
const WATCH = process.argv.includes("--watch");
const FORCE = process.argv.includes("--force");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? "" : String(process.argv[i + 1] || "");
}
const SKU = argValue("--sku") || "bim-bld-arch";
const COHORT = argValue("--cohort") || "2025";

function outPrefixFor(moduleCode) {
  return `hls/${SKU}/${COHORT}/${moduleCode.toLowerCase()}/`;
}

/** Same idea as the ingest: report every missing credential together. */
const REQUIRED = [
  ["AWS_REGION", "e.g. us-east-1"],
  ["AWS_ACCESS_KEY_ID", "app IAM user"],
  ["AWS_SECRET_ACCESS_KEY", "app IAM user"],
  ["AWS_VIDEO_ARCHIVE_BUCKET", "where the masters are"],
  ["AWS_VIDEO_DELIVERY_BUCKET", "where the HLS output goes"],
  ["AWS_MEDIACONVERT_ENDPOINT", "aws mediaconvert describe-endpoints"],
  ["AWS_MEDIACONVERT_ROLE_ARN", "role MediaConvert assumes to read/write S3"],
];

// Accepts either COURSE_-prefixed or bare names, matching utils/awsS3.js.
function envValue(name) {
  return (
    String(process.env[`COURSE_${name}`] || "").trim() ||
    String(process.env[name] || "").trim()
  );
}

function preflight({ warnOnly = false } = {}) {
  const missing = REQUIRED.filter(([name]) => !envValue(name));
  if (!missing.length) {
    if (warnOnly) console.log("\nCredentials look complete — --apply is ready to run.");
    return;
  }
  const label = warnOnly ? "Not ready to --apply yet" : "Cannot start";
  console.log(`\n${label} — ${missing.length} setting(s) missing from server/.env:\n`);
  for (const [name, hint] of missing) console.log(`  ${name.padEnd(28)} ${hint}`);
  console.log("\nSee docs/COURSE_VIDEO_PIPELINE.md for how to obtain each one.");
  if (!warnOnly) process.exit(1);
}

await connectDB();
const course = await PaidCourse.findOne({ sku: SKU });
if (!course) {
  console.error(`No course with sku "${SKU}".`);
  process.exit(1);
}

// ── status ──────────────────────────────────────────────────────────────────
if (STATUS) {
  preflight();

  // A watch can run for the better part of an hour. Anything transient in that
  // window — a dropped Mongo socket, a throttled AWS call — used to escape the
  // per-module catch and kill the process, which reads as "the transcodes
  // failed" when the jobs themselves were fine. Nothing here is worth aborting
  // a long poll over.
  let interrupted = false;
  process.on("SIGINT", () => {
    interrupted = true;
    console.log("\nStopped watching. The jobs keep running; re-run --status any time.");
  });

  let lastError = "";

  while (!interrupted) {
    try {
      // Re-read each pass rather than holding one document open for an hour: a
      // submit running elsewhere would otherwise make this save fail on a
      // version conflict, and the in-memory copy would drift from reality.
      const fresh = await PaidCourse.findOne({ sku: SKU });
      if (!fresh) throw new Error(`course ${SKU} disappeared`);

      const pending = (fresh.modules || []).filter(
        (m) => m.transcodeJobId && m.transcodeStatus !== "COMPLETE",
      );
      if (!pending.length) break;

      let changed = false;
      for (const module of pending) {
        try {
          const state = await getJobState(module.transcodeJobId);
          const was = module.transcodeStatus;
          module.transcodeStatus = state.status || was;
          if (state.status === "COMPLETE") {
            module.hlsKey = `${outPrefixFor(module.code)}index.m3u8`;
            module.transcodeError = "";
          } else if (state.status === "ERROR") {
            module.transcodeError = state.errorMessage || "unknown";
          }
          if (module.transcodeStatus !== was) changed = true;
          console.log(
            `  ${module.code}  ${module.transcodeStatus}` +
              (state.percent ? ` ${state.percent}%` : "") +
              (state.errorMessage ? ` — ${state.errorMessage}` : ""),
          );
        } catch (err) {
          console.error(`  ${module.code} status check failed: ${err.message}`);
        }
      }
      if (changed) await fresh.save();
      lastError = "";
    } catch (err) {
      // Report once and keep polling. Our inability to read or record the
      // state has no bearing on whether the jobs themselves are progressing.
      if (err.message !== lastError) {
        console.error(`  poll failed, will retry: ${err.message}`);
        lastError = err.message;
      }
    }

    if (!WATCH) break;
    await new Promise((r) => setTimeout(r, 30000));
  }

  // Report what is actually true at the end, rather than assuming success.
  const final = await PaidCourse.findOne({ sku: SKU }).lean();
  const modules = final?.modules || [];
  const done = modules.filter((m) => m.hlsKey).length;
  const failed = modules.filter((m) => m.transcodeStatus === "ERROR");

  console.log(`\n${done}/${modules.length} modules have a playable HLS manifest.`);
  if (failed.length) {
    console.log(`\n${failed.length} job(s) failed:`);
    for (const m of failed) console.log(`  ✗ ${m.code}  ${m.transcodeError}`);
    console.log("\nRe-run with --apply to resubmit them.");
  }

  process.exit(failed.length ? 1 : 0);
}

// ── submit ──────────────────────────────────────────────────────────────────
const planned = course.modules.filter((m) => {
  if (!m.sourceKey) return false;
  if (m.hlsKey && !FORCE) return false;
  if (m.transcodeJobId && m.transcodeStatus === "PROGRESSING" && !FORCE) return false;
  return true;
});

const noSource = course.modules.filter((m) => !m.sourceKey);

console.log(`course:   ${course.title} (${SKU})`);
console.log(`to encode: ${planned.length} modules`);
for (const m of planned) {
  console.log(`  ${m.code}  ${m.sourceKey}`);
  console.log(`        -> ${outPrefixFor(m.code)}index.m3u8`);
}
if (noSource.length) {
  console.log(
    `\n${noSource.length} module(s) have no archived master yet ` +
      `(run ingest-drive-videos.mjs first): ${noSource.map((m) => m.code).join(", ")}`,
  );
}

if (!APPLY) {
  console.log("\nDry run. Re-run with --apply to submit these to MediaConvert.");
  preflight({ warnOnly: true });
  process.exit(0);
}

preflight();

let submitted = 0;
for (const module of planned) {
  try {
    const jobId = await submitHlsJob({
      sourceKey: module.sourceKey,
      outPrefix: outPrefixFor(module.code),
      jobTag: `${SKU}:${module.code}`,
    });
    module.transcodeJobId = jobId;
    module.transcodeStatus = "SUBMITTED";
    module.transcodeError = "";
    await course.save();
    submitted += 1;
    console.log(`  ✓ ${module.code} submitted (${jobId})`);
  } catch (err) {
    console.error(`  ✗ ${module.code} failed to submit: ${err.message}`);
  }
}

console.log(
  `\n${submitted}/${planned.length} jobs submitted. ` +
    `Poll with --status (add --watch to follow).`,
);
process.exit(0);
