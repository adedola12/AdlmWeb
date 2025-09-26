// server/routes/products.js
import express from "express";
import { Product } from "../models/Product.js";

const router = express.Router();

// GET /products?page=1&pageSize=9&published=1
router.get("/", async (req, res) => {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const pageSize = Math.min(
    Math.max(parseInt(req.query.pageSize || "9", 10), 1),
    50
  );
  const published = req.query.published === "0" ? undefined : true;

  const q = {};
  if (published === true) q.isPublished = true;

  const total = await Product.countDocuments(q);
  const items = await Product.find(q)
    .sort({ sort: -1, createdAt: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean();

  res.json({ items, total, page, pageSize });
});

// GET /products/:key  (public detail by stable productKey)
router.get("/:key", async (req, res) => {
  const p = await Product.findOne({
    key: req.params.key,
    isPublished: true,
  }).lean();
  if (!p) return res.status(404).json({ error: "Product not found" });
  res.json(p);
});

export default router;
