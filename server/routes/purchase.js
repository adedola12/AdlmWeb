import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { Purchase } from "../models/Purchase.js";
import { Product } from "../models/Product.js";
import { getFxRate } from "../util/fx.js";
import { validateAndComputeDiscount } from "../util/coupons.js";

const router = express.Router();
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

// If you are on Node < 18, uncomment:
// import fetch from "node-fetch";

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

router.post("/cart", requireAuth, async (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const currency = String(req.body?.currency || "NGN").toUpperCase();
    const couponCode = String(req.body?.couponCode || "").trim();

    if (!items.length) return res.status(400).json({ error: "items required" });
    if (!["NGN", "USD"].includes(currency)) {
      return res.status(400).json({ error: "currency must be NGN or USD" });
    }

    const keys = [...new Set(items.map((i) => i.productKey).filter(Boolean))];
    if (!keys.length) return res.status(400).json({ error: "Invalid items" });

    const products = await Product.find({ key: { $in: keys }, isPublished: true }).lean();
    const byKey = Object.fromEntries(products.map((p) => [p.key, p]));
    const fx = await getFxRate();

    const lines = [];
    let total = 0;

    for (const i of items) {
      const p = byKey[i.productKey];
      if (!p) return res.status(400).json({ error: `Invalid product: ${i.productKey}` });

      const seats = Math.max(parseInt(i.seats ?? i.qty ?? 1, 10), 1);
      const periods = Math.max(parseInt(i.periods ?? 1, 10), 1);
      const firstTime = !!i.firstTime;

      const licenseType =
        String(i.licenseType || "personal").toLowerCase() === "organization"
          ? "organization"
          : "personal";

      const unitNGN =
        p.billingInterval === "yearly"
          ? Number(p.price?.yearlyNGN || 0)
          : Number(p.price?.monthlyNGN || 0);

      const installNGN = firstTime ? Number(p.price?.installNGN || 0) : 0;

      let unit = unitNGN;
      let install = installNGN;

      if (currency === "USD") {
        const ovUnit =
          p.billingInterval === "yearly" ? p.price?.yearlyUSD : p.price?.monthlyUSD;
        const ovInstall = p.price?.installUSD;

        unit = ovUnit != null ? Number(ovUnit) : unitNGN * fx;
        install = ovInstall != null ? Number(ovInstall) : installNGN * fx;

        unit = Math.round((unit + Number.EPSILON) * 100) / 100;
        install = Math.round((install + Number.EPSILON) * 100) / 100;
      } else {
        unit = Math.round(unit);
        install = Math.round(install);
      }

      // ✅ recurring is per-seat per-period
      const recurring = unit * seats * periods;
      const lineTotal = recurring + install;

      lines.push({
        productKey: p.key,
        name: p.name,
        billingInterval: p.billingInterval,
        qty: seats,
        periods,
        licenseType,
        unit,
        install,
        subtotal:
          currency === "USD"
            ? Math.round((lineTotal + Number.EPSILON) * 100) / 100
            : Math.round(lineTotal),
      });

      total += lineTotal;
    }

    total =
      currency === "USD"
        ? Math.round((total + Number.EPSILON) * 100) / 100
        : Math.max(Math.round(total), 0);

    const totalBeforeDiscount = total;

    const couponRes = await validateAndComputeDiscount({
      code: couponCode,
      currency,
      subtotal: totalBeforeDiscount,
    });

    if (!couponRes.ok) return res.status(400).json({ error: couponRes.error });

    const discount = Number(couponRes.discount || 0);

    const totalAfterDiscount =
      currency === "USD"
        ? Math.max(Math.round((totalBeforeDiscount - discount + Number.EPSILON) * 100) / 100, 0)
        : Math.max(Math.round(totalBeforeDiscount - discount), 0);

    const purchase = await Purchase.create({
      userId: req.user._id,
      email: req.user.email,
      currency,
      totalBeforeDiscount,
      totalAmount: totalAfterDiscount,
      lines,
      status: "pending",
      coupon: couponRes.coupon
        ? {
            code: couponRes.coupon.code,
            type: couponRes.coupon.type,
            value: couponRes.coupon.value,
            currency: couponRes.coupon.currency,
            discountAmount: discount,
            couponId: couponRes.coupon._id,
            redeemedApplied: false,
          }
        : undefined,
    });

    return res.json({
      ok: true,
      purchaseId: purchase._id,
      lines,
      totalBeforeDiscount,
      discount,
      total: totalAfterDiscount,
      currency,
      coupon: purchase.coupon?.code ? { code: purchase.coupon.code } : null,
      paystack: null,
      message:
        "Manual payment requested. Please pay to the provided account and click 'I have paid' in the client UI. Admin will verify.",
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Cart purchase failed" });
  }
});


// verify endpoint (Thank-You page)
router.get("/verify", async (req, res) => {
  try {
    const reference = String(req.query.reference || "").trim();
    if (!reference)
      return res.status(400).json({ error: "reference required" });
    if (!PAYSTACK_SECRET)
      return res.status(400).json({ error: "Paystack not configured" });

    const psRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(
        reference
      )}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
    );

    const data = await psRes.json().catch(() => ({}));
    if (!psRes.ok || !data?.status) {
      return res
        .status(400)
        .json({ error: data?.message || "Verification failed" });
    }

    const paidOk = data?.data?.status === "success";
    if (!paidOk) return res.json({ ok: false, status: data?.data?.status });

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

      const { autoEnrollFromPurchase } = await import("../util/autoEnroll.js");
      await autoEnrollFromPurchase(purchase);
    }

    return res.json({ ok: true, status: "success", purchaseId: purchase._id });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Verify failed" });
  }
});

router.post("/:id/confirm-manual", requireAuth, async (req, res) => {
  const p = await Purchase.findById(req.params.id);
  if (!p) return res.status(404).json({ error: "Purchase not found" });

  if (String(p.userId) !== String(req.user._id)) {
    return res.status(403).json({ error: "Not allowed" });
  }

  if (p.status !== "pending") {
    return res.status(400).json({ error: "Purchase is not pending" });
  }

  p.userConfirmedAt = new Date();
  await p.save();

  return res.json({ ok: true, message: "Payment confirmation received." });
});

export default router;
