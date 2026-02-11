// server/routes/me-ptrainings.js
import express from "express";
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

    const paymentInstructions =
      Number(training.priceNGN || 0) > 0
        ? getPaymentInstructions(training.priceNGN)
        : null;

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
