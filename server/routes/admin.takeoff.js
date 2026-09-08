// server/routes/admin.takeoff.js
//
// Admin API behind the Time saved page (/admin/takeoff). Read-only over
// TakeoffSession except for the baseline rate table, which is append-only:
// versions are created and activated, never edited or deleted.
//
//   GET  /summary      totals + grouped rows + baseline versions involved
//   GET  /sessions     drill-down list (counts only; there is nothing else)
//   GET  /firms        firms seen in sessions, for the filter dropdown
//   GET  /baselines    every rate-table version, active one flagged
//   POST /baselines    create a version { version, rates, notes, activate }
//   POST /baselines/:version/activate
//
// Public totals exclude cancelled sessions and seeded (demo) sessions. Pass
// includeSeeded=1 to review the dashboard against seed data; the response
// says so in `filters.includeSeeded` so the page can label it.
import express from "express";
import mongoose from "mongoose";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { TakeoffSession } from "../models/TakeoffSession.js";
import { TakeoffBaseline } from "../models/TakeoffBaseline.js";
import { RATE_KEYS } from "../config/takeoffBaselineDefaults.js";
import {
  ensureTakeoffBaselineSeeded,
  getActiveBaseline,
  invalidateBaselineCache,
  sanitizeRates,
} from "../services/takeoffBaseline.js";
import { normalizeProduct, IDLE_GAP_SECONDS } from "../util/takeoffTime.js";

const router = express.Router();

router.use(requireAuth, requirePermission("adminhub"));

/* ────────────────────────────── helpers ────────────────────────────── */

const GROUP_BYS = ["day", "week", "month", "user", "firm", "product"];

function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Window: explicit from/to, else last `days` (default 30), capped at 2 years. */
export function windowFrom(query) {
  const to = parseDate(query.to) || new Date();
  let from = parseDate(query.from);
  if (!from) {
    const days = Math.min(Math.max(Number(query.days) || 30, 1), 731);
    from = new Date(to.getTime() - days * 86400000);
  }
  if (from > to) [from, to] = [to, from];
  return { from, to };
}

export function baseMatch(query, { from, to }) {
  const match = { startedAt: { $gte: from, $lte: to } };
  const product = normalizeProduct(query.product);
  if (product) match.product = product;
  const firmId = String(query.firmId || "").trim().toLowerCase();
  if (firmId) match.firmId = firmId;
  const userId = String(query.userId || "").trim();
  if (userId && mongoose.isValidObjectId(userId)) match.userId = new mongoose.Types.ObjectId(userId);
  const email = String(query.email || "").trim().toLowerCase();
  if (email) match.email = email;
  if (String(query.includeSeeded || "") !== "1") match.seeded = { $ne: true };
  if (String(query.includeCancelled || "") !== "1") match.cancelled = { $ne: true };
  return match;
}

export function median(values) {
  const v = (values || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return 0;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : Math.round((v[mid - 1] + v[mid]) / 2);
}

const SUM = {
  sessions: { $sum: 1 },
  activeSeconds: { $sum: "$activeSeconds" },
  wallSeconds: { $sum: "$wallSeconds" },
  estimatedManualSeconds: { $sum: "$baseline.estimatedManualSeconds" },
  savedSeconds: { $sum: "$savedSeconds" },
  items: { $sum: "$counts.items" },
  sheets: { $sum: "$counts.sheets" },
  boqLines: { $sum: "$counts.boqLines" },
  activeList: { $push: "$activeSeconds" },
  manualList: { $push: "$baseline.estimatedManualSeconds" },
  users: { $addToSet: "$userId" },
  firstAt: { $min: "$startedAt" },
  lastAt: { $max: "$startedAt" },
};

function shape(r = {}) {
  return {
    sessions: r.sessions || 0,
    activeSeconds: r.activeSeconds || 0,
    wallSeconds: r.wallSeconds || 0,
    estimatedManualSeconds: r.estimatedManualSeconds || 0,
    savedSeconds: r.savedSeconds || 0,
    items: r.items || 0,
    sheets: r.sheets || 0,
    boqLines: r.boqLines || 0,
    medianActiveSeconds: median(r.activeList),
    medianEstimatedManualSeconds: median(r.manualList),
    users: Array.isArray(r.users) ? r.users.length : 0,
    firstAt: r.firstAt || null,
    lastAt: r.lastAt || null,
  };
}

function groupIdFor(groupBy) {
  switch (groupBy) {
    case "day":
      return { $dateToString: { format: "%Y-%m-%d", date: "$startedAt" } };
    case "week":
      // ISO week, keyed by its Monday so the chart axis is a real date.
      return {
        $dateToString: {
          format: "%Y-%m-%d",
          date: {
            $dateSubtract: {
              startDate: "$startedAt",
              unit: "day",
              amount: { $subtract: [{ $isoDayOfWeek: "$startedAt" }, 1] },
            },
          },
        },
      };
    case "month":
      return { $dateToString: { format: "%Y-%m", date: "$startedAt" } };
    case "user":
      return "$userId";
    case "firm":
      return "$firmId";
    case "product":
      return "$product";
    default:
      return null;
  }
}

/* ────────────────────────────── summary ────────────────────────────── */

// GET /admin/takeoff/summary?from&to&days&product&firmId&userId&groupBy&includeSeeded
export async function summaryHandler(req, res) {
  try {
    const win = windowFrom(req.query);
    const match = baseMatch(req.query, win);
    const groupBy = GROUP_BYS.includes(String(req.query.groupBy)) ? String(req.query.groupBy) : "week";

    const [totalsRows, groupRows, cancelledRows, seededRows, versionRows, active] = await Promise.all([
      TakeoffSession.aggregate([{ $match: match }, { $group: { _id: null, ...SUM } }]),
      TakeoffSession.aggregate([
        { $match: match },
        {
          $group: {
            _id: groupIdFor(groupBy),
            ...SUM,
            email: { $last: "$email" },
            firmName: { $last: "$firmName" },
            products: { $addToSet: "$product" },
          },
        },
        { $sort: groupBy === "day" || groupBy === "week" || groupBy === "month" ? { _id: 1 } : { savedSeconds: -1 } },
        { $limit: 2000 },
      ]),
      TakeoffSession.countDocuments({ ...match, cancelled: true }),
      TakeoffSession.countDocuments({ ...match, seeded: true }),
      TakeoffSession.aggregate([
        { $match: match },
        {
          $group: {
            _id: { version: "$baseline.version", method: "$baseline.method" },
            sessions: { $sum: 1 },
            savedSeconds: { $sum: "$savedSeconds" },
          },
        },
        { $sort: { sessions: -1 } },
      ]),
      getActiveBaseline(),
    ]);

    const totals = shape(totalsRows[0]);
    totals.cancelledSessions = cancelledRows;
    totals.seededSessions = seededRows;

    const groups = groupRows.map((g) => ({
      key: g._id === null || g._id === undefined ? "" : String(g._id),
      label:
        groupBy === "user"
          ? g.email || String(g._id)
          : groupBy === "firm"
            ? g.firmName || (g._id ? String(g._id) : "Personal licences")
            : String(g._id ?? ""),
      products: g.products || [],
      ...shape(g),
    }));

    return res.json({
      from: win.from,
      to: win.to,
      groupBy,
      filters: {
        product: normalizeProduct(req.query.product) || "",
        firmId: String(req.query.firmId || "").trim().toLowerCase(),
        userId: String(req.query.userId || "").trim(),
        includeSeeded: String(req.query.includeSeeded || "") === "1",
        includeCancelled: String(req.query.includeCancelled || "") === "1",
      },
      totals,
      groups,
      baselineVersions: versionRows.map((v) => ({
        version: v._id.version,
        method: v._id.method,
        sessions: v.sessions,
        savedSeconds: v.savedSeconds,
      })),
      activeBaseline: active,
      methodology: {
        idleGapSeconds: IDLE_GAP_SECONDS,
        formula:
          "estimatedManualSeconds = 60 x (sheets x sheetSetupMinutes + area x areaItemMinutes + linear x linearItemMinutes + count x countItemMinutes + unsplit items x mixedItemMinutes (HERON) or revitElementMinutes (QUIV) + elementTypes x elementTypeMinutes + boqLines x boqLineMinutes) x calibrationScale; savedSeconds = max(0, estimatedManualSeconds - activeSeconds)",
        activeTimeRule: `activeSeconds is wall time minus idle gaps longer than ${IDLE_GAP_SECONDS} s between user inputs or measurement events`,
        exclusions: "cancelled sessions and seeded demo sessions are excluded from totals",
        computedOn: "server, at the time the session was received, from client counts and the baseline version named on the record",
      },
    });
  } catch (err) {
    console.error("[/admin/takeoff/summary] error:", err);
    return res.status(500).json({ error: "Failed to load takeoff summary" });
  }
}

router.get("/summary", summaryHandler);

// GET /admin/takeoff/sessions?…same filters…&limit=200&skip=0
router.get("/sessions", async (req, res) => {
  try {
    const win = windowFrom(req.query);
    const match = baseMatch(req.query, win);
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 1000);
    const skip = Math.max(Number(req.query.skip) || 0, 0);
    const [rows, total] = await Promise.all([
      TakeoffSession.find(match).sort({ startedAt: -1 }).skip(skip).limit(limit).lean(),
      TakeoffSession.countDocuments(match),
    ]);
    return res.json({ from: win.from, to: win.to, total, rows });
  } catch (err) {
    console.error("[/admin/takeoff/sessions] error:", err);
    return res.status(500).json({ error: "Failed to load sessions" });
  }
});

// GET /admin/takeoff/firms → [{ firmId, firmName, sessions }]
router.get("/firms", async (req, res) => {
  try {
    const rows = await TakeoffSession.aggregate([
      { $match: { firmId: { $ne: null }, ...(String(req.query.includeSeeded || "") === "1" ? {} : { seeded: { $ne: true } }) } },
      { $group: { _id: "$firmId", firmName: { $last: "$firmName" }, sessions: { $sum: 1 } } },
      { $sort: { firmName: 1 } },
      { $limit: 500 },
    ]);
    return res.json({ rows: rows.map((r) => ({ firmId: r._id, firmName: r.firmName || r._id, sessions: r.sessions })) });
  } catch (err) {
    console.error("[/admin/takeoff/firms] error:", err);
    return res.status(500).json({ error: "Failed to load firms" });
  }
});

/* ────────────────────────────── baselines ────────────────────────────── */

function baselineOut(b, usage = {}) {
  return {
    id: String(b._id),
    version: b.version,
    rates: b.rates,
    notes: b.notes || "",
    active: !!b.active,
    createdAt: b.createdAt,
    activatedAt: b.activatedAt || null,
    createdBy: b.createdBy ? String(b.createdBy) : null,
    sessions: usage[b.version] || 0,
  };
}

// GET /admin/takeoff/baselines → { rateKeys, rows: [...] }
router.get("/baselines", async (req, res) => {
  try {
    await ensureTakeoffBaselineSeeded();
    const [rows, usage] = await Promise.all([
      TakeoffBaseline.find({}).sort({ createdAt: -1 }).lean(),
      TakeoffSession.aggregate([{ $group: { _id: "$baseline.version", n: { $sum: 1 } } }]),
    ]);
    const used = Object.fromEntries(usage.map((u) => [u._id, u.n]));
    return res.json({ rateKeys: RATE_KEYS, rows: rows.map((b) => baselineOut(b, used)) });
  } catch (err) {
    console.error("[/admin/takeoff/baselines] error:", err);
    return res.status(500).json({ error: "Failed to load baselines" });
  }
});

// POST /admin/takeoff/baselines { version, rates, notes, activate }
router.post("/baselines", async (req, res) => {
  try {
    const version = String(req.body?.version || "").trim().slice(0, 40);
    if (!/^[0-9A-Za-z][0-9A-Za-z._-]{1,39}$/.test(version)) {
      return res.status(400).json({ error: "version must be 2-40 chars: letters, digits, . _ -" });
    }
    const { rates, error } = sanitizeRates(req.body?.rates);
    if (error) return res.status(400).json({ error });
    const notes = String(req.body?.notes || "").trim().slice(0, 2000);
    if (!notes) return res.status(400).json({ error: "notes required: say where these numbers came from" });

    const exists = await TakeoffBaseline.findOne({ version }).select("_id").lean();
    if (exists) return res.status(409).json({ error: "that version already exists; versions are never edited" });

    const activate = req.body?.activate === true || req.body?.activate === "true";
    const uid = req.user?._id || req.user?.id || req.user?.sub || null;
    const doc = await TakeoffBaseline.create({
      version,
      rates,
      notes,
      active: false,
      createdBy: mongoose.isValidObjectId(uid) ? uid : null,
    });
    if (activate) {
      await TakeoffBaseline.updateMany({ _id: { $ne: doc._id }, active: true }, { $set: { active: false } });
      doc.active = true;
      doc.activatedAt = new Date();
      await doc.save();
    }
    invalidateBaselineCache();
    return res.status(201).json(baselineOut(doc.toObject()));
  } catch (err) {
    console.error("[/admin/takeoff/baselines POST] error:", err);
    return res.status(500).json({ error: "Failed to create baseline" });
  }
});

// POST /admin/takeoff/baselines/:version/activate
router.post("/baselines/:version/activate", async (req, res) => {
  try {
    const version = String(req.params.version || "").trim();
    const doc = await TakeoffBaseline.findOne({ version });
    if (!doc) return res.status(404).json({ error: "Not found" });
    await TakeoffBaseline.updateMany({ _id: { $ne: doc._id }, active: true }, { $set: { active: false } });
    doc.active = true;
    doc.activatedAt = new Date();
    await doc.save();
    invalidateBaselineCache();
    return res.json(baselineOut(doc.toObject()));
  } catch (err) {
    console.error("[/admin/takeoff/baselines activate] error:", err);
    return res.status(500).json({ error: "Failed to activate baseline" });
  }
});

export default router;
