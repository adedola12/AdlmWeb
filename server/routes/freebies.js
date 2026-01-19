import express from "express";
import mongoose from "mongoose";
import { Freebie } from "../models/Freebie.js";

const router = express.Router();

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

// GET /freebies  (published only)
router.get("/", async (req, res) => {
  try {
    const items = await Freebie.find({ published: true })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ ok: true, items });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// GET /freebies/:id  (published only)
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id))
      return res.status(400).json({ ok: false, error: "Invalid id" });

    const item = await Freebie.findOne({ _id: id, published: true }).lean();
    if (!item) return res.status(404).json({ ok: false, error: "Not found" });

    return res.json({ ok: true, item });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

export default router;
