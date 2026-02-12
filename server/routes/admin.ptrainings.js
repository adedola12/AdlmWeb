// server/routes/admin.ptrainings.js
import express from "express";
import dayjs from "dayjs";
import mongoose from "mongoose";
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

const DEFAULT_CAPACITY = 14;

function capacityOf(training) {
  const cap = Number(training?.capacityApproved);
  return Number.isFinite(cap) && cap > 0 ? cap : DEFAULT_CAPACITY;
}

function isStrictObjectId(id) {
  return typeof id === "string" && /^[0-9a-fA-F]{24}$/.test(id);
}

function requireStrictObjectIdParam(req, res, next) {
  const id = String(req.params.id || "");
  if (!isStrictObjectId(id))
    return res.status(404).json({ error: "Not found" });
  return next();
}

async function getApprovedCountsMap(trainingObjectIds, session = null) {
  if (!Array.isArray(trainingObjectIds) || trainingObjectIds.length === 0) {
    return {};
  }

  const pipeline = [
    { $match: { trainingId: { $in: trainingObjectIds }, status: "approved" } },
    { $group: { _id: "$trainingId", count: { $sum: 1 } } },
  ];

  const agg = await TrainingEnrollment.aggregate(pipeline).session(
    session || null,
  );
  return Object.fromEntries(
    (agg || []).map((x) => [String(x._id), x.count || 0]),
  );
}

/* ---------------------- sanitizers ---------------------- */
function asTrimmedString(x) {
  if (x == null) return "";
  return String(x).trim();
}

function asNumber(x, def = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : def;
}

function cleanStringArray(arr) {
  const a = Array.isArray(arr) ? arr : [];
  return a.map((x) => asTrimmedString(x)).filter(Boolean);
}

function cleanMediaArray(arr, { forceType = null } = {}) {
  const a = Array.isArray(arr) ? arr : [];
  const out = [];
  for (const it of a) {
    const url = asTrimmedString(it?.url);
    if (!url) continue;

    let type = asTrimmedString(it?.type || "image").toLowerCase();
    if (type !== "image" && type !== "video") type = "image";
    if (forceType) type = forceType;

    const title = asTrimmedString(it?.title || "");
    out.push({ type, url, title });
  }
  return out;
}

function cleanFormFields(arr) {
  const a = Array.isArray(arr) ? arr : [];
  const out = [];

  for (const f of a) {
    const key = asTrimmedString(f?.key);
    const label = asTrimmedString(f?.label);
    if (!key || !label) continue;

    let type = asTrimmedString(f?.type || "short").toLowerCase();
    const allowed = [
      "short",
      "email",
      "phone",
      "paragraph",
      "select",
      "multi",
      "date",
    ];
    if (!allowed.includes(type)) type = "short";

    const required = !!f?.required;
    const placeholder = asTrimmedString(f?.placeholder || "");
    const options =
      type === "select" || type === "multi" ? cleanStringArray(f?.options) : [];

    out.push({ key, label, type, required, placeholder, options });
  }

  return out;
}

/**
 * Normalize payload from admin UI.
 * Supports:
 *  - legacy priceNGN
 *  - new pricing tiers (pricing.normalNGN, groupOf3NGN, earlyBird)
 *  - location object + photos
 *  - venue gallery in `media` (images/videos)
 *  - formFields schema
 */
function normalizeEventPayload(body) {
  const b = body || {};
  const payload = { ...b };

  // strings
  if (typeof payload.title === "string") payload.title = payload.title.trim();
  if (typeof payload.subtitle === "string")
    payload.subtitle = payload.subtitle.trim();
  if (typeof payload.slug === "string") payload.slug = payload.slug.trim();

  if (typeof payload.description === "string")
    payload.description = payload.description;
  if (typeof payload.fullDescription === "string")
    payload.fullDescription = payload.fullDescription;

  // dates: allow ISO strings; mongoose will cast
  if (payload.startAt === null || payload.startAt === "")
    delete payload.startAt;
  if (payload.endAt === null || payload.endAt === "") delete payload.endAt;

  // numbers
  if (payload.capacityApproved != null) {
    const cap = parseInt(payload.capacityApproved, 10);
    if (Number.isFinite(cap) && cap > 0) payload.capacityApproved = cap;
    else delete payload.capacityApproved;
  }

  if (payload.sort != null) {
    const s = parseInt(payload.sort, 10);
    payload.sort = Number.isFinite(s) ? s : 0;
  }

  // pricing tiers
  if (payload.pricing && typeof payload.pricing === "object") {
    const normalNGN = Math.max(asNumber(payload.pricing.normalNGN, 0), 0);
    const groupOf3NGN = Math.max(asNumber(payload.pricing.groupOf3NGN, 0), 0);

    const eb = payload.pricing.earlyBird || {};
    const ebPrice = Math.max(asNumber(eb.priceNGN, 0), 0);
    const ebEndsAtRaw = eb.endsAt;

    let ebEndsAt = null;
    if (ebEndsAtRaw) {
      const d = new Date(ebEndsAtRaw);
      if (!Number.isNaN(d.getTime())) ebEndsAt = d;
    }

    payload.pricing = {
      normalNGN,
      groupOf3NGN,
      earlyBird: { priceNGN: ebPrice, endsAt: ebEndsAt },
    };

    // keep legacy in sync (normal fee)
    payload.priceNGN = normalNGN;
  } else {
    // legacy only
    if (payload.priceNGN != null && payload.priceNGN !== "") {
      payload.priceNGN = Math.max(asNumber(payload.priceNGN, 0), 0);
      payload.pricing = {
        normalNGN: payload.priceNGN,
        groupOf3NGN: 0,
        earlyBird: { priceNGN: 0, endsAt: null },
      };
    }
  }

  // flyer
  if (payload.flyerUrl != null)
    payload.flyerUrl = asTrimmedString(payload.flyerUrl);

  // flags
  if (payload.isPublished != null) payload.isPublished = !!payload.isPublished;
  if (payload.isFeatured != null) payload.isFeatured = !!payload.isFeatured;

  // arrays
  payload.whatYouGet = cleanStringArray(payload.whatYouGet);
  payload.requirements = cleanStringArray(payload.requirements);
  payload.softwareProductKeys = cleanStringArray(
    payload.softwareProductKeys,
  ).map(normKey);

  // location object
  if (payload.location && typeof payload.location === "object") {
    payload.location = {
      name: asTrimmedString(payload.location.name),
      address: asTrimmedString(payload.location.address),
      city: asTrimmedString(payload.location.city),
      state: asTrimmedString(payload.location.state),
      amenities: cleanStringArray(payload.location.amenities),
      googleMapsPlaceUrl: asTrimmedString(payload.location.googleMapsPlaceUrl),
      googleMapsEmbedUrl: asTrimmedString(payload.location.googleMapsEmbedUrl),

      // location photos (images only)
      photos: cleanMediaArray(payload.location.photos, { forceType: "image" }),
    };
  }

  // venue gallery (kept as `media`)
  payload.media = cleanMediaArray(payload.media);

  // form schema
  payload.formFields = cleanFormFields(payload.formFields);

  // installation + grants (keep as-is but ensure arrays)
  payload.installationChecklist = Array.isArray(payload.installationChecklist)
    ? payload.installationChecklist
    : [];
  payload.entitlementGrants = Array.isArray(payload.entitlementGrants)
    ? payload.entitlementGrants
    : [];

  // Remove undefined/null at top-level
  Object.keys(payload).forEach((k) => {
    if (payload[k] === undefined || payload[k] === null) {
      delete payload[k];
    }
  });

  return payload;
}

/* ---------------------- entitlements helpers ---------------------- */
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
      expiresAt: m ? now.add(m, "month").toDate() : null,
    });
  } else {
    if (m) {
      const base =
        ent.expiresAt && dayjs(ent.expiresAt).isAfter(now)
          ? dayjs(ent.expiresAt)
          : now;
      ent.expiresAt = base.add(m, "month").toDate();
    } else {
      ent.expiresAt = ent.expiresAt ?? null;
    }

    ent.status = "active";
    ent.seats = Math.max(Number(ent.seats || 1), nextSeats, 1);
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

/* =========================================================
   EVENTS CRUD
   ========================================================= */
async function listEvents(_req, res) {
  const list = await TrainingEvent.find({}).sort({ createdAt: -1 }).lean();

  const ids = (list || [])
    .map((t) => t?._id)
    .filter(Boolean)
    .map((id) => new mongoose.Types.ObjectId(String(id)));

  const approvedMap = await getApprovedCountsMap(ids);

  const enriched = (list || []).map((t) => {
    const approvedCount = approvedMap[String(t._id)] || 0;
    const cap = capacityOf(t);
    const seatsLeft = Math.max(cap - approvedCount, 0);
    return { ...t, approvedCount, seatsLeft };
  });

  res.json(enriched || []);
}

async function createEvent(req, res) {
  const payload = normalizeEventPayload(req.body);
  const created = await TrainingEvent.create(payload);
  res.json(created);
}

async function patchEvent(req, res) {
  if (!isStrictObjectId(String(req.params.id || ""))) {
    return res.status(404).json({ error: "Not found" });
  }

  const payload = normalizeEventPayload(req.body);
  const updated = await TrainingEvent.findByIdAndUpdate(
    req.params.id,
    payload,
    {
      new: true,
      runValidators: true,
    },
  );

  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
}

async function deleteEvent(req, res) {
  if (!isStrictObjectId(String(req.params.id || ""))) {
    return res.status(404).json({ error: "Not found" });
  }

  const gone = await TrainingEvent.findByIdAndDelete(req.params.id);
  if (!gone) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
}

// Canonical
router.get("/events", asyncHandler(listEvents));
router.post("/events", asyncHandler(createEvent));
router.patch("/events/:id", asyncHandler(patchEvent));
router.delete("/events/:id", asyncHandler(deleteEvent));

// Compatibility aliases
router.get("/", asyncHandler(listEvents));
router.post("/", asyncHandler(createEvent));
router.patch("/:id", requireStrictObjectIdParam, asyncHandler(patchEvent));
router.delete("/:id", requireStrictObjectIdParam, asyncHandler(deleteEvent));

/* -------------------- ENROLLMENTS -------------------- */
router.get(
  "/enrollments",
  asyncHandler(async (req, res) => {
    const q = {};

    const statusRaw = String(req.query.status || "")
      .trim()
      .toLowerCase();
    const paymentStateRaw = String(req.query.paymentState || "")
      .trim()
      .toLowerCase();
    const trainingIdRaw = String(req.query.trainingId || "").trim();

    if (trainingIdRaw) q.trainingId = trainingIdRaw;

    if (statusRaw) {
      if (statusRaw === "payment_pending") {
        q.$or = [
          { status: "payment_pending" },
          { status: "form_pending", "payment.raw.state": "submitted" },
        ];
      } else {
        q.status = statusRaw;
      }
    }

    if (paymentStateRaw) {
      q["payment.raw.state"] = paymentStateRaw;
    }

    const list = await TrainingEnrollment.find(q)
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    const trainingIdsStr = [
      ...new Set(
        (list || []).map((x) => String(x.trainingId || "")).filter(Boolean),
      ),
    ];

    const trainingObjectIds = trainingIdsStr
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
        "title startAt endAt priceNGN pricing capacityApproved entitlementGrants installationChecklist flyerUrl slug",
      )
      .lean();

    const approvedMap = await getApprovedCountsMap(trainingObjectIds);

    const trainingMap = Object.fromEntries(
      (trainings || []).map((t) => {
        const approvedCount = approvedMap[String(t._id)] || 0;
        const cap = capacityOf(t);
        const seatsLeft = Math.max(cap - approvedCount, 0);
        return [String(t._id), { ...t, approvedCount, seatsLeft }];
      }),
    );

    const userIdsStr = [
      ...new Set(
        (list || []).map((x) => String(x.userId || "")).filter(Boolean),
      ),
    ];

    const userObjectIds = userIdsStr
      .map((id) => {
        try {
          return new mongoose.Types.ObjectId(String(id));
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const users = await User.find({ _id: { $in: userObjectIds } })
      .select("email username firstName lastName phone")
      .lean();

    const userMap = Object.fromEntries(
      (users || []).map((u) => [String(u._id), u]),
    );

    const enriched = (list || []).map((x) => {
      const paymentState = String(x?.payment?.raw?.state || "").toLowerCase();
      const receiptUrl = x?.payment?.raw?.receiptUrl || "";

      return {
        ...x,
        training: trainingMap[String(x.trainingId)] || null,
        user: userMap[String(x.userId)] || null,

        paymentState,
        paymentSubmittedAt: x?.payment?.raw?.submittedAt || null,
        hasReceipt: !!receiptUrl,
        receiptUrl,
        payerName: x?.payment?.raw?.payerName || "",
        payerBank: x?.payment?.raw?.bankName || "",
        payerReference:
          x?.payment?.raw?.reference || x?.payment?.reference || "",
        payerNote: x?.payment?.raw?.note || "",
      };
    });

    res.json(enriched);
  }),
);

router.patch(
  "/enrollments/:id/approve",
  asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();

    try {
      let responsePayload = null;

      await session.withTransaction(async () => {
        const enr = await TrainingEnrollment.findById(req.params.id).session(
          session,
        );
        if (!enr) {
          responsePayload = {
            status: 404,
            body: { error: "Enrollment not found" },
          };
          return;
        }

        const st0 = String(enr.status || "").toLowerCase();
        if (st0 === "approved") {
          const trainingLean = await TrainingEvent.findById(
            enr.trainingId,
          ).lean();
          const cap = capacityOf(trainingLean);
          const approvedCount = await TrainingEnrollment.countDocuments({
            trainingId: enr.trainingId,
            status: "approved",
          }).session(session);

          responsePayload = {
            status: 200,
            body: {
              ok: true,
              enrollment: enr,
              grantsApplied: [],
              seatsLeft: Math.max(cap - approvedCount, 0),
              approvedCount,
              message: "Enrollment already approved (no changes).",
            },
          };
          return;
        }

        if (st0 === "rejected") {
          responsePayload = {
            status: 400,
            body: { error: "Cannot approve: enrollment was rejected." },
          };
          return;
        }

        const training = await TrainingEvent.findById(enr.trainingId).lean();
        if (!training) {
          responsePayload = {
            status: 404,
            body: { error: "Training not found" },
          };
          return;
        }

        const cap = capacityOf(training);

        const currentApproved = await TrainingEnrollment.countDocuments({
          trainingId: training._id,
          status: "approved",
        }).session(session);

        await TrainingEvent.collection.updateOne(
          { _id: training._id },
          { $set: { approvedCount: currentApproved } },
          { session },
        );

        const seatUpdate = await TrainingEvent.collection.findOneAndUpdate(
          { _id: training._id, approvedCount: { $lt: cap } },
          { $inc: { approvedCount: 1 } },
          { session, returnDocument: "after", returnOriginal: false },
        );

        if (!seatUpdate?.value) {
          responsePayload = {
            status: 409,
            body: { error: "Cannot approve: capacity reached." },
          };
          return;
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

        enr.installation = enr.installation || {};
        enr.installation.status = enr.installation.status || "pending";

        const user = await User.findById(enr.userId).session(session);
        if (!user) {
          responsePayload = { status: 404, body: { error: "User not found" } };
          return;
        }

        const alreadyApplied = enr?.installation?.entitlementsApplied === true;
        const grantsApplied = alreadyApplied
          ? []
          : applyTrainingGrantsToUser(user, training);

        if (!alreadyApplied) {
          await user.save({ session });
        }

        enr.installation.entitlementsApplied = true;
        enr.installation.entitlementsAppliedAt = new Date();
        enr.installation.entitlementsAppliedBy = req.user?.email || "admin";

        await enr.save({ session });

        const approvedCountAfter = seatUpdate.value.approvedCount || 0;
        const seatsLeft = Math.max(cap - approvedCountAfter, 0);

        responsePayload = {
          status: 200,
          body: {
            ok: true,
            enrollment: enr,
            grantsApplied,
            seatsLeft,
            approvedCount: approvedCountAfter,
            message:
              "Enrollment approved, entitlements granted, seat reserved.",
          },
        };
      });

      if (!responsePayload) {
        return res.status(500).json({ error: "Unknown approval error" });
      }
      return res.status(responsePayload.status).json(responsePayload.body);
    } finally {
      session.endSession();
    }
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
