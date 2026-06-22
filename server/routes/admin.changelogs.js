// server/routes/admin.changelogs.js
//
// Admin CRUD for the "What's New" product changelogs. Gated by the
// `changelogs` admin area (see server/config/permissions.js). Super-admins
// pass implicitly; mini-admins / custom roles need the area granted via UAC.
//
// The editor saves a whole product at once (metadata + the full releases
// array) via PUT — the dataset is tiny (a handful of products, a few releases
// each) so last-write-wins on the whole document keeps the client simple.
// Endpoints return the RAW document (with _id on the product + each release).
import express from "express";
import {
  ChangelogProduct,
  ACCENTS,
  ICONS,
  STATUSES,
  CHANGE_TYPES,
} from "../models/Changelog.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";

const router = express.Router();
const guard = [requireAuth, requirePermission("changelogs")];

/* -------------------------- input sanitizers -------------------------- */

function clean(v) {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeSlug(s) {
  return clean(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Pull the allowed metadata fields off a request body, validating enums.
// `partial` = only set keys that were actually provided.
function sanitizeMeta(body = {}, { partial = false } = {}) {
  const out = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);

  if (!partial || has("name")) out.name = clean(body.name);
  if (!partial || has("tagline")) out.tagline = clean(body.tagline);
  if (!partial || has("category")) out.category = clean(body.category);
  if (!partial || has("compatibility")) out.compatibility = clean(body.compatibility);
  if (!partial || has("summary")) out.summary = clean(body.summary);

  if (!partial || has("accent")) {
    const a = clean(body.accent).toLowerCase();
    out.accent = ACCENTS.includes(a) ? a : "blue";
  }
  if (!partial || has("icon")) {
    const i = clean(body.icon).toLowerCase();
    out.icon = ICONS.includes(i) ? i : "cube";
  }
  if (!partial || has("status")) {
    const s = clean(body.status).toLowerCase();
    out.status = STATUSES.includes(s) ? s : "coming-soon";
  }
  if (!partial || has("order")) {
    const n = Number(body.order);
    out.order = Number.isFinite(n) ? n : 999;
  }
  return out;
}

// Normalize the releases array → [{ version, date, title, highlight, changes }].
// Releases without a version are dropped; empty change groups are dropped.
function sanitizeReleases(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((r) => ({
      version: clean(r?.version),
      date: clean(r?.date),
      title: clean(r?.title),
      highlight: clean(r?.highlight),
      changes: (Array.isArray(r?.changes) ? r.changes : [])
        .map((g) => ({
          type: clean(g?.type).toLowerCase(),
          items: (Array.isArray(g?.items) ? g.items : []).map(clean).filter(Boolean),
        }))
        .filter((g) => CHANGE_TYPES.includes(g.type) && g.items.length),
    }))
    .filter((r) => r.version);
}

/* ============================== ROUTES ============================== */

// GET /admin/changelogs  →  { products: [raw docs] }  (every product)
router.get("/", ...guard, async (_req, res) => {
  try {
    const products = await ChangelogProduct.find({}).sort({ order: 1, name: 1 }).lean();
    res.json({ products });
  } catch (err) {
    console.error("GET /admin/changelogs error", err);
    res.status(500).json({ error: "Failed to load changelogs" });
  }
});

// POST /admin/changelogs  →  create a product (metadata + optional releases)
router.post("/", ...guard, async (req, res) => {
  try {
    const slug = normalizeSlug(req.body?.slug || req.body?.name);
    if (!slug) return res.status(400).json({ error: "A slug or name is required" });

    const exists = await ChangelogProduct.findOne({ slug }).lean();
    if (exists) return res.status(409).json({ error: `Slug "${slug}" already exists` });

    const meta = sanitizeMeta(req.body);
    const releases = sanitizeReleases(req.body?.releases);
    const doc = await ChangelogProduct.create({ slug, ...meta, releases });
    res.status(201).json({ product: doc.toObject() });
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: "Slug already exists" });
    console.error("POST /admin/changelogs error", err);
    res.status(500).json({ error: "Failed to create product" });
  }
});

// PUT /admin/changelogs/:id  →  full save of metadata + releases.
// Release order in the array is the display order; index 0 is "latest".
router.put("/:id", ...guard, async (req, res) => {
  try {
    const update = sanitizeMeta(req.body);
    update.releases = sanitizeReleases(req.body?.releases);

    if (Object.prototype.hasOwnProperty.call(req.body, "slug")) {
      const slug = normalizeSlug(req.body.slug);
      if (!slug) return res.status(400).json({ error: "Slug cannot be empty" });
      const clash = await ChangelogProduct.findOne({ slug, _id: { $ne: req.params.id } }).lean();
      if (clash) return res.status(409).json({ error: `Slug "${slug}" already exists` });
      update.slug = slug;
    }

    const doc = await ChangelogProduct.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });
    if (!doc) return res.status(404).json({ error: "Product not found" });
    res.json({ product: doc.toObject() });
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: "Slug already exists" });
    console.error("PUT /admin/changelogs/:id error", err);
    res.status(500).json({ error: "Failed to save product" });
  }
});

// DELETE /admin/changelogs/:id  →  delete a product and all its releases
router.delete("/:id", ...guard, async (req, res) => {
  try {
    const doc = await ChangelogProduct.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: "Product not found" });
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /admin/changelogs/:id error", err);
    res.status(500).json({ error: "Failed to delete product" });
  }
});

export default router;
