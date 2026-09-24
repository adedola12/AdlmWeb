// Private files people upload (assignment submissions first), 2026-09-18.
//
// Fail-safe by design: AWS S3 is the primary store once FILES_BUCKET is set
// (the AdlmFiles stack, infra/lib/adlm-files-stack.ts); until then, and if it
// is ever unset, files go to Cloudflare R2's private bucket
// (R2_INSTALLERS_BUCKET), which is already live. Nothing here is public: the
// browser uploads with a short-lived presigned PUT and downloads with a
// short-lived presigned GET, both issued only to someone allowed to have them.

import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient as createR2Client, getInstallersBucket, isPrivateInstallerStorageEnabled } from "../utils/r2Upload.js";

let s3;
function awsClient() {
  if (!s3) s3 = new S3Client({ region: process.env.FILES_BUCKET_REGION || process.env.AWS_REGION || "eu-west-1" });
  return s3;
}

/** Where private files go right now: "s3", "r2", or null when neither is set. */
export function fileStoreBackend(env = process.env) {
  if (String(env.FILES_BUCKET || "").trim()) return "s3";
  if (isPrivateInstallerStorageEnabled()) return "r2";
  return null;
}

function target(backend = fileStoreBackend()) {
  if (backend === "s3") return { client: awsClient(), bucket: process.env.FILES_BUCKET.trim(), backend };
  if (backend === "r2") return { client: createR2Client(), bucket: getInstallersBucket(), backend };
  throw new Error("No private file storage is configured (FILES_BUCKET or R2_INSTALLERS_BUCKET).");
}

/** A presigned PUT; the browser must send exactly this Content-Type. */
export async function presignUpload({ key, contentType, expiresIn = 900 }) {
  const t = target();
  const uploadUrl = await getSignedUrl(
    t.client,
    new PutObjectCommand({ Bucket: t.bucket, Key: key, ContentType: contentType }),
    { expiresIn },
  );
  return { uploadUrl, key, contentType, storage: t.backend, expiresIn };
}

/**
 * The Content-Disposition a download is saved under. The plain `filename` is
 * printable ASCII with quotes, backslashes and control characters taken out;
 * `filename*` (RFC 5987) carries the exact name, accents and all.
 *
 * The earlier one-liner had `\\r` inside a regex literal, which is the letter
 * r, so "Chapter report.docx" saved as "Chapte epot.docx" and a real CR got
 * through (review, 2026-09-22).
 */
export function contentDisposition(fileName) {
  const name = String(fileName || "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!name) return undefined;
  const ascii = name.replace(/["\\]/g, "").replace(/[^\u0020-\u007e]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** A presigned GET that downloads under the file's own name. */
export async function presignDownload({ key, storage, fileName, expiresIn = 300 }) {
  const t = target(storage || fileStoreBackend());
  const disposition = contentDisposition(fileName);
  return getSignedUrl(
    t.client,
    new GetObjectCommand({ Bucket: t.bucket, Key: key, ResponseContentDisposition: disposition }),
    { expiresIn },
  );
}

/** What actually landed: { size, contentType }, or null if nothing is there. */
export async function headFile({ key, storage }) {
  const t = target(storage || fileStoreBackend());
  try {
    const r = await t.client.send(new HeadObjectCommand({ Bucket: t.bucket, Key: key }));
    return { size: Number(r.ContentLength) || 0, contentType: r.ContentType || "" };
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NotFound") return null;
    throw err;
  }
}
