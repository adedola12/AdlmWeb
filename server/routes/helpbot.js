// server/routes/helpbot.js
import express from "express";
import { Product } from "../models/Product.js";
import { PaidCourse } from "../models/PaidCourse.js";
import { FreeVideo } from "../models/Learn.js";
import { Training } from "../models/Training.js";

const router = express.Router();

/**
 * GET /helpbot/catalog
 * Public-safe catalog for the frontend HelpBot
 *
 * Query params:
 *   includeTrainings=1  (optional)
 *   includeFreeVideos=1 (optional)
 *
 * Returns:
 *  {
 *    ts: number,
 *    products: [...],
 *    courses: [...],
 *    trainings?: [...],
 *    freeVideos?: [...]
 *  }
 */
router.get("/catalog", async (req, res) => {
  try {
    const includeTrainings = String(req.query.includeTrainings || "") === "1";
    const includeFreeVideos = String(req.query.includeFreeVideos || "") === "1";

    // PRODUCTS (published only)
    const products = await Product.find({ isPublished: true })
      .sort({ sort: -1, createdAt: -1 })
      .select(
        "key slug name blurb description features price billingInterval sort createdAt"
      )
      .lean();

    // COURSES (published only)
    const courses = await PaidCourse.find({ isPublished: true })
      .sort({ sort: -1, createdAt: -1 })
      .select("sku title description bullets createdAt")
      .lean();

    // OPTIONAL: TRAININGS
    let trainings = undefined;
    if (includeTrainings) {
      trainings = await Training.find()
        .sort({ date: -1 })
        .select("title description mode date location attendees createdAt")
        .lean();
    }

    // OPTIONAL: FREE VIDEOS
    let freeVideos = undefined;
    if (includeFreeVideos) {
      freeVideos = await FreeVideo.find({ isPublished: true })
        .sort({ sort: -1, createdAt: -1 })
        .select("title description createdAt")
        .lean();
    }

    res.json({
      ts: Date.now(),
      products,
      courses,
      ...(includeTrainings ? { trainings } : {}),
      ...(includeFreeVideos ? { freeVideos } : {}),
    });
  } catch (err) {
    console.error("GET /helpbot/catalog error", err);
    res.status(500).json({ error: "Failed to build helpbot catalog" });
  }
});

export default router;
