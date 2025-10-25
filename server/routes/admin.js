import express from "express";
import dayjs from "dayjs";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { Purchase } from "../models/Purchase.js"; // <-- IMPORTANT
import { autoEnrollFromPurchase } from "../util/autoEnroll.js";

const router = express.Router();

// Admin: list users
// routes/admin.js  (your existing admin router)
router.get("/users", requireAuth, requireAdmin, async (req, res) => {
  const { q } = req.query;
  const find = {};
  if (q) {
    const rx = new RegExp(String(q).trim(), "i");
    find.$or = [{ email: rx }, { username: rx }];
  }

  const list = await User.find(find, {
    email: 1,
    username: 1,
    role: 1,
    disabled: 1,
    entitlements: 1,
    createdAt: 1,
  }).sort({ createdAt: -1 });

  return res.json(list);
});

// small helper
function addMonthsToEntitlement(userDoc, productKey, monthsToAdd) {
  const now = dayjs();
  let ent = (userDoc.entitlements || []).find(
    (e) => e.productKey === productKey
  );

  if (!ent) {
    ent = {
      productKey,
      status: "active",
      expiresAt: now.add(monthsToAdd, "month").toDate(),
    };
    userDoc.entitlements.push(ent);
  } else {
    const base =
      ent.expiresAt && dayjs(ent.expiresAt).isAfter(now)
        ? dayjs(ent.expiresAt)
        : now;
    ent.status = "active";
    ent.expiresAt = base.add(monthsToAdd, "month").toDate();
  }
}

// Admin: set/extend entitlement (manual override tool you already had)
// body: { email, productKey, months, status }
router.post(
  "/users/entitlement",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const { email, productKey, months = 0, status } = req.body || {};
    const u = await User.findOne({ email });
    if (!u) return res.status(404).json({ error: "User not found" });

    const now = dayjs();
    let ent = u.entitlements.find((e) => e.productKey === productKey);

    if (!ent) {
      ent = {
        productKey,
        status: status || "active",
        expiresAt: (months
          ? now.add(months, "month")
          : now.add(1, "month")
        ).toDate(),
      };
      u.entitlements.push(ent);
    } else {
      if (typeof status === "string") ent.status = status;
      if (months > 0) {
        const base =
          ent.expiresAt && dayjs(ent.expiresAt).isAfter(now)
            ? dayjs(ent.expiresAt)
            : now;
        ent.expiresAt = base.add(months, "month").toDate();
      }
    }

    await u.save();
    return res.json({ ok: true, entitlements: u.entitlements });
  }
);

// Admin: list purchases (?status=pending|approved|rejected)
router.get("/purchases", requireAuth, requireAdmin, async (req, res) => {
  const q = {};
  if (req.query.status) q.status = req.query.status;
  const list = await Purchase.find(q).sort({ createdAt: -1 }).limit(500);
  return res.json(list);
});

// Admin: approve a purchase and apply entitlement(s)
// If purchase has `lines`, each line is applied. If it's a legacy single-product
// purchase, we fall back to productKey/requestedMonths.
router.post(
  "/purchases/:id/approve",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const purchase = await Purchase.findById(req.params.id);
    if (!purchase) return res.status(404).json({ error: "Purchase not found" });
    if (purchase.status !== "pending") {
      return res.status(400).json({ error: "Purchase not pending" });
    }

    const user = await User.findById(purchase.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    // If request includes an override for legacy single-product, use it.
    const overrideMonths = Number(req.body?.months);

    if (Array.isArray(purchase.lines) && purchase.lines.length > 0) {
      // Cart flow: apply each line
      purchase.lines.forEach((ln) => {
        // convert qty to months
        const months =
          ln.billingInterval === "yearly" ? (ln.qty || 0) * 12 : ln.qty || 0;
        if (months > 0) addMonthsToEntitlement(user, ln.productKey, months);
      });
    } else if (purchase.productKey) {
      // Legacy single-product flow
      const months = overrideMonths || purchase.requestedMonths || 1;
      addMonthsToEntitlement(user, purchase.productKey, months);
      purchase.approvedMonths = months;
    } else {
      return res
        .status(400)
        .json({ error: "Nothing to approve for this purchase" });
    }

    await user.save();

    purchase.status = "approved";
    purchase.decidedBy = req.user.email;
    purchase.decidedAt = new Date();
    await purchase.save();

    await autoEnrollFromPurchase(purchase);
    
    return res.json({
      ok: true,
      purchase,
      entitlements: user.entitlements,
      message: "Purchase approved and entitlements updated.",
    });
  }
);

// Admin: reject a purchase
router.post(
  "/purchases/:id/reject",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const p = await Purchase.findById(req.params.id);
    if (!p) return res.status(404).json({ error: "Purchase not found" });
    if (p.status !== "pending")
      return res.status(400).json({ error: "Purchase not pending" });

    p.status = "rejected";
    p.decidedBy = req.user.email;
    p.decidedAt = new Date();
    await p.save();

    return res.json({ ok: true, purchase: p });
  }
);

// POST /admin/users/reset-device { email }
// POST /admin/users/reset-device  { email, productKey }
router.post(
  "/users/reset-device",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const { email, productKey } = req.body || {};
    const u = await User.findOne({ email });
    if (!u) return res.status(404).json({ error: "User not found" });

    const ent = (u.entitlements || []).find((e) => e.productKey === productKey);
    if (!ent) return res.status(404).json({ error: "Entitlement not found" });

    ent.deviceFingerprint = undefined;
    ent.deviceBoundAt = undefined;
    u.refreshVersion += 1; // kick all current sessions
    await u.save();

    return res.json({ ok: true });
  }
);

export default router;
