/**
 * MediaConvert: turns an archived lecture master into an adaptive HLS ladder.
 *
 * Why a ladder rather than a single file: students on Nigerian mobile networks
 * were reporting blurry, stalling playback in class. Adaptive bitrate is the
 * actual fix — the player drops a rung instead of buffering. Resolution alone
 * never was the problem, and upscaling would have made it worse.
 *
 * The rungs stop at the source resolution — and the source is 4K.
 *
 * This file used to say "these are 720p screen recordings", and capped the
 * ladder at 720p on that basis. It was wrong: every one of the thirty-four
 * archived masters is 3840x2160, checked by reading the tkhd box of each
 * (scripts/probe-course-masters.mjs). The ladder was therefore throwing away
 * three quarters of the picture on every lecture, and a student on fibre with
 * a 27-inch monitor was watching a 720p upscale of a 4K screen recording of
 * Revit — which is the one kind of content where the difference is legible,
 * because it is full of small text.
 *
 * 1440p is deliberately absent. Every rung is billed per output minute across
 * thirty-four ~96-minute lectures, and 1440 sits close enough to 1080 that it
 * mostly duplicates it; 2160 and 1080 together cover the gap that matters.
 */
import {
  MediaConvertClient,
  CreateJobCommand,
  GetJobCommand,
} from "@aws-sdk/client-mediaconvert";

import { courseEnv } from "./awsS3.js";

// Same COURSE_-prefixed lookup as the S3 helper, so the whole course pipeline
// shares one credential namespace.
function requiredEnv(name) {
  const value = courseEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: COURSE_${name} (or ${name})`);
  }
  return value;
}

let cached = null;

export function mediaConvertClient() {
  if (cached) return cached;
  // Read through courseEnv, not process.env directly — otherwise a value set as
  // COURSE_AWS_MEDIACONVERT_ENDPOINT is silently ignored and the SDK falls back
  // to the regional default. That happens to work, which is exactly why the bug
  // would have gone unnoticed.
  const endpoint = courseEnv("AWS_MEDIACONVERT_ENDPOINT");
  const accessKeyId = courseEnv("AWS_ACCESS_KEY_ID");
  const secretAccessKey = courseEnv("AWS_SECRET_ACCESS_KEY");

  cached = new MediaConvertClient({
    region: requiredEnv("AWS_REGION"),
    ...(endpoint ? { endpoint } : {}),
    // Omitted under an EC2 instance role, same as the S3 client.
    ...(accessKeyId && secretAccessKey
      ? { credentials: { accessKeyId, secretAccessKey } }
      : {}),
  });
  return cached;
}

/**
 * One rung of the ladder. Screen content is mostly static with sudden full
 * redraws, so quality-defined variable bitrate with a generous max holds text
 * sharp during scrolling without paying for it the rest of the time.
 */
/**
 * Optional burned-in watermark.
 *
 * The DOM watermark only exists while the video plays inside the page — a
 * native fullscreen takeover or a screen recording loses it entirely. This one
 * is encoded into the frames, so it survives fullscreen, screenshots, recording
 * and re-encoding.
 *
 * The trade-off is that it is the same for every viewer: it proves where a leak
 * came from, not who leaked it. Per-viewer burn-in needs a separate encode per
 * student, which is not sane at this scale — the DOM overlay stays the thing
 * that identifies the individual.
 *
 * Point COURSE_AWS_WATERMARK_PNG_KEY at a PNG in the archive bucket to enable.
 */
function watermarkOverlay(height) {
  const key = courseEnv("AWS_WATERMARK_PNG_KEY");
  if (!key) return undefined;
  const bucket = requiredEnv("AWS_VIDEO_ARCHIVE_BUCKET");

  // Scale with the rung so it stays proportionate rather than swamping 240p.
  const width = Math.round(height * 0.28);
  return {
    ImageInserter: {
      InsertableImages: [
        {
          ImageInserterInput: `s3://${bucket}/${key}`,
          Layer: 1,
          // Faint enough to watch through, present enough to survive a re-encode.
          Opacity: 30,
          ImageX: Math.round(height * 0.03),
          ImageY: Math.round(height * 0.03),
          Width: width,
          FadeIn: 0,
        },
      ],
    },
  };
}

function rung({ height, maxBitrate, nameModifier }) {
  return {
    NameModifier: nameModifier,
    ContainerSettings: { Container: "M3U8", M3u8Settings: {} },
    VideoDescription: {
      Height: height,
      ScalingBehavior: "DEFAULT",
      ...(watermarkOverlay(height) ? { VideoPreprocessors: watermarkOverlay(height) } : {}),
      CodecSettings: {
        Codec: "H_264",
        H264Settings: {
          // QVBR takes a quality target and a ceiling. Setting Bitrate as well
          // is rejected outright — the two are alternative rate-control models,
          // not complementary knobs.
          RateControlMode: "QVBR",
          QvbrSettings: { QvbrQualityLevel: 8 },
          MaxBitrate: maxBitrate,
          SceneChangeDetect: "TRANSITION_DETECTION",
          GopSizeUnits: "AUTO",
          QualityTuningLevel: "SINGLE_PASS_HQ",
        },
      },
    },
    AudioDescriptions: [
      {
        CodecSettings: {
          Codec: "AAC",
          AacSettings: {
            Bitrate: 96000,
            CodingMode: "CODING_MODE_2_0",
            SampleRate: 48000,
          },
        },
      },
    ],
  };
}

/**
 * Submits the transcode. Returns the MediaConvert job id; the job is async, so
 * `getJobState` is how you find out it finished.
 *
 * @param {string} sourceKey  master object in the archive bucket
 * @param {string} outPrefix  e.g. hls/bim-bld-arch/2025/w1d1/
 */
export async function submitHlsJob({ sourceKey, outPrefix, jobTag = "" }) {
  const archiveBucket = requiredEnv("AWS_VIDEO_ARCHIVE_BUCKET");
  const deliveryBucket = requiredEnv("AWS_VIDEO_DELIVERY_BUCKET");
  const role = requiredEnv("AWS_MEDIACONVERT_ROLE_ARN");

  const command = new CreateJobCommand({
    Role: role,
    UserMetadata: jobTag ? { module: jobTag } : undefined,
    Settings: {
      Inputs: [
        {
          FileInput: `s3://${archiveBucket}/${sourceKey}`,
          AudioSelectors: { "Audio Selector 1": { DefaultSelection: "DEFAULT" } },
          VideoSelector: {},
          TimecodeSource: "ZEROBASED",
        },
      ],
      OutputGroups: [
        {
          Name: "Apple HLS",
          OutputGroupSettings: {
            Type: "HLS_GROUP_SETTINGS",
            HlsGroupSettings: {
              // Naming the destination "<prefix>index" makes the master
              // manifest land at a predictable <prefix>index.m3u8, with the
              // rungs beside it as index_720.m3u8 and friends. Ending the
              // destination at a bare "/" would name them after the input file.
              Destination: `s3://${deliveryBucket}/${outPrefix}index`,
              SegmentLength: 6,
              MinSegmentLength: 0,
              // 6s segments: long enough to keep the request count sane on a
              // slow connection, short enough that switching rungs is quick.
              DirectoryStructure: "SINGLE_DIRECTORY",
              ManifestDurationFormat: "INTEGER",
            },
          },
          Outputs: [
            // Screen capture is mostly static with sudden full redraws, so QVBR
            // spends very little of these ceilings most of the time — the
            // ceiling is there for the redraws, where text has to stay sharp.
            rung({ height: 2160, maxBitrate: 14000000, nameModifier: "_2160" }),
            rung({ height: 1080, maxBitrate: 5500000, nameModifier: "_1080" }),
            rung({ height: 720, maxBitrate: 3600000, nameModifier: "_720" }),
            rung({ height: 540, maxBitrate: 1800000, nameModifier: "_540" }),
            rung({ height: 360, maxBitrate: 900000, nameModifier: "_360" }),
            rung({ height: 240, maxBitrate: 450000, nameModifier: "_240" }),
          ],
        },
      ],
    },
  });

  const out = await mediaConvertClient().send(command);
  return out?.Job?.Id || "";
}


/**
 * Strips a lecture down to its audio track, as MP4/AAC in the archive bucket.
 *
 * Why this exists: Amazon Transcribe's batch limit is 2 GB per file and AWS
 * lists it as not adjustable. Four of the thirty-four masters are over it —
 * the largest is 5.82 GB — because they are two-hour 720p screen recordings.
 * Transcribe only ever reads the audio track, so handing it 5.82 GB of Revit
 * screen capture was always waste; this makes that explicit and brings the
 * file under the ceiling at the same time. A 96-minute lecture comes out
 * around 70 MB.
 *
 * The AAC settings are deliberately the same ones the HLS rungs already use.
 * They are known to be accepted by this account's MediaConvert queue, and an
 * invented bitrate/coding-mode/sample-rate combination is the usual way to
 * have a job rejected for no useful reason.
 *
 * Writes to the ARCHIVE bucket rather than the delivery one: Transcribe reads
 * it, students never do, and the archive is the bucket the pipeline's IAM user
 * can already write to.
 *
 * @param {string} sourceKey  master object in the archive bucket
 * @param {string} outKey     destination WITHOUT extension, e.g. audio/sku/W1D1
 */
export async function submitAudioExtractJob({ sourceKey, outKey, jobTag = "" }) {
  const archiveBucket = requiredEnv("AWS_VIDEO_ARCHIVE_BUCKET");
  const role = requiredEnv("AWS_MEDIACONVERT_ROLE_ARN");

  const command = new CreateJobCommand({
    Role: role,
    UserMetadata: jobTag ? { module: jobTag, purpose: "transcribe-audio" } : undefined,
    Settings: {
      Inputs: [
        {
          FileInput: `s3://${archiveBucket}/${sourceKey}`,
          AudioSelectors: { "Audio Selector 1": { DefaultSelection: "DEFAULT" } },
          // No VideoSelector: there is no video output to feed, and asking for
          // one only makes the job decode frames it will then throw away.
          TimecodeSource: "ZEROBASED",
        },
      ],
      OutputGroups: [
        {
          Name: "Audio for transcription",
          OutputGroupSettings: {
            Type: "FILE_GROUP_SETTINGS",
            // Ending the destination at the key rather than a "/" names the
            // file after it — audio/sku/W1D1 becomes audio/sku/W1D1.mp4.
            FileGroupSettings: { Destination: `s3://${archiveBucket}/${outKey}` },
          },
          Outputs: [
            {
              // No VideoDescription at all — that is what makes it audio-only.
              ContainerSettings: { Container: "MP4", Mp4Settings: {} },
              AudioDescriptions: [
                {
                  AudioSourceName: "Audio Selector 1",
                  CodecSettings: {
                    Codec: "AAC",
                    AacSettings: {
                      Bitrate: 96000,
                      CodingMode: "CODING_MODE_2_0",
                      SampleRate: 48000,
                    },
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  });

  const out = await mediaConvertClient().send(command);
  return { jobId: out?.Job?.Id || "", audioKey: `${outKey}.mp4` };
}

export async function getJobState(jobId) {
  const out = await mediaConvertClient().send(new GetJobCommand({ Id: jobId }));
  return {
    status: out?.Job?.Status || "",
    errorMessage: out?.Job?.ErrorMessage || "",
    percent: Number(out?.Job?.JobPercentComplete || 0),
  };
}
