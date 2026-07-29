/**
 * AWS S3 client for the course video archive.
 *
 * Deliberately separate from utils/r2Upload.js: that one points the same SDK
 * at Cloudflare R2 for product/flyer assets. This one is real AWS, because the
 * course pipeline (archive -> MediaConvert -> CloudFront) lives there.
 */
import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
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
    partSize: 64 * 1024 * 1024,
    leavePartsOnError: false,
  });

  if (onProgress) upload.on("httpUploadProgress", onProgress);
  await upload.done();
  return { bucket, key };
}
