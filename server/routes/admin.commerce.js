// server/routes/admin.commerce.js
//
// The five Commerce registers, which his admin-commerce.js correctly observes
// are "the same screen with different columns": subscriptions, entitlements,
// quotations, invoices and coupons all answer the same shape of question —
// show me these objects, let me narrow them, let me open one.
//
// One router for the five, because the joins are the same join: nearly every
// row names an account, and the account's name lives on the User while the
// firm lives on the entitlements underneath it.
//
// SUBSCRIPTIONS AND ENTITLEMENTS ARE NOT TWO COLLECTIONS
//
// His model has both as separate objects. Ours has one: an entitlement, which
// carries a product, a seat count, a status and an expiry. What makes one a
// SUBSCRIPTION rather than a one-off grant is `autoRenew` — the intent to
// charge again — and at the time of writing not one entitlement in this
// database has it set, and not one account has a saved card. So the
// Subscriptions register is the renewal book, and it is empty, and it says so
// rather than showing 125 licences under a heading that would imply they
// renew themselves.

import express from "express";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { Invoice } from "../models/Invoice.js";
import { Coupon } from "../models/Coupon.js";
import { Proposal } from "../models/Proposal.js";
import { Product } from "../models/Product.js";
import { Purchase } from "../models/Purchase.js";
import { getEffectivePrices } from "../util/pricing.js";
import { getFxRate } from "../util/fx.js";

const router = express.Router();

const DAY = 864e5;
const n0 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const nameOf = (u) =>
  [u?.firstName, u?.lastName].filter(Boolean).join(" ").trim() ||
  u?.username ||
  String(u?.email || "").split("@")[0] ||
  "Unknown account";

const orgOf = (u) =>
  (u?.entitlements || []).map((e) => String(e.organizationName || "").trim()).find(Boolean) || "";

/** Live, expiring or lapsed — one vocabulary for the whole admin. */
function stateOf(e) {
  const status = String(e.status || "").toLowerCase();
  if (status !== "active") return status === "expired" ? "expired" : status || "inactive";
  if (!e.expiresAt) return "active";
  const days = Math.floor((new Date(e.expiresAt).getTime() - Date.now()) / DAY);
  if (days < 0) return "expired";
  return days <= 30 ? "expiring" : "active";
}

/**
 * Every entitlement in the system, flattened out of the users that hold them.
 * Both registers read this; they differ only in what they keep.
 */
async function allGrants() {
  const users = await User.find({ "entitlements.0": { $exists: true } })
    .select("firstName lastName username email entitlements")
    .lean();

  const rows = [];
  for (const u of users) {
    for (const e of u.entitlements || []) {
      rows.push({
        accountId: String(u._id),
        who: nameOf(u),
        org: orgOf(u),
        email: u.email || "",
        product: e.productKey || "",
        seats: n0(e.seats) || 1,
        status: e.status || "",
        state: stateOf(e),
        expiresAt: e.expiresAt || null,
        licenseType: e.licenseType || "personal",
        autoRenew: !!e.autoRenew,
        devices: (e.devices || []).length,
      });
    }
  }
  return rows;
}

/* ─────────────────────────────────────────────────────── entitlements ── */

router.get("/entitlements", requireAuth, requirePermission("adminhub"), async (req, res, next) => {
  try {
    const view = String(req.query.view || "all").toLowerCase();
    const rows = await allGrants();

    const counts = {
      all: rows.length,
      active: rows.filter((r) => r.state === "active").length,
      expiring: rows.filter((r) => r.state === "expiring").length,
      expired: rows.filter((r) => r.state === "expired").length,
    };

    const items = (view === "all" ? rows : rows.filter((r) => r.state === view)).sort(
      (a, b) => new Date(b.expiresAt || 0) - new Date(a.expiresAt || 0),
    );

    res.json({ items: items.slice(0, 400), counts, total: items.length });
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────────────── subscriptions ── */

/**
 * What a set of live licences is worth in a year, at today's prices.
 *
 * TWO DIFFERENT QUESTIONS, AND THIS ANSWERS ONLY ONE OF THEM
 *
 * "What is on the books" and "what was actually paid" are not the same figure
 * and must not be added together. An entitlement records a product, a seat
 * count and an expiry — it does NOT record what was paid for it, and nothing
 * links a licence back to the order that bought it. So:
 *
 *   - the RUN RATE below is arithmetic on today's price list: what it would
 *     cost to renew these licences for a year, right now. It is the planning
 *     number, and it is exact.
 *   - what customers HAVE paid is a separate total, taken from approved
 *     orders, and it carries the coupon discounts that were actually given.
 *     It is history, and it cannot be attributed to individual licences.
 *
 * Priced with getEffectivePrices — the same function checkout and the renewal
 * cron use — so a discount live on a product is reflected here rather than
 * this screen quoting a list price nobody is charged.
 */
function annualValue(grants, priceByKey) {
  let total = 0;
  let unpriced = 0;
  const byProduct = new Map();

  for (const g of grants) {
    const eff = priceByKey.get(String(g.product || "").toLowerCase());
    // A licence for something with no product record cannot be valued. Counted
    // and reported rather than silently treated as free, which would understate
    // the book and look like a smaller business.
    if (!eff || !eff.yearly) {
      unpriced += 1;
      continue;
    }
    const line = eff.yearly * (g.seats || 1);
    total += line;
    byProduct.set(g.product, (byProduct.get(g.product) || 0) + line);
  }

  return {
    total,
    unpriced,
    byProduct: [...byProduct.entries()]
      .map(([k, v]) => ({ k, v }))
      .sort((a, b) => b.v - a.v),
  };
}

router.get("/subscriptions", requireAuth, requirePermission("adminhub"), async (_req, res, next) => {
  try {
    const [rows, products, fx] = await Promise.all([
      allGrants(),
      Product.find({}).select("key name price isCourse").lean(),
      getFxRate().catch(() => 0.001),
    ]);

    const priceByKey = new Map(
      products.map((p) => [String(p.key || "").toLowerCase(), getEffectivePrices(p, "NGN", fx)]),
    );

    const renewing = rows.filter((r) => r.autoRenew);

    // The renewal book proper is empty, so the screen also reports what WOULD
    // be renewing if anybody had it switched on — the licences running out
    // inside a month. That is the number somebody actually wants from a
    // subscriptions screen, and it is honest about being a different question.
    const soon = rows
      .filter((r) => r.state === "expiring")
      .sort((a, b) => new Date(a.expiresAt || 0) - new Date(b.expiresAt || 0));

    const withCard = await User.countDocuments({
      "paymentMethod.authorizationCode": { $exists: true, $ne: "" },
    });

    const live = rows.filter((r) => r.state === "active" || r.state === "expiring");
    const onBooks = annualValue(live, priceByKey);
    const atRisk = annualValue(soon, priceByKey);

    // What has actually been taken, and what the coupons cost to take it.
    // Approved orders only — a pending order is money that has not arrived.
    //
    // The discount lives at `coupon.discountAmount`, NOT at a top-level
    // `discountAmount`. That distinction is invisible when you get it wrong:
    // Mongo sums a path that does not exist as zero, so an earlier version of
    // this reported that no discount had ever been given, on a system where
    // ten approved orders carry a coupon.
    //
    // There is a second figure for the same thing — totalBeforeDiscount minus
    // totalAmount — and on approved orders the two disagree by about ₦46,000.
    // The explicit field is used, because it is the one the checkout wrote
    // deliberately; the delta moves with VAT and with orders that never
    // recorded a "before" at all.
    const paid = await Purchase.aggregate([
      { $match: { status: "approved" } },
      {
        $group: {
          _id: null,
          gross: { $sum: { $ifNull: ["$totalAmount", 0] } },
          discount: { $sum: { $ifNull: ["$coupon.discountAmount", 0] } },
          orders: { $sum: 1 },
          withCoupon: {
            $sum: { $cond: [{ $gt: [{ $ifNull: ["$coupon.discountAmount", 0] }, 0] }, 1, 0] },
          },
        },
      },
    ]);
    const took = paid[0] || { gross: 0, discount: 0, orders: 0, withCoupon: 0 };

    res.json({
      items: renewing,
      lapsingSoon: soon.slice(0, 200),
      counts: { renewing: renewing.length, lapsingSoon: soon.length, withCard },
      value: {
        // Forward-looking: today's prices × the seats currently held.
        runRate: onBooks.total,
        runRateUnpriced: onBooks.unpriced,
        byProduct: onBooks.byProduct,
        liveLicences: live.length,
        // The slice of that run rate which lapses inside a month.
        atRisk: atRisk.total,
        atRiskUnpriced: atRisk.unpriced,
        atRiskLicences: soon.length,
        // Backward-looking: what customers were actually charged, and what the
        // discounts came to. History, not a forecast.
        taken: took.gross,
        discountGiven: took.discount,
        paidOrders: took.orders,
        couponOrders: took.withCoupon,
      },
    });
  } catch (err) {
    next(err);
  }
});

/* ────────────────────────────────────────────────────────── quotations ── */

router.get("/quotations", requireAuth, requirePermission("proposals"), async (req, res, next) => {
  try {
    const view = String(req.query.view || "all").toLowerCase();
    const q = view === "all" ? {} : { status: view };
    const rows = await Proposal.find(q).sort({ proposalDate: -1, createdAt: -1 }).limit(400).lean();

    const statuses = await Proposal.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]);
    const counts = { all: await Proposal.estimatedDocumentCount() };
    for (const s of statuses) counts[String(s._id || "none")] = s.n;

    const items = rows.map((p) => ({
      id: String(p._id),
      ref: p.proposalNumber || `#${String(p._id).slice(-6).toUpperCase()}`,
      built: p.proposalDate || p.createdAt,
      validUntil: p.validUntil || null,
      who: p.clientContact || p.clientFirm || "Unnamed client",
      org: p.clientFirm || "",
      email: p.clientEmail || "",
      lines: (p.items || []).length,
      what: (p.items || [])
        .map((i) => String(i.name || i.description || "").trim())
        .filter(Boolean)
        .slice(0, 3)
        .join(" · "),
      currency: p.currency || "NGN",
      net: n0(p.subtotal),
      discount: n0(p.discountAmount),
      gross: n0(p.total) || n0(p.subtotal) - n0(p.discountAmount),
      status: p.status || "draft",
    }));

    res.json({ items, counts });
  } catch (err) {
    next(err);
  }
});

/* ──────────────────────────────────────────────────────────── invoices ── */

router.get("/invoices", requireAuth, requirePermission("invoices"), async (req, res, next) => {
  try {
    const view = String(req.query.view || "all").toLowerCase();
    const q = view === "all" ? {} : { status: view };
    const rows = await Invoice.find(q).sort({ invoiceDate: -1, createdAt: -1 }).limit(400).lean();

    const statuses = await Invoice.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]);
    const counts = { all: await Invoice.estimatedDocumentCount() };
    for (const s of statuses) counts[String(s._id || "none")] = s.n;

    const items = rows.map((i) => {
      const due = i.dueDate ? Math.floor((Date.now() - new Date(i.dueDate).getTime()) / DAY) : null;
      return {
        id: String(i._id),
        ref: i.invoiceNumber || `#${String(i._id).slice(-6).toUpperCase()}`,
        issued: i.invoiceDate || i.createdAt,
        dueDate: i.dueDate || null,
        // An invoice past its due date and not paid is the only figure on this
        // register anybody chases, so it is computed rather than left to be
        // read off two columns.
        overdueDays: i.status !== "paid" && due > 0 ? due : 0,
        who: i.clientName || i.clientEmail || "Unnamed client",
        org: i.clientOrganization || "",
        email: i.clientEmail || "",
        currency: i.currency || "NGN",
        net: n0(i.subtotal),
        tax: n0(i.taxAmount ?? i.tax),
        discount: n0(i.discountAmount ?? i.discount),
        gross: n0(i.total),
        lines: (i.items || []).length,
        status: i.status || "draft",
      };
    });

    res.json({ items, counts });
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────────────────── coupons ──── */

router.get("/coupons", requireAuth, requirePermission("adminhub"), async (_req, res, next) => {
  try {
    const rows = await Coupon.find({}).sort({ createdAt: -1 }).limit(400).lean();

    const items = rows.map((c) => {
      const now = Date.now();
      const started = !c.startsAt || new Date(c.startsAt).getTime() <= now;
      const ended = c.endsAt && new Date(c.endsAt).getTime() < now;
      const spent = c.maxRedemptions > 0 && n0(c.redeemedCount) >= n0(c.maxRedemptions);

      // Four ways a coupon is not usable, and they are different: switched
      // off, not started, run out of uses, or past its date. A single
      // "inactive" would hide which.
      let state = "active";
      if (!c.isActive) state = "disabled";
      else if (!started) state = "pending";
      else if (ended) state = "expired";
      else if (spent) state = "spent";

      return {
        id: String(c._id),
        code: c.code || "",
        note: c.description || "",
        kind: c.type || "percent",
        value: n0(c.value),
        currency: c.currency || "NGN",
        minSubtotal: n0(c.minSubtotal),
        used: n0(c.redeemedCount),
        max: n0(c.maxRedemptions),
        startsAt: c.startsAt || null,
        endsAt: c.endsAt || null,
        appliesTo: c.appliesTo || [],
        isBanner: !!c.isBanner,
        state,
      };
    });

    const counts = { all: items.length };
    for (const i of items) counts[i.state] = (counts[i.state] || 0) + 1;

    res.json({ items, counts });
  } catch (err) {
    next(err);
  }
});

export default router;
