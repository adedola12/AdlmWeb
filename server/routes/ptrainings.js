// server/routes/ptrainings.js
import express from "express";
import { TrainingEvent } from "../models/TrainingEvent.js";

const router = express.Router();

// Public: list published events (for Products page)
router.get("/events", async (req, res, next) => {
  try {
    const list = await TrainingEvent.find({ isPublished: true })
      .sort({ startAt: 1, createdAt: -1 })
      .select(
        "title subtitle slug description startAt endAt priceNGN capacityApproved flyerUrl location isFeatured sort",
      )
      .lean();

    res.json(list || []);
  } catch (e) {
    next(e);
  }
});

// Optional: public detail if you want it later
router.get("/events/:id", async (req, res, next) => {
  try {
    const ev = await TrainingEvent.findOne({
      _id: req.params.id,
      isPublished: true,
    }).lean();

    if (!ev) return res.status(404).json({ error: "Not found" });
    res.json(ev);
  } catch (e) {
    next(e);
  }
});

export default router;
