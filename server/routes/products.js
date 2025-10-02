import express from "express";
import { Product } from "../models/Product.js";
import { attachUSDFields, attachUSDList } from "../util/fx.js";

const router = express.Router();

// GET /products
router.get("/", async (req, res) => {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const pageSize = Math.min(
    Math.max(parseInt(req.query.pageSize || "9", 10), 1),
    50
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
});

// GET /products/:key
// router.get("/:key", async (req, res) => {
//   const p = await Product.findOne({
//     key: req.params.key,
//     isPublished: true,
//   }).lean();
//   if (!p) return res.status(404).json({ error: "Product not found" });
//   const withUSD = await attachUSDFields(p);
//   res.json(withUSD);
// });

// server/routes/products.js
router.get("/:key", async (req, res) => {
  const p = await Product.findOne({ key: req.params.key, isPublished: true })
    .populate("relatedFreeVideoIds")
    .lean();
  if (!p) return res.status(404).json({ error: "Product not found" });
  res.json(p);
});

export default router;
