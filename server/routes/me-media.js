// server/routes/me-media.js
import express from "express";
import { requireAuth } from "../middleware/auth.js";
import cloudinary from "../cloudinary.js"; // your configured v2 instance

const router = express.Router();

/**
 * POST /me/media/sign
 * Body: { resource_type?: "image" | "video" | "raw", folder?: string }
 * NOTE: keep this limited to images + user-owned folder to avoid abuse.
 */
router.post("/sign", requireAuth, async (req, res) => {
  try {
    const resource_type = (req.body?.resource_type || "image").toLowerCase();
    if (resource_type !== "image") {
      return res.status(400).json({ error: "Only image uploads allowed" });
    }

    // per-user folder helps organization (optional)
    const baseFolder = process.env.CLOUDINARY_UPLOAD_FOLDER || "adlm/avatars";
    const folder = `${baseFolder}`;

    const timestamp = Math.floor(Date.now() / 1000);
    const paramsToSign = { timestamp, folder };

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      process.env.CLOUDINARY_API_SECRET
    );

    res.json({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      timestamp,
      signature,
      folder,
      resource_type: "image",
    });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to sign" });
  }
});

export default router;
