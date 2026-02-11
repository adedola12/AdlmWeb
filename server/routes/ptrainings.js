// server/routes/ptrainings.js
import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { TrainingEvent } from "../models/TrainingEvent.js";
import { TrainingEnrollment } from "../models/TrainingEnrollment.js";

const router = express.Router();

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function clientUrl() {
  return (
    process.env.CLIENT_URL ||
    process.env.FRONTEND_URL ||
    "http://localhost:5173"
  );
}

/** ✅ ADLM manual payment instructions (env-driven) */
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

/* =========================================================
   ❌ PAYSTACK (COMMENTED OUT for PTrainings manual flow)
   Keep this here in case you want to re-enable later.
========================================================= */

// async function paystackInit({ email, amountNGN, callbackUrl, metadata }) {
//   const secret = process.env.PAYSTACK_SECRET_KEY;
//   if (!secret) throw new Error("Missing PAYSTACK_SECRET_KEY in env");

//   const resp = await fetch("https://api.paystack.co/transaction/initialize", {
//     method: "POST",
//     headers: {
//       Authorization: `Bearer ${secret}`,
//       "Content-Type": "application/json",
//     },
//     body: JSON.stringify({
//       email,
//       amount: Math.round(Number(amountNGN) * 100), // kobo
//       callback_url: callbackUrl,
//       metadata: metadata || {},
//     }),
//   });

//   const json = await resp.json();
//   if (!json?.status) {
//     const msg = json?.message || "Paystack init failed";
//     throw new Error(msg);
//   }

//   return {
//     authorizationUrl: json.data.authorization_url,
//     reference: json.data.reference,
//     accessCode: json.data.access_code,
//   };
// }

// async function paystackVerify(reference) {
//   const secret = process.env.PAYSTACK_SECRET_KEY;
//   if (!secret) throw new Error("Missing PAYSTACK_SECRET_KEY in env");

//   const resp = await fetch(
//     `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
//     { headers: { Authorization: `Bearer ${secret}` } },
//   );
//   const json = await resp.json();
//   return json;
// }

/* -------------------- PUBLIC -------------------- */

router.get(
  "/featured",
  asyncHandler(async (_req, res) => {
    const item = await TrainingEvent.findOne({
      isPublished: true,
      isFeatured: true,
    })
      .sort({ sort: -1, createdAt: -1 })
      .lean();
    res.json(item || null);
  }),
);

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const list = await TrainingEvent.find({ isPublished: true })
      .sort({ sort: -1, startAt: 1, createdAt: -1 })
      .lean();
    res.json(list);
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const item = await TrainingEvent.findById(req.params.id).lean();
    if (!item || (!item.isPublished && process.env.NODE_ENV === "production")) {
      return res.status(404).json({ error: "Not found" });
    }

    const approvedCount = await TrainingEnrollment.countDocuments({
      trainingId: item._id,
      status: "approved",
    });

    res.json({ ...item, approvedCount });
  }),
);

/* -------------------- AUTH: ENROLL (MANUAL PAYMENT) -------------------- */

/**
 * Enroll:
 * - creates/returns enrollment
 * - for FREE: auto-unlocks form
 * - for PAID: returns manual transfer instructions (no paystack)
 */
router.post(
  "/:id/enroll",
  requireAuth,
  asyncHandler(async (req, res) => {
    const training = await TrainingEvent.findById(req.params.id).lean();
    if (!training || !training.isPublished) {
      return res.status(404).json({ error: "Training not available" });
    }

    // cap check uses APPROVED only (same as your current logic)
    const approvedCount = await TrainingEnrollment.countDocuments({
      trainingId: training._id,
      status: "approved",
    });

    if (approvedCount >= (training.capacityApproved || 14)) {
      return res
        .status(409)
        .json({ error: "Enrollment closed (capacity reached)." });
    }

    // unique index trainingId+userId (expected)
    let enrollment = await TrainingEnrollment.findOne({
      trainingId: training._id,
      userId: req.user._id,
    });

    // already in progress / done
    if (
      enrollment &&
      [
        "approved",
        "submitted",
        "form_pending",
        "payment_pending",
        "payment_submitted",
      ].includes(enrollment.status)
    ) {
      const amount = Number(training.priceNGN || 0);
      const instructions = amount > 0 ? getPaymentInstructions(amount) : null;

      return res.json({
        ok: true,
        enrollmentId: enrollment._id,
        status: enrollment.status,
        manualPayment: amount > 0,
        paymentInstructions: instructions,
        checkoutUrl: `${clientUrl()}/ptrainings/enrollment/${enrollment._id}`,
      });
    }

    if (!enrollment) {
      enrollment = await TrainingEnrollment.create({
        trainingId: training._id,
        userId: req.user._id,
        status: "payment_pending",
        payment: {
          amountNGN: Number(training.priceNGN || 0),
          paid: false,
          // reusing reference field to track manual payments
          reference: `MANUAL-${String(req.user._id).slice(-6)}-${Date.now()}`,
          // raw is typically Mixed; safe to store manual meta
          raw: { method: "manual_transfer", state: "pending" },
        },
        installation: { status: "not_started" },
      });
    }

    const amount = Number(training.priceNGN || 0);

    // FREE training => unlock form immediately
    if (amount <= 0) {
      enrollment.payment = enrollment.payment || {};
      enrollment.payment.paid = true;
      enrollment.payment.paidAt = new Date();
      enrollment.status = "form_pending";
      await enrollment.save();

      return res.json({
        ok: true,
        enrollmentId: enrollment._id,
        status: enrollment.status,
        checkoutUrl: `${clientUrl()}/ptrainings/enrollment/${enrollment._id}`,
      });
    }

    // PAID training => manual instructions (no paystack redirect)
    const paymentInstructions = getPaymentInstructions(amount);

    enrollment.status = "payment_pending";
    enrollment.payment = enrollment.payment || {};
    enrollment.payment.amountNGN = amount;
    enrollment.payment.paid = false;
    enrollment.payment.raw = {
      ...(enrollment.payment.raw || {}),
      method: "manual_transfer",
      state: "pending",
    };
    await enrollment.save();

    return res.json({
      ok: true,
      enrollmentId: enrollment._id,
      status: enrollment.status,
      manualPayment: true,
      paymentInstructions,
      checkoutUrl: `${clientUrl()}/ptrainings/enrollment/${enrollment._id}`,
    });
  }),
);

/**
 * User confirms they've made a transfer (manual).
 * This does NOT mark paid=true; admin will confirm later.
 * We unlock the form by moving to form_pending.
 */
router.post(
  "/enrollments/:enrollmentId/payment-submitted",
  requireAuth,
  asyncHandler(async (req, res) => {
    const enrollmentId = String(req.params.enrollmentId || "").trim();
    const note = String(req.body?.note || "").trim();
    const payerName = String(req.body?.payerName || "").trim();
    const bankName = String(req.body?.bankName || "").trim();
    const reference = String(req.body?.reference || "").trim();

    const enr = await TrainingEnrollment.findById(enrollmentId);
    if (!enr) return res.status(404).json({ error: "Enrollment not found" });
    if (String(enr.userId) !== String(req.user._id)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    enr.payment = enr.payment || {};
    enr.payment.paid = false;

    // keep existing reference if already set
    enr.payment.reference = reference || enr.payment.reference || "";

    enr.payment.raw = {
      ...(enr.payment.raw || {}),
      method: "manual_transfer",
      state: "submitted",
      submittedAt: new Date().toISOString(),
      payerName,
      bankName,
      note,
    };

    // unlock form
    if (!["submitted", "approved"].includes(enr.status)) {
      enr.status = "form_pending";
    }

    await enr.save();

    return res.json({
      ok: true,
      enrollmentId: enr._id,
      status: enr.status,
      message: "Payment submission received. Awaiting admin confirmation.",
    });
  }),
);

export default router;
