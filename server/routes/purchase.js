import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { Purchase } from "../models/Purchase.js";
import { Product } from "../models/Product.js";
import { Setting } from "../models/Setting.js";
import { getFxRate } from "../util/fx.js";
import { validateAndComputeDiscount } from "../util/coupons.js";
import { TrainingLocation } from "../models/TrainingLocation.js";
import {
  round2,
  toMoney,
  getEffectivePrices,
  computeRecurring,
} from "../util/pricing.js";
import { saveCardAuthorization } from "../util/paymentMethods.js";
import multer from "multer";
import { uploadBufferToCloudinary } from "../utils/cloudinaryUpload.js";
import { notifyAdminOfPurchase } from "../util/purchaseAlert.js";
import { sendProformaInvoice } from "../util/proformaInvoice.js";

const router = express.Router();
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

// Organization licences normally start at 2 users. RateGen is the exception:
// firms buy it for a single estimator, so an org may take just 1 seat.
// Mirrored client-side in client/src/pages/Purchase.jsx.
const SINGLE_SEAT_ORG_KEYS = new Set(["rategen"]);
const minOrgSeatsFor = (key) =>
  SINGLE_SEAT_ORG_KEYS.has(String(key || "").toLowerCase()) ? 1 : 2;

// If you are on Node < 18, uncomment:
// import fetch from "node-fetch";

router.post("/", requireAuth, async (req, res) => {
  const { productKey, months = 1 } = req.body || {};
  if (!productKey)
    return res.status(400).json({ error: "productKey required" });

  const product = await Product.findOne({ key: productKey }).lean();
  if (!product || !product.isPublished || product.isComingSoon) {
    return res
      .status(400)
      .json({ error: "This product is not available for purchase yet." });
  }

  // Clamp the user-supplied duration — this legacy flow carries no price, so
  // the requested months feed straight into the grant on approval and must
  // not be attacker-controlled beyond sane plan lengths.
  const requestedMonths = Math.min(
    Math.max(parseInt(months, 10) || 1, 1),
    12,
  );

  const p = await Purchase.create({
    userId: req.user._id,
    email: req.user.email,
    productKey,
    requestedMonths,
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
    // Opt-in flag only — it never changes what is charged now. It marks the
    // entitlements granted by this purchase for the auto-renewal cron, which
    // recomputes the price server-side at renewal time.
    const autoRenewRequested = req.body?.autoRenew === true;

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

    // Fetched without the sellability filter, then filtered here, so the
    // reason a line cannot be bought is known rather than inferred.
    // "Invalid product: civil3d" was true but useless: CIVIQ is a real product
    // that we are still building, and telling a buyer their basket is invalid
    // when the honest answer is "that one is not finished yet" loses the sale
    // and the waitlist signup with it.
    const found = await Product.find({ key: { $in: keys } })
      .lean();

    const sellable = found.filter((p) => p.isPublished && !p.isComingSoon);
    const byKey = Object.fromEntries(sellable.map((p) => [p.key, p]));
    const products = sellable;

    // Anything the buyer asked for that cannot be sold today, with the reason.
    // Returned as data so the client can act on it — drop the line, explain the
    // build status, offer the waitlist — instead of parsing an error string.
    const unavailable = [];
    for (const key of keys) {
      if (byKey[key]) continue;
      const p = found.find((x) => x.key === key) || null;
      unavailable.push({
        key,
        name: p?.name || key,
        reason: !p ? "unknown" : p.isComingSoon ? "coming_soon" : "unpublished",
      });
    }

    if (unavailable.length) {
      const soon = unavailable.filter((u) => u.reason === "coming_soon");
      return res.status(400).json({
        error:
          soon.length === unavailable.length
            ? `${soon.map((u) => u.name).join(", ")} ${
                soon.length === 1 ? "is" : "are"
              } still in development and cannot be bought yet.`
            : `Some items cannot be bought: ${unavailable
                .map((u) => u.name)
                .join(", ")}.`,
        unavailable,
      });
    }
    const fx = await getFxRate();

    const lines = [];
    const storageAddons = []; // per-product project-storage slots (NGN only)
    const isNGN = currency === "NGN";
    let total = 0;

    for (const i of items) {
      const p = byKey[i.productKey];
      // Unreachable now that `unavailable` is computed above — kept so a future
      // change to that block cannot let an unpriced line through silently.
      if (!p) {
        return res.status(400).json({
          error: `That product is not available to buy right now.`,
          unavailable: [{ key: i.productKey, name: i.productKey, reason: "unknown" }],
        });
      }

      const seats = Math.max(parseInt(i.seats ?? i.qty ?? 1, 10) || 1, 1);
      const minSeats = minOrgSeatsFor(p.key);
      if (purchaseLicenseType === "organization" && seats < minSeats) {
        return res.status(400).json({
          error: `Organization licences require a minimum of ${minSeats} users for ${p.name}.`,
        });
      }
      let periods = Math.max(parseInt(i.periods ?? 1, 10) || 1, 1);
      // Yearly-billed products (courses) are capped at one year. Buyers pick
      // durations in months, so a client sending 12 here means "12 months" —
      // without this clamp it would be charged as 12 yearly periods (12×
      // the yearly price) and granted 144 months.
      if (p.billingInterval === "yearly") periods = 1;
      const firstTime = !!i.firstTime;

      const eff = getEffectivePrices(p, currency, fx);
      const unit = p.billingInterval === "yearly" ? eff.yearly : eff.monthly;
      const installPerSeat = firstTime ? eff.install : 0;
      const totalInstall = installPerSeat * seats;

      const recurring = computeRecurring({ p, eff, periods, seats, currency, fx });
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

      // Optional project-storage slots for this product (NGN only). Priced
      // authoritatively: storageSlotPriceNGN per 10-slot block, else 3% of the
      // active NGN price (mirrors the product page's displayed price).
      const storageBlocks = Math.max(parseInt(i.storageBlocks ?? 0, 10) || 0, 0);
      if (storageBlocks > 0 && isNGN) {
        const configured = Number(p.storageSlotPriceNGN);
        const activeNGN = p.billingInterval === "yearly" ? eff.yearly : eff.monthly;
        const unitPrice =
          Number.isFinite(configured) && configured > 0
            ? Math.round(configured)
            : Math.max(Math.round(Number(activeNGN || 0) * 0.03), 0);

        if (unitPrice > 0) {
          const storageSubtotal = Math.round(unitPrice * storageBlocks);
          storageAddons.push({
            productKey: p.key,
            blocks: storageBlocks,
            slotsPerBlock: 10,
            slots: storageBlocks * 10,
            unitPrice,
            subtotal: storageSubtotal,
            applied: false,
          });
          total += storageSubtotal;
        }
      }
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

    const subtotalAfterDiscount =
      currency === "USD"
        ? Math.max(round2(total - discount), 0)
        : Math.max(Math.round(total - discount), 0);

    // ── VAT (applied after discount, before final total) ──
    const settings = await Setting.findOne({ key: "global" }).lean();
    const vatEnabled = !!settings?.vatEnabled && !!settings?.vatApplyToPurchases;
    const vatPercent = vatEnabled
      ? Math.min(Math.max(Number(settings?.vatPercent || 0), 0), 100)
      : 0;
    const vatAmount = vatPercent > 0
      ? toMoney((subtotalAfterDiscount * vatPercent) / 100, currency)
      : 0;
    const vatLabel = vatPercent > 0
      ? `${settings?.vatLabel || "VAT"} ${vatPercent}%`
      : "";

    const totalWithVat = currency === "USD"
      ? round2(subtotalAfterDiscount + vatAmount)
      : Math.round(subtotalAfterDiscount + vatAmount);

    const purchase = await Purchase.create({
      userId: req.user._id,
      email: req.user.email,

      currency,
      totalBeforeDiscount: total,
      vatPercent,
      vatAmount,
      vatLabel,
      totalAmount: totalWithVat,

      licenseType: purchaseLicenseType,
      organization,

      lines,
      physicalTraining,
      storageAddons,
      status: "pending",
      autoRenewRequested,
      paymentMethod: PAYMENT_METHODS.has(String(req.body?.paymentMethod))
        ? String(req.body.paymentMethod)
        : "card",

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

    // Transfers and invoice requests need a human before the licence
    // activates, so tell the team now rather than waiting for someone to open
    // the admin list. Deliberately not awaited into the response: the buyer
    // should not wait on our SMTP, and a failed alert must not fail the order.
    if (purchase.paymentMethod !== "card") {
      notifyAdminOfPurchase(purchase, { reason: "new" }).then((sent) => {
        if (sent) {
          Purchase.updateOne(
            { _id: purchase._id },
            { $set: { adminNotifiedAt: new Date() } },
          ).catch(() => {});
        }
      });
    }

    // "Request invoice" said we would email a proforma invoice to the billing
    // contact, and nothing sent one. It goes to the billing email the buyer
    // gave, falling back to the account it was ordered from.
    let invoiceSentTo = null;
    if (purchase.paymentMethod === "invoice") {
      invoiceSentTo = String(
        purchase.organization?.email || purchase.email || req.user?.email || "",
      ).trim();
      if (invoiceSentTo) sendProformaInvoice(purchase, invoiceSentTo);
    }

    return res.json({
      ok: true,
      purchaseId: purchase._id,
      lines,
      totalBeforeDiscount,
      discount,
      vatPercent,
      vatAmount,
      vatLabel,
      total: totalWithVat,
      // Same figure under the name the rest of the app uses for it. The
      // checkout panel read `totalAmount`, found nothing, and rendered a Pay
      // button with no amount on it and a bank box with no Amount row.
      totalAmount: totalWithVat,
      currency,
      invoiceSentTo,
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

    const existing = await Purchase.findOne({ paystackRef: reference });
    if (!existing) return res.json({ ok: false, message: "Purchase not found" });
    if (existing.paid) {
      // Already paid — return success idempotently
      return res.json({ ok: true, status: "success", purchaseId: existing._id });
    }

    // The charge must cover the order in the order's currency — otherwise a
    // small self-initialized charge on the same reference would activate a
    // large order.
    const expectedMinor = Math.round(Number(existing.totalAmount || 0) * 100);
    const paidMinor = Number(data?.data?.amount || 0);
    const paidCurrency = String(data?.data?.currency || "").toUpperCase();
    if (paidCurrency !== existing.currency || paidMinor < expectedMinor) {
      console.error(
        `[purchase verify] amount/currency mismatch on ${reference}: paid ${paidMinor} ${paidCurrency}, expected ${expectedMinor} ${existing.currency}`,
      );
      return res
        .status(400)
        .json({ error: "Payment does not match the order amount" });
    }

    // Persist the reusable card token for auto-renewals. Best-effort: a
    // failure here must never block crediting a confirmed payment.
    await saveCardAuthorization(existing.userId, data?.data).catch((err) =>
      console.error("[purchase verify] save card failed:", err?.message || err),
    );

    const purchase = await Purchase.findOneAndUpdate(
      { paystackRef: reference, paid: { $ne: true } },
      {
        $set: {
          paid: true,
          status: "approved",
          // Entitlements are credited right below — mark them applied so a
          // later "mark installation complete" can't add the months again.
          "installation.entitlementsApplied": true,
          "installation.entitlementsAppliedAt": new Date(),
        },
      },
      { new: true },
    );

    if (!purchase) {
      // Raced with the webhook — it already credited. Idempotent success.
      return res.json({ ok: true, status: "success", purchaseId: existing._id });
    }

    try {
      const { applyEntitlementsFromPurchase } =
        await import("../util/applyEntitlements.js");
      await applyEntitlementsFromPurchase(purchase);

      const { autoEnrollFromPurchase } = await import("../util/autoEnroll.js");
      await autoEnrollFromPurchase(purchase);
    } catch (e) {
      // Crediting failed — clear the applied flag so admin can finish it via
      // the installation-complete flow. Payment itself stays recorded.
      await Purchase.updateOne(
        { _id: purchase._id },
        {
          $set: {
            "installation.entitlementsApplied": false,
            "installation.entitlementsAppliedAt": null,
          },
        },
      ).catch(() => {});
      throw e;
    }

    return res.json({ ok: true, status: "success", purchaseId: purchase._id });
  } catch (e) {
    console.error("Payment verify error:", e);
    return res.status(500).json({ error: "Verify failed" });
  }
});

// Start a Paystack card charge for a pending purchase. Amount and email come
// from the server-side Purchase record — the client only supplies the id, so
// a tampered frontend can never change what gets charged. Foreign cards pay
// in NGN too (their bank handles FX); 3DS runs inside the Paystack popup.
router.post("/:id/paystack/init", requireAuth, async (req, res) => {
  try {
    if (!PAYSTACK_SECRET)
      return res.status(400).json({ error: "Paystack not configured" });

    const p = await Purchase.findById(req.params.id);
    if (!p) return res.status(404).json({ error: "Purchase not found" });
    if (String(p.userId) !== String(req.user._id))
      return res.status(403).json({ error: "Not allowed" });
    if (p.paid) return res.status(400).json({ error: "Already paid" });
    if (p.status !== "pending")
      return res.status(400).json({ error: "Purchase is not pending" });

    // Card charges run in NGN only until the domiciliary account is set up.
    // USD-priced orders keep using manual transfer.
    if (p.currency !== "NGN")
      return res.status(400).json({
        error: "Card payment is available for NGN orders only",
      });

    const amountKobo = Math.round(Number(p.totalAmount || 0) * 100);
    if (!(amountKobo > 0))
      return res.status(400).json({ error: "Invalid order amount" });

    const webUrl = (
      process.env.PUBLIC_WEB_URL || "https://www.adlmstudio.net"
    ).replace(/\/$/, "");

    const psRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: p.email || req.user.email,
        amount: amountKobo,
        currency: "NGN",
        channels: ["card"],
        // Paystack appends ?trxref=..&reference=.. — Purchase.jsx verifies on
        // mount when it sees a reference (covers the hosted-page fallback and
        // popup flows that end in a redirect).
        callback_url: `${webUrl}/purchase`,
        metadata: { purchaseId: String(p._id) },
      }),
    });

    const data = await psRes.json().catch(() => ({}));
    if (!psRes.ok || !data?.status || !data?.data?.reference) {
      console.error(
        "[paystack init] failed:",
        data?.message || `HTTP ${psRes.status}`,
      );
      return res
        .status(502)
        .json({ error: data?.message || "Could not start card payment" });
    }

    // Store the reference before the user pays — /purchase/verify and the
    // webhook both look the purchase up by it.
    p.paystackRef = data.data.reference;
    await p.save();

    return res.json({
      ok: true,
      reference: data.data.reference,
      access_code: data.data.access_code,
      authorization_url: data.data.authorization_url,
    });
  } catch (e) {
    console.error("Paystack init error:", e);
    return res.status(500).json({ error: "Could not start card payment" });
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

// Which methods a buyer may choose. Kept beside the route rather than only in
// the schema so an unknown value is rejected at the door.
const PAYMENT_METHODS = new Set(["card", "transfer", "invoice"]);

// Receipt upload for a bank transfer.
//
// One file, images or PDF, 8MB. Memory storage so the buffer goes straight to
// Cloudinary without touching disk — the same shape support.js uses for
// screenshots.
const uploadReceipt = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(png|jpe?g|webp|heic|heif)$|^application\/pdf$/i.test(file.mimetype);
    cb(ok ? null : new Error("Upload a photo or a PDF of the receipt."), ok);
  },
}).single("receipt");

/**
 * POST /purchase/:id/receipt
 *
 * Replaces "send the receipt to us on WhatsApp". The proof now lives on the
 * order, so whoever approves it can see the evidence without leaving the
 * admin, and it is still there when a phone is replaced.
 */
router.post("/:id/receipt", requireAuth, (req, res) => {
  uploadReceipt(req, res, async (err) => {
    if (err) {
      const msg =
        err.code === "LIMIT_FILE_SIZE"
          ? "That file is larger than 8MB — please upload a smaller photo."
          : err.message || "That file could not be read.";
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: "No receipt was attached." });

    try {
      const p = await Purchase.findById(req.params.id);
      if (!p) return res.status(404).json({ error: "Purchase not found" });
      if (String(p.userId) !== String(req.user._id)) {
        return res.status(403).json({ error: "Not allowed" });
      }
      // An approved order is settled; a new receipt against it is either a
      // mistake or an attempt to overwrite the evidence for a decision that
      // has already been made.
      if (p.status !== "pending") {
        return res.status(400).json({ error: "This purchase has already been decided." });
      }

      const isPdf = /pdf$/i.test(req.file.mimetype);
      const up = await uploadBufferToCloudinary(req.file.buffer, {
        folder: process.env.CLOUDINARY_RECEIPTS_FOLDER || "adlm/receipts",
        resourceType: isPdf ? "raw" : "image",
      });

      p.paymentProof = {
        url: up.secure_url,
        publicId: up.public_id,
        filename: req.file.originalname || "",
        bytes: req.file.size || 0,
        uploadedAt: new Date(),
      };
      // Uploading the receipt IS the buyer saying they have paid.
      if (!p.userConfirmedAt) p.userConfirmedAt = new Date();
      if (p.paymentMethod === "card") p.paymentMethod = "transfer";
      await p.save();

      const sent = await notifyAdminOfPurchase(p, { reason: "receipt" });
      if (sent) {
        p.adminNotifiedAt = new Date();
        await p.save();
      }

      return res.json({
        ok: true,
        receiptUrl: up.secure_url,
        message: "Receipt received. We will confirm your licence shortly.",
      });
    } catch (e) {
      console.error("[purchase] receipt upload failed:", e?.message || e);
      return res
        .status(500)
        .json({ error: "We could not save that receipt — please try again." });
    }
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
