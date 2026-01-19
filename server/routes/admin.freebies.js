import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { Freebie } from "../models/Freebie.js";

const router = express.Router();

function accessSecret() {
  return (
    process.env.JWT_ACCESS_SECRET ||
    process.env.ACCESS_TOKEN_SECRET ||
    process.env.ACCESS_SECRET ||
    ""
  );
}

function getBearer(req) {
  const h = req.headers.authorization || "";
  if (h.startsWith("Bearer ")) return h.slice(7).trim();
  // optional cookie fallback if you ever set it:
  return req.cookies?.accessToken || req.cookies?.ACCESS_TOKEN || "";
}

function requireAuth(req, res, next) {
  const token = getBearer(req);
  if (!token) return res.status(401).json({ ok: false, error: "Unauthorized" });

  const secret = accessSecret();
  if (!secret)
    return res.status(500).json({ ok: false, error: "Missing JWT secret" });

  try {
    const payload = jwt.verify(token, secret);
    req.user = {
      id: payload.sub || payload.userId || payload._id,
      role: (payload.role || payload.r || "user").toLowerCase(),
      email: payload.email,
    };
    return next();
  } catch {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
}

function requireStaff(req, res, next) {
  const role = (req.user?.role || "").toLowerCase();
  if (role === "admin" || role === "mini_admin") return next();
  return res.status(403).json({ ok: false, error: "Forbidden" });
}

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function cleanUrl(s) {
  const v = (s || "").trim();
  if (!v) return "";
  if (!/^https?:\/\//i.test(v)) return ""; // keep http(s) only
  return v;
}

function normalizeVideos(videos) {
  const arr = Array.isArray(videos) ? videos : [];
  return arr
    .map((x) => ({
      url: cleanUrl(x?.url || x),
      title: (x?.title || "").trim(),
    }))
    .filter((v) => !!v.url);
}

// ✅ LIST
router.get("/", requireAuth, requireStaff, async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    const filter = q
      ? {
          $or: [
            { title: new RegExp(q, "i") },
            { description: new RegExp(q, "i") },
          ],
        }
      : {};

    const items = await Freebie.find(filter).sort({ createdAt: -1 }).lean();
    return res.json({ ok: true, items });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// ✅ CREATE
router.post("/", requireAuth, requireStaff, async (req, res) => {
  try {
    const title = (req.body.title || "").trim();
    if (!title)
      return res.status(400).json({ ok: false, error: "Title is required" });

    const doc = await Freebie.create({
      title,
      description: (req.body.description || "").trim(),
      imageUrl: cleanUrl(req.body.imageUrl),
      downloadUrl: cleanUrl(req.body.downloadUrl),
      videos: normalizeVideos(req.body.videos),
      published: req.body.published !== false,
      createdBy: req.user?.id || undefined,
    });

    return res.json({ ok: true, item: doc });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// ✅ UPDATE
router.put("/:id", requireAuth, requireStaff, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id))
      return res.status(400).json({ ok: false, error: "Invalid id" });

    const title = (req.body.title || "").trim();
    if (!title)
      return res.status(400).json({ ok: false, error: "Title is required" });

    const update = {
      title,
      description: (req.body.description || "").trim(),
      imageUrl: cleanUrl(req.body.imageUrl),
      downloadUrl: cleanUrl(req.body.downloadUrl),
      videos: normalizeVideos(req.body.videos),
      published: !!req.body.published,
    };

    const item = await Freebie.findByIdAndUpdate(id, update, { new: true });
    if (!item) return res.status(404).json({ ok: false, error: "Not found" });

    return res.json({ ok: true, item });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// ✅ TOGGLE PUBLISH
router.patch("/:id/publish", requireAuth, requireStaff, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id))
      return res.status(400).json({ ok: false, error: "Invalid id" });

    const published = !!req.body.published;
    const item = await Freebie.findByIdAndUpdate(
      id,
      { published },
      { new: true },
    );
    if (!item) return res.status(404).json({ ok: false, error: "Not found" });

    return res.json({ ok: true, item });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// ✅ DELETE
router.delete("/:id", requireAuth, requireStaff, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id))
      return res.status(400).json({ ok: false, error: "Invalid id" });

    const gone = await Freebie.findByIdAndDelete(id);
    if (!gone) return res.status(404).json({ ok: false, error: "Not found" });

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

export default router;
