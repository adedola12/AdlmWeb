// server/routes/me.billing.js
// Profile → Billing: saved card + per-product auto-renew toggles.
// The card object returned here is display metadata only — the Paystack
// authorization token is select:false on the schema and never serialized.
import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { Product } from "../models/Product.js";
import { removeCardAuthorization } from "../util/paymentMethods.js";

const router = express.Router();

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function cardView(pm) {
  if (!pm?.reusable || !pm?.last4) return null;
  return {
    cardType: pm.cardType || "",
    last4: pm.last4,
    expMonth: pm.expMonth || "",
    expYear: pm.expYear || "",
    bank: pm.bank || "",
    savedAt: pm.savedAt || null,
  };
}

// GET /me/billing → { card, subscriptions[] }
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id)
      .select("entitlements paymentMethod")
      .lean();
    if (!user) return res.status(404).json({ error: "User not found" });

    const ents = user.entitlements || [];
    const products = await Product.find({})
      .select("key name billingInterval")
      .lean();
    const nameByKey = new Map(
      products.map((p) => [String(p.key || "").toLowerCase(), p.name || p.key]),
    );

    const subscriptions = ents
      .filter((e) => e.productKey)
      .map((e) => ({
        productKey: e.productKey,
        productName:
          nameByKey.get(String(e.productKey).toLowerCase()) || e.productKey,
        status: e.status || "inactive",
        expiresAt: e.expiresAt || null,
        seats: e.seats || 1,
        autoRenew: e.autoRenew === true,
        autoRenewMonths: e.autoRenewMonths || 1,
        lastRenewalError: e.renewal?.lastError || "",
      }));

    res.json({ card: cardView(user.paymentMethod), subscriptions });
  }),
);

// POST /me/billing/autorenew { productKey, autoRenew, months? }
router.post(
  "/autorenew",
  requireAuth,
  asyncHandler(async (req, res) => {
    const productKey = String(req.body?.productKey || "")
      .trim()
      .toLowerCase();
    const enable = req.body?.autoRenew === true;
    if (!productKey)
      return res.status(400).json({ error: "productKey required" });

    const user = await User.findById(req.user._id).select(
      "entitlements paymentMethod",
    );
    if (!user) return res.status(404).json({ error: "User not found" });

    const ent = (user.entitlements || []).find(
      (e) => e.productKey === productKey,
    );
    if (!ent)
      return res
        .status(404)
        .json({ error: "No subscription found for this product" });

    if (enable && !user.paymentMethod?.reusable) {
      return res.status(400).json({
        error:
          "No saved card. Pay for a purchase by card first — the card is saved automatically for renewals.",
      });
    }

    ent.autoRenew = enable;
    if (enable) {
      const months = parseInt(req.body?.months, 10);
      if (Number.isFinite(months) && months >= 1) {
        ent.autoRenewMonths = Math.min(months, 12);
      } else if (!ent.autoRenewMonths || ent.autoRenewMonths < 1) {
        ent.autoRenewMonths = 1;
      }
      // Fresh opt-in ⇒ fresh retry budget for the current expiry.
      ent.renewal = {
        attempts: 0,
        lastAttemptAt: null,
        lastError: "",
        cycleExpiryAt: ent.expiresAt || null,
      };
    }

    await user.save();
    res.json({
      ok: true,
      productKey,
      autoRenew: ent.autoRenew,
      autoRenewMonths: ent.autoRenewMonths,
    });
  }),
);

// DELETE /me/billing/card — forget the stored authorization (and switch off
// every auto-renew flag, since renewals are impossible without it).
router.delete(
  "/card",
  requireAuth,
  asyncHandler(async (req, res) => {
    await removeCardAuthorization(req.user._id);
    res.json({ ok: true });
  }),
);

export default router;
