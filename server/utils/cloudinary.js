// server/utils/cloudinary.js
import { v2 as cloudinary } from "cloudinary";
import crypto from "crypto";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const DEFAULT_FOLDER = process.env.CLOUDINARY_FOLDER || "adlm/previews";
const UNSIGNED_PRESET = (process.env.CLOUDINARY_UNSIGNED_PRESET || "").trim();

/** Upload by URL/file path/buffer (server-side ingestion) */
export async function uploadAsset({
  file,
  folder = DEFAULT_FOLDER,
  publicId,
  resourceType = "video",
  extra = {},
}) {
  if (!file) throw new Error("cloudinary.uploadAsset: 'file' is required");
  const res = await cloudinary.uploader.upload(file, {
    folder,
    public_id: publicId,
    resource_type: resourceType,
    ...extra,
  });
  return {
    secure_url: res.secure_url,
    public_id: res.public_id,
    bytes: res.bytes,
    duration: res.duration,
    width: res.width,
    height: res.height,
  };
}

export async function deleteAsset(publicId, resourceType = "video") {
  if (!publicId) throw new Error("cloudinary.deleteAsset: publicId required");
  return cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
}

/** Tell the client how to upload: unsigned OR signed. */
export function getUploadAuth(params = {}) {
  const folder = params.folder || DEFAULT_FOLDER;
  const resource_type = params.resource_type || "video";

  // Prefer unsigned if you configured a preset
  if (UNSIGNED_PRESET) {
    return {
      mode: "unsigned",
      upload_preset: UNSIGNED_PRESET,
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      // IMPORTANT: most unsigned presets control folders themselves;
      // the client should NOT send 'folder' unless your preset allows it.
      resource_type,
    };
  }

  // Signed flow
  const timestamp = Math.floor(Date.now() / 1000);

  // ONLY sign the fields Cloudinary expects (do NOT sign resource_type)
  const toSign = {
    timestamp,
    folder,
    ...(params.public_id ? { public_id: params.public_id } : {}),
    ...(params.eager ? { eager: params.eager } : {}),
  };

  const signature = cloudinary.utils.api_sign_request(
    toSign,
    process.env.CLOUDINARY_API_SECRET
  );

  return {
    mode: "signed",
    timestamp,
    signature,
    api_key: process.env.CLOUDINARY_API_KEY,
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    folder,
    resource_type,
    ...(params.public_id ? { public_id: params.public_id } : {}),
    ...(params.eager ? { eager: params.eager } : {}),
  };
}

export function getPreviewUrl(url, seconds = 60, startAt = 0) {
  if (!url) return url;
  return url.replace(
    /\/upload\/(?!.*\/upload\/)/,
    `/upload/so_${startAt},du_${seconds}/`
  );
}

export function verifyWebhook(payload, signature) {
  const hash = crypto
    .createHmac("sha256", process.env.CLOUDINARY_API_SECRET)
    .update(payload, "utf8")
    .digest("hex");
  return hash === signature;
}
