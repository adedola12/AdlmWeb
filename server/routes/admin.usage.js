// server/routes/admin.usage.js
//
// Admin view over UsageSession heartbeat data: per user+product last-active
// time, total minutes, and session count over a window. Consumed by the
// admin dashboard's Active Subscriptions table ("Last seen" / "Usage").
import express from "express";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { UsageSession } from "../models/UsageSession.js";
import { DiagnosticLog } from "../models/DiagnosticLog.js";

const router = express.Router();

router.use(requireAuth, requirePermission("adminhub"));

// GET /admin/usage/summary?days=30&product=revit
// → { days, rows: [{ userId, email, productKey, lastActiveAt, minutes,
//                    sessions, appVersion }] }
router.get("/summary", async (req, res) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
    const since = new Date(Date.now() - days * 86400000);

    const match = { lastPingAt: { $gte: since } };
    const product = String(req.query.product || "")
      .trim()
      .toLowerCase();
    if (product) match.productKey = product;

    const rows = await UsageSession.aggregate([
      { $match: match },
      { $sort: { lastPingAt: 1 } },
      {
        $group: {
          _id: { userId: "$userId", productKey: "$productKey" },
          email: { $last: "$email" },
          lastActiveAt: { $max: "$lastPingAt" },
          minutes: { $sum: "$minutes" },
          sessions: { $sum: 1 },
          appVersion: { $last: "$appVersion" },
          fpVersion: { $last: "$fpVersion" },
        },
      },
      { $sort: { lastActiveAt: -1 } },
    ]);

    res.json({
      days,
      rows: rows.map((r) => ({
        userId: r._id.userId,
        productKey: r._id.productKey,
        email: r.email,
        lastActiveAt: r.lastActiveAt,
        minutes: r.minutes,
        sessions: r.sessions,
        appVersion: r.appVersion,
        fpVersion: r.fpVersion,
      })),
    });
  } catch (err) {
    console.error("[/admin/usage/summary] error:", err);
    res.status(500).json({ error: "Failed to load usage summary" });
  }
});

// GET /admin/usage/user?email=…&days=90 — per-session drill-down for support.
router.get("/user", async (req, res) => {
  try {
    const email = String(req.query.email || "")
      .trim()
      .toLowerCase();
    if (!email) return res.status(400).json({ error: "email required" });

    const days = Math.min(Math.max(Number(req.query.days) || 90, 1), 365);
    const since = new Date(Date.now() - days * 86400000);

    const sessions = await UsageSession.find({
      email,
      lastPingAt: { $gte: since },
    })
      .sort({ lastPingAt: -1 })
      .limit(200)
      .lean();

    res.json({ email, days, sessions });
  } catch (err) {
    console.error("[/admin/usage/user] error:", err);
    res.status(500).json({ error: "Failed to load user usage" });
  }
});

// GET /admin/usage/logs?days=30&product=revit&email=…
// Beta testers' diagnostic logs, newest first, WITHOUT the content (the list
// is per-row metadata plus the PerfLog lines; the full text is fetched by id).
// → { days, rows: [{ id, userId, email, productKey, appVersion, hostTarget,
//                    reason, lineCount, sizeBytes, perfLines, createdAt }] }
router.get("/logs", async (req, res) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
    const since = new Date(Date.now() - days * 86400000);

    const match = { createdAt: { $gte: since } };
    const product = String(req.query.product || "")
      .trim()
      .toLowerCase();
    if (product) match.productKey = product;
    const email = String(req.query.email || "")
      .trim()
      .toLowerCase();
    if (email) match.email = email;

    const limit = Math.min(Math.max(Number(req.query.limit) || 300, 1), 1000);

    const rows = await DiagnosticLog.find(match)
      .sort({ createdAt: -1 })
      .limit(limit)
      .select("-content")
      .lean();

    res.json({
      days,
      rows: rows.map((r) => ({
        id: String(r._id),
        userId: r.userId,
        email: r.email,
        productKey: r.productKey,
        appVersion: r.appVersion,
        hostTarget: r.hostTarget,
        reason: r.reason,
        lineCount: r.lineCount,
        sizeBytes: r.sizeBytes,
        perfLines: r.perfLines || [],
        createdAt: r.createdAt,
      })),
    });
  } catch (err) {
    console.error("[/admin/usage/logs] error:", err);
    res.status(500).json({ error: "Failed to load diagnostic logs" });
  }
});

// GET /admin/usage/logs/:id — one log with its full text.
router.get("/logs/:id", async (req, res) => {
  try {
    const doc = await DiagnosticLog.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json({
      id: String(doc._id),
      email: doc.email,
      productKey: doc.productKey,
      appVersion: doc.appVersion,
      hostTarget: doc.hostTarget,
      reason: doc.reason,
      lineCount: doc.lineCount,
      sizeBytes: doc.sizeBytes,
      createdAt: doc.createdAt,
      content: doc.content || "",
    });
  } catch (err) {
    console.error("[/admin/usage/logs/:id] error:", err);
    res.status(500).json({ error: "Failed to load diagnostic log" });
  }
});

export default router;
