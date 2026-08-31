// server/routes/admin.documents.js
//
// The Documents group: what the studio produces, what it spends on AI, what
// was done in the admin, and what the system is set to.
//
// His group is Composer, Templates, Issued, AI usage and System. Two of those
// we do not have and they stay absent rather than becoming empty screens:
// there is no template store (document templates are code), and no register of
// what has been issued (a PDF is generated and sent, and nothing records that
// it happened).
//
// AI USAGE IS THE ONE THAT PAYS FOR ITSELF
//
// 163 calls are logged with their token counts and cost, and until now the
// only way to read it was a chart of the last 30 days. What an administrator
// actually needs to know is which FEATURE is spending the money — Ada, the
// quiz drafter, the programme estimator — because that is the thing that can
// be turned down. So it is grouped by feature and by person, and the totals
// are summed in the database rather than over a page of rows.

import express from "express";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { AiUsage } from "../models/AiUsage.js";
import { AuditLog } from "../models/AuditLog.js";
import { Proposal } from "../models/Proposal.js";
import { Setting } from "../models/Setting.js";

const router = express.Router();
const hub = [requireAuth, requirePermission("adminhub")];

const n0 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const DAY = 864e5;

/* ─────────────────────────────────────────────────────────────── ai usage ── */

router.get("/ai-usage", ...hub, async (req, res, next) => {
  try {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    const since = new Date(Date.now() - days * DAY);

    const [byFeature, byPerson, totals] = await Promise.all([
      AiUsage.aggregate([
        { $match: { at: { $gte: since } } },
        {
          $group: {
            _id: "$feature",
            calls: { $sum: 1 },
            inTokens: { $sum: { $ifNull: ["$inputTokens", 0] } },
            outTokens: { $sum: { $ifNull: ["$outputTokens", 0] } },
            cost: { $sum: { $ifNull: ["$costUsd", 0] } },
          },
        },
        { $sort: { cost: -1, calls: -1 } },
      ]),
      AiUsage.aggregate([
        { $match: { at: { $gte: since } } },
        {
          $group: {
            _id: { email: "$email", name: "$name" },
            calls: { $sum: 1 },
            cost: { $sum: { $ifNull: ["$costUsd", 0] } },
            features: { $addToSet: "$feature" },
          },
        },
        { $sort: { cost: -1 } },
        { $limit: 50 },
      ]),
      AiUsage.aggregate([
        { $match: { at: { $gte: since } } },
        {
          $group: {
            _id: null,
            calls: { $sum: 1 },
            cost: { $sum: { $ifNull: ["$costUsd", 0] } },
            inTokens: { $sum: { $ifNull: ["$inputTokens", 0] } },
            outTokens: { $sum: { $ifNull: ["$outputTokens", 0] } },
          },
        },
      ]),
    ]);

    res.json({
      items: byFeature.map((f) => ({
        id: f._id || "unattributed",
        name: f._id || "Unattributed",
        calls: f.calls,
        inTokens: f.inTokens,
        outTokens: f.outTokens,
        cost: f.cost,
        state: "active",
      })),
      people: byPerson.map((p) => ({
        id: p._id.email || "anonymous",
        who: p._id.name || p._id.email || "Signed out",
        email: p._id.email || "",
        calls: p.calls,
        cost: p.cost,
        features: (p.features || []).filter(Boolean),
      })),
      totals: totals[0] || { calls: 0, cost: 0, inTokens: 0, outTokens: 0 },
      days,
    });
  } catch (err) {
    next(err);
  }
});

/* ────────────────────────────────────────────────────────────── audit log ── */

router.get("/audit", ...hub, async (req, res, next) => {
  try {
    const q = {};
    if (String(req.query.god) === "true") q.isGod = true;

    const rows = await AuditLog.find(q).sort({ createdAt: -1 }).limit(300).lean();
    const [all, god] = await Promise.all([
      AuditLog.estimatedDocumentCount(),
      AuditLog.countDocuments({ isGod: true }),
    ]);

    const items = rows.map((a) => ({
      id: String(a._id),
      action: a.action || "",
      who: a.actorEmail || "system",
      // A break-glass action is not an ordinary one and the row says so.
      god: !!a.isGod,
      target: a.targetEmail || a.productKey || "",
      method: a.method || "",
      path: a.path || "",
      status: n0(a.status),
      ip: a.ip || "",
      at: a.createdAt || null,
      state: a.status >= 400 ? "bad" : a.isGod ? "due" : "active",
    }));

    res.json({ items, counts: { all, god } });
  } catch (err) {
    next(err);
  }
});

/* ───────────────────────────────────────────────────────────── documents ── */

/**
 * What the studio has produced. Quotations are the only document type this
 * system stores as a record — invoices have their own register, and anything
 * else (certificates, receipts) is generated on demand and not kept.
 */
router.get("/produced", ...hub, async (_req, res, next) => {
  try {
    const rows = await Proposal.find({}).sort({ proposalDate: -1, createdAt: -1 }).limit(300).lean();
    const items = rows.map((p) => ({
      id: String(p._id),
      ref: p.proposalNumber || `#${String(p._id).slice(-6).toUpperCase()}`,
      kind: "Quotation",
      who: p.clientContact || p.clientFirm || "Unnamed client",
      org: p.clientFirm || "",
      by: p.preparedBy || "",
      lines: (p.items || []).length,
      total: n0(p.total) || n0(p.subtotal),
      currency: p.currency || "NGN",
      at: p.proposalDate || p.createdAt,
      validUntil: p.validUntil || null,
      state: p.status || "draft",
    }));
    const counts = { all: items.length };
    for (const i of items) counts[i.state] = (counts[i.state] || 0) + 1;
    res.json({ items, counts });
  } catch (err) {
    next(err);
  }
});

/* ──────────────────────────────────────────────────────────────── system ── */

router.get("/system", ...hub, async (_req, res, next) => {
  try {
    const s = (await Setting.findOne({ key: "global" }).lean()) || {};

    // One row per setting, because the question an administrator has is "what
    // is this set to and does it apply" — not "show me a JSON blob".
    const items = [
      {
        id: "fx",
        name: "FX rate, naira to dollar",
        value: s.fxRateNGNUSD ? String(s.fxRateNGNUSD) : "not set",
        note: "Every dollar price with no explicit USD figure is converted at this.",
        state: s.fxRateNGNUSD ? "active" : "due",
      },
      {
        id: "vat",
        name: "VAT",
        value: s.vatEnabled ? `${n0(s.vatPercent)}%` : "off",
        note: [
          s.vatApplyToPurchases ? "applies to purchases" : "not on purchases",
          s.vatApplyToInvoices ? "applies to invoices" : "not on invoices",
        ].join(" · "),
        state: s.vatEnabled ? "active" : "calm",
      },
      {
        id: "hub",
        name: "Installer Hub",
        value: s.installerHubUrl || "not set",
        note: "Where the desktop installer is downloaded from.",
        state: s.installerHubUrl ? "active" : "due",
      },
      {
        id: "mobile",
        name: "Mobile app",
        value: s.mobileAppUrl || "not set",
        note: "The link the site offers for the phone app.",
        state: s.mobileAppUrl ? "active" : "calm",
      },
      {
        id: "reinstall",
        name: "Forced reinstall",
        value: s.forceReinstallActive ? "ON" : "off",
        note: s.forceReinstallActive
          ? String(s.forceReinstallMessage || "Every desktop client is being told to reinstall.")
          : "Desktop clients update normally.",
        // An active forced reinstall interrupts every customer, so it is
        // flagged rather than sitting quietly as one row among five.
        state: s.forceReinstallActive ? "bad" : "calm",
      },
    ];

    res.json({ items, counts: { all: items.length } });
  } catch (err) {
    next(err);
  }
});

export default router;
