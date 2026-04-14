import express from "express";
import { TrainingLocation } from "../models/TrainingLocation.js";

const router = express.Router();

// Public: list active training locations (for purchase dropdown)
router.get("/", async (_req, res) => {
  try {
    const locations = await TrainingLocation.find({ isActive: true })
      .sort({ name: 1 })
      .lean();
    return res.json({ ok: true, locations });
  } catch (e) {
    console.error("training-locations list error:", e);
    return res.status(500).json({ error: "Failed to load training locations" });
  }
});

export default router;
