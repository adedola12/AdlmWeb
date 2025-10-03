// server/routes/meMedia.js
import express from "express";
import crypto from "crypto";
import { requireAuth } from "../middleware/auth.js";
import cloudinary from "../utils/cloudinaryConfig.js";

// Any authenticated user can request a signed ticket for *image* uploads.
// POST /me/media/sign
// body: { resource_type?: "image", folder?: "adlm/avatars", public_id?, eager? }
const router = express.Router();

router.post("/sign", requireAuth, async (req, res) => {
  try {
    const {
      resource_type = "image", // lock to image for avatars
      folder = process.env.CLOUDINARY_AVATAR_FOLDER || "adlm/avatars",
      public_id, // optional
      eager, // optional
    } = req.body || {};

    if (resource_type !== "image") {
      return res.status(400).json({ error: "Only image uploads allowed" });
    }

    const timestamp = Math.floor(Date.now() / 1000);

    // Sign only allowed params
    const paramsToSign = { timestamp, folder };
    if (public_id) paramsToSign.public_id = public_id;
    if (eager) paramsToSign.eager = eager;

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
      ...(public_id ? { public_id } : {}),
      ...(eager ? { eager } : {}),
    });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to sign" });
  }
});

export default router;
