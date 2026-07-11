// server/services/catalog.js
// Builds the grounding "knowledge pack" the ADLM AI Agent reads on every turn:
// the live, published catalog with ACCURATE prices (reusing the same pricing
// rules as checkout), plus a productKey index so tool calls can be validated.
//
// Cached in-process for a few minutes — the catalog changes rarely and every
// chat turn would otherwise re-query Mongo.

import { Product } from "../models/Product.js";
import { PaidCourse } from "../models/PaidCourse.js";
import { FreeVideo } from "../models/Learn.js";
import { Training } from "../models/Training.js";
import { Freebie } from "../models/Freebie.js";
import { getFxRate } from "../util/fx.js";
import { getEffectivePrices } from "../util/pricing.js";

const CACHE_TTL_MS = 5 * 60 * 1000;
let CACHE = { ts: 0, data: null };

function ngn(n) {
  const v = Number(n || 0);
  if (!v) return "";
  return `₦${v.toLocaleString("en-NG")}`;
}
function usd(n) {
  const v = Number(n || 0);
  if (!v) return "";
  return `$${v.toLocaleString("en-US")}`;
}

// One human-readable price line per product, e.g.
// "₦15,000/mo ($10) · 6mo ₦80,000 · yearly ₦150,000 ($100)"
function priceLine(p, fxRate) {
  const n = getEffectivePrices(p, "NGN", fxRate);
  const u = getEffectivePrices(p, "USD", fxRate);

  const parts = [];
  if (p.billingInterval === "yearly") {
    const y = [ngn(n.yearly), usd(u.yearly)].filter(Boolean).join(" / ");
    if (y) parts.push(`${y} per year`);
  } else {
    const m = [ngn(n.monthly), usd(u.monthly)].filter(Boolean).join(" / ");
    if (m) parts.push(`${m} per month`);
    if (n.sixMonth) {
      const s = [ngn(n.sixMonth), usd(u.sixMonth)].filter(Boolean).join(" / ");
      if (s) parts.push(`6 months ${s}`);
    }
    if (n.yearly) {
      const y = [ngn(n.yearly), usd(u.yearly)].filter(Boolean).join(" / ");
      if (y) parts.push(`1 year ${y}`);
    }
  }
  if (n.install) {
    const inst = [ngn(n.install), usd(u.install)].filter(Boolean).join(" / ");
    if (inst) parts.push(`one-time install ${inst}`);
  }
  return parts.join(" · ");
}

function clip(s, n = 220) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

async function build() {
  const fxRate = await getFxRate().catch(() => 1600);

  const [products, courses, trainings, freeVideos, freebies] = await Promise.all([
    Product.find({ isPublished: true })
      .sort({ sort: -1, createdAt: -1 })
      .select("key name blurb description features price billingInterval isComingSoon")
      .lean(),
    PaidCourse.find({ isPublished: true })
      .sort({ sort: -1, createdAt: -1 })
      .select("sku title blurb description")
      .lean(),
    Training.find({ date: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } })
      .sort({ date: 1 })
      .limit(8)
      .select("title description mode date city country venue")
      .lean(),
    FreeVideo.find({ isPublished: true })
      .sort({ sort: -1, createdAt: -1 })
      .limit(12)
      .select("title description")
      .lean(),
    Freebie.find({ published: true })
      .sort({ createdAt: -1 })
      .limit(12)
      .select("title description productKey")
      .lean(),
  ]);

  // productKey -> canonical info, used to validate/label tool calls.
  const productIndex = new Map();
  for (const p of products) {
    if (p.key) {
      productIndex.set(String(p.key).toLowerCase(), {
        key: p.key,
        name: p.name || p.key,
        route: `/product/${encodeURIComponent(p.key)}`,
        comingSoon: !!p.isComingSoon,
      });
    }
  }

  /* ---- Assemble the markdown knowledge pack ---- */
  const lines = [];

  lines.push("## PRODUCTS (software, plugins & subscriptions)");
  if (!products.length) lines.push("(none published)");
  for (const p of products) {
    const feats = Array.isArray(p.features) && p.features.length
      ? ` Key features: ${p.features.slice(0, 6).join("; ")}.`
      : "";
    const price = priceLine(p, fxRate);
    const status = p.isComingSoon ? " [COMING SOON — not yet purchasable]" : "";
    lines.push(
      `- **${p.name}** (productKey: \`${p.key}\`)${status} — ${clip(
        p.blurb || p.description,
      )}${feats}${price ? ` Price: ${price}.` : ""}`,
    );
  }

  lines.push("");
  lines.push("## COURSES (self-paced / classroom, paid)");
  if (!courses.length) lines.push("(none published)");
  for (const c of courses) {
    lines.push(
      `- **${c.title}** (course sku: \`${c.sku}\`) — ${clip(
        c.blurb || c.description,
      )}`,
    );
  }

  lines.push("");
  lines.push("## UPCOMING TRAININGS (live, dated)");
  if (!trainings.length) lines.push("(none scheduled)");
  for (const t of trainings) {
    const where =
      t.mode === "online"
        ? "online"
        : [t.venue, t.city, t.country].filter(Boolean).join(", ") || t.mode;
    const when = t.date ? new Date(t.date).toISOString().slice(0, 10) : "TBA";
    lines.push(
      `- **${t.title}** — ${when}, ${where}. ${clip(t.description, 140)} (id: \`${t._id}\`)`,
    );
  }

  if (freeVideos.length) {
    lines.push("");
    lines.push("## FREE VIDEOS (lead magnets — /learn)");
    for (const v of freeVideos.slice(0, 8)) {
      lines.push(`- ${v.title}`);
    }
  }

  if (freebies.length) {
    lines.push("");
    lines.push("## FREE DOWNLOADS (lead magnets — /freebies)");
    for (const f of freebies.slice(0, 8)) {
      lines.push(`- ${f.title}${f.productKey ? ` (for ${f.productKey})` : ""}`);
    }
  }

  return {
    knowledgePack: lines.join("\n"),
    productIndex,
    fxRate,
    counts: {
      products: products.length,
      courses: courses.length,
      trainings: trainings.length,
    },
  };
}

export async function getCatalog() {
  const now = Date.now();
  if (CACHE.data && now - CACHE.ts < CACHE_TTL_MS) return CACHE.data;
  const data = await build();
  CACHE = { ts: now, data };
  return data;
}

// Exposed so an admin edit could bust the cache immediately if wired later.
export function invalidateCatalog() {
  CACHE = { ts: 0, data: null };
}
