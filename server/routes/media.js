// server/routes/meMedia.js
import express from "express";
import crypto from "crypto";
import { requireAuth } from "../middleware/auth.js";
import cloudinary from "../utils/cloudinaryConfig.js";
import express from "express";
import { v2 as cloudinary } from "cloudinary";

// Any authenticated user can request a signed ticket for *image* uploads.
// POST /me/media/sign
// body: { resource_type?: "image", folder?: "adlm/avatars", public_id?, eager? }
const router = express.Router();
router.use(requireAuth, requireAdmin);


function requireAdmin(req, _res, next) {
  if (req.user?.role === "admin") return next();
  return res.status(403).json({ error: "Admin only" });
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});


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

// server/routes/media.js
router.get("/assets", async (req, res) => {
  const {
    type = "image",
    prefix = "",              // optional folder prefix
    max = 24,                 // page size
    next: next_cursor,        // pagination token
    q = "",                   // naive filename search
  } = req.query;

  try {
    const opts = {
      type: "upload",
      resource_type: type === "video" ? "video" : "image",
      max_results: Math.min(Number(max) || 24, 100),
      prefix: prefix || undefined,
      next_cursor: next_cursor || undefined,
    };

    const out = await cloudinary.api.resources(opts);
    let items = out.resources.map(r => ({
      public_id: r.public_id,
      url: r.secure_url,
      format: r.format,
      bytes: r.bytes,
      width: r.width,
      height: r.height,
      created_at: r.created_at,
    }));

    // light client-side search by filename/public_id
    const ql = (q || "").toLowerCase();
    if (ql) {
      items = items.filter(x =>
        x.public_id.toLowerCase().includes(ql) ||
        x.url.toLowerCase().includes(ql)
      );
    }

    res.json({ items, next: out.next_cursor || null });
  } catch (e) {
    res.status(500).json({ error: e.message || "Cloudinary list failed" });
  }
});


export default router;
