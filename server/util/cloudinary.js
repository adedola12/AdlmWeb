// server/utils/cloudinary.js
import { v2 as cloudinary } from "cloudinary";
import crypto from "crypto";

// ---- Config ----
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Defaults
const DEFAULT_FOLDER = process.env.CLOUDINARY_FOLDER || "adlm/previews";

/**
 * Upload a video (or image). Accepts:
 *  - local file path ("C:/tmp/preview.mp4")
 *  - remote URL ("https://example.com/clip.mp4")
 *  - Buffer/Stream (pass the buffer directly)
 *
 * @param {Object} opts
 * @param {string|Buffer|Readable} opts.file           File path, URL, buffer or stream
 * @param {string} [opts.folder]                        Cloudinary folder
 * @param {string} [opts.publicId]                      Custom public_id (omit to auto-generate)
 * @param {("video"|"image"|"auto")} [opts.resourceType]
 * @param {Object} [opts.extra]                         Any extra Cloudinary options
 * @returns {Promise<{secure_url:string, public_id:string, duration?:number, bytes:number, width?:number, height?:number}>}
 */
export async function uploadAsset({
  file,
  folder = DEFAULT_FOLDER,
  publicId,
  resourceType = "video",
  extra = {},
}) {
  if (!file) throw new Error("cloudinary.uploadAsset: 'file' is required");

  const options = {
    folder,
    public_id: publicId,
    resource_type: resourceType, // "video" for MP4 previews
    // You can limit file size/format if you want:
    // allowed_formats: ["mp4", "mov", "webm"],
    // timeout: 60000,
    ...extra,
  };

  const res = await cloudinary.uploader.upload(file, options);
  // res contains many fields; return the ones we care about
  return {
    secure_url: res.secure_url,
    public_id: res.public_id,
    bytes: res.bytes,
    duration: res.duration, // for video
    width: res.width,
    height: res.height,
  };
}

/**
 * Delete an asset by public_id.
 * @param {string} publicId
 * @param {("video"|"image"|"raw")} [resourceType]
 */
export async function deleteAsset(publicId, resourceType = "video") {
  if (!publicId) throw new Error("cloudinary.deleteAsset: publicId required");
  const res = await cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType,
  });
  return res; // { result: "ok" | "not found" | ... }
}

/**
 * Generate a signed upload payload so the client can POST directly to Cloudinary.
 * Use this for *signed client uploads* (safer than exposing your API secret).
 *
 * Frontend will send:
 *   - file=<File or Blob>
 *   - api_key, timestamp, signature, folder, resource_type, etc.
 *
 * @param {Object} params e.g. { folder, resource_type, public_id }
 * @returns {{ timestamp:number, signature:string, api_key:string, cloud_name:string, folder:string, resource_type:string }}
 */
export function signUploadParams(params = {}) {
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = params.folder || DEFAULT_FOLDER;
  const resource_type = params.resource_type || "video";

  // Build the string to sign according to Cloudinary rules
  const toSign = {
    timestamp,
    folder,
    resource_type,
    ...(params.public_id ? { public_id: params.public_id } : {}),
    ...(params.eager ? { eager: params.eager } : {}),
  };

  const signature = cloudinary.utils.api_sign_request(
    toSign,
    process.env.CLOUDINARY_API_SECRET
  );

  return {
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

/**
 * Helper to transform a Cloudinary video URL to a 60s clip preview
 * without re-uploading. (Delivery transform)
 *
 * Example:
 *   getPreviewUrl("https://res.cloudinary.com/.../upload/v123/abc.mp4", 60)
 */
export function getPreviewUrl(url, seconds = 60, startAt = 0) {
  if (!url) return url;
  // Insert transformation segment: so_{start},du_{seconds}
  // Example pattern: /upload/so_0,du_60/
  return url.replace(
    /\/upload\/(?!.*\/upload\/)/,
    `/upload/so_${startAt},du_${seconds}/`
  );
}

/**
 * Optional: verify webhooks (if you use Cloudinary notifications).
 * @param {string} payload Raw request body string
 * @param {string} signature Header "X-Cld-Signature" value
 */
export function verifyWebhook(payload, signature) {
  const hash = crypto
    .createHmac("sha256", process.env.CLOUDINARY_API_SECRET)
    .update(payload, "utf8")
    .digest("hex");
  return hash === signature;
}
