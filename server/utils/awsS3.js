/**
 * AWS S3 client for the course video archive.
 *
 * Deliberately separate from utils/r2Upload.js: that one points the same SDK
 * at Cloudflare R2 for product/flyer assets. This one is real AWS, because the
 * course pipeline (archive -> MediaConvert -> CloudFront) lives there.
 */
import {
  S3Client,
  HeadObjectCommand,
  HeadBucketCommand,
  CreateMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

/**
 * Course-pipeline credentials are read from COURSE_AWS_* first, falling back
 * to the generic AWS_* names.
 *
 * The prefix exists so this pipeline can hold its own IAM user without
 * colliding with whatever AWS_ACCESS_KEY_ID is already set for on the host —
 * and so the SDK's default provider chain can never quietly pick up ambient
 * credentials belonging to something else.
 */
export function courseEnv(name) {
  return (
    String(process.env[`COURSE_${name}`] || "").trim() ||
    String(process.env[name] || "").trim()
  );
}

function requiredEnv(name) {
  const value = courseEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: COURSE_${name} (or ${name})`);
  }
  return value;
}

let cached = null;

export function s3Client() {
  if (cached) return cached;
  cached = new S3Client({
    region: requiredEnv("AWS_REGION"),
    credentials: {
      accessKeyId: requiredEnv("AWS_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("AWS_SECRET_ACCESS_KEY"),
    },
  });
  return cached;
}

export function archiveBucket() {
  return requiredEnv("AWS_VIDEO_ARCHIVE_BUCKET");
}

/** Size of an existing object, or null when it isn't there. */
export async function objectSize(key, bucket = archiveBucket()) {
  try {
    const out = await s3Client().send(
      new HeadObjectCommand({ Bucket: bucket, Key: key }),
    );
    return Number(out.ContentLength || 0);
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NotFound") {
      return null;
    }
    throw err;
  }
}

/**
 * Proves the credentials can actually write to the archive bucket, without
 * leaving anything behind.
 *
 * HeadBucket alone only proves the bucket exists and is reachable — it says
 * nothing about write permission, which is the one that fails 20 GB in. So we
 * also open a multipart upload and immediately abort it. That exercises
 * PutObject and AbortMultipartUpload, which is exactly the permission set the
 * real transfer needs, and needs no DeleteObject.
 */
export async function verifyWriteAccess(bucket = archiveBucket()) {
  const client = s3Client();

  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (err) {
    const code = err?.$metadata?.httpStatusCode;
    if (code === 404) throw new Error(`Bucket "${bucket}" does not exist in this region.`);
    if (code === 301) {
      throw new Error(
        `Bucket "${bucket}" exists but lives in a different region than AWS_REGION.`,
      );
    }
    if (code === 403) {
      throw new Error(
        `Credentials rejected for "${bucket}" — check the key, and that the ` +
          `policy is attached to the user and names this bucket.`,
      );
    }
    throw err;
  }

  const probeKey = "_adlm-write-check/probe";
  const started = await client.send(
    new CreateMultipartUploadCommand({ Bucket: bucket, Key: probeKey }),
  );
  await client.send(
    new AbortMultipartUploadCommand({
      Bucket: bucket,
      Key: probeKey,
      UploadId: started.UploadId,
    }),
  );

  return bucket;
}

/**
 * Multipart upload straight from a stream. The largest lecture is 6.25 GB, so
 * the bytes must never be collected in memory — `Upload` handles the parts and
 * retries each one independently.
 */
export async function uploadStream({
  key,
  body,
  contentType = "video/mp4",
  metadata = {},
  bucket = archiveBucket(),
  onProgress,
}) {
  const upload = new Upload({
    client: s3Client(),
    params: {
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      Metadata: metadata,
    },
    queueSize: 4,
    // Progress is emitted once per completed part, so part size sets how often
    // the caller hears anything. At 64 MB a slow uplink goes silent for many
    // minutes before the first update, which reads as a hang. 16 MB keeps the
    // request count sane (a 6 GB file is ~380 parts against a 10,000 limit)
    // while reporting four times as often.
    partSize: 16 * 1024 * 1024,
    leavePartsOnError: false,
  });

  if (onProgress) upload.on("httpUploadProgress", onProgress);
  await upload.done();
  return { bucket, key };
}
