// server/routes/admin.followups.js
//
// The renewal call desk. Mounted at /admin/followups behind the "followups"
// permission area, which is staff-grantable — this is a call list to work, and
// nothing here can change an entitlement, approve a purchase, or move money.
// Whoever works it needs a phone number and somewhere to write down what was
// said, not the Admin Hub.
//
// The list itself is derived, not entered: POST /rebuild recomputes it from
// live entitlements and pending purchases (see util/followUps.js). Everything
// else on this router is the human layer on top — call outcomes, notes,
// assignment, and the push to the Notion CRM.
import express from "express";
import mongoose from "mongoose";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { User } from "../models/User.js";
import {
  FollowUp,
  CALL_OUTCOMES,
  FOLLOWUP_STATUSES,
  FOLLOWUP_REASONS,
} from "../models/FollowUp.js";
import { rebuildFollowUps } from "../util/followUps.js";
import {
  notionEnabled,
  syncFollowUpToNotion,
  logFollowUpCallToNotion,
} from "../util/notion.js";

const router = express.Router();
const requireStaff = [requireAuth, requirePermission("followups")];

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const isId = (v) => mongoose.Types.ObjectId.isValid(String(v || ""));

/** Display name of the signed-in staff member, for the call log. */
async function callerName(req) {
  const uid = String(req.user?._id || req.user?.id || req.user?.sub || "");
  if (!uid || !isId(uid)) return { id: null, name: "" };
  const doc = await User.findById(uid)
    .select("firstName lastName email")
    .lean();
  const name =
    [doc?.firstName, doc?.lastName]
      .map((s) => String(s || "").trim())
      .filter(Boolean)
      .join(" ") ||
    doc?.email ||
    "";
  return { id: doc?._id || null, name };
}

/** Shared query builder for the list and the CSV export. */
function listFilter(query) {
  const filter = {};

  // Retired rows (renewed, or the purchase got approved) are hidden unless
  // explicitly asked for — the point of the screen is who still needs calling.
  if (String(query.archived || "") === "1") filter.active = false;
  else if (String(query.archived || "") !== "all") filter.active = true;

  const reason = String(query.reason || "").trim();
  if (FOLLOWUP_REASONS.includes(reason)) filter.reasons = reason;

  const status = String(query.status || "").trim();
  if (FOLLOWUP_STATUSES.includes(status)) filter.status = status;

  const outcome = String(query.outcome || "").trim();
  if (CALL_OUTCOMES.includes(outcome)) filter.lastOutcome = outcome;

  if (String(query.due || "") === "1") {
    // Everything scheduled for today or already past due.
    filter.nextFollowUpAt = { $ne: null, $lte: new Date() };
  }

  if (String(query.uncalled || "") === "1") filter.callCount = 0;

  if (String(query.assignedToMe || "") === "1" && query._uid) {
    filter.assignedToId = query._uid;
  }

  const q = String(query.q || "").trim();
  if (q) {
    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp(safe, "i");
    filter.$or = [
      { email: rx },
      { firstName: rx },
      { lastName: rx },
      { phone: rx },
      { firmName: rx },
    ];
  }

  return filter;
}

const SORTS = {
  overdue: { maxDaysOverdue: -1, lastExpiredAt: 1 },
  due: { nextFollowUpAt: 1 },
  recent: { updatedAt: -1 },
  name: { firstName: 1, lastName: 1 },
};

/* ───────────────────────────── list ─────────────────────────────────── */

/**
 * GET /admin/followups
 * Filters: reason, status, outcome, due=1, uncalled=1, assignedToMe=1,
 *          archived=1|all, q, sort, page, limit
 */
router.get(
  "/",
  requireStaff,
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const uid = String(req.user?._id || req.user?.id || req.user?.sub || "");

    const filter = listFilter({ ...req.query, _uid: isId(uid) ? uid : null });
    const sort = SORTS[String(req.query.sort || "overdue")] || SORTS.overdue;

    const [items, total, byReason, byStatus, dueCount, uncalledCount, lastRun] =
      await Promise.all([
        FollowUp.find(filter)
          .sort(sort)
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        FollowUp.countDocuments(filter),
        FollowUp.aggregate([
          { $match: { active: true } },
          { $unwind: "$reasons" },
          { $group: { _id: "$reasons", n: { $sum: 1 } } },
        ]),
        FollowUp.aggregate([
          { $match: { active: true } },
          { $group: { _id: "$status", n: { $sum: 1 } } },
        ]),
        FollowUp.countDocuments({
          active: true,
          nextFollowUpAt: { $ne: null, $lte: new Date() },
        }),
        FollowUp.countDocuments({ active: true, callCount: 0 }),
        FollowUp.findOne({ lastRebuiltAt: { $ne: null } })
          .sort({ lastRebuiltAt: -1 })
          .select("lastRebuiltAt")
          .lean(),
      ]);

    return res.json({
      ok: true,
      items,
      total,
      page,
      limit,
      counts: {
        reasons: Object.fromEntries(byReason.map((r) => [r._id, r.n])),
        statuses: Object.fromEntries(byStatus.map((r) => [r._id, r.n])),
        due: dueCount,
        uncalled: uncalledCount,
      },
      lastRebuiltAt: lastRun?.lastRebuiltAt || null,
      notionEnabled: notionEnabled(),
      outcomes: CALL_OUTCOMES,
      statuses: FOLLOWUP_STATUSES,
    });
  }),
);

/* ───────────────────────────── rebuild ──────────────────────────────── */

/**
 * POST /admin/followups/rebuild
 * Body: { expiredWithinDays?, pendingMinAgeHours? }
 *
 * Safe to run as often as you like: it refreshes the snapshot and never
 * touches call history, notes, status or assignment.
 */
router.post(
  "/rebuild",
  requireStaff,
  asyncHandler(async (req, res) => {
    const expiredWithinDays = Math.max(
      0,
      parseInt(req.body?.expiredWithinDays, 10) || 0,
    );
    const pendingMinAgeHours = Math.max(
      0,
      Number.isFinite(parseInt(req.body?.pendingMinAgeHours, 10))
        ? parseInt(req.body.pendingMinAgeHours, 10)
        : 24,
    );

    const out = await rebuildFollowUps({ expiredWithinDays, pendingMinAgeHours });
    return res.json({ ok: true, ...out });
  }),
);

/* ───────────────────────────── log a call ───────────────────────────── */

/**
 * POST /admin/followups/:id/calls
 * Body: { outcome, note?, channel?, nextFollowUpAt?, status? }
 *
 * Appends to the call log and moves the row's work state. The Notion push is
 * best-effort and happens after the write, so a CRM outage cannot cost
 * somebody the call they just made.
 */
router.post(
  "/:id/calls",
  requireStaff,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!isId(id)) return res.status(400).json({ error: "Invalid id" });

    const outcome = String(req.body?.outcome || "").trim();
    if (!CALL_OUTCOMES.includes(outcome)) {
      return res.status(400).json({
        error: `outcome must be one of: ${CALL_OUTCOMES.join(", ")}`,
      });
    }

    const doc = await FollowUp.findById(id);
    if (!doc) return res.status(404).json({ error: "Not found" });

    const channel = ["phone", "whatsapp", "email"].includes(req.body?.channel)
      ? req.body.channel
      : "phone";

    let nextFollowUpAt = null;
    if (req.body?.nextFollowUpAt) {
      const d = new Date(req.body.nextFollowUpAt);
      if (!Number.isNaN(d.getTime())) nextFollowUpAt = d;
    }

    const who = await callerName(req);
    const call = {
      at: new Date(),
      byId: who.id,
      byName: who.name,
      outcome,
      channel,
      note: String(req.body?.note || "").slice(0, 2000),
      nextFollowUpAt,
      notionPageId: "",
    };

    doc.calls.push(call);
    doc.callCount = doc.calls.length;
    doc.lastCalledAt = call.at;
    doc.lastOutcome = outcome;
    doc.nextFollowUpAt = nextFollowUpAt;

    // The outcome implies the work state unless the caller overrode it. A
    // "renewed" row is NOT retired here — active is owned by the rebuild, and
    // the entitlement only really moves when the purchase is approved. Marking
    // it done is the caller saying "my part is finished".
    const explicit = String(req.body?.status || "").trim();
    if (FOLLOWUP_STATUSES.includes(explicit)) {
      doc.status = explicit;
    } else if (outcome === "renewed" || outcome === "not_interested") {
      doc.status = "done";
    } else if (outcome === "callback" && nextFollowUpAt) {
      doc.status = "snoozed";
    } else {
      doc.status = "in_progress";
    }

    await doc.save();

    // Best-effort CRM push: the contact's pipeline fields, then the call as a
    // new Activity Log entry.
    if (notionEnabled()) {
      const notion = await syncFollowUpToNotion(doc.toObject());
      const pageId = await logFollowUpCallToNotion(doc.toObject(), call);

      doc.notion = notion;
      if (pageId) {
        const last = doc.calls[doc.calls.length - 1];
        if (last) last.notionPageId = pageId;
      }
      await doc.save();
    }

    return res.json({ ok: true, item: doc.toObject() });
  }),
);

/* ───────────────────────────── edit a row ───────────────────────────── */

/**
 * PATCH /admin/followups/:id
 * Body: { status?, note?, nextFollowUpAt?, phone?, assignToMe?, unassign? }
 *
 * Deliberately narrow. The snapshot (which products, how overdue, what they
 * tried to buy) is derived and must not be editable here — a hand-corrected
 * expiry date would be silently overwritten by the next rebuild, which is
 * worse than not offering the field. Phone is the exception: it is the one
 * thing a caller genuinely learns and needs to keep.
 */
router.patch(
  "/:id",
  requireStaff,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!isId(id)) return res.status(400).json({ error: "Invalid id" });

    const $set = {};

    if (req.body?.status !== undefined) {
      const s = String(req.body.status);
      if (!FOLLOWUP_STATUSES.includes(s)) {
        return res.status(400).json({ error: "Invalid status" });
      }
      $set.status = s;
    }

    if (req.body?.note !== undefined) {
      $set.note = String(req.body.note).slice(0, 4000);
    }

    if (req.body?.phone !== undefined) {
      $set.phone = String(req.body.phone).trim().slice(0, 40);
    }

    if (req.body?.nextFollowUpAt !== undefined) {
      if (!req.body.nextFollowUpAt) {
        $set.nextFollowUpAt = null;
      } else {
        const d = new Date(req.body.nextFollowUpAt);
        if (Number.isNaN(d.getTime())) {
          return res.status(400).json({ error: "Invalid nextFollowUpAt" });
        }
        $set.nextFollowUpAt = d;
      }
    }

    if (req.body?.assignToMe) {
      const who = await callerName(req);
      $set.assignedToId = who.id;
      $set.assignedToName = who.name;
    } else if (req.body?.unassign) {
      $set.assignedToId = null;
      $set.assignedToName = "";
    }

    if (!Object.keys($set).length) {
      return res.status(400).json({ error: "Nothing to update" });
    }

    const item = await FollowUp.findByIdAndUpdate(
      id,
      { $set },
      { new: true },
    ).lean();
    if (!item) return res.status(404).json({ error: "Not found" });

    return res.json({ ok: true, item });
  }),
);

/* ───────────────────────────── Notion push ──────────────────────────── */

/**
 * POST /admin/followups/:id/notion — push one contact into the CRM.
 */
router.post(
  "/:id/notion",
  requireStaff,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!isId(id)) return res.status(400).json({ error: "Invalid id" });
    if (!notionEnabled()) {
      return res
        .status(409)
        .json({ error: "Notion is not configured (NOTION_API_KEY is unset)." });
    }

    const doc = await FollowUp.findById(id);
    if (!doc) return res.status(404).json({ error: "Not found" });

    doc.notion = await syncFollowUpToNotion(doc.toObject());
    await doc.save();

    if (doc.notion.lastError) {
      return res.status(502).json({ ok: false, error: doc.notion.lastError });
    }
    return res.json({ ok: true, item: doc.toObject() });
  }),
);

/**
 * POST /admin/followups/notion/sync-all
 * Body: { onlyMissing?: boolean (default true), limit?: number }
 *
 * Pushes the open call list into the CRM. Sequential on purpose: Notion rate
 * limits at roughly 3 requests a second and each contact costs a lookup plus a
 * write, so a parallel fan-out over a few hundred people would spend most of
 * its time being throttled and retried.
 */
router.post(
  "/notion/sync-all",
  requireStaff,
  asyncHandler(async (req, res) => {
    if (!notionEnabled()) {
      return res
        .status(409)
        .json({ error: "Notion is not configured (NOTION_API_KEY is unset)." });
    }

    const onlyMissing = req.body?.onlyMissing !== false;
    const limit = Math.min(500, Math.max(1, parseInt(req.body?.limit, 10) || 250));

    const filter = { active: true };
    if (onlyMissing) filter["notion.contactPageId"] = "";

    const docs = await FollowUp.find(filter)
      .sort({ maxDaysOverdue: -1 })
      .limit(limit)
      .exec();

    let synced = 0;
    const failures = [];

    for (const doc of docs) {
      const notion = await syncFollowUpToNotion(doc.toObject());
      doc.notion = notion;
      await doc.save();
      if (notion.lastError) failures.push({ email: doc.email, error: notion.lastError });
      else synced += 1;
    }

    return res.json({
      ok: true,
      considered: docs.length,
      synced,
      failed: failures.length,
      failures: failures.slice(0, 20),
      // A capped run is not a complete one. Say so rather than letting the
      // "synced N" line read as "everyone is in the CRM now".
      capped: docs.length === limit,
    });
  }),
);

/* ───────────────────────────── CSV export ──────────────────────────── */

// A leading =, +, - or @ makes Excel treat a cell as a formula, so a name or
// note starting with one would execute on open. Prefix with a quote.
const cell = (v) => {
  let s = String(v ?? "");
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

// GET /admin/followups/export.csv — same filters as the list.
router.get(
  "/export.csv",
  requireStaff,
  asyncHandler(async (req, res) => {
    const uid = String(req.user?._id || req.user?.id || req.user?.sub || "");
    const filter = listFilter({ ...req.query, _uid: isId(uid) ? uid : null });
    const sort = SORTS[String(req.query.sort || "overdue")] || SORTS.overdue;

    const rows = await FollowUp.find(filter).sort(sort).limit(5000).lean();

    const header = [
      "First name", "Last name", "Email", "Phone", "Company",
      "Reasons", "Expired products", "Days overdue", "Pending orders",
      "Status", "Calls", "Last called", "Last outcome", "Next follow-up",
      "Assigned to", "Note",
    ];

    const body = rows.map((r) =>
      [
        r.firstName,
        r.lastName,
        r.email,
        r.phone,
        r.firmName,
        (r.reasons || []).join(" + "),
        (r.products || []).map((p) => p.productName).join(" · "),
        r.maxDaysOverdue || 0,
        (r.purchases || []).map((p) => p.items).join(" · "),
        r.status,
        r.callCount || 0,
        r.lastCalledAt ? new Date(r.lastCalledAt).toISOString().slice(0, 10) : "",
        r.lastOutcome || "",
        r.nextFollowUpAt
          ? new Date(r.nextFollowUpAt).toISOString().slice(0, 10)
          : "",
        r.assignedToName || "",
        r.note || "",
      ]
        .map(cell)
        .join(","),
    );

    const csv = [header.map(cell).join(","), ...body].join("\r\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="follow-up-calls.csv"',
    );
    // Excel reads a CSV as the system codepage unless it sees a BOM, which
    // mangles any non-ASCII name and the ₦ sign.
    return res.send(`﻿${csv}`);
  }),
);

export default router;
