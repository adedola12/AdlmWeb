// server/routes/admin.ptrainings.js
import express from "express";
import dayjs from "dayjs";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { TrainingEvent } from "../models/TrainingEvent.js";
import { TrainingEnrollment } from "../models/TrainingEnrollment.js";
import { User } from "../models/User.js";

const router = express.Router();
router.use(requireAuth, requireAdmin);

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function addMonthsToEntitlement(userDoc, productKey, monthsToAdd, seats = 1) {
  if (!userDoc || !productKey) return;
  const m = Math.max(Number(monthsToAdd || 0), 0);
  if (!m) return;

  userDoc.entitlements = userDoc.entitlements || [];
  const now = dayjs();

  let ent = userDoc.entitlements.find((e) => e.productKey === productKey);
  if (!ent) {
    userDoc.entitlements.push({
      productKey,
      status: "active",
      seats: Math.max(Number(seats || 1), 1),
      expiresAt: now.add(m, "month").toDate(),
      devices: [],
    });
  } else {
    const base =
      ent.expiresAt && dayjs(ent.expiresAt).isAfter(now)
        ? dayjs(ent.expiresAt)
        : now;
    ent.status = "active";
    ent.expiresAt = base.add(m, "month").toDate();
    ent.seats = Math.max(Number(ent.seats || 1), Number(seats || 1), 1);
  }

  userDoc.refreshVersion = (userDoc.refreshVersion || 0) + 1;
}

/* -------------------- EVENTS CRUD -------------------- */
router.get(
  "/events",
  asyncHandler(async (_req, res) => {
    const list = await TrainingEvent.find({}).sort({ createdAt: -1 });
    res.json(list || []);
  }),
);

router.post(
  "/events",
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    const created = await TrainingEvent.create(payload);
    res.json(created);
  }),
);

router.patch(
  "/events/:id",
  asyncHandler(async (req, res) => {
    const updated = await TrainingEvent.findByIdAndUpdate(
      req.params.id,
      req.body || {},
      { new: true },
    );
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  }),
);

router.delete(
  "/events/:id",
  asyncHandler(async (req, res) => {
    const gone = await TrainingEvent.findByIdAndDelete(req.params.id);
    if (!gone) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  }),
);

/* -------------------- ENROLLMENTS -------------------- */
router.get(
  "/enrollments",
  asyncHandler(async (req, res) => {
    const q = {};
    if (req.query.status) q.status = String(req.query.status);

    const list = await TrainingEnrollment.find(q)
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    // attach training (so admin UI can see basic info if you want later)
    const ids = [...new Set((list || []).map((x) => String(x.trainingId)))].map(
      (x) => x,
    );
    const trainings = await TrainingEvent.find({ _id: { $in: ids } })
      .select(
        "title startAt endAt priceNGN capacityApproved entitlementGrants installationChecklist",
      )
      .lean();

    const map = Object.fromEntries(
      (trainings || []).map((t) => [String(t._id), t]),
    );
    const enriched = (list || []).map((x) => ({
      ...x,
      training: map[String(x.trainingId)] || null,
    }));

    res.json(enriched);
  }),
);

/**
 * ✅ Approve enrollment (admin confirms payment & slot)
 * - sets payment.paid=true
 * - sets status="approved"
 */
router.patch(
  "/enrollments/:id/approve",
  asyncHandler(async (req, res) => {
    const enr = await TrainingEnrollment.findById(req.params.id);
    if (!enr) return res.status(404).json({ error: "Enrollment not found" });

    const training = await TrainingEvent.findById(enr.trainingId).lean();
    if (!training) return res.status(404).json({ error: "Training not found" });

    // enforce cap
    const approvedCount = await TrainingEnrollment.countDocuments({
      trainingId: training._id,
      status: "approved",
    });
    if (approvedCount >= (training.capacityApproved || 14)) {
      return res
        .status(409)
        .json({ error: "Cannot approve: capacity reached." });
    }

    enr.payment = enr.payment || {};
    enr.payment.paid = true;
    enr.payment.paidAt = new Date();
    enr.payment.raw = {
      ...(enr.payment.raw || {}),
      state: "confirmed",
      confirmedAt: new Date().toISOString(),
      confirmedBy: req.user?.email || "admin",
    };

    enr.status = "approved";
    enr.approvedAt = new Date();
    enr.approvedBy = req.user?.email || "admin";

    // keep installation shape consistent
    enr.installation = enr.installation || {};
    enr.installation.status = enr.installation.status || "pending";

    await enr.save();
    res.json({ ok: true, enrollment: enr });
  }),
);

router.patch(
  "/enrollments/:id/reject",
  asyncHandler(async (req, res) => {
    const enr = await TrainingEnrollment.findById(req.params.id);
    if (!enr) return res.status(404).json({ error: "Enrollment not found" });

    enr.status = "rejected";
    enr.rejectedAt = new Date();
    enr.rejectedBy = req.user?.email || "admin";
    await enr.save();

    res.json({ ok: true, enrollment: enr });
  }),
);

/**
 * ✅ Mark installation complete + grant entitlements (if configured on training)
 */
router.patch(
  "/enrollments/:id/installation-complete",
  asyncHandler(async (req, res) => {
    const enr = await TrainingEnrollment.findById(req.params.id);
    if (!enr) return res.status(404).json({ error: "Enrollment not found" });

    const training = await TrainingEvent.findById(enr.trainingId).lean();
    if (!training) return res.status(404).json({ error: "Training not found" });

    const user = await User.findById(enr.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const grants = Array.isArray(training.entitlementGrants)
      ? training.entitlementGrants
      : [];

    for (const g of grants) {
      const productKey = String(g?.productKey || "").trim();
      const months = Number(g?.months || 0);
      const seats = Number(g?.seats || 1);
      addMonthsToEntitlement(user, productKey, months, seats);
    }
    await user.save();

    enr.installation = enr.installation || {};
    enr.installation.status = "complete";
    enr.installation.completedAt = new Date();
    enr.installation.completedBy = req.user?.email || "admin";
    enr.installation.entitlementsApplied = true;
    enr.installation.entitlementsAppliedAt = new Date();

    await enr.save();

    res.json({
      ok: true,
      enrollment: enr,
      grantsApplied: grants,
      message: "Installation complete and entitlements granted.",
    });
  }),
);

export default router;
