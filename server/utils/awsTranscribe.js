/**
 * Transcribe: turns an archived lecture master into a timed transcript.
 *
 * Runs against exactly the same S3 object MediaConvert reads — the archived
 * master under `sourceKey` — so nothing new has to be uploaded and a lecture
 * that has already been transcoded is already transcribable.
 *
 * Asynchronous like MediaConvert, and handled the same way: submit, record the
 * job name, poll later. A lecture runs one to two hours, so nothing here waits
 * on a result.
 *
 * The transcript JSON lands back in the same bucket under `transcripts/`. It
 * is never served to the browser directly: routes/meCourses.js reads it,
 * reduces it to cues and hands those over, so the storage layout stays
 * server-side like every other key in this pipeline.
 */
import {
  TranscribeClient,
  StartTranscriptionJobCommand,
  GetTranscriptionJobCommand,
} from "@aws-sdk/client-transcribe";

import { courseEnv, archiveBucket } from "./awsS3.js";

function requiredEnv(name) {
  const value = courseEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: COURSE_${name} (or ${name})`);
  }
  return value;
}

let cached = null;

export function transcribeClient() {
  if (cached) return cached;
  const accessKeyId = courseEnv("AWS_ACCESS_KEY_ID");
  const secretAccessKey = courseEnv("AWS_SECRET_ACCESS_KEY");

  cached = new TranscribeClient({
    region: requiredEnv("AWS_REGION"),
    ...(accessKeyId && secretAccessKey
      ? { credentials: { accessKeyId, secretAccessKey } }
      : {}),
  });
  return cached;
}

/**
 * A job name Transcribe will accept, derived from the module so a re-run
 * against the same lecture is recognisable in the console.
 *
 * Transcribe allows [0-9a-zA-Z._-] only, and the name must be unique within
 * the account — so the caller appends something per-attempt.
 */
export function transcriptionJobName(sku, moduleCode, stamp) {
  const clean = (s) => String(s || "").replace(/[^0-9a-zA-Z._-]+/g, "-").slice(0, 60);
  return `adlm-${clean(sku)}-${clean(moduleCode)}-${clean(stamp)}`.slice(0, 200);
}

/** Where the finished transcript is written, relative to the archive bucket. */
export const transcriptKeyFor = (sku, moduleCode) =>
  `transcripts/${sku}/${moduleCode}.json`;

/**
 * Submit one lecture for transcription.
 *
 * `LanguageCode` is pinned rather than auto-detected: these are Nigerian
 * English lectures, and language identification on accented technical speech
 * is a way to have a job come back labelled as something else entirely.
 *
 * `Settings.VocabularyName` is passed when COURSE_TRANSCRIBE_VOCABULARY names
 * one. Quantity surveying vocabulary — P&G, BoQ, rebar bar-marks, "prelims" —
 * is not something a general model gets right, and a custom vocabulary is the
 * supported way to teach it those terms.
 */
export async function submitTranscriptionJob({ sourceKey, sku, moduleCode, stamp }) {
  const bucket = archiveBucket();
  const jobName = transcriptionJobName(sku, moduleCode, stamp);
  const vocabulary = courseEnv("TRANSCRIBE_VOCABULARY");

  const command = new StartTranscriptionJobCommand({
    TranscriptionJobName: jobName,
    LanguageCode: courseEnv("TRANSCRIBE_LANGUAGE") || "en-US",
    Media: { MediaFileUri: `s3://${bucket}/${sourceKey}` },
    OutputBucketName: bucket,
    OutputKey: transcriptKeyFor(sku, moduleCode),
    ...(vocabulary
      ? { Settings: { VocabularyName: vocabulary, ShowSpeakerLabels: false } }
      : {}),
  });

  await transcribeClient().send(command);
  return { jobName, transcriptKey: transcriptKeyFor(sku, moduleCode) };
}

/**
 * Where a submitted job has got to.
 *
 * Returns the raw TranscriptionJobStatus — QUEUED / IN_PROGRESS / COMPLETED /
 * FAILED — plus the failure reason, which is the only thing that explains a
 * job that died on a codec Transcribe would not read.
 */
export async function getTranscriptionJobState(jobName) {
  const res = await transcribeClient().send(
    new GetTranscriptionJobCommand({ TranscriptionJobName: jobName }),
  );
  const job = res?.TranscriptionJob || {};
  return {
    status: job.TranscriptionJobStatus || "",
    failureReason: job.FailureReason || "",
    completedAt: job.CompletionTime || null,
  };
}
