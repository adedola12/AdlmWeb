// server/routes/me-ptrainings.js
import express from "express";
import dayjs from "dayjs";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth.js";
import { TrainingEvent } from "../models/TrainingEvent.js";
import { TrainingEnrollment } from "../models/TrainingEnrollment.js";

const router = express.Router();
router.use(requireAuth);

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

function resolveTrainingFeeNGN(training) {
  const legacy = Number(training?.priceNGN || 0) || 0;
  const normal = Number(training?.pricing?.normalNGN ?? legacy ?? 0) || 0;

  const ebPrice = Number(training?.pricing?.earlyBird?.priceNGN || 0) || 0;
  const ebEndsAt = training?.pricing?.earlyBird?.endsAt
    ? new Date(training.pricing.earlyBird.endsAt)
    : null;

  const now = new Date();
  const earlybirdActive =
    ebPrice > 0 &&
    ebEndsAt &&
    !Number.isNaN(ebEndsAt.getTime()) &&
    now < ebEndsAt;

  if (earlybirdActive) return ebPrice;
  return normal;
}

function escapeICS(s) {
  return String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function toICSDate(dt) {
  const d = new Date(dt);
  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

/**
 * ✅ NEW: list ALL my enrollments (for Dashboard)
 * GET /me/ptrainings/enrollments
 */
router.get(
  "/enrollments",
  asyncHandler(async (req, res) => {
    const list = await TrainingEnrollment.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    const trainingIds = [
      ...new Set(
        (list || []).map((x) => String(x.trainingId || "")).filter(Boolean),
      ),
    ];

    // Mongoose can cast strings to ObjectId, but we'll be strict-safe:
    const trainingObjectIds = trainingIds
      .map((id) => {
        try {
          return new mongoose.Types.ObjectId(String(id));
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const trainings = await TrainingEvent.find({
      _id: { $in: trainingObjectIds },
    })
      .select(
        "title subtitle slug description startAt endAt flyerUrl pricing priceNGN location installationChecklist softwareProductKeys entitlementGrants",
      )
      .lean();

    const trainingMap = Object.fromEntries(
      (trainings || []).map((t) => [String(t._id), t]),
    );

    const enriched = (list || []).map((enr) => {
      const training = trainingMap[String(enr.trainingId)] || null;

      const paymentState = String(enr?.payment?.raw?.state || "").toLowerCase();
      const receiptUrl = enr?.payment?.raw?.receiptUrl || "";

      // Use stored amount first, fallback to resolved fee
      const amount =
        Number(enr?.payment?.amountNGN ?? 0) ||
        (training ? resolveTrainingFeeNGN(training) : 0);

      return {
        ...enr,
        training,
        paymentState,
        hasReceipt: !!receiptUrl,
        receiptUrl,
        amountNGN: amount,
      };
    });

    res.json(enriched);
  }),
);

router.get(
  "/:enrollmentId",
  asyncHandler(async (req, res) => {
    const enrollmentId = String(req.params.enrollmentId || "").trim();

    const enr = await TrainingEnrollment.findById(enrollmentId).lean();
    if (!enr) return res.status(404).json({ error: "Not found" });
    if (String(enr.userId) !== String(req.user._id)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const training = await TrainingEvent.findById(enr.trainingId).lean();
    if (!training) return res.status(404).json({ error: "Training not found" });

    // Use stored amount first, fallback to resolved fee
    const amount =
      Number(enr?.payment?.amountNGN ?? 0) || resolveTrainingFeeNGN(training);

    const paymentInstructions =
      amount > 0 ? getPaymentInstructions(amount) : null;

    res.json({ ...enr, training, paymentInstructions });
  }),
);

router.post(
  "/:enrollmentId/form",
  asyncHandler(async (req, res) => {
    const enrollmentId = String(req.params.enrollmentId || "").trim();

    const enr = await TrainingEnrollment.findById(enrollmentId);
    if (!enr) return res.status(404).json({ error: "Enrollment not found" });
    if (String(enr.userId) !== String(req.user._id)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // accept form once it’s unlocked (manual submitted OR paid)
    const raw = enr.payment?.raw || {};
    const manualSubmitted =
      raw?.method === "manual_transfer" && raw?.state === "submitted";
    const paid = !!enr.payment?.paid;

    if (!paid && !manualSubmitted) {
      return res
        .status(403)
        .json({ error: "Payment not confirmed/submitted yet." });
    }

    enr.formData = req.body || {};
    enr.formSubmittedAt = new Date();
    enr.status = "submitted";
    await enr.save();

    res.json({ ok: true });
  }),
);

router.get(
  "/:enrollmentId/ics",
  asyncHandler(async (req, res) => {
    const enrollmentId = String(req.params.enrollmentId || "").trim();

    const enr = await TrainingEnrollment.findById(enrollmentId).lean();
    if (!enr) return res.status(404).json({ error: "Not found" });
    if (String(enr.userId) !== String(req.user._id)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const training = await TrainingEvent.findById(enr.trainingId).lean();
    if (!training) return res.status(404).json({ error: "Training not found" });

    const loc = training.location || {};
    const address = [loc.name, loc.address, loc.city, loc.state]
      .filter(Boolean)
      .join(", ");

    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//ADLM//PTraining//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${escapeICS(String(enr._id))}@adlm`,
      `DTSTAMP:${toICSDate(new Date())}`,
      `DTSTART:${toICSDate(training.startAt)}`,
      `DTEND:${toICSDate(training.endAt)}`,
      `SUMMARY:${escapeICS(training.title || "ADLM Training")}`,
      `DESCRIPTION:${escapeICS(training.description || training.fullDescription || "")}`,
      `LOCATION:${escapeICS(address)}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="ADLM-Training-${String(enr._id).slice(-6)}.ics"`,
    );
    res.send(ics);
  }),
);

export default router;
