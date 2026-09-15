// server/routes/admin.people.js
//
// People — the register of individual accounts.
//
// His framing: "The register answers 'who is this?'; the record answers 'what
// happened to them?'. Searching by email is the commonest thing an
// administrator does at the start of a support call." So the search is the
// primary control and it matches name, email, username or firm.
//
// WHERE THE ORGANISATION ACTUALLY LIVES
//
// Not on the user. `licenseType` and `organizationName` are fields on each
// ENTITLEMENT, and the User schema has neither. That is worth stating plainly
// because getting it wrong is silent rather than loud: Mongoose strips unknown
// paths out of a query, so `User.countDocuments({ licenseType: "organization" })`
// does not return zero, it returns EVERY user — the filter vanishes and the
// count looks plausible. A person's firm is therefore read off their
// entitlements here.
//
// WHAT "HOLDING A LICENCE" MEANS
//
// An entitlement is live when its status is active AND it has not run out.
// Both halves are needed: 55 accounts carry status "active", and some of those
// carry an expiresAt in the past, because nothing sweeps the flag when the
// date passes. Counting on status alone would report licences that expired
// months ago as current.

import express from "express";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { User } from "../models/User.js";

const router = express.Router();
router.use(requireAuth, requirePermission("users"));

const DAY = 864e5;
const LIMIT = 200;

const isLive = (e) => {
  if (String(e?.status || "").toLowerCase() !== "active") return false;
  if (!e.expiresAt) return true;
  return new Date(e.expiresAt).getTime() >= Date.now();
};

/** The firm a person is licensed under, taken off their entitlements. */
const orgOf = (u) =>
  (u.entitlements || []).map((e) => String(e.organizationName || "").trim()).find(Boolean) || "";

/** Do they hold an organisation licence rather than a personal one? */
const isOwner = (u) =>
  (u.entitlements || []).some((e) => String(e.licenseType || "") === "organization");

/**
 * The status word for the soonest expiry, using his tone vocabulary so
 * "expiring" means the same thing here as everywhere else in the admin.
 */
function nextExpiry(u) {
  const live = (u.entitlements || []).filter(isLive).filter((e) => e.expiresAt);
  if (!live.length) return null;
  const soonest = live.reduce((a, b) =>
    new Date(a.expiresAt) < new Date(b.expiresAt) ? a : b,
  );
  const days = Math.floor((new Date(soonest.expiresAt).getTime() - Date.now()) / DAY);
  return {
    date: soonest.expiresAt,
    days,
    status: days <= 30 ? "expiring" : "active",
  };
}

router.get("/", async (req, res, next) => {
  try {
    const view = String(req.query.view || "all").toLowerCase();
    const q = String(req.query.q || "").trim();

    // Search is a database query, not a filter over a page: with 458 accounts
    // and a limit, filtering client-side would search only what happened to be
    // loaded and quietly miss the person being looked for.
    const find = {};
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      find.$or = [
        { email: rx },
        { firstName: rx },
        { lastName: rx },
        { username: rx },
        { "entitlements.organizationName": rx },
      ];
    }

    const users = await User.find(find)
      .select("firstName lastName email username role createdAt entitlements")
      .sort({ createdAt: -1 })
      .limit(1000)
      .lean();

    const shaped = users.map((u) => {
      const live = (u.entitlements || []).filter(isLive);
      return {
        id: String(u._id),
        name:
          [u.firstName, u.lastName].filter(Boolean).join(" ").trim() ||
          u.username ||
          String(u.email || "").split("@")[0],
        email: u.email || "",
        org: orgOf(u),
        owner: isOwner(u),
        role: u.role || "user",
        holds: live.map((e) => e.productKey).filter(Boolean),
        seats: live.reduce((t, e) => t + (Number(e.seats) || 1), 0),
        expiry: nextExpiry(u),
        joined: u.createdAt || null,
      };
    });

    const matches = (p, v) => {
      if (v === "holders") return p.holds.length > 0;
      if (v === "owners") return p.owner;
      if (v === "idle") return p.holds.length === 0;
      return true;
    };

    // Counts are of the SEARCH, not of the whole table — a filter row that
    // ignored the search would offer tabs leading to nothing.
    const counts = {
      all: shaped.length,
      holders: shaped.filter((p) => matches(p, "holders")).length,
      owners: shaped.filter((p) => matches(p, "owners")).length,
      idle: shaped.filter((p) => matches(p, "idle")).length,
    };

    const rows = shaped.filter((p) => matches(p, view));

    res.json({
      items: rows.slice(0, LIMIT),
      counts,
      shown: Math.min(rows.length, LIMIT),
      total: rows.length,
      capped: rows.length > LIMIT,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
