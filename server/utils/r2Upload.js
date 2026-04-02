import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

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

export async function uploadBufferToR2(
  buffer,
  {
    key,
    contentType = "application/octet-stream",
    cacheControl = "public, max-age=31536000, immutable",
  } = {},
) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error("A non-empty Buffer is required for R2 upload.");
  }

  const objectKey = String(key || "").trim();
  if (!objectKey) {
    throw new Error("An object key is required for R2 upload.");
  }

  const bucket = requiredEnv("R2_BUCKET");
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
