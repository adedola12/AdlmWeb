import express from "express";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { Software } from "../models/Software.js";

const router = express.Router();
router.use(requireAuth, requireAdmin);

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function sanitize(body = {}, { partial = false } = {}) {
  const out = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  const str = (k) => (has(k) ? String(body[k] || "").trim() : undefined);

  const assign = (k, v) => {
    if (!partial || v !== undefined) out[k] = v;
  };

  assign("name", str("name"));
  assign("description", str("description"));
  assign("version", str("version"));
  assign("fileUrl", str("fileUrl"));
  assign("fileSha256", has("fileSha256") ? String(body.fileSha256 || "").trim().toLowerCase() : undefined);
  assign("fileOriginalName", str("fileOriginalName"));
  assign("installVideoUrl", str("installVideoUrl"));

  if (has("kind")) {
    const k = String(body.kind || "installer").trim().toLowerCase();
    out.kind = ["installer", "apk", "other"].includes(k) ? k : "installer";
  } else if (!partial) {
    out.kind = "installer";
  }

  if (has("fileSize")) out.fileSize = Math.max(0, Number(body.fileSize || 0));

  if (has("storageProvider")) {
    const sp = String(body.storageProvider || "").trim().toLowerCase();
    out.storageProvider = ["r2", "cloudinary", "external", ""].includes(sp) ? sp : "";
  }

  if (has("isActive")) out.isActive = body.isActive !== false;
  else if (!partial) out.isActive = true;

  return out;
}

// List active (default) or all softwares
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const includeInactive = String(req.query.includeInactive || "").toLowerCase() === "true";
    const filter = includeInactive ? {} : { isActive: true };
    const items = await Software.find(filter).sort({ name: 1 }).lean();
    res.json({ ok: true, items });
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const item = await Software.findById(req.params.id).lean();
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true, item });
  }),
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const payload = sanitize(req.body || {});
    if (!payload.name) return res.status(400).json({ error: "name required" });
    const item = await Software.create(payload);
    res.json({ ok: true, item });
  }),
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const payload = sanitize(req.body || {}, { partial: true });
    const item = await Software.findByIdAndUpdate(req.params.id, payload, { new: true });
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true, item });
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const out = await Software.findByIdAndDelete(req.params.id);
    if (!out) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  }),
);

export default router;
