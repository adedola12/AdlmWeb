import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getEndpoint(accountId) {
  const configured = String(process.env.R2_S3_ENDPOINT || "").trim();
  if (configured) return configured;
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

function normalizePublicBaseUrl() {
  const url = String(process.env.R2_PUBLIC_BASE_URL || "").trim();
  if (!url) {
    throw new Error("Missing required environment variable: R2_PUBLIC_BASE_URL");
  }
  return url.replace(/\/+$/, "");
}

function createClient() {
  const accountId = requiredEnv("R2_ACCOUNT_ID");
  const accessKeyId = requiredEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = requiredEnv("R2_SECRET_ACCESS_KEY");

  return new S3Client({
    region: "auto",
    endpoint: getEndpoint(accountId),
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

function encodeObjectKey(key) {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function isR2Configured() {
  return [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
    "R2_PUBLIC_BASE_URL",
  ].every((name) => String(process.env[name] || "").trim());
}

/* ------------------------------------------------------------------ *
 * Private installer storage
 *
 * R2_BUCKET is public, and one bucket with one R2_PUBLIC_BASE_URL serves
 * the site's own media (adlm/previews, adlm/videos, adlm/certificates,
 * adlm/mobile-app) alongside installer packages (adlm/installers). It
 * therefore cannot be made private without blacking out the website.
 *
 * So anyone holding a packageUri could download an installer with no
 * credential at all, for as long as the object existed — and
 * /me/deployments hands that URL to every entitled user, so one customer
 * could pass the link on and the entire payload (for HERON, the
 * proprietary takeoff template tree) was a single GET away from anybody.
 *
 * Set R2_INSTALLERS_BUCKET to a SEPARATE, non-public bucket in the same
 * R2 account and installer objects go there, with /me/deployments signing
 * a short-lived GET per request instead of returning a permanent link.
 * Leave it unset and every path below behaves exactly as before: this is
 * deliberately additive so the code can ship ahead of the bucket, and the
 * cutover is the object move rather than a deploy.
 *
 * The stored packageUri keeps its R2_PUBLIC_BASE_URL/<key> shape even
 * when the object is private. It is an IDENTIFIER there, not a working
 * link: holding the shape lets objectKeyFromPackageUri resolve old and
 * new records through one code path, needs no migration, and makes
 * unsetting the env var revert cleanly.
 * ------------------------------------------------------------------ */

export function getInstallersBucket() {
  return String(process.env.R2_INSTALLERS_BUCKET || "").trim();
}

export function isPrivateInstallerStorageEnabled() {
  return Boolean(isR2Configured() && getInstallersBucket());
}

/**
 * Seconds a signed installer URL stays valid. It has to outlast the gap
 * between the Hub fetching its catalog and a user finishing a ~70 MB
 * download on a slow connection, so the default is generous. SigV4 caps
 * this at 7 days; anything larger is clamped rather than rejected.
 */
function getInstallerUrlTtlSeconds() {
  const raw = Number.parseInt(process.env.R2_INSTALLER_URL_TTL_SECONDS || "", 10);
  const fallback = 6 * 60 * 60; // 6 hours
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.min(raw, 7 * 24 * 60 * 60);
}

/**
 * Recovers the R2 object key from a stored packageUri.
 *
 * Returns "" when the URI is not one of ours — a Cloudinary raw URL from
 * before the R2 move, or an absolute link somewhere else entirely.
 * Callers read "" as "leave this packageUri alone", which is what keeps
 * a mixed-storage manifest working.
 */
export function objectKeyFromPackageUri(packageUri) {
  const uri = String(packageUri || "").trim();
  if (!uri) return "";

  let base;
  try {
    base = normalizePublicBaseUrl();
  } catch {
    return "";
  }

  if (!uri.startsWith(`${base}/`)) return "";

  const encodedKey = uri.slice(base.length + 1).split("?")[0].split("#")[0];
  if (!encodedKey) return "";

  try {
    return encodedKey
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .join("/");
  } catch {
    // A malformed percent-escape means we cannot name the object safely.
    return "";
  }
}

/**
 * Signs a time-limited GET for one installer object in the private bucket.
 *
 * A presigned URL carries its credential in the query string, so the
 * caller still downloads with a plain unauthenticated GET. That is what
 * makes this invisible to every InstallerHub already in the field:
 * DownloadPackageAsync derives its cache filename from
 * Path.GetFileName(packageUri.LocalPath), and Uri.LocalPath excludes the
 * query, so "...v2.9.5.zip?X-Amz-Signature=..." still caches as
 * "planswift-plugin-v2.9.5.zip".
 */
export async function createPresignedGetUrl({ key, expiresIn } = {}) {
  const objectKey = String(key || "").trim();
  if (!objectKey) {
    throw new Error("An object key is required for a presigned download.");
  }
  if (!isPrivateInstallerStorageEnabled()) {
    throw new Error("Private installer storage is not configured.");
  }

  return getSignedUrl(
    createClient(),
    new GetObjectCommand({ Bucket: getInstallersBucket(), Key: objectKey }),
    { expiresIn: expiresIn || getInstallerUrlTtlSeconds() },
  );
}

/**
 * Streams an object back from R2 (for same-origin proxying of model files so the
 * browser viewer isn't blocked by R2's missing CORS headers). Returns the Node
 * Readable body plus content metadata.
 */
export async function getR2ObjectStream(objectKey) {
  if (!objectKey) throw new Error("An object key is required.");
  if (!isR2Configured()) throw new Error("R2 storage is not configured.");

  const bucket = requiredEnv("R2_BUCKET");
  const client = createClient();

  const resp = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: objectKey }),
  );
  return {
    stream: resp.Body, // Node.js Readable in the AWS SDK v3
    contentType: resp.ContentType,
    contentLength: resp.ContentLength,
  };
}

export async function deleteFromR2(objectKey) {
  if (!objectKey || !isR2Configured()) return;

  const bucket = requiredEnv("R2_BUCKET");
  const client = createClient();

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: objectKey,
    }),
  );
}

export async function listFromR2(prefix = "adlm/installers") {
  if (!isR2Configured()) return [];

  const bucket = requiredEnv("R2_BUCKET");
  const client = createClient();
  const publicBaseUrl = normalizePublicBaseUrl();
  const items = [];
  let continuationToken;

  do {
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      MaxKeys: 1000,
      ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
    });

    const response = await client.send(command);

    for (const obj of response.Contents || []) {
      const key = obj.Key || "";
      const fileName = key.split("/").pop() || key;
      const encodedKey = key
        .split("/")
        .map((s) => encodeURIComponent(s))
        .join("/");

      items.push({
        publicId: key,
        originalName: fileName,
        packageUri: `${publicBaseUrl}/${encodedKey}`,
        bytes: obj.Size || 0,
        storageProvider: "r2",
        createdAt: obj.LastModified || null,
      });
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return items;
}

/**
 * Issues a short-lived presigned PUT so the browser can upload straight to R2.
 *
 * uploadBufferToR2 requires the whole file to travel through the API first,
 * which for installers means a ~50MB body crossing API Gateway (hard 10MB
 * request cap) and then being buffered in Lambda memory before a second
 * upload to R2. Presigning moves the bytes out of that path entirely: the API
 * only signs a URL, and the browser PUTs to R2 directly at its own line speed.
 *
 * The signature covers Content-Type, so the caller MUST send exactly the
 * contentType passed here on the PUT or R2 rejects it with 403.
 */
export async function createPresignedPutUrl({
  key,
  contentType = "application/octet-stream",
  expiresIn = 900,
  // Installer routes pass true so packages land in the private bucket when
  // one is configured. Everything else keeps writing to the public bucket.
  installer = false,
} = {}) {
  const objectKey = String(key || "").trim();
  if (!objectKey) {
    throw new Error("An object key is required for a presigned upload.");
  }
  if (!isR2Configured()) {
    throw new Error("R2 storage is not configured.");
  }

  const bucket =
    installer && isPrivateInstallerStorageEnabled()
      ? getInstallersBucket()
      : requiredEnv("R2_BUCKET");
  const client = createClient();

  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      ContentType: contentType,
    }),
    { expiresIn },
  );

  const publicBaseUrl = normalizePublicBaseUrl();
  return {
    uploadUrl,
    publicUrl: `${publicBaseUrl}/${encodeObjectKey(objectKey)}`,
    key: objectKey,
    contentType,
    expiresIn,
  };
}

export async function uploadBufferToR2(
  buffer,
  {
    key,
    contentType = "application/octet-stream",
    cacheControl = "public, max-age=31536000, immutable",
    // See createPresignedPutUrl: installer payloads go to the private
    // bucket once one is configured.
    installer = false,
  } = {},
) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error("A non-empty Buffer is required for R2 upload.");
  }

  const objectKey = String(key || "").trim();
  if (!objectKey) {
    throw new Error("An object key is required for R2 upload.");
  }

  const usePrivate = installer && isPrivateInstallerStorageEnabled();
  const bucket = usePrivate ? getInstallersBucket() : requiredEnv("R2_BUCKET");
  const client = createClient();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: buffer,
      ContentType: contentType,
      CacheControl: cacheControl,
      ContentLength: buffer.length,
    }),
  );

  const publicBaseUrl = normalizePublicBaseUrl();
  return {
    secure_url: `${publicBaseUrl}/${encodeObjectKey(objectKey)}`,
    public_id: objectKey,
  };
}
