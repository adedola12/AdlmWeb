// server/routes/admin.media.js
import express from "express";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import {
  uploadAsset,
  deleteAsset,
  getUploadAuth,
} from "../utils/cloudinary.js";

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.post("/sign", (req, res) => {
  res.json(getUploadAuth(req.body || {}));
});

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

router.post("/delete", async (req, res) => {
  const { publicId, resourceType } = req.body || {};
  if (!publicId) return res.status(400).json({ error: "publicId required" });
  const out = await deleteAsset(publicId, resourceType || "video");
  res.json(out);
});

export default router;
