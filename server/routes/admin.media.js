// server/routes/admin.media.js
import express from "express";
import multer from "multer";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { uploadBufferToCloudinary } from "../utils/cloudinaryUpload.js";
import { uploadAsset, deleteAsset } from "../utils/cloudinary.js"; // keep your existing URL-ingest + delete helpers if you want

const router = express.Router();
router.use(requireAuth, requireAdmin);

// memory storage keeps file in RAM so we can stream it to Cloudinary
const upload = multer({ storage: multer.memoryStorage() });

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

export default router;
