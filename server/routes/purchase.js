import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { Purchase } from "../models/Purchase.js";
import { Product } from "../models/Product.js";
import { getFxRate } from "../util/fx.js";
import { validateAndComputeDiscount } from "../util/coupons.js";
import { TrainingLocation } from "../models/TrainingLocation.js";

const router = express.Router();
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

const round2 = (x) => Math.round((Number(x || 0) + Number.EPSILON) * 100) / 100;

function pickBundleDiscount(p, periods) {
  const d = p?.discounts || null;
  if (!d) return null;

  if (p.billingInterval === "yearly") {
    return periods === 1 ? d.oneYear || null : null;
  }

  if (periods === 6) return d.sixMonths || null;
  if (periods === 12) return d.oneYear || null;
  return null;
}

function toMoney(x, currency) {
  return currency === "USD" ? round2(x) : Math.round(Number(x || 0));
}

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

    const purchaseLicenseType =
      String(req.body?.licenseType || "personal").toLowerCase() ===
      "organization"
        ? "organization"
        : "personal";

    const orgIn = req.body?.organization || null;
    let organization = undefined;

    if (purchaseLicenseType === "organization") {
      const name = String(orgIn?.name || "").trim();
      if (!name) {
        return res.status(400).json({
          error: "organization.name is required for organization purchases",
        });
      }

      organization = {
        name,
        email:
          String(orgIn?.email || "")
            .trim()
            .toLowerCase() || undefined,
        phone: String(orgIn?.phone || "").trim() || undefined,
      };
    }

    if (!items.length) return res.status(400).json({ error: "items required" });
    if (!["NGN", "USD"].includes(currency)) {
      return res.status(400).json({ error: "currency must be NGN or USD" });
    }

    const keys = [...new Set(items.map((i) => i.productKey).filter(Boolean))];
    if (!keys.length) return res.status(400).json({ error: "Invalid items" });

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

      const seats = Math.max(parseInt(i.seats ?? i.qty ?? 1, 10) || 1, 1);
      const periods = Math.max(parseInt(i.periods ?? 1, 10) || 1, 1);
      const firstTime = !!i.firstTime;

      const unitNGN =
        p.billingInterval === "yearly"
          ? Number(p.price?.yearlyNGN || 0)
          : Number(p.price?.monthlyNGN || 0);

      const installNGN = firstTime ? Number(p.price?.installNGN || 0) : 0;

      let unit = unitNGN;
      let install = installNGN;

      if (currency === "USD") {
        const ovUnit =
          p.billingInterval === "yearly"
            ? p.price?.yearlyUSD
            : p.price?.monthlyUSD;

        const ovInstall = p.price?.installUSD;

        unit = ovUnit != null ? Number(ovUnit) : unitNGN * fx;

        // ✅ FIX: only apply install override if firstTime is true
        install = firstTime
          ? ovInstall != null
            ? Number(ovInstall)
            : installNGN * fx
          : 0;

        unit = round2(unit);
        install = round2(install);
      } else {
        unit = Math.round(unit);
        install = Math.round(install);
      }

      // base recurring
      let recurring = unit * seats * periods;

      // bundle discount (recurring only)
      const disc = pickBundleDiscount(p, periods);

      if (disc?.type === "percent") {
        const pct = Number(disc.valueNGN || 0);
        const factor = Math.max(0, 1 - pct / 100);
        recurring = toMoney(recurring * factor, currency);
      }

      if (disc?.type === "fixed") {
        let fixedPerSeat = 0;

        if (currency === "USD") {
          if (disc.valueUSD != null) fixedPerSeat = Number(disc.valueUSD || 0);
          else fixedPerSeat = Number(disc.valueNGN || 0) * fx;
          fixedPerSeat = round2(fixedPerSeat);
        } else {
          fixedPerSeat = Math.round(Number(disc.valueNGN || 0));
        }

        if (fixedPerSeat > 0)
          recurring = toMoney(fixedPerSeat * seats, currency);
      }

      // install fee is per-seat
      const totalInstall = install * seats;
      const lineTotal = recurring + totalInstall;

      lines.push({
        productKey: p.key,
        name: p.name,
        billingInterval: p.billingInterval,

        qty: seats,
        periods,

        licenseType: purchaseLicenseType,
        organizationName: organization?.name || undefined,

        unit,
        install: totalInstall,
        subtotal:
          currency === "USD" ? round2(lineTotal) : Math.round(lineTotal),
      });

      total += lineTotal;
    }

    total = currency === "USD" ? round2(total) : Math.max(Math.round(total), 0);
    const totalBeforeDiscount = total;

    const couponRes = await validateAndComputeDiscount({
      code: couponCode,
      currency,
      subtotal: totalBeforeDiscount,
      productKeys: keys, // ✅ pass keys (if your coupon util supports it)
    });

    if (!couponRes.ok) return res.status(400).json({ error: couponRes.error });

    const discount = Number(couponRes.discount || 0);

    // ── Physical training add-on (organization only) ──
    let physicalTraining = undefined;
    const ptInput = req.body?.physicalTraining;

    if (purchaseLicenseType === "organization" && ptInput?.requested) {
      const loc = await TrainingLocation.findById(ptInput.locationId).lean();
      if (!loc || !loc.isActive) {
        return res
          .status(400)
          .json({ error: "Selected training location is not available" });
      }

      const trainingCost =
        currency === "USD"
          ? round2(Number(loc.trainingCostUSD || 0))
          : Math.round(Number(loc.trainingCostNGN || 0));

      let bimInstallCost = 0;
      if (ptInput.bimInstallRequested) {
        bimInstallCost =
          currency === "USD"
            ? round2(Number(loc.bimInstallCostUSD || 0))
            : Math.round(Number(loc.bimInstallCostNGN || 0));
      }

      physicalTraining = {
        requested: true,
        locationId: loc._id,
        locationName: loc.name,
        locationCity: loc.city || "",
        locationState: loc.state || "",
        locationAddress: loc.address || "",
        trainingCost,
        durationDays: loc.durationDays || 1,
        bimInstallRequested: !!ptInput.bimInstallRequested,
        bimInstallCost,
        status: "pending_date",
      };

      // Add training costs to total
      total += trainingCost + bimInstallCost;
      total =
        currency === "USD" ? round2(total) : Math.max(Math.round(total), 0);
    }

    const totalAfterDiscount =
      currency === "USD"
        ? Math.max(round2(total - discount), 0)
        : Math.max(Math.round(total - discount), 0);

    const purchase = await Purchase.create({
      userId: req.user._id,
      email: req.user.email,

      currency,
      totalBeforeDiscount: total,
      totalAmount: totalAfterDiscount,

      licenseType: purchaseLicenseType,
      organization,

      lines,
      physicalTraining,
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
    console.error("Cart purchase error:", e);
    return res.status(500).json({ error: "Cart purchase failed" });
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
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } },
    );

    const data = await psRes.json().catch(() => ({}));
    if (!psRes.ok || !data?.status) {
      return res
        .status(400)
        .json({ error: data?.message || "Verification failed" });
    }

    const paidOk = data?.data?.status === "success";
    if (!paidOk) return res.json({ ok: false, status: data?.data?.status });

    const purchase = await Purchase.findOneAndUpdate(
      { paystackRef: reference, paid: { $ne: true } },
      { $set: { paid: true, status: "approved" } },
      { new: true },
    );

    if (!purchase) {
      // Either not found or already paid — check which
      const existing = await Purchase.findOne({ paystackRef: reference });
      if (!existing)
        return res.json({ ok: false, message: "Purchase not found" });
      // Already paid — return success idempotently
      return res.json({ ok: true, status: "success", purchaseId: existing._id });
    }

    {

      const { applyEntitlementsFromPurchase } =
        await import("../util/applyEntitlements.js");
      await applyEntitlementsFromPurchase(purchase);

      const { autoEnrollFromPurchase } = await import("../util/autoEnroll.js");
      await autoEnrollFromPurchase(purchase);
    }

    return res.json({ ok: true, status: "success", purchaseId: purchase._id });
  } catch (e) {
    console.error("Payment verify error:", e);
    return res.status(500).json({ error: "Verify failed" });
  }
});

// Bank details served from env — keeps sensitive data out of frontend source
router.get("/bank-details", requireAuth, (_req, res) => {
  res.json({
    accountNumber: process.env.BANK_ACCOUNT_NUMBER || "1634998770",
    accountName: process.env.BANK_ACCOUNT_NAME || "ADLM Studio",
    bankName: process.env.BANK_NAME || "Access Bank",
  });
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

// Token-based training date confirmation (from email link, no auth required)
router.get("/confirm-training", async (req, res) => {
  try {
    const { orderId, token } = req.query;
    if (!orderId || !token) {
      return res.status(400).json({ error: "orderId and token are required" });
    }

    const purchase = await Purchase.findById(orderId);
    if (!purchase) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (!purchase.physicalTraining?.requested) {
      return res.status(400).json({ error: "No physical training on this order" });
    }

    if (purchase.physicalTraining.confirmToken !== token) {
      return res.status(403).json({ error: "Invalid or expired confirmation token" });
    }

    if (purchase.physicalTraining.status !== "date_proposed") {
      return res.status(400).json({ error: "Training date already confirmed or not yet proposed" });
    }

    purchase.physicalTraining.confirmedByUser = true;
    purchase.physicalTraining.confirmedAt = new Date();
    purchase.physicalTraining.status = "confirmed";
    purchase.physicalTraining.confirmToken = undefined;
    await purchase.save();

    // Redirect to frontend with success message
    const webUrl =
      String(process.env.PUBLIC_WEB_URL || process.env.PUBLIC_APP_URL || "").trim() ||
      "http://localhost:5173";
    return res.redirect(`${webUrl}/dashboard?notice=training_confirmed`);
  } catch (e) {
    console.error("confirm-training error:", e);
    return res.status(500).json({ error: "Confirmation failed" });
  }
});

export default router;
