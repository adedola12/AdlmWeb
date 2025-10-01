// server/routes/admin.media.js
import express from "express";
import multer from "multer";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { uploadBufferToCloudinary } from "../utils/cloudinaryUpload.js";
import { uploadAsset, deleteAsset } from "../utils/cloudinary.js"; // keep your existing URL-ingest + delete helpers if you want

function requireAdmin(_req, res, next) {
  if (_req.user?.role === "admin") return next();
  return res.status(403).json({ error: "Admin only" });
}

const router = express.Router();
router.use(requireAuth, requireAdmin);

// memory storage keeps file in RAM so we can stream it to Cloudinary
const upload = multer({ storage: multer.memoryStorage() });

router.post("/sign", requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      resource_type = "video",
      folder = process.env.CLOUDINARY_UPLOAD_FOLDER || "adlm/previews",
      public_id,
      eager,
    } = req.body || {};

    const timestamp = Math.floor(Date.now() / 1000);

    // only sign what Cloudinary expects
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
      resource_type, // returned (so client knows /image or /video), not signed
      ...(public_id ? { public_id } : {}),
      ...(eager ? { eager } : {}),
    });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to sign" });
  }
});

/**
 * POST /admin/media/upload-file
 * multipart/form-data  { file: <binary> }
 * Optional query/body: folder, publicId
 * Returns: { secure_url, public_id }
 */
router.post("/upload-file", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "file is required" });

    const { folder, publicId } = { ...req.body, ...req.query };
    const out = await uploadBufferToCloudinary(req.file.buffer, {
      folder,
      publicId,
      resourceType: "video",
    });
    return res.json(out);
  } catch (e) {
    return res.status(400).json({ error: e.message || "Upload failed" });
  }
});

/**
 * (Optional) server-side ingestion from remote URL
 * POST /admin/media/upload-url { url }
 */
router.post("/upload-url", async (req, res) => {
  try {
    const { url, folder, publicId, resourceType } = req.body || {};
    if (!url) return res.status(400).json({ error: "url is required" });
    const out = await uploadAsset({
      file: url,
      folder,
      publicId,
      resourceType: resourceType || "video",
    });
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: e.message || "Upload failed" });
  }
});

/** Delete by public_id */
router.post("/delete", async (req, res) => {
  const { publicId, resourceType } = req.body || {};
  if (!publicId) return res.status(400).json({ error: "publicId required" });
  const out = await deleteAsset(publicId, resourceType || "video");
  res.json(out);
});

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
