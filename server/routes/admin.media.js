// server/routes/admin.media.js
import express from "express";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import {
  uploadAsset,
  deleteAsset,
  signUploadParams,
} from "../util/cloudinary.js";

const router = express.Router();
router.use(requireAuth, requireAdmin);

// POST /admin/media/sign  -> signed client upload
router.post("/sign", (req, res) => {
  const payload = signUploadParams(req.body || {});
  res.json(payload);
});

// POST /admin/media/upload-url  -> server ingests remote url
router.post("/upload-url", async (req, res) => {
  const { url, folder, publicId, resourceType } = req.body || {};
  if (!url) return res.status(400).json({ error: "url is required" });
  const out = await uploadAsset({
    file: url,
    folder,
    publicId,
    resourceType: resourceType || "video",
  });
  res.json(out);
});

// POST /admin/media/delete
router.post("/delete", async (req, res) => {
  const { publicId, resourceType } = req.body || {};
  if (!publicId) return res.status(400).json({ error: "publicId required" });
  const out = await deleteAsset(publicId, resourceType || "video");
  res.json(out);
});

export default router;
