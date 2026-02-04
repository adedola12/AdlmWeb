// server/routes/admin.usersLite.js
import express from "express";
import dayjs from "dayjs";
import { requireAuth } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { Product } from "../models/Product.js";
import { Purchase } from "../models/Purchase.js";

const router = express.Router();

/* -------------------- auth -------------------- */
// allow ONLY admin + mini_admin
function requireStaff(req, res, next) {
  const roleRaw = String(req.user?.role || "");
  const role = roleRaw.toLowerCase().replace(/-/g, "_").trim(); // accept mini-admin too
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

function escapeRegExp(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSubStatus(ent) {
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

/* -------------------- tabs for products -------------------- */
async function getEntitlementUserCountsByKey() {
  // Count UNIQUE users per productKey (case-insensitive)
  const rows = await User.aggregate([
    { $match: { entitlements: { $exists: true, $ne: [] } } },
    { $unwind: "$entitlements" },
    {
      $project: {
        userId: "$_id",
        productKey: { $toLower: "$entitlements.productKey" },
      },
    },
    { $group: { _id: { productKey: "$productKey", userId: "$userId" } } },
    { $group: { _id: "$_id.productKey", count: { $sum: 1 } } },
  ]);

  const map = {};
  for (const r of rows || []) {
    if (!r?._id) continue;
    map[String(r._id)] = Number(r.count || 0);
  }
  return map;
}

function tabWeightFromProduct(p) {
  const key = safeLower(p?.key);
  const name = safeLower(p?.name);
  const hay = `${key} ${name}`;

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
  return 10;
}

/* -------------------- unpaid attempts (pending purchases) -------------------- */
const UNPAID_TAB_ID = "__unpaid_attempts__";

function pickFirstNonEmpty(...vals) {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

function buildAttemptedItem(p) {
  // Cart purchase
  if (Array.isArray(p?.lines) && p.lines.length > 0) {
    const names = p.lines
      .map((ln) => ln?.name || ln?.productName || ln?.productKey || "")
      .filter(Boolean);
    if (names.length) return names.join(" · ");
  }

  // Single product purchase
  return (
    p?.name ||
    p?.productName ||
    p?.productTitle ||
    p?.productKey ||
    p?.sku ||
    "—"
  );
}

function purchaseToLiteRow(p) {
  const email = pickFirstNonEmpty(p?.email, p?.user?.email, p?.customer?.email);

  const firstName = pickFirstNonEmpty(
    p?.firstName,
    p?.user?.firstName,
    p?.customer?.firstName,
  );

  const lastName = pickFirstNonEmpty(
    p?.lastName,
    p?.user?.lastName,
    p?.customer?.lastName,
  );

  return {
    firstName,
    lastName,
    email,
    attemptedItem: buildAttemptedItem(p),
    createdAt: p?.createdAt || null,
  };
}

async function getUnpaidAttemptRows() {
  // pending purchase attempts
  const purchases = await Purchase.find(
    { status: "pending" },
    {
      email: 1,
      firstName: 1,
      lastName: 1,
      createdAt: 1,
      productKey: 1,
      name: 1,
      productName: 1,
      productTitle: 1,
      sku: 1,
      lines: 1,
      user: 1,
      customer: 1,
    },
  )
    .sort({ createdAt: -1 })
    .limit(2000)
    .lean();

  // Aggregate by email (one row per email), combine attempted items uniquely
  const map = new Map(); // emailLower -> {firstName,lastName,email,_items:Set,createdAt}
  for (const p of purchases || []) {
    const r = purchaseToLiteRow(p);
    if (!r.email) continue;

    const key = String(r.email).toLowerCase();
    if (!map.has(key)) {
      map.set(key, {
        firstName: r.firstName || "",
        lastName: r.lastName || "",
        email: r.email,
        _items: new Set(),
        createdAt: r.createdAt || null,
      });
    }

    const agg = map.get(key);

    if (!agg.firstName && r.firstName) agg.firstName = r.firstName;
    if (!agg.lastName && r.lastName) agg.lastName = r.lastName;

    if (r.attemptedItem && r.attemptedItem !== "—") {
      const parts = String(r.attemptedItem)
        .split("·")
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length) parts.forEach((x) => agg._items.add(x));
      else agg._items.add(String(r.attemptedItem).trim());
    }
  }

  return Array.from(map.values()).map((x) => ({
    firstName: x.firstName,
    lastName: x.lastName,
    email: x.email,
    attemptedItem: x._items.size ? Array.from(x._items).join(" · ") : "—",
    createdAt: x.createdAt,
  }));
}

/* -------------------- routes -------------------- */

/**
 * GET /admin/users-lite/tabs
 * Returns all mini-admin tabs, including unpaid attempts.
 */
router.get(
  "/tabs",
  asyncHandler(async (_req, res) => {
    const [products, countsByKey, unpaidRows, neverPaidCount] =
      await Promise.all([
        Product.find({}, { key: 1, name: 1, isCourse: 1, sort: 1 }).lean(),
        getEntitlementUserCountsByKey(),
        getUnpaidAttemptRows(), // unique email rows
        User.countDocuments({
          $or: [
            { entitlements: { $exists: false } },
            { entitlements: { $size: 0 } },
          ],
        }),
      ]);

    const prods = Array.isArray(products) ? products : [];

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
      .filter((t) => t.count > 0)
      .sort((a, b) => {
        if (a._weight !== b._weight) return a._weight - b._weight;
        if (a._sort !== b._sort) return a._sort - b._sort;
        return a._name.localeCompare(b._name);
      })
      .map(({ _weight, _sort, _name, ...t }) => t);

    // Unknown keys (entitlements that have no Product record)
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

    const tabs = [
      ...productTabs,
      ...unknownTabs,
      {
        id: UNPAID_TAB_ID,
        title: "Unpaid Attempts",
        count: Array.isArray(unpaidRows) ? unpaidRows.length : 0,
      },
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
 * GET /admin/users-lite/list?tab=product:<key>|unknown:<key>|never_paid|__unpaid_attempts__
 */
router.get(
  "/list",
  asyncHandler(async (req, res) => {
    const tab = String(req.query?.tab || "").trim();
    if (!tab) return res.status(400).json({ error: "tab is required" });

    // ✅ unpaid attempts
    if (tab === UNPAID_TAB_ID) {
      const rows = await getUnpaidAttemptRows();
      return res.json({ ok: true, tab, rows });
    }

    // ✅ never paid
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

    // Case-insensitive match in DB
    const rx = new RegExp(`^${escapeRegExp(key)}$`, "i");

    const users = await User.find(
      { "entitlements.productKey": rx },
      { email: 1, firstName: 1, lastName: 1, entitlements: 1 },
    ).lean();

    const rows = [];
    for (const u of users || []) {
      const ents = Array.isArray(u?.entitlements) ? u.entitlements : [];
      const relevant = ents.filter((e) => rx.test(String(e?.productKey || "")));
      if (!relevant.length) continue;

      const best = pickBestStatus(relevant);
      rows.push(userRow(u, best));
    }

    return res.json({ ok: true, tab, rows });
  }),
);

export default router;
