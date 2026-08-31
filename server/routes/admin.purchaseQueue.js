// server/routes/admin.purchaseQueue.js
//
// The purchases queue, as his screen needs it.
//
// GET /admin/purchases already exists and the old hub reads it, so it is left
// exactly as it is. It returns raw Purchase documents, and a raw purchase
// cannot answer the question his screen is built around — WHO is this, and can
// I act on it? The customer's name and firm live on the User, and the reason a
// row is stuck is a join away. Doing that join in the browser would mean the
// screen fetching every user to draw a list.
//
// HIS RULE, TRANSLATED
//
// His: "A transfer is approved on the strength of a proof of payment, so the
// proof is on the row — and a row with no proof cannot be approved at all." He
// wrote that because the live admin lets you approve a row with no product and
// no email against it, and nine orphaned installations exist because of it.
//
// We store no proof of payment — there is no such field, and none of the
// pending rows record a payment method either. So the rule cannot be ported
// literally. What CAN be ported is the thing the rule protects: do not offer a
// decision the server will refuse, and say why on the row.
//
// POST /purchases/:id/approve refuses in two ways that are knowable in
// advance: the account is gone ("User not found"), or the order carries no
// lines, so there is nothing to grant. Both are computed here as `blocked`,
// and the screen disables Approve and prints the reason where his proof went.
// A blocked row can still be REJECTED — refusing an ungrantable order is
// exactly how it should leave the queue.

import express from "express";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { Purchase } from "../models/Purchase.js";
import { User } from "../models/User.js";

const router = express.Router();
router.use(requireAuth, requirePermission("adminhub"));

const DAY = 864e5;
const n0 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** The firm a person is licensed under. Held per entitlement, not per user. */
const orgOf = (u) =>
  (u?.entitlements || []).map((e) => String(e.organizationName || "").trim()).find(Boolean) || "";

/** "2 × QUIV · 1 × HERON" — what was actually bought. His `what()`. */
const describe = (lines) =>
  (lines || [])
    .map((l) => `${n0(l.qty) || 1} × ${String(l.name || l.productKey || "Unnamed item").trim()}`)
    .join(" · ");

/**
 * The term the customer actually bought. His note: "The customer bought a year
 * or a month; the order carries it. A control that lets an administrator pick
 * a different one is a control that lets them get it wrong." So it is reported,
 * never offered.
 *
 * A line carries both an interval and a number of periods, so three months of
 * a monthly plan is "3 months" rather than "1 month".
 */
function term(lines) {
  const ls = lines || [];
  if (!ls.length) return "";
  const months = ls.map((l) => {
    const per = Math.max(1, n0(l.periods) || 1);
    return String(l.billingInterval || "").toLowerCase() === "yearly" ? per * 12 : per;
  });
  const same = months.every((m) => m === months[0]);
  if (!same) return "mixed terms";
  const m = months[0];
  if (m === 12) return "12 months";
  return `${m} month${m === 1 ? "" : "s"}`;
}

const seatsOf = (lines) => (lines || []).reduce((t, l) => t + (n0(l.qty) || 1), 0);

router.get("/", async (req, res, next) => {
  try {
    const status = String(req.query.status || "pending").toLowerCase();
    const q = status === "all" ? {} : { status };

    const rows = await Purchase.find(q).sort({ createdAt: -1 }).limit(500).lean();

    // Tab counts come off the whole collection, not off the page being shown —
    // a tab that counted only what is loaded would disagree with itself.
    const [awaiting, approved, rejected, all] = await Promise.all([
      Purchase.countDocuments({ status: "pending" }),
      Purchase.countDocuments({ status: "approved" }),
      Purchase.countDocuments({ status: "rejected" }),
      Purchase.estimatedDocumentCount(),
    ]);

    const ids = [...new Set(rows.map((r) => String(r.userId)).filter(Boolean))];
    const users = await User.find({ _id: { $in: ids } })
      // organizationName and licenseType are NOT User fields — they live on
      // each entitlement. Selecting them here returned undefined and the
      // row quietly fell through to the person's own name.
      .select("_id firstName lastName email entitlements.organizationName entitlements.licenseType")
      .lean();
    const byId = new Map(users.map((u) => [String(u._id), u]));

    const items = rows.map((p) => {
      const u = byId.get(String(p.userId));
      const lines = p.lines || [];
      const gross = n0(p.totalAmount);
      const tax = n0(p.vatAmount);

      // Knowable-in-advance reasons the approve endpoint would refuse.
      let blocked = null;
      if (!p.userId || !u) blocked = "No account behind this order";
      else if (!lines.length) blocked = "No items on this order";

      return {
        id: String(p._id),
        ref: p.paystackRef || `#${String(p._id).slice(-6).toUpperCase()}`,
        // A gateway reference is the one thing on these rows that can be
        // checked against something outside the system. Where his screen put
        // the proof of payment, ours puts this when there is one.
        gatewayRef: p.paystackRef || "",
        status: p.status,
        who:
          [u?.firstName, u?.lastName].filter(Boolean).join(" ").trim() ||
          String(p.email || u?.email || "").trim() ||
          "Unknown customer",
        org:
          String(p.organization?.name || orgOf(u) || "").trim() ||
          (String(p.licenseType || "personal") === "organization"
            ? "Organisation"
            : "Personal licence"),
        email: String(p.email || u?.email || "").trim(),
        what: describe(lines),
        seats: seatsOf(lines),
        term: term(lines),
        currency: p.currency || "NGN",
        gross,
        tax,
        net: gross - tax,
        vatLabel: p.vatLabel || (p.vatPercent ? `VAT ${p.vatPercent}%` : "VAT"),
        age: Math.floor((Date.now() - new Date(p.createdAt).getTime()) / DAY),
        createdAt: p.createdAt,
        decidedAt: p.decidedAt || null,
        decidedBy: p.decidedBy || "",
        blocked,
      };
    });

    res.json({ items, counts: { awaiting, approved, rejected, all } });
  } catch (err) {
    next(err);
  }
});

export default router;
