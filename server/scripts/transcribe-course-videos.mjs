/**
 * Turns the archived lecture masters into timed transcripts with Amazon
 * Transcribe, so the player's Transcript tab has something to draw.
 *
 * Runs in two phases because Transcribe is asynchronous, exactly like its
 * MediaConvert twin next door:
 *
 *   node scripts/transcribe-course-videos.mjs                # plan
 *   node scripts/transcribe-course-videos.mjs --apply        # submit jobs
 *   node scripts/transcribe-course-videos.mjs --status       # poll, record results
 *   node scripts/transcribe-course-videos.mjs --status --watch
 *
 * Scope it while you are finding out whether the output is worth reading:
 *
 *   node scripts/transcribe-course-videos.mjs --apply --sku bim-bld-arch --limit 1
 *
 * Lectures over Transcribe's 2 GB ceiling get an audio-only extract first —
 * a MediaConvert job — and are then transcribed from that. --apply submits
 * whichever step each lecture is due, and --status advances both, so the
 * whole set moves with the same two commands rather than needing a separate
 * pass for the big ones.
 *
 * A module that already has a COMPLETED transcript is skipped unless --force,
 * so re-running after a partial failure only re-transcribes what actually
 * failed. Transcribe bills per second of audio: --limit and --sku exist so a
 * first run costs one lecture rather than twenty-four.
 */
import "dotenv/config";
import { connectDB } from "../db.js";
import { PaidCourse } from "../models/PaidCourse.js";
import {
  submitTranscriptionJob,
  getTranscriptionJobState,
} from "../utils/awsTranscribe.js";
import { submitAudioExtractJob, getJobState } from "../utils/awsMediaConvert.js";

const APPLY = process.argv.includes("--apply");
const STATUS = process.argv.includes("--status");
const WATCH = process.argv.includes("--watch");
const FORCE = process.argv.includes("--force");

const argOf = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : "";
};
const ONLY_SKU = argOf("--sku");
const LIMIT = Number(argOf("--limit") || 0) || 0;

const mins = (sec) => `${Math.round((Number(sec) || 0) / 60)}m`;
const gb = (bytes) => (Number(bytes) || 0) / 1073741824;

/**
 * Transcribe's batch limits, which AWS lists as NOT adjustable: 2 GB per
 * file and 28,800 seconds of audio.
 *
 * The size one bites. These masters are two-hour 720p screen recordings and
 * four of the thirty-four come in over 2 GB; a job submitted for one of those
 * is rejected outright. They are skipped and reported rather than sent and
 * lost. The fix for them is to transcribe an extracted audio track instead of
 * the whole video, which is a MediaConvert job of the kind
 * transcode-course-videos.mjs already runs.
 */
const MAX_BYTES = 2 * 1073741824;
const MAX_SECONDS = 28800;

/** Why a lecture cannot go as-is, or "" when it can. */
function tooBig(m) {
  if ((m.sourceBytes || 0) > MAX_BYTES) {
    return `${gb(m.sourceBytes).toFixed(2)} GB — over Transcribe's 2 GB file limit`;
  }
  if ((m.durationSec || 0) > MAX_SECONDS) {
    return `${mins(m.durationSec)} — over Transcribe's 8 hour limit`;
  }
  return "";
}

async function courses() {
  const q = ONLY_SKU ? { sku: ONLY_SKU } : {};
  return PaidCourse.find(q).select("sku title modules");
}

/**
 * What Transcribe should actually read for a lecture: the audio extract when
 * there is one, the master otherwise.
 */
const mediaKeyFor = (m) => m.audioKey || m.sourceKey;

/** Needs an audio extract before Transcribe will take it. */
const needsExtract = (m) => !!tooBig(m) && !m.audioKey;

/** Ready to transcribe now. */
function candidates(course) {
  return (course.modules || [])
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => !!m.sourceKey)
    .filter(({ m }) => FORCE || m.transcriptStatus !== "COMPLETED")
    .filter(({ m }) => !needsExtract(m));
}

/** Waiting on an audio extract — either not started, or still running. */
function extractable(course) {
  return (course.modules || [])
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => !!m.sourceKey)
    .filter(({ m }) => FORCE || m.transcriptStatus !== "COMPLETED")
    .filter(({ m }) => needsExtract(m) && m.audioStatus !== "SUBMITTED" && m.audioStatus !== "PROGRESSING");
}

async function plan() {
  const list = await courses();
  let total = 0;
  let skipped = 0;
  for (const course of list) {
    const todo = candidates(course);
    const done = (course.modules || []).filter(
      (m) => m.transcriptStatus === "COMPLETED",
    ).length;
    const noMaster = (course.modules || []).filter((m) => !m.sourceKey).length;
    const oversize = (course.modules || []).filter(
      (m) => m.sourceKey && tooBig(m) && (FORCE || m.transcriptStatus !== "COMPLETED"),
    );

    console.log(`\n${course.sku} — ${course.title}`);
    console.log(
      `  ${course.modules?.length || 0} modules · ${done} transcribed · ` +
        `${todo.length} to do · ${noMaster} with no archived master`,
    );
    for (const { m, i } of todo.slice(0, LIMIT || todo.length)) {
      console.log(
        `    ${i + 1}. ${m.code} — ${m.title} ` +
          `(${gb(m.sourceBytes).toFixed(2)} GB${m.durationSec ? `, ${mins(m.durationSec)}` : ""})`,
      );
      total += 1;
    }
    for (const m of oversize) {
      const state = m.audioKey
        ? "audio ready"
        : m.audioStatus === "SUBMITTED" || m.audioStatus === "PROGRESSING"
          ? "extracting audio"
          : "needs an audio extract";
      console.log(`    AUDIO ${m.code} — ${tooBig(m)} — ${state}`);
      if (!m.audioKey) skipped += 1;
    }
  }
  console.log(
    `\n${total} lecture${total === 1 ? "" : "s"} would be submitted.` +
      (APPLY ? "" : "  Re-run with --apply to submit."),
  );
  if (skipped) {
    console.log(
      `${skipped} over the size limit — --apply extracts their audio first, ` +
        `then transcribes from that on the next --status.`,
    );
  }
  return total;
}

async function apply() {
  const list = await courses();
  let submitted = 0;

  // Counted as ATTEMPTS, not successes.
  //
  // Bounding on successes meant a systematic failure — a missing IAM
  // permission, say — sail straight past `--limit 1` and try all fourteen
  // lectures, because a failure never incremented the counter. The whole
  // point of the flag is to cap the blast radius of a first run, and it did
  // the opposite in exactly the case where that mattered.
  let attempted = 0;
  let consecutiveFailures = 0;
  let extracted = 0;
  let extractFailures = 0;

  for (const course of list) {
    // Audio extracts first: they are the long pole, and starting them before
    // the transcriptions means both are running while you wait.
    const toExtract = extractable(course);
    let extractTouched = false;
    for (const { m } of toExtract) {
      // --limit bounds each phase independently. It exists to cap what a
      // first run can set going, and an unbounded extract loop under a
      // --limit 1 would repeat the mistake the transcription loop already
      // made.
      if (LIMIT && extracted >= LIMIT) break;
      if (extractFailures >= 3) break;
      extracted += 1;
      try {
        const { jobId, audioKey } = await submitAudioExtractJob({
          sourceKey: m.sourceKey,
          outKey: `audio/${course.sku}/${m.code}`,
          jobTag: `${course.sku}/${m.code}`,
        });
        m.audioJobId = jobId;
        m.audioStatus = "SUBMITTED";
        m.audioError = "";
        extractTouched = true;
        extractFailures = 0;
        console.log(`extracting ${course.sku}/${m.code} -> ${audioKey} (job ${jobId})`);
      } catch (e) {
        extractFailures += 1;
        m.audioStatus = "ERROR";
        m.audioError = e?.message || String(e);
        extractTouched = true;
        console.error(`EXTRACT FAILED ${course.sku}/${m.code}: ${m.audioError}`);
      }
    }
    if (extractTouched) await course.save();

    const todo = candidates(course);
    for (const { m } of todo) {
      if (LIMIT && attempted >= LIMIT) break;
      // Fourteen identical errors tell you nothing the second one did not.
      if (consecutiveFailures >= 3) break;
      attempted += 1;
      try {
        const stamp = `${Date.now()}`;
        const { jobName, transcriptKey } = await submitTranscriptionJob({
          sourceKey: mediaKeyFor(m),
          sku: course.sku,
          moduleCode: m.code,
          stamp,
        });
        m.transcriptJobName = jobName;
        m.transcriptKey = transcriptKey;
        m.transcriptStatus = "SUBMITTED";
        m.transcriptError = "";
        submitted += 1;
        consecutiveFailures = 0;
        console.log(`submitted ${course.sku}/${m.code} -> ${jobName}`);
      } catch (e) {
        consecutiveFailures += 1;
        m.transcriptStatus = "FAILED";
        m.transcriptError = e?.message || String(e);
        console.error(`FAILED  ${course.sku}/${m.code}: ${m.transcriptError}`);
      }
    }
    if (todo.length) await course.save();
    if (LIMIT && attempted >= LIMIT) break;
    if (consecutiveFailures >= 3) break;
  }

  if (consecutiveFailures >= 3) {
    console.error(
      "Stopped after three failures in a row — that is a setup problem, " +
        "not a bad lecture. Fix it and re-run; nothing has been billed.",
    );
  }
  if (extracted) {
    console.log(
      `${extracted} audio extract${extracted === 1 ? "" : "s"} started — ` +
        `--status turns each one into a transcription as it lands.`,
    );
  }
  console.log(`\n${submitted} submitted. Poll with --status.`);
}

async function pollOnce() {
  const list = await courses();
  let pending = 0;

  for (const course of list) {
    let touched = false;

    // Phase one: audio extracts. A finished extract immediately submits its
    // transcription, so a single --status --watch carries a big lecture all
    // the way through instead of stopping halfway and waiting to be nudged.
    for (const m of course.modules || []) {
      if (!m.audioJobId) continue;
      if (m.audioStatus === "COMPLETE" || m.audioStatus === "ERROR") continue;

      try {
        const state = await getJobState(m.audioJobId);
        if (state.status === "ERROR") {
          m.audioStatus = "ERROR";
          m.audioError = state.errorMessage || "MediaConvert reported an error";
          touched = true;
          console.error(`EXTRACT FAILED ${course.sku}/${m.code}: ${m.audioError}`);
        } else if (state.status === "COMPLETE") {
          m.audioStatus = "COMPLETE";
          m.audioKey = `audio/${course.sku}/${m.code}.mp4`;
          m.audioError = "";
          touched = true;
          console.log(`audio    ${course.sku}/${m.code} ready`);

          try {
            const { jobName, transcriptKey } = await submitTranscriptionJob({
              sourceKey: m.audioKey,
              sku: course.sku,
              moduleCode: m.code,
              stamp: `${Date.now()}`,
            });
            m.transcriptJobName = jobName;
            m.transcriptKey = transcriptKey;
            m.transcriptStatus = "SUBMITTED";
            m.transcriptError = "";
            console.log(`submitted ${course.sku}/${m.code} -> ${jobName}`);
          } catch (e) {
            m.transcriptStatus = "FAILED";
            m.transcriptError = e?.message || String(e);
            console.error(`FAILED  ${course.sku}/${m.code}: ${m.transcriptError}`);
          }
          pending += 1;
        } else {
          if (state.status && state.status !== m.audioStatus) {
            m.audioStatus = state.status;
            touched = true;
          }
          pending += 1;
        }
      } catch (e) {
        m.audioStatus = "ERROR";
        m.audioError = e?.message || String(e);
        touched = true;
        console.error(`EXTRACT LOST ${course.sku}/${m.code}: ${m.audioError}`);
      }
    }

    // Phase two: the transcriptions themselves.
    for (const m of course.modules || []) {
      if (!m.transcriptJobName) continue;
      if (m.transcriptStatus === "COMPLETED" || m.transcriptStatus === "FAILED") continue;

      try {
        const state = await getTranscriptionJobState(m.transcriptJobName);
        if (state.status && state.status !== m.transcriptStatus) {
          m.transcriptStatus = state.status;
          touched = true;
        }
        if (state.status === "FAILED") {
          m.transcriptError = state.failureReason || "Transcribe reported a failure";
          touched = true;
          console.error(`FAILED  ${course.sku}/${m.code}: ${m.transcriptError}`);
        } else if (state.status === "COMPLETED") {
          m.transcriptError = "";
          touched = true;
          console.log(`done    ${course.sku}/${m.code}`);
        } else {
          pending += 1;
        }
      } catch (e) {
        // A job name that no longer exists is worth recording rather than
        // retrying forever — Transcribe keeps completed jobs for 90 days.
        m.transcriptStatus = "FAILED";
        m.transcriptError = e?.message || String(e);
        touched = true;
        console.error(`LOST    ${course.sku}/${m.code}: ${m.transcriptError}`);
      }
    }
    if (touched) await course.save();
  }

  return pending;
}

await connectDB();

if (STATUS) {
  let pending = await pollOnce();
  while (WATCH && pending > 0) {
    console.log(`${pending} still running — checking again in 60s`);
    await new Promise((r) => setTimeout(r, 60000));
    pending = await pollOnce();
  }
  console.log(pending ? `${pending} still running.` : "Nothing left running.");
} else if (APPLY) {
  await plan();
  await apply();
} else {
  await plan();
}

process.exit(0);
