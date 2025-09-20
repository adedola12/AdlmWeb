// server/routes/media.js
import express from "express";
import crypto from "crypto";
import cloudinary from "../cloudinary.js";
import { requireAuth } from "../middleware/auth.js";

// Simple admin gate. If you already have requireAdmin, use that instead.
function requireAdmin(_req, res, next) {
  if (_req.user?.role === "admin") return next();
  return res.status(403).json({ error: "Admin only" });
}

const router = express.Router();

/**
 * POST /admin/media/sign
 * Body (optional):
 *   resource_type: "image" | "video" | "raw" (default: "video")
 *   folder: override folder (default: process.env.CLOUDINARY_UPLOAD_FOLDER || "adlm/previews")
 *   public_id: optional (let Cloudinary auto-generate if omitted)
 *   eager: optional transformation string(s) (advanced)
 *
 * Returns: { cloud_name, api_key, timestamp, signature, folder, resource_type, public_id? }
 */
router.post("/sign", requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      resource_type = "video",
      folder = process.env.CLOUDINARY_UPLOAD_FOLDER || "adlm/previews",
      public_id, // optional custom file name (no extension)
      eager, // optional: e.g. "so_0,du_60" for 60s clip
    } = req.body || {};

    const timestamp = Math.floor(Date.now() / 1000);

    // Build the params for the signature
    const paramsToSign = {
      timestamp,
      folder,
      resource_type,
    };
    if (public_id) paramsToSign.public_id = public_id;
    if (eager) paramsToSign.eager = eager;

    // Generate signature with secret (never send secret to client)
    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      process.env.CLOUDINARY_API_SECRET
    );

    return res.json({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      timestamp,
      signature,
      folder,
      resource_type,
      ...(public_id ? { public_id } : {}),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Failed to sign" });
  }
});

/**
 * (Optional) POST /admin/media/preview-url
 * Build a transformed preview URL (e.g., first 60s) from a Cloudinary base URL.
 * Body: { url: "https://res.cloudinary.com/<cloud>/video/upload/.../file.mp4", durationSec?: 60, startSec?: 0 }
 * Returns: { previewUrl }
 */
router.post("/preview-url", requireAuth, requireAdmin, (req, res) => {
  try {
    const { url, durationSec = 60, startSec = 0 } = req.body || {};
    if (!url) return res.status(400).json({ error: "url required" });

    // Inject Cloudinary transformation (so_<start>,du_<duration>)
    // Example: /upload/so_0,du_60/...
    const previewUrl = url.replace(
      /\/upload\/(?!.*\/)/, // first "upload" segment
      `/upload/so_${startSec},du_${durationSec}/`
    );

    return res.json({ previewUrl });
  } catch (e) {
    return res
      .status(500)
      .json({ error: e.message || "Failed to build preview" });
  }
});

export default router;
