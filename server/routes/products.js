// server/routes/products.js
import express from "express";
import mongoose from "mongoose";
import { Product } from "../models/Product.js";
import { attachUSDFields, attachUSDList } from "../util/fx.js";

const router = express.Router();

// GET /products
router.get("/", async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const pageSize = Math.min(
      Math.max(parseInt(req.query.pageSize || "9", 10), 1),
      50,
    );

    const q = { isPublished: true };
    const total = await Product.countDocuments(q);

    const raw = await Product.find(q)
      .sort({ sort: -1, createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean();

    const items = await attachUSDList(raw);
    res.json({ items, total, page, pageSize });
  } catch (err) {
    next(err);
  }
});

// GET /products/:key  (key OR _id)
router.get("/:key", async (req, res, next) => {
  try {
    const rawKey = String(req.params.key || "").trim();
    const key = decodeURIComponent(rawKey);

    const or = [{ key, isPublished: true }];

    // Allow lookup by ObjectId too (very useful for admin / deep links)
    if (mongoose.isValidObjectId(key)) {
      or.push({ _id: key, isPublished: true });
    }

    const found = await Product.findOne({ $or: or })
      .populate("relatedFreeVideoIds")
      .lean();

    if (!found) return res.status(404).json({ error: "Product not found" });

    const p = await attachUSDFields(found);
    res.json(p);
  } catch (err) {
    next(err);
  }
});

export default router;
