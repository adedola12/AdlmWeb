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
  GetObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client, archiveBucket, courseEnv, objectSize } from "./awsS3.js";

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

/**
 * Where one video's master and ladder live, from its row id and firm.
 *
 * EVERY ENCODE GETS ITS OWN LADDER DIRECTORY
 *
 * `attempt` is why. CloudFront serves this bucket with the managed
 * CachingOptimized policy, and MediaConvert writes no Cache-Control, so an
 * object sits at the edge for 24 hours by default. Re-encoding into the same
 * prefix therefore left the old master manifest cached: the ladder on S3 had
 * six rungs and every viewer kept being handed the four-rung one for the rest
 * of the day. "Improve quality" appeared to do nothing, which is worse than
 * not offering the button.
 *
 * A new directory per encode means a new manifest URL, so the picture changes
 * the moment the job completes with no invalidation and no new IAM grant.
 * The previous directory is deleted once the new one is playable.
 *
 * Attempt 0 is the pre-versioning layout, kept so rows encoded before this
 * still resolve to the directory their objects are actually in.
 */
export function ladderPrefix(id, attempt = 0) {
  return attempt > 0
    ? `hls/${ORG_VIDEO_PREFIX}${id}/v${attempt}/`
    : `hls/${ORG_VIDEO_PREFIX}${id}/`;
}

/** Everything under a video, across every encode attempt. */
export function ladderRoot(id) {
  return `hls/${ORG_VIDEO_PREFIX}${id}/`;
}

export function keysFor(doc, attempt) {
  const slug = String(doc.orgKey || "org").replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || "org";
  const id = String(doc._id);
  const n = attempt == null ? doc.encodeAttempt || 0 : attempt;
  return {
    masterPrefix: `${ORG_VIDEO_PREFIX}${slug}/${id}/`,
    outPrefix: ladderPrefix(id, n),
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

/**
 * The master's real pixel height, read out of the MP4 itself.
 *
 * Needed because MediaConvert will upscale on request and bill the higher
 * tier for it (see ladderFor in awsMediaConvert.js), so the ladder has to
 * know what the source can actually fill.
 *
 * Reads the `tkhd` boxes and takes the largest, which is the video track —
 * the audio track reports 0x0, so no track-type matching is needed. The moov
 * atom sits at the head of a faststart file and at the tail otherwise, so
 * both ends are tried. Returns 0 when it cannot tell, which the caller reads
 * as "submit every rung" rather than as an error.
 */
export async function probeMasterHeight(key, bucket = archiveBucket()) {
  const CHUNK = 12 * 1024 * 1024;
  const read = async (from, to) => {
    const res = await s3Client().send(
      new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=${from}-${to}` }),
    );
    return Buffer.from(await res.Body.transformToByteArray());
  };

  const dimensionsFrom = (buf) => {
    let best = 0;
    const walk = (start, end, depth) => {
      let p = start;
      while (p + 8 <= end && depth < 6) {
        const size = buf.readUInt32BE(p);
        const type = buf.toString("latin1", p + 4, p + 8);
        const box = size === 0 ? end - p : size === 1 ? Number(buf.readBigUInt64BE(p + 8)) : size;
        if (box < 8 || p + box > end) break;
        if (type === "tkhd") {
          // version + 3 flag bytes, then width/height as the last 8 bytes of
          // the box, 16.16 fixed point.
          const w = buf.readUInt32BE(p + box - 8) / 65536;
          const h = buf.readUInt32BE(p + box - 4) / 65536;
          if (w > 0 && h > best) best = Math.round(h);
        } else if (["moov", "trak", "mdia", "minf", "stbl"].includes(type)) {
          walk(p + 8, p + box, depth + 1);
        }
        p += box;
      }
    };
    try {
      walk(0, buf.length, 0);
    } catch {
      return 0;
    }
    return best;
  };

  try {
    const total = await objectSize(key, bucket);
    if (!total) return 0;
    let h = dimensionsFrom(await read(0, Math.min(CHUNK, total) - 1));
    if (!h && total > CHUNK) h = dimensionsFrom(await read(total - CHUNK, total - 1));
    return h;
  } catch (e) {
    console.warn("[orgVideoStorage] could not measure the master:", e?.message || e);
    return 0;
  }
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

/**
 * Removes a video's master and EVERY ladder it has ever had. Best-effort;
 * never throws — a delete that cannot happen is a cost problem, not a reason
 * to refuse to remove the row.
 *
 * The ladder is deleted from the root rather than from `doc.outPrefix`, so an
 * abandoned earlier encode goes with it instead of being left behind billed.
 */
export async function discardOrgVideoObjects(doc) {
  const { masterPrefix } = keysFor(doc);
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
      out.ladder = await deletePrefix(deliveryBucket(), ladderRoot(String(doc._id)));
    }
  } catch (e) {
    console.warn("[orgVideoStorage] ladder delete failed:", e?.message || e);
  }
  return out;
}

/** Removes one superseded encode. Best-effort; never throws. */
export async function discardLadder(prefix) {
  if (!prefix) return 0;
  try {
    return await deletePrefix(deliveryBucket(), prefix);
  } catch (e) {
    console.warn("[orgVideoStorage] superseded ladder not removed:", e?.message || e);
    return 0;
  }
}
