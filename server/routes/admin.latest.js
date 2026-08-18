// server/routes/admin.latest.js
//
// Admin CRUD for the "Latest from ADLM" band, at /admin/latest.
// Gated by the "latest" permission area.
import express from "express";
import mongoose from "mongoose";
import { LatestItem, KINDS } from "../models/LatestItem.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";

const router = express.Router();
const requireStaff = [requireAuth, requirePermission("latest")];

const KIND_KEYS = Object.keys(KINDS);

// Whitelist, so a stray field in the request body cannot reach the document.
function clean(body = {}) {
  const out = {};
  const str = (v, max) => String(v ?? "").trim().slice(0, max);

  if (body.kind !== undefined) {
    if (!KIND_KEYS.includes(String(body.kind))) return { error: "Unknown kind" };
    out.kind = String(body.kind);
  }
  if (body.tag !== undefined) out.tag = str(body.tag, 40);
  if (body.title !== undefined) out.title = str(body.title, 200);
  if (body.blurb !== undefined) out.blurb = str(body.blurb, 400);
  if (body.imageUrl !== undefined) out.imageUrl = str(body.imageUrl, 600);
  if (body.ctaLabel !== undefined) out.ctaLabel = str(body.ctaLabel, 60);
  if (body.ctaHref !== undefined) out.ctaHref = str(body.ctaHref, 600);
  if (body.published !== undefined) out.published = !!body.published;
  if (body.sort !== undefined) out.sort = Number(body.sort) || 0;
  return out;
}

// GET /admin/latest — everything, published or not.
router.get("/", requireStaff, async (_req, res) => {
  try {
    const items = await LatestItem.find({}).sort({ sort: 1, createdAt: -1 }).lean();
    return res.json({ ok: true, items, kinds: KINDS });
  } catch (err) {
    console.error("[admin.latest] list failed:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

router.post("/", requireStaff, async (req, res) => {
  try {
    const patch = clean(req.body);
    if (patch.error) return res.status(400).json({ ok: false, error: patch.error });
    if (!patch.title) return res.status(400).json({ ok: false, error: "A title is required." });
    const item = await LatestItem.create(patch);
    return res.json({ ok: true, item });
  } catch (err) {
    console.error("[admin.latest] create failed:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

router.patch("/:id", requireStaff, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ ok: false, error: "Bad id" });
    }
    const patch = clean(req.body);
    if (patch.error) return res.status(400).json({ ok: false, error: patch.error });
    if (!Object.keys(patch).length) {
      return res.status(400).json({ ok: false, error: "Nothing to update" });
    }
    const item = await LatestItem.findByIdAndUpdate(req.params.id, patch, { new: true }).lean();
    if (!item) return res.status(404).json({ ok: false, error: "Not found" });
    return res.json({ ok: true, item });
  } catch (err) {
    console.error("[admin.latest] patch failed:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

router.delete("/:id", requireStaff, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ ok: false, error: "Bad id" });
    }
    const gone = await LatestItem.findByIdAndDelete(req.params.id).lean();
    if (!gone) return res.status(404).json({ ok: false, error: "Not found" });
    return res.json({ ok: true });
  } catch (err) {
    console.error("[admin.latest] delete failed:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

export default router;
