// Admin CRUD for the Flyer Engine. Mirrors the shape of admin.freebies.js
// (responses are { ok, items } / { ok, item }) but reuses the shared auth
// middleware. Staff = admin or mini_admin.
import express from "express";
import mongoose from "mongoose";
import { Flyer } from "../models/Flyer.js";
import { requireAuth, requireAdminOrMiniAdmin } from "../middleware/auth.js";

const router = express.Router();

// Gate the whole router: must be authenticated AND admin/mini_admin.
router.use(requireAuth, requireAdminOrMiniAdmin);

const TEMPLATES = new Set(["announcement", "countdown", "launch", "event", "subscription", "ticket", "thumbBold", "thumbTutorial", "thumbFeatures", "thumbHook"]);

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function cleanTemplate(t) {
  const v = String(t || "").trim();
  return TEMPLATES.has(v) ? v : "announcement";
}

function cleanUrl(s) {
  const v = String(s || "").trim();
  if (!v) return "";
  // accept http(s) and data URLs are NOT stored here (thumbnails are uploaded
  // to Cloudinary first); only keep http(s) links.
  if (!/^https?:\/\//i.test(v)) return "";
  return v;
}

// ✅ LIST
router.get("/", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    const filter = q ? { title: new RegExp(q, "i") } : {};
    const items = await Flyer.find(filter).sort({ updatedAt: -1 }).lean();
    return res.json({ ok: true, items });
  } catch (e) {
    console.error("flyers list", e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// ✅ GET ONE
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id))
      return res.status(400).json({ ok: false, error: "Invalid id" });
    const item = await Flyer.findById(id).lean();
    if (!item) return res.status(404).json({ ok: false, error: "Not found" });
    return res.json({ ok: true, item });
  } catch (e) {
    console.error("flyers get", e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// ✅ CREATE
router.post("/", async (req, res) => {
  try {
    const title = (req.body.title || "").trim();
    if (!title)
      return res.status(400).json({ ok: false, error: "Title is required" });

    const doc = await Flyer.create({
      title,
      template: cleanTemplate(req.body.template),
      data: req.body.data && typeof req.body.data === "object" ? req.body.data : {},
      thumbnailUrl: cleanUrl(req.body.thumbnailUrl),
      published: req.body.published !== false,
      createdBy: req.user?.id || req.user?._id || undefined,
    });

    return res.json({ ok: true, item: doc });
  } catch (e) {
    console.error("flyers create", e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// ✅ UPDATE
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id))
      return res.status(400).json({ ok: false, error: "Invalid id" });

    const title = (req.body.title || "").trim();
    if (!title)
      return res.status(400).json({ ok: false, error: "Title is required" });

    const update = {
      title,
      template: cleanTemplate(req.body.template),
      data: req.body.data && typeof req.body.data === "object" ? req.body.data : {},
      thumbnailUrl: cleanUrl(req.body.thumbnailUrl),
    };
    if (typeof req.body.published === "boolean") update.published = req.body.published;

    const item = await Flyer.findByIdAndUpdate(id, update, { new: true });
    if (!item) return res.status(404).json({ ok: false, error: "Not found" });

    return res.json({ ok: true, item });
  } catch (e) {
    console.error("flyers update", e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// ✅ DELETE
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id))
      return res.status(400).json({ ok: false, error: "Invalid id" });

    const gone = await Flyer.findByIdAndDelete(id);
    if (!gone) return res.status(404).json({ ok: false, error: "Not found" });

    return res.json({ ok: true });
  } catch (e) {
    console.error("flyers delete", e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

export default router;
