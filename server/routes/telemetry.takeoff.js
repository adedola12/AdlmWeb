// server/routes/telemetry.takeoff.js
//
// Plugin-facing side of the Takeoff Time Log. Mounted at /telemetry and
// /api/telemetry.
//
//   POST /takeoff-sessions       batch of session records from HERON / QUIV
//   GET  /takeoff-calibration    has this user answered the one-time question?
//   POST /takeoff-calibration    their answer (or that they skipped it)
//   GET  /takeoff-summary        admin-only; same handler as /admin/takeoff/summary
//
// The client sends identity, timings and counts. The server resolves the firm
// from the account, chooses the baseline (the user's own calibration if they
// gave one, else the active admin rate table) and computes the manual-time
// estimate and the time saved. Nothing numeric that the dashboard shows is
// trusted from the client except the timings themselves, and those are
// clamped (active <= wall, wall <= ended - started + slack).
//
// Privacy: the record is rebuilt field by field from a whitelist. Anything the
// client sends that is not on it (element names, file paths, quantities...) is
// dropped before it reaches Mongo. projectRef is blanked if it looks like a
// path.
import express from "express";
import mongoose from "mongoose";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { TakeoffSession, TAKEOFF_SCHEMA_VERSION } from "../models/TakeoffSession.js";
import { TakeoffCalibration } from "../models/TakeoffCalibration.js";
import { User } from "../models/User.js";
import { getActiveBaseline } from "../services/takeoffBaseline.js";
import {
  calibrationScale,
  estimateManualSeconds,
  humanDuration,
  normalizeCounts,
  normalizeProduct,
  savedSeconds,
} from "../util/takeoffTime.js";
import { summaryHandler } from "./admin.takeoff.js";

const router = express.Router();

export const MAX_BATCH = 100;
// A client clock can drift from ours; a session may also legitimately span a
// lunch break. Wall time is trusted up to the timestamps plus this slack.
const WALL_SLACK_SECONDS = 300;
const MAX_WALL_SECONDS = 24 * 3600;

function userIdFrom(req) {
  const raw = req.user?._id || req.user?.id || req.user?.sub || "";
  try {
    return new mongoose.Types.ObjectId(String(raw));
  } catch {
    return null;
  }
}

const str = (v, max) => String(v ?? "").trim().slice(0, max);

function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function slugFirm(name) {
  const s = String(name || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || null;
}

/** The firm a user's sessions belong to, from the entitlement or the profile. */
export function resolveFirm(user, productKey) {
  if (!user) return { firmId: null, firmName: "" };
  const ents = Array.isArray(user.entitlements) ? user.entitlements : [];
  const key = String(productKey || "").toLowerCase();
  const pick =
    ents.find((e) => e?.productKey === key && e?.organizationName) ||
    ents.find((e) => e?.licenseType === "organization" && e?.organizationName) ||
    null;
  const name = str(pick?.organizationName || user.firmName || "", 120);
  return { firmId: slugFirm(name), firmName: name };
}

/**
 * Validate and rebuild one client record. Returns { record } or { error }.
 * `ctx` carries everything resolved once per batch (user, firm, baseline,
 * calibration).
 */
export function buildSessionRecord(raw, ctx) {
  if (!raw || typeof raw !== "object") return { error: "record must be an object" };

  const sessionId = str(raw.sessionId, 64);
  if (!/^[0-9a-zA-Z-]{8,64}$/.test(sessionId)) return { error: "sessionId must be a uuid" };

  const product = normalizeProduct(raw.product || raw.productKey || ctx.productKey);
  if (!product) return { error: "product must be HERON, QUIV or RATEGEN" };

  const startedAt = parseDate(raw.startedAt);
  const endedAt = parseDate(raw.endedAt);
  if (!startedAt || !endedAt) return { error: "startedAt and endedAt must be ISO datetimes" };
  if (endedAt < startedAt) return { error: "endedAt is before startedAt" };

  const spanSeconds = Math.round((endedAt - startedAt) / 1000);
  let wallSeconds = Number(raw.wallSeconds);
  if (!Number.isFinite(wallSeconds) || wallSeconds < 0) wallSeconds = spanSeconds;
  wallSeconds = Math.min(Math.round(wallSeconds), spanSeconds + WALL_SLACK_SECONDS, MAX_WALL_SECONDS);

  let activeSeconds = Number(raw.activeSeconds);
  if (!Number.isFinite(activeSeconds) || activeSeconds < 0) return { error: "activeSeconds required" };
  activeSeconds = Math.min(Math.round(activeSeconds), wallSeconds);

  const cancelled = raw.cancelled === true || raw.cancelled === "true";
  const mode = String(raw.mode || "auto") === "assisted" ? "assisted" : "auto";

  let projectRef = str(raw.projectRef, 80);
  // A path is content we promised never to store.
  if (/[\\/:]/.test(projectRef) || /\.[a-z0-9]{2,5}$/i.test(projectRef)) projectRef = "";

  const counts = normalizeCounts(raw.counts);

  // Baseline choice: the user's own calibration wins for their sessions only.
  const cal = ctx.calibration && !ctx.calibration.skipped && ctx.calibration.scale > 0 ? ctx.calibration : null;
  const scale = cal ? cal.scale : 1;
  const estimatedManualSeconds = cancelled
    ? 0
    : estimateManualSeconds(counts, ctx.baseline.rates, product, scale);
  const saved = cancelled ? 0 : savedSeconds(estimatedManualSeconds, activeSeconds);

  const record = {
    sessionId,
    userId: ctx.userId,
    email: ctx.email,
    seatId: str(raw.seatId || raw.deviceFingerprint, 64),
    firmId: ctx.firmId,
    firmName: ctx.firmName,
    product,
    productKey: str(ctx.productKey || raw.productKey, 40).toLowerCase(),
    productVersion: str(raw.productVersion || raw.appVersion, 40),
    mode,
    projectRef,
    startedAt,
    endedAt,
    activeSeconds,
    wallSeconds,
    counts,
    baseline: {
      method: cal ? "user_calibration" : "admin_rate_table",
      version: ctx.baseline.version,
      calibrationId: cal ? cal._id : null,
      scale,
      estimatedManualSeconds,
    },
    savedSeconds: saved,
    cancelled,
    seeded: false,
    clientTimezone: str(raw.clientTimezone, 64),
    schemaVersion: TAKEOFF_SCHEMA_VERSION,
    receivedAt: new Date(),
  };
  return { record };
}

function resultFor(r) {
  return {
    sessionId: r.sessionId,
    cancelled: r.cancelled,
    activeSeconds: r.activeSeconds,
    estimatedManualSeconds: r.baseline.estimatedManualSeconds,
    savedSeconds: r.savedSeconds,
    baselineVersion: r.baseline.version,
    baselineMethod: r.baseline.method,
    labels: {
      active: humanDuration(r.activeSeconds),
      estimatedManual: humanDuration(r.baseline.estimatedManualSeconds),
      saved: humanDuration(r.savedSeconds),
    },
  };
}

// POST /telemetry/takeoff-sessions
//   { productKey, sessions: [ {...}, ... ] }   (or a bare array, or one record)
// → { accepted, duplicates, rejected: [{ index, sessionId, error }],
//     results: [...], calibration: { asked } }
router.post("/takeoff-sessions", requireAuth, async (req, res) => {
  try {
    const userId = userIdFrom(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const body = req.body;
    let list = Array.isArray(body) ? body : Array.isArray(body?.sessions) ? body.sessions : body?.sessionId ? [body] : null;
    if (!list || !list.length) return res.status(400).json({ error: "sessions[] required" });
    if (list.length > MAX_BATCH) return res.status(413).json({ error: `at most ${MAX_BATCH} sessions per request` });

    const productKey = str(body?.productKey || list[0]?.productKey, 40).toLowerCase();

    const user = await User.findById(userId)
      .select("email firmName entitlements.productKey entitlements.organizationName entitlements.licenseType")
      .lean();
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const product = normalizeProduct(list[0]?.product || productKey);
    const [baseline, calibration] = await Promise.all([
      getActiveBaseline(),
      product ? TakeoffCalibration.findOne({ userId, product }).lean() : null,
    ]);

    const ctx = {
      userId,
      email: String(user.email || "").toLowerCase(),
      productKey,
      ...resolveFirm(user, productKey),
      baseline,
      calibration,
    };

    const records = [];
    const rejected = [];
    list.forEach((raw, index) => {
      const { record, error } = buildSessionRecord(raw, ctx);
      if (error) rejected.push({ index, sessionId: str(raw?.sessionId, 64), error });
      else records.push(record);
    });

    let accepted = 0;
    let duplicates = 0;
    if (records.length) {
      try {
        const inserted = await TakeoffSession.insertMany(records, { ordered: false });
        accepted = inserted.length;
      } catch (err) {
        // Retries re-send the same sessionId; the unique index drops them and
        // insertMany reports each as a write error. Everything else went in.
        const writeErrors = err?.writeErrors || err?.result?.writeErrors || [];
        const dupes = writeErrors.filter((w) => (w?.code ?? w?.err?.code) === 11000).length;
        const other = writeErrors.length - dupes;
        if (err?.code === 11000 && !writeErrors.length) duplicates = 1;
        else duplicates = dupes;
        accepted = Math.max(0, records.length - writeErrors.length);
        if (other > 0 || (!writeErrors.length && err?.code !== 11000)) {
          console.error("[/telemetry/takeoff-sessions] insert error:", err);
          if (!accepted && !duplicates) return res.status(500).json({ error: "could not store sessions" });
        }
      }
    }

    return res.status(rejected.length && !accepted && !duplicates ? 400 : 200).json({
      accepted,
      duplicates,
      rejected,
      results: records.map(resultFor),
      calibration: { asked: !!calibration },
    });
  } catch (err) {
    console.error("[/telemetry/takeoff-sessions] error:", err);
    return res.status(500).json({ error: "takeoff telemetry failed" });
  }
});

// GET /telemetry/takeoff-calibration?product=HERON
// → { asked, skipped, scale, manualMinutes }
router.get("/takeoff-calibration", requireAuth, async (req, res) => {
  try {
    const userId = userIdFrom(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const product = normalizeProduct(req.query.product);
    if (!product) return res.status(400).json({ error: "product required" });
    const doc = await TakeoffCalibration.findOne({ userId, product }).lean();
    return res.json({
      asked: !!doc,
      skipped: !!doc?.skipped,
      scale: doc && !doc.skipped ? doc.scale : 1,
      manualMinutes: doc && !doc.skipped ? doc.manualMinutes : 0,
    });
  } catch (err) {
    console.error("[/telemetry/takeoff-calibration GET] error:", err);
    return res.status(500).json({ error: "failed" });
  }
});

// POST /telemetry/takeoff-calibration
//   { product, skipped?: true }                                   -> never ask again
//   { product, manualMinutes, referenceCounts, referenceSessionId } -> use it
// Applies to sessions received from now on; already-stored sessions keep the
// figures they were stored with (they are the audit trail).
router.post("/takeoff-calibration", requireAuth, async (req, res) => {
  try {
    const userId = userIdFrom(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const product = normalizeProduct(req.body?.product || req.body?.productKey);
    if (!product) return res.status(400).json({ error: "product required" });

    const skipped = req.body?.skipped === true || req.body?.skipped === "true";
    let update;
    if (skipped) {
      update = { skipped: true, manualMinutes: 0, scale: 1 };
    } else {
      const manualMinutes = Number(req.body?.manualMinutes);
      if (!Number.isFinite(manualMinutes) || manualMinutes <= 0 || manualMinutes > 24 * 60) {
        return res.status(400).json({ error: "manualMinutes must be between 1 and 1440" });
      }
      const referenceCounts = normalizeCounts(req.body?.referenceCounts);
      const total = referenceCounts.sheets + referenceCounts.items + referenceCounts.elementTypes + referenceCounts.boqLines;
      if (!total) return res.status(400).json({ error: "referenceCounts required" });
      const baseline = await getActiveBaseline();
      const scale = calibrationScale(manualMinutes, referenceCounts, baseline.rates, product);
      update = {
        skipped: false,
        manualMinutes: Math.round(manualMinutes),
        referenceCounts,
        referenceSessionId: str(req.body?.referenceSessionId, 64),
        baselineVersion: baseline.version,
        scale,
      };
    }

    const doc = await TakeoffCalibration.findOneAndUpdate(
      { userId, product },
      { $set: update, $setOnInsert: { userId, product } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();

    return res.json({ asked: true, skipped: !!doc.skipped, scale: doc.skipped ? 1 : doc.scale });
  } catch (err) {
    console.error("[/telemetry/takeoff-calibration POST] error:", err);
    return res.status(500).json({ error: "failed" });
  }
});

// Admin read, kept on this path too because the brief names it here.
router.get("/takeoff-summary", requireAuth, requirePermission("adminhub"), summaryHandler);

export default router;
