// server/routes/admin.trainings.js
import express from "express";
import { Training } from "../models/Training.js";
import { requireAuth } from "../middleware/auth.js";
import { requireStaff } from "../middleware/roles.js";

const router = express.Router();

// ✅ must be AFTER router is created
router.use(requireAuth, requireStaff);

router.get("/", async (_req, res) => {
  try {
    const items = await Training.find().sort({ createdAt: -1 });
    res.json({ items });
  } catch (err) {
    console.error("GET /admin/trainings error", err);
    res.status(500).json({ error: "Failed to fetch trainings" });
  }
});

router.post("/", async (req, res) => {
  try {
    const {
      title,
      description,
      mode,
      date,
      city,
      country,
      venue,
      attendees,
      tags,
      imageUrls, // ✅ new
      imageUrl, // ✅ legacy fallback
    } = req.body || {};

    const normalizedImageUrls =
      Array.isArray(imageUrls) && imageUrls.length
        ? imageUrls.filter(Boolean)
        : imageUrl
        ? [imageUrl]
        : [];

    if (!title || !mode || !date || normalizedImageUrls.length === 0) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const training = await Training.create({
      title,
      description,
      mode,
      date,
      city,
      country,
      venue,
      attendees: attendees || 0,
      tags: (tags || []).map((t) => String(t).trim()).filter(Boolean),
      imageUrls: normalizedImageUrls,
    });

    res.status(201).json({ item: training });
  } catch (err) {
    console.error("POST /admin/trainings error", err);
    res.status(500).json({ error: "Failed to create training" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await Training.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /admin/trainings error", err);
    res.status(500).json({ error: "Failed to delete training" });
  }
});

export default router;
