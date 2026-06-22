// server/models/Changelog.js
//
// Database-backed source for the public "What's New" product changelogs.
// One document per product (QUIV, CIVIQ, HERON, …); each embeds an ordered
// list of releases (newest first) and each release embeds change groups
// (New / Improved / Fixed) with bullet items.
//
// The public shape served to the site is produced by toPublicProduct() and is
// IDENTICAL to what client/scripts/gen-changelogs.mjs emits into
// src/data/changelogs.js — so the public pages can switch between the bundled
// file (fallback / seed) and the API with no shape changes.

import mongoose from "mongoose";

// Allowed front-matter vocab — mirrors the markdown front matter + theme maps
// in client/src/data/whatsNewTheme.js. Keep these in sync if the theme grows.
export const ACCENTS = ["orange", "blue", "sky", "emerald", "violet", "amber"];
export const ICONS = ["cube", "map", "layers", "zap", "dollar", "play", "trending", "book"];
export const STATUSES = ["live", "coming-soon"];
export const CHANGE_TYPES = ["new", "improved", "fixed"];

// Canonical display order for change groups within a release. The public
// detail page just maps over `changes`, so we serialize in this order
// regardless of the order the admin entered them.
const TYPE_ORDER = { new: 0, improved: 1, fixed: 2 };

const ChangeGroupSchema = new mongoose.Schema(
  {
    type: { type: String, enum: CHANGE_TYPES, required: true },
    items: { type: [String], default: [] },
  },
  { _id: false },
);

const ReleaseSchema = new mongoose.Schema(
  {
    // Free-text version label, e.g. "3.1.1" or "1.0". Not validated as semver
    // on purpose — products like HERON ship "1.0" and dates like "2022".
    version: { type: String, required: true, trim: true },
    // Free-text date label exactly as shown, e.g. "June 2026" or "2022".
    date: { type: String, default: "", trim: true },
    title: { type: String, default: "", trim: true },
    // Optional one–two sentence highlight paragraph under the heading.
    highlight: { type: String, default: "", trim: true },
    changes: { type: [ChangeGroupSchema], default: [] },
  },
  { timestamps: true }, // keeps an _id per release for sub-document editing
);

const ChangelogProductSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    name: { type: String, default: "", trim: true },
    tagline: { type: String, default: "", trim: true },
    category: { type: String, default: "", trim: true },
    accent: { type: String, enum: ACCENTS, default: "blue" },
    icon: { type: String, enum: ICONS, default: "cube" },
    status: { type: String, enum: STATUSES, default: "coming-soon" },
    compatibility: { type: String, default: "", trim: true },
    summary: { type: String, default: "", trim: true },
    // Card sort order on the hub (ascending). Matches the markdown `order`.
    order: { type: Number, default: 999 },
    // Releases are stored newest-first; index 0 is the "latest".
    releases: { type: [ReleaseSchema], default: [] },
  },
  { timestamps: true },
);

// Serialize ONE product document into the exact public shape consumed by
// WhatsNew.jsx / WhatsNewProduct.jsx (and produced by gen-changelogs.mjs).
ChangelogProductSchema.methods.toPublicProduct = function () {
  return serializePublic(this);
};

export function serializePublic(doc) {
  const slug = String(doc.slug || "").toLowerCase();

  const releases = (doc.releases || []).map((r, i) => {
    const changes = (r.changes || [])
      .map((g) => ({ type: g.type, items: (g.items || []).map((s) => String(s).trim()).filter(Boolean) }))
      .filter((g) => g.items.length)
      .sort((a, b) => (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9));

    const out = {
      version: String(r.version || "").trim(),
      date: String(r.date || "").trim(),
      latest: i === 0,
      title: String(r.title || "").trim() || `Version ${String(r.version || "").trim()}`,
      changes,
    };
    const hl = String(r.highlight || "").trim();
    if (hl) out.highlight = hl;
    return out;
  });

  const itemCount = releases.reduce(
    (n, r) => n + r.changes.reduce((m, g) => m + g.items.length, 0),
    0,
  );

  const status = doc.status || (releases.length ? "live" : "coming-soon");

  return {
    slug,
    name: doc.name || slug.toUpperCase(),
    tagline: doc.tagline || "",
    category: doc.category || "",
    accent: doc.accent || "blue",
    icon: doc.icon || "cube",
    status,
    compatibility: doc.compatibility || "",
    summary: doc.summary || doc.tagline || "",
    order: Number.isFinite(doc.order) ? doc.order : 999,
    latest: releases[0]?.version || null,
    lastUpdated: releases[0]?.date || null,
    itemCount,
    releases,
  };
}

// Sort + serialize a list of products into the public `products` array shape,
// ordered by `order` then `name` (identical to the generator).
export function serializePublicList(docs) {
  return [...docs]
    .map(serializePublic)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

export const ChangelogProduct =
  mongoose.models.ChangelogProduct ||
  mongoose.model("ChangelogProduct", ChangelogProductSchema);

export default ChangelogProduct;
