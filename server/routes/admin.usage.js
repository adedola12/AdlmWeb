// server/routes/admin.usage.js
//
// Admin view over UsageSession heartbeat data: per user+product last-active
// time, total minutes, and session count over a window. Consumed by the
// admin dashboard's Active Subscriptions table ("Last seen" / "Usage").
import express from "express";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { UsageSession } from "../models/UsageSession.js";

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

export default router;
