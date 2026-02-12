// server/routes/ptrainings.js
import express from "express";
import { TrainingEvent } from "../models/TrainingEvent.js";
import { TrainingEnrollment } from "../models/TrainingEnrollment.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function getPaymentInstructions(amountNGN) {
  return {
    mode: "manual_transfer",
    amountNGN: Number(amountNGN || 0),
    currency: "NGN",
    bankName: process.env.ADLMPAY_BANK_NAME || "YOUR BANK NAME",
    accountName: process.env.ADLMPAY_ACCOUNT_NAME || "ADLM Studio",
    accountNumber: process.env.ADLMPAY_ACCOUNT_NUMBER || "0000000000",
    note:
      process.env.ADLMPAY_NOTE ||
      "After transfer, click “I’ve Paid / Continue”. Admin will confirm your payment.",
    whatsapp: process.env.ADLMPAY_WHATSAPP || "",
    supportEmail: process.env.ADLMPAY_SUPPORT_EMAIL || "",
  };
}

function computePricing(training) {
  const pricing = training?.pricing || {};
  const normal = Number(pricing?.normalNGN ?? training?.priceNGN ?? 0) || 0;
  const groupOf3 = Number(pricing?.groupOf3NGN ?? 0) || 0;
  const ebPrice = Number(pricing?.earlyBird?.priceNGN ?? 0) || 0;

  const ebEndsAtRaw = pricing?.earlyBird?.endsAt || null;
  const ebEndsAt = ebEndsAtRaw ? new Date(ebEndsAtRaw) : null;

  const now = new Date();
  const ebActive =
    ebPrice > 0 &&
    ebEndsAt &&
    !Number.isNaN(ebEndsAt.getTime()) &&
    now.getTime() < ebEndsAt.getTime();

  const payable = ebActive ? ebPrice : normal;
  const tier = ebActive ? "earlybird" : "normal";

  return { normal, groupOf3, ebPrice, ebEndsAt, ebActive, payable, tier };
}

/**
 * Public: list published events (for Products page)
 */
router.get(
  "/events",
  asyncHandler(async (_req, res) => {
    const list = await TrainingEvent.find({ isPublished: true })
      .sort({ startAt: 1, createdAt: -1 })
      .select(
        "title subtitle slug description startAt endAt priceNGN pricing capacityApproved flyerUrl location isFeatured sort",
      )
      .lean();

    res.json(list || []);
  }),
);

/**
 * Public: detail (used by PTrainingDetail.jsx)
 */
router.get(
  "/events/:id",
  asyncHandler(async (req, res) => {
    const ev = await TrainingEvent.findOne({
      _id: req.params.id,
      isPublished: true,
    }).lean();

    if (!ev) return res.status(404).json({ error: "Not found" });

    const approvedCount = await TrainingEnrollment.countDocuments({
      trainingId: ev._id,
      status: "approved",
    });

    res.json({ ...ev, approvedCount });
  }),
);

/**
 * ✅ Auth: Enroll in a training
 * POST /ptrainings/:id/enroll
 */
router.post(
  "/:id/enroll",
  requireAuth,
  asyncHandler(async (req, res) => {
    const training = await TrainingEvent.findById(req.params.id).lean();
    if (!training || !training.isPublished) {
      return res.status(404).json({ error: "Training not found" });
    }

    const pricing = computePricing(training);
    const isPaid = Number(pricing.payable || 0) > 0;

    // If already enrolled, return existing enrollmentId + payment info
    const existing = await TrainingEnrollment.findOne({
      trainingId: training._id,
      userId: req.user._id,
    });

    if (existing) {
      const amt = Number(existing?.payment?.amountNGN ?? pricing.payable ?? 0);

      const status0 = String(existing?.status || "").toLowerCase();
      const paidAlready = !!existing?.payment?.paid || status0 === "approved";

      const paymentState = String(
        existing?.payment?.raw?.state || "",
      ).toLowerCase();
      const paymentSubmitted = paymentState === "submitted";

      // ✅ Only show payment modal if user still needs to take action
      const needsManualPaymentAction =
        amt > 0 && !paidAlready && !paymentSubmitted;

      return res.json({
        enrollmentId: String(existing._id),
        manualPayment: needsManualPaymentAction,
        paymentSubmitted,
        paymentState,
        paymentInstructions: amt > 0 ? getPaymentInstructions(amt) : null,
      });
    }

    // Enforce cap on APPROVED slots
    const cap = Number(training.capacityApproved || 14);
    const approvedCount = await TrainingEnrollment.countDocuments({
      trainingId: training._id,
      status: "approved",
    });

    if (approvedCount >= cap) {
      return res
        .status(409)
        .json({ error: "Enrollment closed: capacity reached." });
    }

    const enr = new TrainingEnrollment({
      trainingId: training._id,
      userId: req.user._id,
      status: isPaid ? "payment_pending" : "form_pending",
      payment: {
        amountNGN: Number(pricing.payable || 0),
        paid: !isPaid,
        paidAt: !isPaid ? new Date() : null,
        raw: !isPaid
          ? {
              method: "free",
              state: "confirmed",
              confirmedAt: new Date().toISOString(),
              pricingTier: "free",
            }
          : {
              method: "manual_transfer",
              state: "pending",
              createdAt: new Date().toISOString(),
              pricingTier: pricing.tier,
            },
      },
      installation: { status: "none" },
    });

    await enr.save();

    res.json({
      enrollmentId: String(enr._id),
      manualPayment: isPaid,
      paymentSubmitted: false,
      paymentState: isPaid ? "pending" : "confirmed",
      paymentInstructions: isPaid
        ? getPaymentInstructions(pricing.payable)
        : null,
    });
  }),
);

/**
 * ✅ Auth: User submits manual transfer proof (+ optional receiptUrl)
 * POST /ptrainings/enrollments/:enrollmentId/payment-submitted
 */
router.post(
  "/enrollments/:enrollmentId/payment-submitted",
  requireAuth,
  asyncHandler(async (req, res) => {
    const enrollmentId = String(req.params.enrollmentId || "").trim();
    const enr = await TrainingEnrollment.findById(enrollmentId);
    if (!enr) return res.status(404).json({ error: "Enrollment not found" });

    if (String(enr.userId) !== String(req.user._id)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // ✅ If already approved, just return ok
    if (String(enr.status || "").toLowerCase() === "approved") {
      return res.json({ ok: true, enrollmentId: String(enr._id) });
    }

    const training = await TrainingEvent.findById(enr.trainingId).lean();
    if (!training) return res.status(404).json({ error: "Training not found" });

    const pricing = computePricing(training);
    const payable = Number(enr?.payment?.amountNGN ?? pricing.payable ?? 0);

    if (payable <= 0) {
      // free training: ensure paid
      enr.payment = enr.payment || {};
      enr.payment.amountNGN = 0;
      enr.payment.paid = true;
      enr.payment.paidAt = enr.payment.paidAt || new Date();
      enr.status =
        enr.status === "payment_pending" ? "form_pending" : enr.status;
      await enr.save();
      return res.json({ ok: true, enrollmentId: String(enr._id) });
    }

    const { note, payerName, bankName, reference, receiptUrl } = req.body || {};

    enr.payment = enr.payment || {};
    enr.payment.amountNGN = Number(enr.payment.amountNGN || payable || 0);
    if (reference) enr.payment.reference = String(reference);

    const prev =
      enr.payment.raw && typeof enr.payment.raw === "object"
        ? enr.payment.raw
        : {};

    enr.payment.raw = {
      ...prev,
      method: "manual_transfer",
      state: "submitted",
      submittedAt: new Date().toISOString(),
      note: note || prev.note || "",
      payerName: payerName || prev.payerName || "",
      bankName: bankName || prev.bankName || "",
      reference: reference || prev.reference || "",
      receiptUrl: receiptUrl || prev.receiptUrl || "",
    };

    // ✅ Unlock form after submission (do not override approved)
    if (String(enr.status || "").toLowerCase() === "payment_pending") {
      enr.status = "form_pending";
    }

    await enr.save();
    res.json({ ok: true, enrollmentId: String(enr._id) });
  }),
);

export default router;
