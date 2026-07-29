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

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

let cached = null;

export function mediaConvertClient() {
  if (cached) return cached;
  cached = new MediaConvertClient({
    region: requiredEnv("AWS_REGION"),
    // Account-specific endpoint; DescribeEndpoints returns it, but it is stable
    // per account/region so it lives in config rather than costing a call.
    endpoint: process.env.AWS_MEDIACONVERT_ENDPOINT || undefined,
    credentials: {
      accessKeyId: requiredEnv("AWS_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("AWS_SECRET_ACCESS_KEY"),
    },
  });
  return cached;
}

/**
 * One rung of the ladder. Screen content is mostly static with sudden full
 * redraws, so quality-defined variable bitrate with a generous max holds text
 * sharp during scrolling without paying for it the rest of the time.
 */
function rung({ height, bitrate, maxBitrate, nameModifier }) {
  return {
    NameModifier: nameModifier,
    ContainerSettings: { Container: "M3U8", M3u8Settings: {} },
    VideoDescription: {
      Height: height,
      ScalingBehavior: "DEFAULT",
      CodecSettings: {
        Codec: "H_264",
        H264Settings: {
          RateControlMode: "QVBR",
          QvbrSettings: { QvbrQualityLevel: 8 },
          MaxBitrate: maxBitrate,
          Bitrate: bitrate,
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
            rung({ height: 720, bitrate: 2400000, maxBitrate: 3600000, nameModifier: "_720" }),
            rung({ height: 540, bitrate: 1200000, maxBitrate: 1800000, nameModifier: "_540" }),
            rung({ height: 360, bitrate: 600000, maxBitrate: 900000, nameModifier: "_360" }),
            rung({ height: 240, bitrate: 300000, maxBitrate: 450000, nameModifier: "_240" }),
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
