// server/routes/admin.trainings.js
import express from "express";
import { Training } from "../models/Training.js";
import { requireAdmin } from "../middleware/auth.js"; // adjust path if needed

const router = express.Router();

// // All routes here require admin
// router.use(requireAdmin);

// GET /admin/trainings
router.get("/", async (_req, res) => {
  try {
    const items = await Training.find().sort({ createdAt: -1 });
    res.json({ items });
  } catch (err) {
    console.error("GET /admin/trainings error", err);
    res.status(500).json({ error: "Failed to fetch trainings" });
  }
});

// POST /admin/trainings
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
      imageUrl,
    } = req.body;

    if (!title || !mode || !date || !imageUrl) {
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
      tags: (tags || []).map((t) => t.trim()).filter(Boolean),
      imageUrl,
    });

    res.status(201).json({ item: training });
  } catch (err) {
    console.error("POST /admin/trainings error", err);
    res.status(500).json({ error: "Failed to create training" });
  }
});

// DELETE /admin/trainings/:id
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
