/**
 * MediaConvert: turns an archived lecture master into an adaptive HLS ladder.
 *
 * Why a ladder rather than a single file: students on Nigerian mobile networks
 * were reporting blurry, stalling playback in class. Adaptive bitrate is the
 * actual fix — the player drops a rung instead of buffering. Resolution alone
 * never was the problem, and upscaling would have made it worse.
 *
 * The rungs stop at the source resolution. These are 720p screen recordings of
 * Revit and Excel, so 1080p rungs would cost bitrate to encode detail that
 * isn't in the master.
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

export async function getJobState(jobId) {
  const out = await mediaConvertClient().send(new GetJobCommand({ Id: jobId }));
  return {
    status: out?.Job?.Status || "",
    errorMessage: out?.Job?.ErrorMessage || "",
    percent: Number(out?.Job?.JobPercentComplete || 0),
  };
}
