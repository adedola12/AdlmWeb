// server/routes/me-trainings.js
import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { TrainingEnrollment } from "../models/TrainingEnrollment.js";
import { TrainingEvent } from "../models/TrainingEvent.js";

const router = express.Router();
router.use(requireAuth);

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function toICS({ title, description, location, startAt, endAt }) {
  const dt = (d) =>
    new Date(d)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ADLM//Training//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${Date.now()}@adlmstudio.net`,
    `DTSTAMP:${dt(new Date())}`,
    `DTSTART:${dt(startAt)}`,
    `DTEND:${dt(endAt)}`,
    `SUMMARY:${String(title || "ADLM Training").replace(/\n/g, " ")}`,
    `DESCRIPTION:${String(description || "").replace(/\n/g, " ")}`,
    `LOCATION:${String(location || "").replace(/\n/g, " ")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

// list my enrollments
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const list = await TrainingEnrollment.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    const trainingIds = list.map((x) => x.trainingId).filter(Boolean);
    const trainings = await TrainingEvent.find({
      _id: { $in: trainingIds },
    }).lean();

    const map = new Map(trainings.map((t) => [String(t._id), t]));
    res.json(
      list.map((e) => ({
        ...e,
        training: map.get(String(e.trainingId)) || null,
      })),
    );
  }),
);

// get one enrollment
router.get(
  "/:enrollmentId",
  asyncHandler(async (req, res) => {
    const e = await TrainingEnrollment.findById(req.params.enrollmentId).lean();
    if (!e) return res.status(404).json({ error: "Not found" });
    if (String(e.userId) !== String(req.user._id))
      return res.status(403).json({ error: "Forbidden" });

    const training = await TrainingEvent.findById(e.trainingId).lean();
    res.json({ ...e, training });
  }),
);

// submit form
router.post(
  "/:enrollmentId/form",
  asyncHandler(async (req, res) => {
    const enrollment = await TrainingEnrollment.findById(
      req.params.enrollmentId,
    );
    if (!enrollment) return res.status(404).json({ error: "Not found" });
    if (String(enrollment.userId) !== String(req.user._id))
      return res.status(403).json({ error: "Forbidden" });

    if (!enrollment.payment?.paid) {
      return res.status(402).json({ error: "Payment required" });
    }
    if (enrollment.status !== "form_pending") {
      return res
        .status(409)
        .json({ error: `Cannot submit form in status: ${enrollment.status}` });
    }

    const training = await TrainingEvent.findById(enrollment.trainingId).lean();
    if (!training) return res.status(404).json({ error: "Training not found" });

    const data = req.body || {};

    // validate required fields based on training.formFields
    const missing = [];
    for (const f of training.formFields || []) {
      if (!f.required) continue;
      const v = data[f.key];
      const empty =
        v === undefined ||
        v === null ||
        (typeof v === "string" && !v.trim()) ||
        (Array.isArray(v) && v.length === 0);
      if (empty) missing.push(f.key);
    }

    if (missing.length) {
      return res
        .status(400)
        .json({ error: "Missing required fields", missing });
    }

    enrollment.formData = data;
    enrollment.formSubmittedAt = new Date();
    enrollment.status = "submitted";
    enrollment.installation.status = "pending"; // ✅ user now sees pending installation
    await enrollment.save();

    res.json({ ok: true, status: enrollment.status });
  }),
);

// download calendar .ics
router.get(
  "/:enrollmentId/ics",
  asyncHandler(async (req, res) => {
    const e = await TrainingEnrollment.findById(req.params.enrollmentId).lean();
    if (!e) return res.status(404).json({ error: "Not found" });
    if (String(e.userId) !== String(req.user._id))
      return res.status(403).json({ error: "Forbidden" });

    const t = await TrainingEvent.findById(e.trainingId).lean();
    if (!t) return res.status(404).json({ error: "Training not found" });

    const ics = toICS({
      title: t.title,
      description: t.description || t.fullDescription,
      location: `${t.location?.name || ""} ${t.location?.address || ""}`.trim(),
      startAt: t.startAt,
      endAt: t.endAt,
    });

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="adlm-training-${t.slug}.ics"`,
    );
    res.send(ics);
  }),
);

export default router;
