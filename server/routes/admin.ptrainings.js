// server/routes/admin.ptrainings.js
import express from "express";
import dayjs from "dayjs";
import mongoose from "mongoose";
import { sendMail } from "../util/mailer.js";
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
  const cap = Number(training?.capacityApproved ?? training?.capacity);
  return Number.isFinite(cap) && cap > 0 ? cap : DEFAULT_CAPACITY;
}
function manualSeatsLeftOf(training) {
  const raw = training?.seatsLeft;
  if (raw === undefined || raw === null || raw === "") return null;

  const n = Number(raw);
  if (!Number.isFinite(n)) return null;

  return Math.max(Math.floor(n), 0);
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

  // normalize to ObjectId + also keep string version
  const objIds = trainingObjectIds
    .map((id) => {
      try {
        return id instanceof mongoose.Types.ObjectId
          ? id
          : new mongoose.Types.ObjectId(String(id));
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const strIds = objIds.map((id) => String(id));

  const pipeline = [
    {
      $match: {
        status: "approved",
        $or: [{ trainingId: { $in: objIds } }, { trainingId: { $in: strIds } }],
      },
    },
    // normalize key for grouping (so ObjectId and string group together)
    { $project: { tid: { $toString: "$trainingId" } } },
    { $group: { _id: "$tid", count: { $sum: 1 } } },
  ];

  const agg = await TrainingEnrollment.aggregate(pipeline).session(
    session || null,
  );

  // map keys are string ids
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

  // dates
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

  if (payload.seatsLeft != null && payload.seatsLeft !== "") {
    const sl = parseInt(payload.seatsLeft, 10);
    if (Number.isFinite(sl) && sl >= 0) payload.seatsLeft = sl;
    else delete payload.seatsLeft;
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

    // legacy sync
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

  // venue gallery
  payload.media = cleanMediaArray(payload.media);

  // form schema
  payload.formFields = cleanFormFields(payload.formFields);

  // installation + grants
  payload.installationChecklist = Array.isArray(payload.installationChecklist)
    ? payload.installationChecklist
    : [];
  payload.entitlementGrants = Array.isArray(payload.entitlementGrants)
    ? payload.entitlementGrants
    : [];

  // Remove undefined/null at top-level
  Object.keys(payload).forEach((k) => {
    if (payload[k] === undefined || payload[k] === null) delete payload[k];
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

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function toCalUtcStamp(d) {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return dt
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function buildMapsLink(training) {
  const loc = training?.location || {};
  const direct = String(loc?.googleMapsPlaceUrl || "").trim();
  if (direct) return direct;

  const name = String(loc?.name || "").trim();
  const addr = String(loc?.address || "").trim();
  const city = String(loc?.city || "").trim();
  const state = String(loc?.state || "").trim();
  const q = encodeURIComponent(
    [name, addr, city, state].filter(Boolean).join(", "),
  );
  return q
    ? `https://www.google.com/maps/search/?api=1&query=${q}`
    : "https://www.google.com/maps";
}

function buildCalendarLinks(training) {
  const title = String(training?.title || "ADLM Physical Training").trim();

  const startAt = training?.startAt ? new Date(training.startAt) : null;
  let endAt = training?.endAt ? new Date(training.endAt) : null;

  if (startAt && (!endAt || Number.isNaN(endAt.getTime()))) {
    endAt = new Date(startAt.getTime() + 3 * 60 * 60 * 1000);
  }

  const loc = training?.location || {};
  const locationText = [loc?.name, loc?.address, loc?.city, loc?.state]
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .join(", ");

  const details = `You're confirmed for ${title}. See you in class!`;

  const gStart = startAt ? toCalUtcStamp(startAt) : "";
  const gEnd = endAt ? toCalUtcStamp(endAt) : "";

  const google =
    gStart && gEnd
      ? `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
          title,
        )}&dates=${gStart}/${gEnd}&details=${encodeURIComponent(
          details,
        )}&location=${encodeURIComponent(locationText)}`
      : "https://calendar.google.com/";

  const outlook =
    startAt && endAt
      ? `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(
          title,
        )}&startdt=${encodeURIComponent(startAt.toISOString())}&enddt=${encodeURIComponent(
          endAt.toISOString(),
        )}&body=${encodeURIComponent(details)}&location=${encodeURIComponent(
          locationText,
        )}`
      : "https://outlook.live.com/calendar/";

  return { google, outlook };
}

function buildTrainingApprovedEmailHtml({ firstName, training }) {
  const name = String(firstName || "").trim() || "there";

  const title = escapeHtml(training?.title || "ADLM Physical Training");
  const startTxt = training?.startAt
    ? dayjs(training.startAt).format("dddd, D MMM YYYY · h:mm A")
    : "To be announced";
  const endTxt = training?.endAt
    ? dayjs(training.endAt).format("dddd, D MMM YYYY · h:mm A")
    : "";

  const loc = training?.location || {};
  const locName = escapeHtml(loc?.name || "");
  const addr = escapeHtml(loc?.address || "");
  const city = escapeHtml(loc?.city || "");
  const state = escapeHtml(loc?.state || "");

  const mapsUrl = buildMapsLink(training);
  const { google: googleCalUrl, outlook: outlookCalUrl } =
    buildCalendarLinks(training);

  const btn = (href, label, bg) => `
    <a href="${href}"
       style="display:inline-block;padding:12px 16px;border-radius:10px;
              background:${bg};color:#ffffff;text-decoration:none;font-weight:700;
              margin-right:10px;margin-top:8px">
      ${label}
    </a>
  `;

  return `
  <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a">
    <h2 style="margin:0 0 10px 0">Congratulations ${escapeHtml(name)} 🎉</h2>
    <p style="margin:0 0 12px 0">
      Your payment has been <b>confirmed</b> and your seat is now <b>secured</b> for:
    </p>

    <div style="padding:12px 14px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;margin:12px 0">
      <div style="font-size:16px;font-weight:800;margin-bottom:6px">${title}</div>
      <div style="font-size:13px;color:#334155">
        <div><b>Date/Time:</b> ${escapeHtml(startTxt)} ${
          endTxt ? `— ${escapeHtml(endTxt)}` : ""
        }</div>
        ${
          locName || addr || city || state
            ? `<div style="margin-top:6px"><b>Venue:</b> ${[
                locName,
                addr,
                city,
                state,
              ]
                .filter(Boolean)
                .join(", ")}</div>`
            : ""
        }
      </div>
    </div>

    <div style="margin:10px 0 18px 0">
      ${btn(googleCalUrl, "Add to Google Calendar", "#2563eb")}
      ${btn(outlookCalUrl, "Add to Outlook Calendar", "#0f172a")}
      ${btn(mapsUrl, "Open Map Location", "#16a34a")}
    </div>

    <p style="margin:0 0 10px 0;color:#334155;font-size:14px">
      If you have any questions before the class, just reply to this email.
    </p>

    <p style="margin:18px 0 0 0;font-weight:800">See you in class ✅</p>

    <p style="margin:12px 0 0 0;color:#475569">
      — ADLM Studio
    </p>
  </div>
  `;
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

    // ✅ Manual mode:
    // if seatsLeft is provided on event, use it.
    // otherwise fallback to configured capacity (not capacity - approved).
    const manualLeft = manualSeatsLeftOf(t);
    const seatsLeft = manualLeft != null ? manualLeft : capacityOf(t);

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

  const idStr = String(req.params.id);
  const idObj = new mongoose.Types.ObjectId(idStr);

  const session = await mongoose.startSession();

  try {
    let deletedEnrollments = 0;
    let deletedEvent = null;

    await session.withTransaction(async () => {
      const enrRes = await TrainingEnrollment.deleteMany({
        $or: [{ trainingId: idObj }, { trainingId: idStr }],
      }).session(session);

      deletedEnrollments = enrRes?.deletedCount || 0;

      deletedEvent = await TrainingEvent.findOneAndDelete({
        _id: idObj,
      }).session(session);

      if (!deletedEvent) {
        throw Object.assign(new Error("Not found"), { status: 404 });
      }
    });

    return res.json({
      ok: true,
      deletedEventId: idStr,
      deletedEnrollments,
    });
  } catch (err) {
    const status = err?.status || 500;
    return res.status(status).json({ error: err?.message || "Server error" });
  } finally {
    session.endSession();
  }
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
    // Build query safely (so trainingId OR doesn't clash with status OR)
    const and = [];

    const statusRaw = String(req.query.status || "")
      .trim()
      .toLowerCase();
    const paymentStateRaw = String(req.query.paymentState || "")
      .trim()
      .toLowerCase();
    const trainingIdRaw = String(req.query.trainingId || "").trim();

    if (trainingIdRaw) {
      if (isStrictObjectId(trainingIdRaw)) {
        const tidObj = new mongoose.Types.ObjectId(trainingIdRaw);
        and.push({
          $or: [{ trainingId: trainingIdRaw }, { trainingId: tidObj }],
        });
      } else {
        and.push({ trainingId: trainingIdRaw });
      }
    }

    if (statusRaw) {
      if (statusRaw === "payment_pending") {
        and.push({
          $or: [
            { status: "payment_pending" },
            { status: "form_pending", "payment.raw.state": "submitted" },
          ],
        });
      } else {
        and.push({ status: statusRaw });
      }
    }

    if (paymentStateRaw) {
      and.push({ "payment.raw.state": paymentStateRaw });
    }

    const q = and.length === 0 ? {} : and.length === 1 ? and[0] : { $and: and };

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
        "title startAt endAt priceNGN pricing capacityApproved capacity entitlementGrants installationChecklist flyerUrl slug location",
      )
      .lean();

    const approvedMap = await getApprovedCountsMap(trainingObjectIds);

    const trainingMap = Object.fromEntries(
      (trainings || []).map((t) => {
        const approvedCount = approvedMap[String(t._id)] || 0;

        // ✅ Manual mode:
        // use event.seatsLeft when present; otherwise show configured capacity.
        const manualLeft = manualSeatsLeftOf(t);
        const seatsLeft = manualLeft != null ? manualLeft : capacityOf(t);

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
    class HttpError extends Error {
      constructor(status, message) {
        super(message);
        this.status = status;
      }
    }

    const enrollmentId = String(req.params.id || "").trim();
    if (!isStrictObjectId(enrollmentId)) {
      return res.status(404).json({ error: "Enrollment not found" });
    }

    const session = await mongoose.startSession();

    try {
      let resultBody = null;
      let mailJob = null;

      await session.withTransaction(async () => {
        // Load enrollment
        const enr =
          await TrainingEnrollment.findById(enrollmentId).session(session);
        if (!enr) throw new HttpError(404, "Enrollment not found");

        const st0 = String(enr.status || "").toLowerCase();

        // Idempotent: already approved => success
        if (st0 === "approved") {
          const trainingLean = await TrainingEvent.findById(enr.trainingId)
            .session(session)
            .lean();

          resultBody = {
            ok: true,
            enrollment: enr,
            grantsApplied: [],
            seatsLeft: manualSeatsLeftOf(trainingLean),
            message: "Enrollment already approved (no changes).",
          };
          return;
        }

        if (st0 === "rejected") {
          throw new HttpError(400, "Cannot approve: enrollment was rejected.");
        }

        // Load training + user
        const trainingLean = await TrainingEvent.findById(enr.trainingId)
          .session(session)
          .lean();
        if (!trainingLean) throw new HttpError(404, "Training not found");

        const user = await User.findById(enr.userId).session(session);
        if (!user) throw new HttpError(404, "User not found");

        // ✅ NO capacity counter checks/increments here (manual admin flow)
        // Mark payment as confirmed + enrollment approved
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
        enr.decidedAt = new Date();
        enr.decidedBy = req.user?.email || "admin";

        enr.installation = enr.installation || {};
        enr.installation.status = enr.installation.status || "pending";

        // Entitlements apply once
        const alreadyApplied = enr.entitlementsApplied === true;
        const grantsApplied = alreadyApplied
          ? []
          : applyTrainingGrantsToUser(user, trainingLean);

        if (!alreadyApplied) {
          await user.save({ session });
          enr.entitlementsApplied = true;
          enr.entitlementsAppliedAt = new Date();
        }

        enr.installation.entitlementsAppliedBy = req.user?.email || "admin";
        await enr.save({ session });

        // Send email AFTER commit
        mailJob = {
          to: user.email,
          firstName: user.firstName || enr.firstName || user.username || "",
          training: trainingLean,
        };

        resultBody = {
          ok: true,
          enrollment: enr,
          grantsApplied,
          seatsLeft: manualSeatsLeftOf(trainingLean),
          message: alreadyApplied
            ? "Enrollment approved."
            : "Enrollment approved, entitlements granted.",
        };
      });

      if (!resultBody) {
        return res.status(500).json({ error: "Unknown approval error" });
      }

      // Email outside transaction
      if (mailJob?.to) {
        try {
          await sendMail({
            to: mailJob.to,
            subject:
              "You're Confirmed! ADLM Physical Training — Details Inside",
            html: buildTrainingApprovedEmailHtml({
              firstName: mailJob.firstName,
              training: mailJob.training,
            }),
          });
        } catch (e) {
          console.error(
            "[ptrainings approve] sendMail failed:",
            e?.message || e,
          );
        }
      }

      return res.json(resultBody);
    } catch (err) {
      const status = err?.status || 500;
      return res.status(status).json({ error: err?.message || "Server error" });
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

    // ✅ mark installation as complete (THIS is your waitlist system)
    enr.installation.status = "complete";
    enr.installation.completedAt = new Date();
    enr.installation.completedBy = req.user?.email || "admin";

    let grantsApplied = [];
    const alreadyApplied = !!enr.entitlementsApplied;

    if (!alreadyApplied) {
      grantsApplied = applyTrainingGrantsToUser(user, training);
      await user.save();

      enr.entitlementsApplied = true;
      enr.entitlementsAppliedAt = new Date();
      enr.entitlementsAppliedBy = req.user?.email || "admin";
    } else {
      grantsApplied = Array.isArray(training?.entitlementGrants)
        ? training.entitlementGrants
        : [];
    }

    // ✅ IMPORTANT: keep enr.status as "approved" so seat remains occupied
    // enr.status = "approved";

    await enr.save();

    res.json({
      ok: true,
      enrollment: enr,
      grantsApplied,
      message: alreadyApplied
        ? "Installation marked complete."
        : "Installation complete and entitlements granted.",
    });
  }),
);

export default router;
