// server/routes/admin.aiUsage.js
//
// Admin API behind /admin/ai-usage — the AI spend & allocation dashboard.
//
//   GET    /overview            headline totals, per-feature / per-model /
//                               per-account splits, daily series, top users,
//                               and the AWS credit burn-down + runway
//   GET    /users               per-user rows with their allocation and how
//                               much of it is spent this month
//   GET    /user/:id            drill-down: per-feature totals + recent calls
//   GET    /events              raw call log (paged) for auditing a spike
//   GET    /allocations         the default row + every per-user override
//   PUT    /allocations/default set the platform default + guest ceiling
//   PUT    /allocations/user/:id set/clear one user's allowance
//   DELETE /allocations/user/:id
//   GET    /credit  PUT /credit the AI credit pool the burn-down runs against
//
// Read-only aggregation over the AiUsage event log; nothing here can change a
// user's data, only their future allowance.

import express from "express";
import mongoose from "mongoose";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { AiUsage } from "../models/AiUsage.js";
import { AiAllocation } from "../models/AiAllocation.js";
import { User } from "../models/User.js";
import { Setting } from "../models/Setting.js";
import {
  AI_FEATURES,
  AI_FEATURE_KEYS,
  BILLING_ACCOUNTS,
  isAiFeature,
} from "../config/aiPricing.js";
import {
  monthStart,
  getDefaultAllocation,
  invalidateAllocationCache,
} from "../services/aiUsage.js";

const router = express.Router();

router.use(requireAuth, requirePermission("aiusage"));

/* ────────────────────────────── helpers ────────────────────────────── */

const clampDays = (v, def = 30) => Math.min(Math.max(Number(v) || def, 1), 365);

function windowFrom(query) {
  // "month" pins the window to the current calendar month, which is the same
  // window allocations reset on — so the numbers on the users tab always agree
  // with what the quota check is enforcing.
  if (String(query.window || "") === "month") {
    const since = monthStart();
    return { since, days: Math.ceil((Date.now() - since.getTime()) / 86400000) || 1, window: "month" };
  }
  const days = clampDays(query.days);
  return { since: new Date(Date.now() - days * 86400000), days, window: "days" };
}

function baseMatch(query, since) {
  const match = { at: { $gte: since } };
  const feature = String(query.feature || "").trim();
  if (feature && isAiFeature(feature)) match.feature = feature;
  const billedTo = String(query.billedTo || "").trim();
  if (billedTo && BILLING_ACCOUNTS[billedTo]) match.billedTo = billedTo;
  const product = String(query.product || "").trim();
  if (product) match.product = product;
  return match;
}

const SUM = {
  calls: { $sum: 1 },
  tokens: { $sum: "$totalTokens" },
  inputTokens: { $sum: "$inputTokens" },
  outputTokens: { $sum: "$outputTokens" },
  cacheReadTokens: { $sum: "$cacheReadTokens" },
  cacheWriteTokens: { $sum: "$cacheWriteTokens" },
  costUsd: { $sum: "$costUsd" },
  errors: { $sum: { $cond: [{ $eq: ["$ok", false] }, 1, 0] } },
  estimated: { $sum: { $cond: [{ $eq: ["$tokenSource", "estimated"] }, 1, 0] } },
  avgMs: { $avg: "$ms" },
};

const round = (n, dp = 4) => Number((Number(n) || 0).toFixed(dp));

function shapeTotals(r = {}) {
  return {
    calls: r.calls || 0,
    tokens: r.tokens || 0,
    inputTokens: r.inputTokens || 0,
    outputTokens: r.outputTokens || 0,
    cacheReadTokens: r.cacheReadTokens || 0,
    cacheWriteTokens: r.cacheWriteTokens || 0,
    costUsd: round(r.costUsd),
    errors: r.errors || 0,
    estimatedCalls: r.estimated || 0,
    avgMs: Math.round(r.avgMs || 0),
  };
}

// `window` is carried in BOTH directions on purpose.
//
// Reading it out lets the page say "10 per day" rather than implying a month.
// Writing it back matters more: this object REPLACES the stored limit, so a
// field it does not mention is gone, and the schema default puts it back as
// "month". An admin who opened the AI page and pressed Save - without touching
// the QUIV rows at all - would have quietly turned their daily allowance into a
// monthly one, and nothing on screen would have said so.
function limitWindow(v) {
  return String(v || "") === "day" ? "day" : "month";
}

function limitOut(l) {
  return {
    enabled: l?.enabled !== false,
    calls: Number(l?.calls) || 0,
    tokens: Number(l?.tokens) || 0,
    costUsd: Number(l?.costUsd) || 0,
    window: limitWindow(l?.window),
  };
}

function sanitizeLimit(body) {
  return {
    enabled: body?.enabled !== false,
    calls: Math.max(0, Math.floor(Number(body?.calls) || 0)),
    tokens: Math.max(0, Math.floor(Number(body?.tokens) || 0)),
    costUsd: Math.max(0, Number(Number(body?.costUsd || 0).toFixed(2))),
    window: limitWindow(body?.window),
  };
}

// Only known feature keys make it into the stored map — an admin typo can't
// create a limit that silently never applies to anything. An all-zero entry is
// dropped (zero means unlimited, so storing it would list the feature as
// "capped" while capping nothing) UNLESS it is switched off, which is the one
// case where an all-zero entry carries meaning.
// `keepAll` is used for the guest map, where an all-zero ENABLED entry is
// meaningful: it is how an admin says "guests may use this" for a feature the
// code defaults to signed-in-only. Dropping it would silently discard the
// permission.
function sanitizeFeatures(obj, { keepAll = false } = {}) {
  const out = {};
  if (!obj || typeof obj !== "object") return out;
  for (const key of AI_FEATURE_KEYS) {
    if (!obj[key]) continue;
    const lim = sanitizeLimit(obj[key]);
    if (keepAll || lim.calls || lim.tokens || lim.costUsd || !lim.enabled) out[key] = lim;
  }
  return out;
}

const actorId = (req) => req.user?._id || req.user?.id || null;

const mapOut = (m) => {
  const raw = m instanceof Map ? Object.fromEntries(m) : m || {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) out[k] = limitOut(v);
  return out;
};

function allocationOut(doc) {
  if (!doc) return null;
  const features = mapOut(doc.features);
  return {
    guestFeatures: mapOut(doc.guestFeatures),
    _id: doc._id,
    scope: doc.scope,
    userId: doc.userId || null,
    email: doc.email || "",
    enabled: doc.enabled !== false,
    total: limitOut(doc.total),
    guestTotal: limitOut(doc.guestTotal),
    features,
    notes: doc.notes || "",
    updatedByEmail: doc.updatedByEmail || "",
    updatedAt: doc.updatedAt,
  };
}

/* ────────────────────────────── overview ────────────────────────────── */
// GET /admin/ai-usage/overview?days=30 | window=month
router.get("/overview", async (req, res) => {
  try {
    const { since, days, window } = windowFrom(req.query);
    const match = baseMatch(req.query, since);

    const [totals, byFeature, byModel, byAccount, daily, topUsers, monthTotals, creditDoc] =
      await Promise.all([
        AiUsage.aggregate([{ $match: match }, { $group: { _id: null, ...SUM } }]),
        AiUsage.aggregate([
          { $match: match },
          { $group: { _id: "$feature", ...SUM } },
          { $sort: { costUsd: -1 } },
        ]),
        AiUsage.aggregate([
          { $match: match },
          { $group: { _id: { model: "$model", provider: "$provider" }, ...SUM } },
          { $sort: { costUsd: -1 } },
          { $limit: 25 },
        ]),
        AiUsage.aggregate([
          { $match: match },
          { $group: { _id: "$billedTo", ...SUM } },
          { $sort: { costUsd: -1 } },
        ]),
        AiUsage.aggregate([
          { $match: match },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$at", timezone: "UTC" } },
              ...SUM,
            },
          },
          { $sort: { _id: 1 } },
        ]),
        AiUsage.aggregate([
          { $match: match },
          {
            $group: {
              _id: "$userId",
              email: { $last: "$email" },
              name: { $last: "$name" },
              ...SUM,
            },
          },
          { $sort: { costUsd: -1 } },
          { $limit: 10 },
        ]),
        // Credit burn is always month-to-date and always AWS-billed, whatever
        // the dashboard filters are set to.
        AiUsage.aggregate([
          { $match: { at: { $gte: monthStart() }, billedTo: "aws" } },
          { $group: { _id: null, ...SUM } },
        ]),
        Setting.findOne({ key: "global" }).lean(),
      ]);

    // Lifetime AWS spend drives the credit burn-down; the window above only
    // drives the charts.
    const [awsAllTime] = await AiUsage.aggregate([
      { $match: { billedTo: "aws" } },
      { $group: { _id: null, ...SUM } },
    ]);

    const credit = buildCredit(creditDoc, awsAllTime, monthTotals[0]);

    res.json({
      days,
      window,
      since,
      features: AI_FEATURES,
      accounts: Object.values(BILLING_ACCOUNTS),
      totals: shapeTotals(totals[0]),
      byFeature: byFeature.map((r) => ({ feature: r._id, ...shapeTotals(r) })),
      byModel: byModel.map((r) => ({
        model: r._id.model || "(unreported)",
        provider: r._id.provider || "",
        ...shapeTotals(r),
      })),
      byAccount: byAccount.map((r) => ({ billedTo: r._id || "unknown", ...shapeTotals(r) })),
      daily: daily.map((r) => ({ date: r._id, ...shapeTotals(r) })),
      topUsers: topUsers.map((r) => ({
        userId: r._id,
        email: r.email || (r._id ? "" : "(guests)"),
        name: r.name || "",
        ...shapeTotals(r),
      })),
      credit,
    });
  } catch (err) {
    console.error("[/admin/ai-usage/overview] error:", err);
    res.status(500).json({ error: "Failed to load AI usage overview" });
  }
});

// Credit runway: how much of the pool is gone, how fast it's going, and when it
// runs out at the current month-to-date rate.
function buildCredit(settings, awsAllTime, monthAws) {
  const totalUsd =
    Number(settings?.aiCreditTotalUsd) || Number(process.env.AWS_CREDIT_TOTAL_USD) || 0;
  const opening = Number(settings?.aiCreditOpeningSpendUsd) || 0;
  const meteredUsd = round(awsAllTime?.costUsd || 0, 2);
  const spentUsd = round(opening + meteredUsd, 2);
  const remainingUsd = totalUsd ? round(Math.max(0, totalUsd - spentUsd), 2) : null;

  const monthSpend = round(monthAws?.costUsd || 0, 2);
  const dayOfMonth = Math.max(1, new Date().getUTCDate());
  const perDay = round(monthSpend / dayOfMonth, 4);
  const projectedMonthUsd = round(perDay * daysInThisMonth(), 2);

  const expiresAt = toDate(settings?.aiCreditExpiresAt);
  const daysToExpiry =
    expiresAt ? Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 86400000)) : null;

  // Unbounded burn projection. At a near-zero rate this reaches absurd numbers
  // — $25,000 at $0.0003/day is 83 million days — so it is never shown alone.
  const burnDays =
    remainingUsd !== null && perDay > 0 ? Math.floor(remainingUsd / perDay) : null;

  // The pool ends at whichever comes first: spending it, or the grant expiring.
  // Credit that outlives its own expiry is not runway — it is credit that will
  // be LOST unused, and "runs out in 83,333,300 days" hides exactly that. Same
  // clamp the AI service applies in governance/creditGuard.js.
  let daysRemaining = null;
  let limitedBy = null;

  if (daysToExpiry !== null && (burnDays === null || burnDays >= daysToExpiry)) {
    daysRemaining = daysToExpiry;
    limitedBy = "expiry";
  } else if (burnDays !== null && burnDays <= MAX_PROJECTION_DAYS) {
    daysRemaining = burnDays;
    limitedBy = "burn";
  }
  // Otherwise no expiry is configured and burn is too slow to project. Left
  // null, which the dashboard already renders as "—" — an honest "we cannot
  // say" beats a number nobody can act on.

  return {
    label: settings?.aiCreditLabel || "AWS credit",
    totalUsd,
    openingSpendUsd: opening,
    meteredUsd,
    spentUsd,
    remainingUsd,
    percentUsed: totalUsd ? round(Math.min(100, (spentUsd / totalUsd) * 100), 1) : null,
    monthToDateUsd: monthSpend,
    perDayUsd: perDay,
    projectedMonthUsd,
    daysRemaining,
    exhaustsOn:
      daysRemaining === null
        ? null
        : limitedBy === "expiry"
          ? expiresAt
          : new Date(Date.now() + daysRemaining * 86400000),
    // "burn" = spent before it expires. "expiry" = expires with credit left.
    // Lets the dashboard label the figure for what it actually is.
    limitedBy,
    startAt: settings?.aiCreditStartAt || null,
    expiresAt: settings?.aiCreditExpiresAt || null,
  };
}

// Beyond a century the burn rate is noise, not a forecast.
const MAX_PROJECTION_DAYS = 36500;

function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysInThisMonth() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

/* ────────────────────────────── per-user ────────────────────────────── */
// GET /admin/ai-usage/users?window=month&q=&limit=100&sort=costUsd
router.get("/users", async (req, res) => {
  try {
    const { since, days, window } = windowFrom({ window: "month", ...req.query });
    const match = baseMatch(req.query, since);
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const q = String(req.query.q || "").trim().toLowerCase();
    if (q) match.email = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };

    const rows = await AiUsage.aggregate([
      { $match: match },
      {
        $group: {
          _id: { userId: "$userId", feature: "$feature" },
          email: { $last: "$email" },
          name: { $last: "$name" },
          role: { $last: "$role" },
          lastAt: { $max: "$at" },
          ...SUM,
        },
      },
    ]);

    // Fold the per-feature groups into one row per user.
    const byUser = new Map();
    for (const r of rows) {
      const key = r._id.userId ? String(r._id.userId) : "guests";
      let u = byUser.get(key);
      if (!u) {
        u = {
          userId: r._id.userId || null,
          email: r.email || (r._id.userId ? "" : "(anonymous visitors)"),
          name: r.name || "",
          role: r.role || "guest",
          lastAt: r.lastAt,
          totals: shapeTotals({}),
          byFeature: {},
        };
        byUser.set(key, u);
      }
      u.byFeature[r._id.feature] = shapeTotals(r);
      if (!u.lastAt || r.lastAt > u.lastAt) u.lastAt = r.lastAt;
      u.totals.calls += r.calls || 0;
      u.totals.tokens += r.tokens || 0;
      u.totals.inputTokens += r.inputTokens || 0;
      u.totals.outputTokens += r.outputTokens || 0;
      u.totals.costUsd = round(u.totals.costUsd + (r.costUsd || 0));
      u.totals.errors += r.errors || 0;
    }

    const list = [...byUser.values()];
    const ids = list.map((u) => u.userId).filter(Boolean);

    const [allocs, def, users] = await Promise.all([
      AiAllocation.find({ userId: { $in: ids } }).lean(),
      getDefaultAllocation(),
      User.find({ _id: { $in: ids } }).select("name email role").lean(),
    ]);
    const allocById = new Map(allocs.map((a) => [String(a.userId), a]));
    const userById = new Map(users.map((u) => [String(u._id), u]));

    for (const u of list) {
      const id = u.userId ? String(u.userId) : "";
      const own = id ? allocById.get(id) : null;
      const eff = own || (u.userId ? def : null);
      u.allocation = allocationOut(eff);
      u.allocationScope = own ? "user" : u.userId ? "default" : "guest";
      const dbUser = id ? userById.get(id) : null;
      if (dbUser) {
        u.email = u.email || dbUser.email || "";
        u.name = u.name || dbUser.name || "";
        u.role = dbUser.role || u.role;
      }
      // How much of the effective allowance is gone — the number that decides
      // whether an admin needs to act.
      const limits = u.allocation?.total || null;
      u.percentUsed = limits
        ? {
            calls: limits.calls ? round((u.totals.calls / limits.calls) * 100, 1) : null,
            tokens: limits.tokens ? round((u.totals.tokens / limits.tokens) * 100, 1) : null,
            costUsd: limits.costUsd ? round((u.totals.costUsd / limits.costUsd) * 100, 1) : null,
          }
        : null;
    }

    const sortKey = ["calls", "tokens", "costUsd"].includes(String(req.query.sort))
      ? String(req.query.sort)
      : "costUsd";
    list.sort((a, b) => (b.totals[sortKey] || 0) - (a.totals[sortKey] || 0));

    res.json({
      window,
      days,
      since,
      features: AI_FEATURES,
      defaultAllocation: allocationOut(def),
      rows: list.slice(0, limit),
      truncated: Math.max(0, list.length - limit),
    });
  } catch (err) {
    console.error("[/admin/ai-usage/users] error:", err);
    res.status(500).json({ error: "Failed to load per-user AI usage" });
  }
});

// GET /admin/ai-usage/user/:id?days=90 — drill-down for one account.
router.get("/user/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "");
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "Bad user id" });
    const days = clampDays(req.query.days, 90);
    const since = new Date(Date.now() - days * 86400000);
    const userId = new mongoose.Types.ObjectId(id);

    const [user, byFeature, monthByFeature, events, alloc, def] = await Promise.all([
      User.findById(id).select("name email role").lean(),
      AiUsage.aggregate([
        { $match: { userId, at: { $gte: since } } },
        { $group: { _id: "$feature", lastAt: { $max: "$at" }, ...SUM } },
        { $sort: { costUsd: -1 } },
      ]),
      AiUsage.aggregate([
        { $match: { userId, at: { $gte: monthStart() } } },
        { $group: { _id: "$feature", ...SUM } },
      ]),
      AiUsage.find({ userId, at: { $gte: since } })
        .sort({ at: -1 })
        .limit(200)
        .lean(),
      AiAllocation.findOne({ userId }).lean(),
      getDefaultAllocation(),
    ]);

    res.json({
      days,
      user: user || null,
      byFeature: byFeature.map((r) => ({ feature: r._id, lastAt: r.lastAt, ...shapeTotals(r) })),
      monthByFeature: monthByFeature.map((r) => ({ feature: r._id, ...shapeTotals(r) })),
      allocation: allocationOut(alloc || def),
      allocationScope: alloc ? "user" : "default",
      events,
    });
  } catch (err) {
    console.error("[/admin/ai-usage/user] error:", err);
    res.status(500).json({ error: "Failed to load user AI usage" });
  }
});

// GET /admin/ai-usage/events?days=7&feature=&email=&ok=false&limit=200&skip=0
router.get("/events", async (req, res) => {
  try {
    const { since, days } = windowFrom(req.query);
    const match = baseMatch(req.query, since);
    const email = String(req.query.email || "").trim().toLowerCase();
    if (email) match.email = email;
    if (String(req.query.ok) === "false") match.ok = false;

    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 1000);
    const skip = Math.max(0, Number(req.query.skip) || 0);

    const [events, total] = await Promise.all([
      AiUsage.find(match).sort({ at: -1 }).skip(skip).limit(limit).lean(),
      AiUsage.countDocuments(match),
    ]);
    res.json({ days, total, skip, limit, events });
  } catch (err) {
    console.error("[/admin/ai-usage/events] error:", err);
    res.status(500).json({ error: "Failed to load AI usage events" });
  }
});

/* ──────────────────────────── allocations ──────────────────────────── */

router.get("/allocations", async (_req, res) => {
  try {
    const [def, rows] = await Promise.all([
      getDefaultAllocation(),
      AiAllocation.find({ scope: "user" }).sort({ updatedAt: -1 }).limit(500).lean(),
    ]);
    res.json({
      features: AI_FEATURES,
      default: allocationOut(def),
      rows: rows.map(allocationOut),
    });
  } catch (err) {
    console.error("[/admin/ai-usage/allocations] error:", err);
    res.status(500).json({ error: "Failed to load allocations" });
  }
});

router.put("/allocations/default", async (req, res) => {
  try {
    const doc = await AiAllocation.findOneAndUpdate(
      { scope: "default" },
      {
        $set: {
          scope: "default",
          userId: null,
          enabled: req.body?.enabled !== false,
          total: sanitizeLimit(req.body?.total),
          guestTotal: sanitizeLimit(req.body?.guestTotal),
          features: sanitizeFeatures(req.body?.features),
          guestFeatures: sanitizeFeatures(req.body?.guestFeatures, { keepAll: true }),
          notes: String(req.body?.notes || "").slice(0, 500),
          updatedBy: actorId(req),
          updatedByEmail: req.user?.email || "",
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
    invalidateAllocationCache();
    res.json({ ok: true, allocation: allocationOut(doc) });
  } catch (err) {
    console.error("[/admin/ai-usage/allocations/default] error:", err);
    res.status(500).json({ error: "Failed to save default allocation" });
  }
});

router.put("/allocations/user/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "");
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "Bad user id" });
    const user = await User.findById(id).select("email").lean();
    if (!user) return res.status(404).json({ error: "User not found" });

    const doc = await AiAllocation.findOneAndUpdate(
      { userId: id },
      {
        $set: {
          scope: "user",
          userId: id,
          email: user.email || "",
          enabled: req.body?.enabled !== false,
          total: sanitizeLimit(req.body?.total),
          features: sanitizeFeatures(req.body?.features),
          notes: String(req.body?.notes || "").slice(0, 500),
          updatedBy: actorId(req),
          updatedByEmail: req.user?.email || "",
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
    invalidateAllocationCache(id);
    res.json({ ok: true, allocation: allocationOut(doc) });
  } catch (err) {
    console.error("[/admin/ai-usage/allocations/user] error:", err);
    res.status(500).json({ error: "Failed to save allocation" });
  }
});

// Removing an override drops the user back onto the platform default.
router.delete("/allocations/user/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "");
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "Bad user id" });
    await AiAllocation.deleteOne({ userId: id });
    invalidateAllocationCache(id);
    res.json({ ok: true });
  } catch (err) {
    console.error("[/admin/ai-usage/allocations delete] error:", err);
    res.status(500).json({ error: "Failed to remove allocation" });
  }
});

/* ─────────────────────────────── credit ─────────────────────────────── */

router.get("/credit", async (_req, res) => {
  try {
    const [settings, awsAllTime, monthAws] = await Promise.all([
      Setting.findOne({ key: "global" }).lean(),
      AiUsage.aggregate([{ $match: { billedTo: "aws" } }, { $group: { _id: null, ...SUM } }]),
      AiUsage.aggregate([
        { $match: { billedTo: "aws", at: { $gte: monthStart() } } },
        { $group: { _id: null, ...SUM } },
      ]),
    ]);
    res.json({ credit: buildCredit(settings, awsAllTime[0], monthAws[0]) });
  } catch (err) {
    console.error("[/admin/ai-usage/credit] error:", err);
    res.status(500).json({ error: "Failed to load credit status" });
  }
});

router.put("/credit", async (req, res) => {
  try {
    const $set = {
      aiCreditLabel: String(req.body?.label || "AWS credit").slice(0, 60),
      aiCreditTotalUsd: Math.max(0, Number(req.body?.totalUsd) || 0),
      aiCreditOpeningSpendUsd: Math.max(0, Number(req.body?.openingSpendUsd) || 0),
      aiCreditStartAt: req.body?.startAt ? new Date(req.body.startAt) : null,
      aiCreditExpiresAt: req.body?.expiresAt ? new Date(req.body.expiresAt) : null,
    };
    await Setting.findOneAndUpdate({ key: "global" }, { $set }, { upsert: true, new: true });

    const [awsAllTime, monthAws] = await Promise.all([
      AiUsage.aggregate([{ $match: { billedTo: "aws" } }, { $group: { _id: null, ...SUM } }]),
      AiUsage.aggregate([
        { $match: { billedTo: "aws", at: { $gte: monthStart() } } },
        { $group: { _id: null, ...SUM } },
      ]),
    ]);
    res.json({
      ok: true,
      credit: buildCredit({ key: "global", ...$set }, awsAllTime[0], monthAws[0]),
    });
  } catch (err) {
    console.error("[/admin/ai-usage/credit PUT] error:", err);
    res.status(500).json({ error: "Failed to save credit settings" });
  }
});

export default router;
