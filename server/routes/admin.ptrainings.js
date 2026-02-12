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

const normKey = (k) =>
  String(k || "")
    .trim()
    .toLowerCase();

/**
 * ✅ Upsert entitlements using the SAME shape as User.entitlements schema
 * Applies months by extending expiresAt.
 */
function addMonthsToEntitlement(
  userDoc,
  {
    productKey,
    months = 1,
    seats = 1,
    licenseType = "personal",
    organizationName = "",
  },
) {
  const pk = normKey(productKey);
  if (!userDoc || !pk) return;

  const m = Math.max(Number(months || 0), 0);
  // If months is 0, we still activate entitlement (no expiry change).
  const nextSeats = Math.max(Number(seats || 1), 1);
  const lt = licenseType === "organization" ? "organization" : "personal";
  const org =
    lt === "organization" ? String(organizationName || "").trim() : "";

  userDoc.entitlements = userDoc.entitlements || [];
  const now = dayjs();

  let ent = userDoc.entitlements.find((e) => normKey(e.productKey) === pk);

  if (!ent) {
    userDoc.entitlements.push({
      productKey: pk,
      status: "active",
      seats: nextSeats,
      devices: [],
      licenseType: lt,
      organizationName: org,
      expiresAt: m ? now.add(m, "month").toDate() : now.toDate(),
    });
  } else {
    // extend expiry from the later of now or current expiry
    if (m) {
      const base =
        ent.expiresAt && dayjs(ent.expiresAt).isAfter(now)
          ? dayjs(ent.expiresAt)
          : now;
      ent.expiresAt = base.add(m, "month").toDate();
    } else {
      // keep expiresAt as-is if months==0
      ent.expiresAt = ent.expiresAt || now.toDate();
    }

    ent.status = "active";
    ent.seats = Math.max(Number(ent.seats || 1), nextSeats, 1);

    // keep license metadata in sync
    ent.licenseType = lt;
    ent.organizationName = org;
  }

  userDoc.refreshVersion = (userDoc.refreshVersion || 0) + 1;
}

function applyTrainingGrantsToUser(userDoc, training) {
  const grants = Array.isArray(training?.entitlementGrants)
    ? training.entitlementGrants
    : [];

  for (const g of grants) {
    addMonthsToEntitlement(userDoc, {
      productKey: g?.productKey,
      months: g?.months,
      seats: g?.seats,
      licenseType: g?.licenseType,
      organizationName: g?.organizationName,
    });
  }

  return grants;
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

    const ids = [...new Set((list || []).map((x) => String(x.trainingId)))];
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
 * ✅ ALSO: grant entitlements immediately on approval
 */
router.patch(
  "/enrollments/:id/approve",
  asyncHandler(async (req, res) => {
    const enr = await TrainingEnrollment.findById(req.params.id);
    if (!enr) return res.status(404).json({ error: "Enrollment not found" });

    const st0 = String(enr.status || "").toLowerCase();
    if (st0 === "approved") {
      return res.json({
        ok: true,
        enrollment: enr,
        grantsApplied: [],
        message: "Enrollment already approved (no changes).",
      });
    }
    if (st0 === "rejected") {
      return res
        .status(400)
        .json({ error: "Cannot approve: enrollment was rejected." });
    }

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

    // mark paid + approved
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

    // ensure installation shape exists
    enr.installation = enr.installation || {};
    enr.installation.status = enr.installation.status || "pending";

    // ✅ grant entitlements NOW (on approval)
    const user = await User.findById(enr.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const alreadyApplied = enr?.installation?.entitlementsApplied === true;
    const grantsApplied = alreadyApplied
      ? []
      : applyTrainingGrantsToUser(user, training);
    if (!alreadyApplied) await user.save();

    await user.save();

    // store flags on enrollment (reuse existing fields you already set in install route)
    enr.installation.entitlementsApplied = true;
    enr.installation.entitlementsAppliedAt = new Date();
    enr.installation.entitlementsAppliedBy = req.user?.email || "admin";

    await enr.save();

    res.json({
      ok: true,
      enrollment: enr,
      grantsApplied,
      message: "Enrollment approved and entitlements granted.",
    });
  }),
);

router.patch(
  "/enrollments/:id/reject",
  asyncHandler(async (req, res) => {
    const enr = await TrainingEnrollment.findById(req.params.id);
    if (!enr) return res.status(404).json({ error: "Enrollment not found" });

    const st0 = String(enr.status || "").toLowerCase();
    if (st0 === "rejected") {
      return res.json({
        ok: true,
        enrollment: enr,
        message: "Already rejected.",
      });
    }
    if (st0 === "approved") {
      return res
        .status(400)
        .json({ error: "Cannot reject: enrollment already approved." });
    }


    enr.status = "rejected";
    enr.rejectedAt = new Date();
    enr.rejectedBy = req.user?.email || "admin";
    await enr.save();

    res.json({ ok: true, enrollment: enr });
  }),
);

/**
 * ✅ Mark installation complete
 * - DOES NOT double-grant entitlements if already granted on approval.
 * - If somehow not granted yet, it will grant once here.
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

    enr.installation = enr.installation || {};

    let grantsApplied = [];
    const alreadyApplied = !!enr.installation.entitlementsApplied;

    if (!alreadyApplied) {
      grantsApplied = applyTrainingGrantsToUser(user, training);
      await user.save();

      enr.installation.entitlementsApplied = true;
      enr.installation.entitlementsAppliedAt = new Date();
      enr.installation.entitlementsAppliedBy = req.user?.email || "admin";
    } else {
      grantsApplied = Array.isArray(training?.entitlementGrants)
        ? training.entitlementGrants
        : [];
    }

    enr.installation.status = "complete";
    enr.installation.completedAt = new Date();
    enr.installation.completedBy = req.user?.email || "admin";

    await enr.save();

    res.json({
      ok: true,
      enrollment: enr,
      grantsApplied,
      message: alreadyApplied
        ? "Installation marked complete. (Entitlements were already granted on approval.)"
        : "Installation complete and entitlements granted.",
    });
  }),
);

export default router;
