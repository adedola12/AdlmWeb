// server/utils/orgVideoStorage.js
//
// Organisation videos on the course pipeline: master in the archive bucket,
// HLS ladder in the delivery bucket, playback through CloudFront. This file
// is the handful of S3 operations that pipeline's helpers do not already
// export — a presigned PUT so the browser can upload the master itself (the
// API runs on Lambda, whose 10MB body cap rules out proxying), and deletion
// of a master and its ladder when a row goes.
//
// Everything reads the COURSE_-prefixed configuration through courseEnv, so
// the org videos and the courses are one credential, one bucket pair, one
// CloudFront distribution.

import {
  PutObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client, archiveBucket, courseEnv } from "./awsS3.js";

export const ORG_VIDEO_PREFIX = "org-videos/";

/** True when the archive, delivery bucket and MediaConvert are all set. */
export function isPipelineConfigured() {
  return [
    "AWS_REGION",
    "AWS_VIDEO_ARCHIVE_BUCKET",
    "AWS_VIDEO_DELIVERY_BUCKET",
    "AWS_MEDIACONVERT_ROLE_ARN",
  ].every((n) => courseEnv(n));
}

/** True when CloudFront signing is set up, so HLS can actually be served. */
export function isCloudfrontConfigured() {
  return ["AWS_CLOUDFRONT_DOMAIN", "AWS_CLOUDFRONT_KEY_PAIR_ID"].every((n) => courseEnv(n)) &&
    Boolean(courseEnv("AWS_CLOUDFRONT_PRIVATE_KEY") || courseEnv("AWS_CLOUDFRONT_PRIVATE_KEY_PATH"));
}

export function deliveryBucket() {
  const v = courseEnv("AWS_VIDEO_DELIVERY_BUCKET");
  if (!v) throw new Error("Missing required environment variable: COURSE_AWS_VIDEO_DELIVERY_BUCKET");
  return v;
}

/** Where one video's master and ladder live, from its row id and firm. */
export function keysFor(doc) {
  const slug = String(doc.orgKey || "org").replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || "org";
  const id = String(doc._id);
  return {
    masterPrefix: `${ORG_VIDEO_PREFIX}${slug}/${id}/`,
    outPrefix: `hls/${ORG_VIDEO_PREFIX}${id}/`,
  };
}

/**
 * A short-lived PUT for the browser. Content-Type is part of the signature,
 * so the browser must send exactly the one returned here.
 */
export async function presignArchivePut({ key, contentType = "video/mp4", ttlSec = 6 * 60 * 60 }) {
  const uploadUrl = await getSignedUrl(
    s3Client(),
    new PutObjectCommand({ Bucket: archiveBucket(), Key: key, ContentType: contentType }),
    { expiresIn: ttlSec },
  );
  return { uploadUrl, key, contentType, expiresIn: ttlSec, bucket: archiveBucket() };
}

async function deletePrefix(bucket, prefix) {
  if (!prefix || !prefix.endsWith("/")) return 0;
  const client = s3Client();
  let token;
  let removed = 0;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
    );
    const keys = (page.Contents || []).map((o) => ({ Key: o.Key }));
    if (keys.length) {
      // A batch delete does not throw for a key it could not remove — it lists
      // it under Errors and returns 200. Read them, or a missing DeleteObject
      // permission looks exactly like success while the objects stay billed.
      const out = await client.send(
        new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys, Quiet: true } }),
      );
      const errors = out?.Errors || [];
      if (errors.length) {
        throw new Error(`${errors.length} of ${keys.length} objects could not be deleted: ${errors[0].Code} ${errors[0].Message || ""}`.trim());
      }
      removed += keys.length;
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return removed;
}

/** Removes a video's master and its ladder. Best-effort; never throws. */
export async function discardOrgVideoObjects(doc) {
  const { masterPrefix, outPrefix } = keysFor(doc);
  const out = { master: 0, ladder: 0 };
  try {
    if (String(doc.sourceKey || "").startsWith(ORG_VIDEO_PREFIX)) {
      out.master = await deletePrefix(archiveBucket(), masterPrefix);
    }
  } catch (e) {
    console.warn("[orgVideoStorage] master delete failed:", e?.message || e);
  }
  try {
    if (doc.hlsKey || doc.outPrefix) {
      out.ladder = await deletePrefix(deliveryBucket(), doc.outPrefix || outPrefix);
    }
  } catch (e) {
    console.warn("[orgVideoStorage] ladder delete failed:", e?.message || e);
  }
  return out;
}
