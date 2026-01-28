import express from "express";
import dayjs from "dayjs";
import { requireAuth } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { Product } from "../models/Product.js";

const router = express.Router();

/* -------------------- auth -------------------- */
// allow ONLY admin + mini_admin
function requireStaff(req, res, next) {
  const role = String(req.user?.role || "").toLowerCase();
  if (role === "admin" || role === "mini_admin") return next();
  return res.status(403).json({ error: "Forbidden" });
}

router.use(requireAuth, requireStaff);

/* -------------------- helpers -------------------- */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const safeLower = (v) =>
  String(v || "")
    .trim()
    .toLowerCase();

function normalizeSubStatus(ent) {
  // ent.status: active | inactive | disabled
  const now = dayjs();
  const s = safeLower(ent?.status || "inactive");
  const exp = ent?.expiresAt ? dayjs(ent.expiresAt) : null;

  if (s === "disabled")
    return { status: "disabled", expiresAt: ent?.expiresAt || null };

  if (s === "active") {
    if (!exp) return { status: "active", expiresAt: null };
    if (exp.isAfter(now)) return { status: "active", expiresAt: ent.expiresAt };
    return { status: "expired", expiresAt: ent.expiresAt };
  }

  // inactive
  if (exp && exp.isAfter(now))
    return { status: "inactive", expiresAt: ent.expiresAt };
  if (exp && !exp.isAfter(now))
    return { status: "expired", expiresAt: ent.expiresAt };
  return { status: "inactive", expiresAt: ent?.expiresAt || null };
}

function pickBestStatus(ents) {
  // best -> active > disabled > expired > inactive
  const rank = { active: 4, disabled: 3, expired: 2, inactive: 1 };

  let best = null;

  for (const e of ents || []) {
    const r = normalizeSubStatus(e);
    const score = rank[r.status] || 0;

    if (!best) {
      best = { ...r, _score: score };
      continue;
    }

    if (score > best._score) {
      best = { ...r, _score: score };
      continue;
    }

    // tie-breaker: later expiry wins
    if (score === best._score) {
      const a = r.expiresAt ? dayjs(r.expiresAt) : null;
      const b = best.expiresAt ? dayjs(best.expiresAt) : null;
      if (a && (!b || a.isAfter(b))) best = { ...r, _score: score };
    }
  }

  return best || { status: "inactive", expiresAt: null };
}

function userRow(u, best) {
  return {
    firstName: String(u?.firstName || "").trim(),
    lastName: String(u?.lastName || "").trim(),
    email: String(u?.email || "").trim(),
    subscriptionStatus: best?.status || "inactive",
  };
}

/* -------------------- dynamic tabs -------------------- */
/**
 * We build tabs like:
 * - product:<key> for every product that has >= 1 user with an entitlement for that key
 * - never_paid
 *
 * Tabs are derived from Product DB, and counts are derived from User.entitlements.
 * If you add new products later, they show up automatically when someone gets entitlement.
 */
async function getEntitlementUserCountsByKey() {
  // Count UNIQUE users per productKey
  // 1) unwind entitlements
  // 2) group by {productKey, userId} to dedupe
  // 3) group by productKey to count users
  const rows = await User.aggregate([
    { $match: { entitlements: { $exists: true, $ne: [] } } },
    { $unwind: "$entitlements" },
    {
      $project: {
        userId: "$_id",
        productKey: { $toLower: "$entitlements.productKey" },
      },
    },
    {
      $group: {
        _id: { productKey: "$productKey", userId: "$userId" },
      },
    },
    {
      $group: {
        _id: "$_id.productKey",
        count: { $sum: 1 },
      },
    },
  ]);

  const map = {};
  for (const r of rows || []) {
    if (!r?._id) continue;
    map[String(r._id)] = Number(r.count || 0);
  }
  return map; // { "planswift_pro": 12, "rategen_basic": 5, ... }
}

function tabWeightFromProduct(p) {
  // keep your most important ones up top automatically
  const key = safeLower(p?.key);
  const name = safeLower(p?.name);
  const hay = `${key} ${name}`;

  // software first
  if (!p?.isCourse) {
    if (hay.includes("planswift")) return 0;
    if (
      hay.includes("rategen") ||
      hay.includes("rate gen") ||
      hay.includes("rate-gen")
    )
      return 1;
    return 2;
  }

  // courses next
  return 10;
}

/* -------------------- routes -------------------- */

/**
 * GET /admin/users-lite/tabs
 * Returns tab list + counts.
 * Tabs are built dynamically from Product DB + actual entitlement usage.
 */
router.get(
  "/tabs",
  asyncHandler(async (_req, res) => {
    const [products, countsByKey] = await Promise.all([
      Product.find({}, { key: 1, name: 1, isCourse: 1, sort: 1 }).lean(),
      getEntitlementUserCountsByKey(),
    ]);

    const prods = Array.isArray(products) ? products : [];

    // Build product tabs only for products that currently have paid users (count > 0)
    const productTabs = prods
      .map((p) => {
        const k = safeLower(p?.key);
        const count = Number(countsByKey[k] || 0);

        return {
          id: `product:${k}`,
          title: p?.isCourse
            ? `Paid for course: ${String(p?.name || k).trim()}`
            : `Paid for: ${String(p?.name || k).trim()}`,
          count,
          _weight: tabWeightFromProduct(p),
          _sort: Number(p?.sort || 0),
          _name: String(p?.name || k).trim(),
        };
      })
      .filter((t) => t.count > 0) // show tabs only when someone has that entitlement
      .sort((a, b) => {
        if (a._weight !== b._weight) return a._weight - b._weight;
        if (a._sort !== b._sort) return a._sort - b._sort;
        return a._name.localeCompare(b._name);
      })
      .map(({ _weight, _sort, _name, ...t }) => t);

    // If there are entitlements with keys NOT in Product collection, show them as "Unknown"
    const productKeySet = new Set(prods.map((p) => safeLower(p?.key)));
    const unknownTabs = Object.keys(countsByKey || {})
      .filter((k) => !productKeySet.has(safeLower(k)))
      .map((k) => ({
        id: `unknown:${safeLower(k)}`,
        title: `Paid for (unknown product): ${safeLower(k)}`,
        count: Number(countsByKey[safeLower(k)] || 0),
      }))
      .filter((t) => t.count > 0)
      .sort((a, b) => a.title.localeCompare(b.title));

    // never paid: no entitlements at all
    const neverPaidCount = await User.countDocuments({
      $or: [
        { entitlements: { $exists: false } },
        { entitlements: { $size: 0 } },
      ],
    });

    const tabs = [
      ...productTabs,
      ...unknownTabs,
      {
        id: "never_paid",
        title: "Signed up but never paid",
        count: neverPaidCount,
      },
    ];

    return res.json({ ok: true, tabs });
  }),
);

/**
 * GET /admin/users-lite/list?tab=product:<key>|unknown:<key>|never_paid
 * Returns user rows: firstName, lastName, email, subscriptionStatus
 */
router.get(
  "/list",
  asyncHandler(async (req, res) => {
    const tab = String(req.query?.tab || "").trim();
    if (!tab) return res.status(400).json({ error: "tab is required" });

    // never paid
    if (tab === "never_paid") {
      const users = await User.find(
        {
          $or: [
            { entitlements: { $exists: false } },
            { entitlements: { $size: 0 } },
          ],
        },
        { email: 1, firstName: 1, lastName: 1, entitlements: 1 },
      ).lean();

      const rows = (users || []).map((u) =>
        userRow(u, { status: "inactive", expiresAt: null }),
      );

      return res.json({ ok: true, tab, rows });
    }

    // product:<key> or unknown:<key>
    let key = "";
    if (tab.startsWith("product:"))
      key = safeLower(tab.slice("product:".length));
    if (tab.startsWith("unknown:"))
      key = safeLower(tab.slice("unknown:".length));

    if (!key) return res.status(400).json({ error: "Invalid tab" });

    const users = await User.find(
      { "entitlements.productKey": key },
      { email: 1, firstName: 1, lastName: 1, entitlements: 1 },
    ).lean();

    const rows = [];
    for (const u of users || []) {
      const ents = Array.isArray(u?.entitlements) ? u.entitlements : [];
      const relevant = ents.filter((e) => safeLower(e?.productKey) === key);
      if (!relevant.length) continue;

      const best = pickBestStatus(relevant);
      rows.push(userRow(u, best));
    }

    return res.json({ ok: true, tab, rows });
  }),
);

export default router;
