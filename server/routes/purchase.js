// server/routes/purchase.js
import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { Purchase } from "../models/Purchase.js";
import { Product } from "../models/Product.js";
import { getFxRate } from "../util/fx.js";

const router = express.Router();
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

function toKobo(naira) {
  return Math.round(Number(naira || 0) * 100);
}

// (unchanged) POST "/" — simple pending order
router.post("/", requireAuth, async (req, res) => {
  const { productKey, months = 1 } = req.body || {};
  if (!productKey)
    return res.status(400).json({ error: "productKey required" });

  const p = await Purchase.create({
    userId: req.user._id,
    email: req.user.email,
    productKey,
    requestedMonths: Number(months) || 1,
    status: "pending",
  });

  return res.json({
    ok: true,
    purchase: p,
    message: "Purchase submitted and pending admin review.",
  });
});

// CART checkout -> Paystack init for NGN
router.post("/cart", requireAuth, async (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const currency = (req.body?.currency || "NGN").toUpperCase();

    if (!items.length) return res.status(400).json({ error: "items required" });
    if (!["NGN", "USD"].includes(currency))
      return res.status(400).json({ error: "currency must be NGN or USD" });

    const keys = [...new Set(items.map((i) => i.productKey))];
    const products = await Product.find({
      key: { $in: keys },
      isPublished: true,
    }).lean();
    const byKey = Object.fromEntries(products.map((p) => [p.key, p]));

    const fx = await getFxRate();
    const lines = [];
    let total = 0;

    for (const i of items) {
      const p = byKey[i.productKey];
      if (!p)
        return res
          .status(400)
          .json({ error: `Invalid product: ${i.productKey}` });

      const qty = Math.max(parseInt(i.qty || 1, 10), 1);
      const firstTime = !!i.firstTime;

      let unitNGN =
        p.billingInterval === "yearly"
          ? p.price?.yearlyNGN || 0
          : p.price?.monthlyNGN || 0;
      let installNGN = firstTime ? p.price?.installNGN || 0 : 0;

      let unit = unitNGN;
      let install = installNGN;

      if (currency === "USD") {
        const ovUnit =
          p.billingInterval === "yearly"
            ? p.price?.yearlyUSD
            : p.price?.monthlyUSD;
        const ovInstall = p.price?.installUSD;
        unit = ovUnit != null ? ovUnit : unitNGN * fx;
        install = ovInstall != null ? ovInstall : installNGN * fx;
        unit = Math.round((unit + Number.EPSILON) * 100) / 100;
        install = Math.round((install + Number.EPSILON) * 100) / 100;
      }

      const recurring = unit * qty;
      const lineTotal = recurring + install;

      lines.push({
        productKey: p.key,
        name: p.name,
        billingInterval: p.billingInterval,
        qty,
        unit,
        install,
        subtotal: lineTotal,
      });

      total += lineTotal;
    }

    const purchase = await Purchase.create({
      userId: req.user._id,
      email: req.user.email,
      currency,
      totalAmount: total,
      lines,
      status: "pending",
    });

    let paystackInit = null;
    if (currency === "NGN") {
      if (!PAYSTACK_SECRET) {
        return res.json({
          ok: true,
          simulated: true,
          purchaseId: purchase._id,
          lines,
          total,
          currency,
          message: "Paystack secret not set; simulated order created.",
        });
      }

      const initBody = {
        email: req.user.email,
        amount: toKobo(total),
        currency: "NGN",
        metadata: { purchaseId: purchase._id.toString() },
        callback_url: `${FRONTEND_URL}/checkout/thanks`, // <-- important
      };

      const psRes = await fetch(
        "https://api.paystack.co/transaction/initialize",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(initBody),
        }
      );

      const psJson = await psRes.json();
      if (!psRes.ok || !psJson.status) {
        return res
          .status(400)
          .json({ error: psJson?.message || "Paystack init failed" });
      }

      await Purchase.updateOne(
        { _id: purchase._id },
        { $set: { paystackRef: psJson.data.reference } }
      );

      paystackInit = {
        authorization_url: psJson.data.authorization_url,
        reference: psJson.data.reference,
      };
    }

    return res.json({
      ok: true,
      purchaseId: purchase._id,
      lines,
      total,
      currency,
      paystack: paystackInit,
      message:
        currency === "NGN"
          ? "Proceed to Paystack to complete payment."
          : "USD selected — implement USD flow or convert to NGN for Paystack.",
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Cart purchase failed" });
  }
});

// NEW: verify endpoint (used by Thank-You page)
router.get("/verify", async (req, res) => {
  try {
    const reference = (req.query.reference || "").trim();
    if (!reference)
      return res.status(400).json({ error: "reference required" });
    if (!PAYSTACK_SECRET)
      return res.status(400).json({ error: "Paystack not configured" });

    const psRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(
        reference
      )}`,
      {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
      }
    );
    const data = await psRes.json();
    if (!psRes.ok || !data.status) {
      return res
        .status(400)
        .json({ error: data?.message || "Verification failed" });
    }

    const paidOk = data.data?.status === "success";
    if (!paidOk) return res.json({ ok: false, status: data.data?.status });

    const purchase = await Purchase.findOne({ paystackRef: reference });
    if (!purchase)
      return res.json({ ok: false, message: "Purchase not found" });

    // Idempotent update
    if (!purchase.paid) {
      purchase.paid = true;
      purchase.status = "approved";
      await purchase.save();

      const { applyEntitlementsFromPurchase } = await import(
        "../util/applyEntitlements.js"
      );
      await applyEntitlementsFromPurchase(purchase);
      // optional: import here to avoid cycle
      const { autoEnrollFromPurchase } = await import("../util/autoEnroll.js");
      await autoEnrollFromPurchase(purchase);
    }

    return res.json({ ok: true, status: "success", purchaseId: purchase._id });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Verify failed" });
  }
});

export default router;
