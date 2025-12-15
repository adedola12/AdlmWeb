// server/routes/helpbot.js
import express from "express";
import { Product } from "../models/Product.js";
import { PaidCourse } from "../models/PaidCourse.js";
import { FreeVideo } from "../models/Learn.js";
import { Training } from "../models/Training.js";

const router = express.Router();

/* ------------------ Simple rate limit (no extra deps) ------------------ */
const RL_WINDOW_MS = 60 * 1000; // 1 minute
const RL_MAX = 60; // 60 requests/min per IP (tune)
const hits = new Map();

function rateLimit(req, res, next) {
  const ip =
    req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown";

  const now = Date.now();
  const rec = hits.get(ip) || { ts: now, count: 0 };

  if (now - rec.ts > RL_WINDOW_MS) {
    rec.ts = now;
    rec.count = 0;
  }

  rec.count += 1;
  hits.set(ip, rec);

  if (rec.count > RL_MAX) {
    return res
      .status(429)
      .json({ error: "Too many requests. Try again soon." });
  }
  next();
}

/* ------------------ Helpers ------------------ */
function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .trim();
}
function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}
function tokenize(text) {
  return uniq(
    normalize(text)
      .replace(/[^\w\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3)
  );
}

function scoreMatch(message, itemTokens, idBoost, itemId) {
  const mTokens = tokenize(message);
  if (!mTokens.length) return 0;

  let score = 0;
  for (const t of mTokens) {
    if (itemTokens.includes(t)) score += 3;
    else if (itemTokens.some((x) => x.includes(t) || t.includes(x))) score += 1;
  }

  const m = normalize(message);
  if (itemId && m.includes(normalize(itemId))) score += idBoost;

  return score;
}

/* ------------------ Server-side cache (NOT localStorage) ------------------ */
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 mins (tune)
let CACHE = { ts: 0, data: null };

async function buildCatalog({ includeTrainings, includeFreeVideos }) {
  const [products, courses, trainings, freeVideos] = await Promise.all([
    Product.find({ isPublished: true })
      .sort({ sort: -1, createdAt: -1 })
      .select("key slug name blurb description features price billingInterval")
      .lean(),

    PaidCourse.find({ isPublished: true })
      .sort({ sort: -1, createdAt: -1 })
      .select("sku title description bullets")
      .lean(),

    includeTrainings
      ? Training.find()
          .sort({ date: -1 })
          .select("title description mode date location")
          .lean()
      : Promise.resolve([]),

    includeFreeVideos
      ? FreeVideo.find({ isPublished: true })
          .sort({ sort: -1, createdAt: -1 })
          .select("title description")
          .lean()
      : Promise.resolve([]),
  ]);

  const productItems = products.map((p) => {
    const id = p.key || p.slug || p._id;
    const label = p.name || id;
    const textBlob = [
      p.name,
      p.key,
      p.slug,
      p.blurb,
      p.description,
      Array.isArray(p.features) ? p.features.join(" ") : "",
    ].join(" ");

    const priceNGN =
      p?.billingInterval === "yearly"
        ? p?.price?.yearlyNGN
        : p?.price?.monthlyNGN;
    const priceUSD =
      p?.billingInterval === "yearly"
        ? p?.price?.yearlyUSD
        : p?.price?.monthlyUSD;

    return {
      kind: "product",
      id,
      label,
      to: id ? `/product/${encodeURIComponent(id)}` : "/products",
      tokens: tokenize(textBlob),
      meta: {
        billingInterval: p?.billingInterval || "monthly",
        priceNGN,
        priceUSD,
      },
    };
  });

  const courseItems = courses.map((c) => {
    const id = c.sku || c._id;
    const label = c.title || id;
    const textBlob = [
      c.sku,
      c.title,
      c.description,
      Array.isArray(c.bullets) ? c.bullets.join(" ") : "",
    ].join(" ");

    return {
      kind: "course",
      id,
      label,
      to: id ? `/learn/course/${encodeURIComponent(id)}` : "/learn",
      tokens: tokenize(textBlob),
      meta: {},
    };
  });

  const trainingItems = trainings.map((t) => {
    const id = t._id;
    const label = t.title || "Training";
    const textBlob = [t.title, t.description, t.mode, t.location, t.date].join(
      " "
    );

    return {
      kind: "training",
      id,
      label,
      to: id ? `/trainings/${encodeURIComponent(id)}` : "/trainings",
      tokens: tokenize(textBlob),
      meta: { mode: t.mode, date: t.date },
    };
  });

  const freeVideoItems = freeVideos.map((v) => {
    const id = v._id;
    const label = v.title || "Free video";
    const textBlob = [v.title, v.description].join(" ");

    return {
      kind: "freeVideo",
      id,
      label,
      to: id ? `/learn/free/${encodeURIComponent(id)}` : "/learn",
      tokens: tokenize(textBlob),
      meta: {},
    };
  });

  return {
    all: [...productItems, ...courseItems, ...trainingItems, ...freeVideoItems],
  };
}

async function getCatalogCached(opts) {
  const now = Date.now();
  if (CACHE.data && now - CACHE.ts < CACHE_TTL_MS) return CACHE.data;

  const data = await buildCatalog(opts);
  CACHE = { ts: now, data };
  return data;
}

/* ------------------ Endpoints ------------------ */

/**
 * POST /helpbot/search
 * body: { message: string, includeTrainings?: boolean, includeFreeVideos?: boolean, limit?: number }
 * returns: { matches: [{kind,id,label,to,meta,score}] }
 */
router.post("/search", rateLimit, async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();
    const includeTrainings = !!req.body?.includeTrainings;
    const includeFreeVideos = !!req.body?.includeFreeVideos;
    const limit = Math.min(
      Math.max(parseInt(req.body?.limit || "6", 10), 1),
      10
    );

    if (!message) return res.json({ matches: [] });
    if (message.length > 240) {
      return res.status(400).json({ error: "Message too long." });
    }

    const catalog = await getCatalogCached({
      includeTrainings,
      includeFreeVideos,
    });

    const scored = catalog.all
      .map((it) => {
        const idBoost = it.kind === "product" || it.kind === "course" ? 6 : 4;
        const score = scoreMatch(message, it.tokens, idBoost, it.id);
        return { ...it, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ tokens, ...safe }) => safe); // remove tokens from response

    res.json({ matches: scored });
  } catch (err) {
    console.error("POST /helpbot/search error", err);
    res.status(500).json({ error: "Search failed" });
  }
});

export default router;
