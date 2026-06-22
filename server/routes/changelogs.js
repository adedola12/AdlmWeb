// server/routes/changelogs.js
//
// Public "What's New" changelog API. Read-only, no auth. The shape returned by
// these endpoints is identical to client/src/data/changelogs.js so the public
// pages can swap the bundled file for a live fetch with no shape change.
import express from "express";
import { ChangelogProduct, serializePublic, serializePublicList } from "../models/Changelog.js";

const router = express.Router();

// GET /changelogs  →  { products: [...] }  (every product, hub-ordered)
router.get("/", async (_req, res) => {
  try {
    const docs = await ChangelogProduct.find({}).lean();
    res.json({ products: serializePublicList(docs) });
  } catch (err) {
    console.error("GET /changelogs error", err);
    res.status(500).json({ error: "Failed to fetch changelogs" });
  }
});

// GET /changelogs/:slug  →  { product }  (single product detail)
router.get("/:slug", async (req, res) => {
  try {
    const slug = String(req.params.slug || "").toLowerCase();
    const doc = await ChangelogProduct.findOne({ slug }).lean();
    if (!doc) return res.status(404).json({ error: "Product not found" });
    res.json({ product: serializePublic(doc) });
  } catch (err) {
    console.error("GET /changelogs/:slug error", err);
    res.status(500).json({ error: "Failed to fetch changelog" });
  }
});

export default router;
