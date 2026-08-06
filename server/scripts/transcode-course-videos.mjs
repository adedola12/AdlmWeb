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

function outPrefixFor(moduleCode, track = "lecture") {
  if (track === "onboarding") return `hls/${SKU}/${COHORT}/course-intro/`;
  const suffix = track === "summary" ? "-summary" : "";
  return `hls/${SKU}/${COHORT}/${moduleCode.toLowerCase()}${suffix}/`;
}

/**
 * The playable recordings hanging off one module.
 *
 * A module carries the lecture in its own fields and the recap clip nested
 * under `summary`. They encode independently — same ladder, separate jobs — so
 * everything here works on this flattened view rather than on modules.
 */
function tracksOf(module) {
  const out = [{ track: "lecture", code: module.code, data: module }];
  if (module.summary?.sourceKey) {
    out.push({ track: "summary", code: module.code, data: module.summary });
  }
  return out;
}

/**
 * Every recording on the course, module-level and course-level alike.
 *
 * The intro hangs off the course rather than any module, so it is folded in
 * here with an empty code — that way the submit loop, the status poll and the
 * final tally all cover it without a special case in each.
 */
function allTracksOf(courseDoc) {
  const out = (courseDoc.modules || []).flatMap(tracksOf);
  if (courseDoc.onboarding?.sourceKey) {
    out.push({ track: "onboarding", code: "", data: courseDoc.onboarding });
  }
  return out;
}

/** "W2P3" / "W2P3+s" / "intro" — keeps the status output in one column. */
function labelOf({ code, track }) {
  if (track === "onboarding") return "intro";
  return track === "summary" ? `${code}+s` : code;
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

      const pending = allTracksOf(fresh).filter(
        (t) => t.data.transcodeJobId && t.data.transcodeStatus !== "COMPLETE",
      );
      if (!pending.length) break;

      let changed = false;
      for (const entry of pending) {
        const { data } = entry;
        try {
          const state = await getJobState(data.transcodeJobId);
          const was = data.transcodeStatus;
          data.transcodeStatus = state.status || was;
          if (state.status === "COMPLETE") {
            data.hlsKey = `${outPrefixFor(entry.code, entry.track)}index.m3u8`;
            data.transcodeError = "";
          } else if (state.status === "ERROR") {
            data.transcodeError = state.errorMessage || "unknown";
          }
          if (data.transcodeStatus !== was) changed = true;
          console.log(
            `  ${labelOf(entry).padEnd(6)} ${data.transcodeStatus}` +
              (state.percent ? ` ${state.percent}%` : "") +
              (state.errorMessage ? ` — ${state.errorMessage}` : ""),
          );
        } catch (err) {
          console.error(`  ${labelOf(entry)} status check failed: ${err.message}`);
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
  const tracks = allTracksOf(final || {});
  const done = tracks.filter((t) => t.data.hlsKey).length;
  const failed = tracks.filter((t) => t.data.transcodeStatus === "ERROR");

  console.log(`\n${done}/${tracks.length} recordings have a playable HLS manifest.`);
  if (failed.length) {
    console.log(`\n${failed.length} job(s) failed:`);
    for (const t of failed) console.log(`  ✗ ${labelOf(t)}  ${t.data.transcodeError}`);
    console.log("\nRe-run with --apply to resubmit them.");
  }

  process.exit(failed.length ? 1 : 0);
}

// ── submit ──────────────────────────────────────────────────────────────────
const planned = allTracksOf(course).filter(({ data }) => {
  if (!data.sourceKey) return false;
  if (data.hlsKey && !FORCE) return false;
  if (data.transcodeJobId && data.transcodeStatus === "PROGRESSING" && !FORCE) return false;
  return true;
});

const noSource = course.modules.filter((m) => !m.sourceKey);

console.log(`course:   ${course.title} (${SKU})`);
console.log(`to encode: ${planned.length} recordings`);
for (const entry of planned) {
  console.log(`  ${labelOf(entry).padEnd(6)} ${entry.data.sourceKey}`);
  console.log(`        -> ${outPrefixFor(entry.code, entry.track)}index.m3u8`);
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
for (const entry of planned) {
  const { data } = entry;
  try {
    const jobId = await submitHlsJob({
      sourceKey: data.sourceKey,
      outPrefix: outPrefixFor(entry.code, entry.track),
      jobTag: `${SKU}:${labelOf(entry)}`,
    });
    data.transcodeJobId = jobId;
    data.transcodeStatus = "SUBMITTED";
    data.transcodeError = "";
    await course.save();
    submitted += 1;
    console.log(`  ✓ ${labelOf(entry)} submitted (${jobId})`);
  } catch (err) {
    console.error(`  ✗ ${labelOf(entry)} failed to submit: ${err.message}`);
  }
}

console.log(
  `\n${submitted}/${planned.length} jobs submitted. ` +
    `Poll with --status (add --watch to follow).`,
);
process.exit(0);
