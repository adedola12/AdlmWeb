// server/routes/admin.installQueue.js
//
// The installations queue, as his screen needs it.
//
// An "installation" here is not its own record: it is an approved Purchase
// carrying an `installation` sub-document. So the row has to be assembled from
// the order, the account behind it and the entitlement grants the approval
// wrote — which is a join, and belongs on this side of the wire.
//
// HIS TWO POPULATIONS
//
// His screen exists because the live admin holds nine rows that all read
// "Unknown email · Legacy record · Product(s) —" and offers "Mark complete"
// against every one of them, which cannot work: there is nothing to complete an
// orphan against. He separates the ones that can be finished from the ones that
// cannot, and offers the orphans the only two things that are true — adopt, or
// discard.
//
// Ours has the same split for a different reason. No installation row in this
// database has lost its account, so his orphan-by-missing-account population is
// empty. What DOES occur is an approved order whose approval wrote no
// entitlement grants: there is nothing to apply, so "Mark complete" would
// record a completion that granted nobody anything. Those are flagged the same
// way and for the same reason.
//
// `blocked` is therefore computed, not assumed, and the count of it is
// reported so the screen can say how many rather than implying none.

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

/**
 * What the approval decided to grant. This is the thing an installation
 * applies, so it is what the row has to show — his "Products".
 */
const grantsOf = (p) => (p.installation?.entitlementGrants || []);

router.get("/", async (req, res, next) => {
  try {
    const view = String(req.query.view || "pending").toLowerCase();
    const q = { status: "approved" };
    if (view === "all") q["installation.status"] = { $in: ["pending", "complete", "uninstalled"] };
    else q["installation.status"] = view;

    const rows = await Purchase.find(q)
      .sort({ "installation.markedAt": -1, decidedAt: -1 })
      .limit(500)
      .lean();

    const base = { status: "approved" };
    const [pending, complete, uninstalled, all] = await Promise.all([
      Purchase.countDocuments({ ...base, "installation.status": "pending" }),
      Purchase.countDocuments({ ...base, "installation.status": "complete" }),
      Purchase.countDocuments({ ...base, "installation.status": "uninstalled" }),
      Purchase.countDocuments({
        ...base,
        "installation.status": { $in: ["pending", "complete", "uninstalled"] },
      }),
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
      const ins = p.installation || {};
      const grants = grantsOf(p);
      const seats = grants.reduce((t, g) => t + (n0(g.seats) || 1), 0);

      // The two states his orphan heading exists for.
      let blocked = null;
      if (!p.userId || !u) blocked = "No account on this record";
      else if (!grants.length) blocked = "Nothing to apply — the approval granted no entitlements";

      // His entitlement chip, on our two fields.
      //
      // Grants are checked BEFORE the applied flag, because the two can
      // disagree: twelve completed rows carry entitlementsApplied: true over
      // an empty grant list, so the completion ran and granted nothing.
      // Reading the flag first labelled those "Entitlements applied" on a row
      // that also said the approval granted none — the screen contradicting
      // itself, which is worse than either statement alone.
      const ent = !grants.length
        ? {
            label: ins.entitlementsApplied ? "Applied, but nothing to apply" : "Entitlements missing",
            tone: "due",
          }
        : ins.entitlementsApplied
          ? { label: "Entitlements applied", tone: "ok" }
          : { label: "Entitlements queued", tone: "" };

      return {
        id: String(p._id),
        ref: `#${String(p._id).slice(-6).toUpperCase()}`,
        status: ins.status || "none",
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
        products: grants.map((g) => g.productKey).filter(Boolean),
        seats,
        months: grants.reduce((t, g) => Math.max(t, n0(g.months)), 0),
        ent,
        blocked,
        address: String(ins.address || "").trim(),
        markedBy: ins.markedBy || "",
        markedAt: ins.markedAt || null,
        appliedAt: ins.entitlementsAppliedAt || null,
        approvedAt: p.decidedAt || null,
        age: p.decidedAt ? Math.floor((Date.now() - new Date(p.decidedAt).getTime()) / DAY) : null,
      };
    });

    res.json({
      items,
      counts: { pending, complete, uninstalled, all },
      blocked: items.filter((i) => i.blocked).length,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
