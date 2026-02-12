// server/routes/ptrainings.js
import express from "express";
import { TrainingEvent } from "../models/TrainingEvent.js";
import { TrainingEnrollment } from "../models/TrainingEnrollment.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function isStrictObjectId(id) {
  return typeof id === "string" && /^[0-9a-fA-F]{24}$/.test(id);
}

// ✅ Find a published training by either Mongo _id or slug.
// Keeps old links working, and enables new slug links.
async function findPublishedTrainingByKey(keyRaw) {
  const key = String(keyRaw || "").trim();
  if (!key) return null;

  // 1) try _id if it looks like ObjectId
  if (isStrictObjectId(key)) {
    const byId = await TrainingEvent.findOne({
      _id: key,
      isPublished: true,
    }).lean();
    if (byId) return byId;
    // if not found, fallback to slug (covers edge-case slug that is 24-hex)
  }

  // 2) slug (store slug lowercase)
  const slug = key.toLowerCase();
  return await TrainingEvent.findOne({ slug, isPublished: true }).lean();
}

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
 * Public: list published events
 */
router.get(
  "/events",
  asyncHandler(async (_req, res) => {
    const list = await TrainingEvent.find({ isPublished: true })
      .sort({ startAt: 1, createdAt: -1 })
      .select(
        "title subtitle slug description startAt endAt priceNGN pricing capacityApproved flyerUrl location isFeatured sort media whatYouGet requirements",
      )
      .lean();

    res.json(list || []);
  }),
);

/**
 * ✅ Public: detail by :key (slug or id)
 * GET /ptrainings/events/:key
 */
router.get(
  "/events/:key",
  asyncHandler(async (req, res) => {
    const ev = await findPublishedTrainingByKey(req.params.key);
    if (!ev) return res.status(404).json({ error: "Not found" });

    // ✅ count approved (support old enrollments where trainingId may be stored as string)
    const approvedCount = await TrainingEnrollment.countDocuments({
      status: "approved",
      $or: [{ trainingId: ev._id }, { trainingId: String(ev._id) }],
    });

    res.json({ ...ev, approvedCount });
  }),
);

/**
 * ✅ Auth: Enroll by :key (slug or id)
 * POST /ptrainings/:key/enroll
 */
router.post(
  "/:key/enroll",
  requireAuth,
  asyncHandler(async (req, res) => {
    const training = await findPublishedTrainingByKey(req.params.key);
    if (!training) {
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

      // Only show payment modal if user still needs to take action
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
      status: "approved",
      $or: [{ trainingId: training._id }, { trainingId: String(training._id) }],
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
 * Auth: User submits manual transfer proof (+ optional receiptUrl)
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

    // If already approved, just return ok
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

    // Unlock form after submission (do not override approved)
    if (String(enr.status || "").toLowerCase() === "payment_pending") {
      enr.status = "form_pending";
    }

    await enr.save();
    res.json({ ok: true, enrollmentId: String(enr._id) });
  }),
);

export default router;
