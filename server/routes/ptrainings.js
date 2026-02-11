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

/**
 * Public: list published events (for Products page)
 */
router.get(
  "/events",
  asyncHandler(async (req, res) => {
    const list = await TrainingEvent.find({ isPublished: true })
      .sort({ startAt: 1, createdAt: -1 })
      .select(
        "title subtitle slug description startAt endAt priceNGN capacityApproved flyerUrl location isFeatured sort",
      )
      .lean();

    res.json(list || []);
  }),
);

/**
 * Public: detail (used by PTrainingDetail.jsx)
 * ✅ includes approvedCount so UI can show “approved/capacity”
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
 * ✅ Auth: Enroll in a training (called by PTrainingDetail.jsx)
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

    // If already enrolled, return existing enrollmentId + payment mode
    const existing = await TrainingEnrollment.findOne({
      trainingId: training._id,
      userId: req.user._id,
    });

    const isPaid = Number(training.priceNGN || 0) > 0;

    if (existing) {
      return res.json({
        enrollmentId: String(existing._id),
        manualPayment: isPaid,
        paymentInstructions: isPaid
          ? getPaymentInstructions(training.priceNGN)
          : null,
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

    // Create enrollment
    const enr = new TrainingEnrollment({
      trainingId: training._id,
      userId: req.user._id,
      status: isPaid ? "payment_pending" : "form_pending",
      payment: {
        amountNGN: Number(training.priceNGN || 0),
        paid: !isPaid, // free => paid=true so form unlocks immediately
        paidAt: !isPaid ? new Date() : null,
        raw: !isPaid
          ? {
              method: "free",
              state: "confirmed",
              confirmedAt: new Date().toISOString(),
            }
          : {
              method: "manual_transfer",
              state: "pending",
              createdAt: new Date().toISOString(),
            },
      },
      installation: { status: "none" },
    });

    await enr.save();

    res.json({
      enrollmentId: String(enr._id),
      manualPayment: isPaid,
      paymentInstructions: isPaid
        ? getPaymentInstructions(training.priceNGN)
        : null,
    });
  }),
);

/**
 * ✅ Auth: User submits manual transfer proof (called by PTrainingDetail + portal)
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

    const training = await TrainingEvent.findById(enr.trainingId).lean();
    if (!training) return res.status(404).json({ error: "Training not found" });

    const isPaid = Number(training.priceNGN || 0) > 0;
    if (!isPaid) {
      // free trainings: nothing to submit, but keep it safe
      enr.payment = enr.payment || {};
      enr.payment.paid = true;
      enr.payment.paidAt = enr.payment.paidAt || new Date();
      enr.status =
        enr.status === "payment_pending" ? "form_pending" : enr.status;
      await enr.save();
      return res.json({ ok: true, enrollmentId: String(enr._id) });
    }

    const { note, payerName, bankName, reference } = req.body || {};

    enr.payment = enr.payment || {};
    enr.payment.amountNGN = Number(
      enr.payment.amountNGN || training.priceNGN || 0,
    );
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
    };

    // Unlock form after submission
    if (enr.status === "payment_pending") enr.status = "form_pending";

    await enr.save();
    res.json({ ok: true, enrollmentId: String(enr._id) });
  }),
);

export default router;
