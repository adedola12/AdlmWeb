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
 * This file used to say "these are 720p screen recordings" and capped the
 * ladder at 720p on that basis. It was wrong, and a firm reported it back as
 * simply blurry: their 40-minute Revit walkthrough was recorded at 3840x2160
 * and the cap rendered it at 1280x720. Screen content is the one kind where
 * that is not subtle. A ribbon label 11px tall at native becomes 4px at a
 * third of the height, which is not small text, it is no text.
 *
 * 1440p is deliberately absent. Every rung is billed per output minute, and
 * 1440 sits close enough to 1080 that it mostly duplicates it; 2160 and 1080
 * together cover the gap that matters.
 *
 * The extra rungs cost nothing on a master that cannot use them, because a
 * rung above the source is dropped before the job is submitted rather than
 * upscaled into existence. See ladderFor below — MediaConvert itself will
 * happily upscale, and bill for it, so the refusal has to be ours.
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

function rung({ height, maxBitrate, nameModifier, quality = 8 }) {
  return {
    NameModifier: nameModifier,
    ContainerSettings: { Container: "M3U8", M3u8Settings: {} },
    VideoDescription: {
      Height: height,
      ScalingBehavior: "DEFAULT",
      // Above the default 50, so the scaler's anti-alias kernel is wound back
      // a little on every rung that is a downscale. Small glyphs are exactly
      // what a soft downscale destroys first, and a Revit ribbon is nothing
      // but small glyphs. A no-op on the rung that matches the source, since
      // nothing is being scaled there. Mild on purpose: push it much past this
      // and high-contrast edges start to ring, which reads as worse, not
      // sharper.
      Sharpness: 70,
      ...(watermarkOverlay(height) ? { VideoPreprocessors: watermarkOverlay(height) } : {}),
      CodecSettings: {
        Codec: "H_264",
        H264Settings: {
          // QVBR takes a quality target and a ceiling. Setting Bitrate as well
          // is rejected outright — the two are alternative rate-control models,
          // not complementary knobs.
          RateControlMode: "QVBR",
          // Per rung rather than flat. AWS's own table puts 8 at 720p; the
          // rungs a large screen actually lands on carry the text, so they get
          // 9. QVBR only spends what the picture needs, so raising the target
          // on a static screen recording costs far less than the number
          // suggests — and the ceiling below still binds.
          QvbrSettings: { QvbrQualityLevel: quality },
          MaxBitrate: maxBitrate,
          // Named rather than left to the default. High profile's 8x8 transform
          // is the one codec feature that specifically helps high-contrast
          // glyph edges, and CABAC is worth a few percent on the same content.
          // Both are almost certainly the defaults already; naming them makes
          // the encode deterministic instead of dependent on that staying true.
          CodecProfile: "HIGH",
          EntropyEncoding: "CABAC",
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
 * THE LADDER, and why it has to know the source height.
 *
 * MediaConvert does NOT decline to upscale. Setting `Height` on an output is
 * an instruction, not a ceiling: hand it a 1428x814 recording with a 2160 rung
 * and it returns a 3790x2160 output — measured, not assumed. That output
 * carries no more detail than the master did, and it bills at the 4K
 * multiplier, which is the most expensive tier on the price list.
 *
 * So a rung above the master is dropped rather than submitted. A 4K master
 * gets all six; a 1080p one gets four; a genuinely 720p one gets three and
 * costs a fraction. `sourceHeight` of 0 means "not measured" and submits
 * everything, which is the behaviour the course scripts have always had.
 *
 * The smallest rung always survives, so a tiny or unmeasurable source still
 * produces a playable ladder rather than an empty output group.
 */
const RUNGS = [
  // maxBitrate is a ceiling, not a target: QVBR spends what the picture needs
  // and a static screen recording needs far less than these. 2160 is capped at
  // 8 rather than 14 Mbps because nothing in a Revit walkthrough justifies 14,
  // and a ceiling that can never be reached is not a guardrail.
  { height: 2160, maxBitrate: 8000000, nameModifier: "_2160", quality: 9 },
  { height: 1080, maxBitrate: 6000000, nameModifier: "_1080", quality: 9 },
  { height: 720, maxBitrate: 3600000, nameModifier: "_720", quality: 8 },
  { height: 540, maxBitrate: 1800000, nameModifier: "_540", quality: 8 },
  { height: 360, maxBitrate: 900000, nameModifier: "_360", quality: 8 },
  // The bottom rung exists to avoid a stall, not to be read. Spending more
  // quality on 428x240 buys nothing legible and raises the floor a weak
  // connection has to clear.
  { height: 240, maxBitrate: 450000, nameModifier: "_240", quality: 7 },
];

export function ladderFor(sourceHeight = 0) {
  const h = Number(sourceHeight) || 0;
  // A few pixels of slack: a 1080p capture is sometimes 1076 or 1088 lines
  // after a container's display matrix, and refusing its own rung over four
  // pixels would cost the whole point of the rung.
  const usable = h > 0 ? RUNGS.filter((r) => r.height <= h + 16) : RUNGS;
  return (usable.length ? usable : [RUNGS[RUNGS.length - 1]]).map(rung);
}

/**
 * Submits the transcode. Returns the MediaConvert job id; the job is async, so
 * `getJobState` is how you find out it finished.
 *
 * @param {string} sourceKey  master object in the archive bucket
 * @param {string} outPrefix  e.g. hls/bim-bld-arch/2025/w1d1/
 * @param {number} sourceHeight  the master's real pixel height, when known.
 *   Rungs above it are dropped — see LADDER below. Omit and every rung is
 *   submitted, which is what the course scripts have always done.
 */
export async function submitHlsJob({ sourceKey, outPrefix, jobTag = "", sourceHeight = 0 }) {
  const archiveBucket = requiredEnv("AWS_VIDEO_ARCHIVE_BUCKET");
  const deliveryBucket = requiredEnv("AWS_VIDEO_DELIVERY_BUCKET");
  const role = requiredEnv("AWS_MEDIACONVERT_ROLE_ARN");
  const outputs = ladderFor(sourceHeight);

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
          Outputs: outputs,
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
