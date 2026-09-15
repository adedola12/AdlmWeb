// server/routes/admin.learnQueues.js
//
// Three queues that all end in somebody being let into something: training
// enrolments, course submissions, and the follow-up calls behind lapsed or
// unpaid accounts.
//
// ENROLMENTS — his capacity rule, and why half of it cannot be ported
//
// His screen refuses to approve an enrolment onto a course with no seats left,
// and says which: "that course has only 2 seats left". It is the best idea on
// his screen and it cannot be built here, because nothing in this database
// records a capacity. The Training model carries a title, a date, a city, a
// venue and an `attendees` count — a tally of who came, not a limit on who
// may. There is no number to compare against.
//
// So the seat guard is absent rather than faked against `attendees`, which
// would refuse enrolments for a reason that is not true. What IS portable is
// his other guard: an enrolment with no proof of payment cannot be approved,
// and `payment.raw.receiptUrl` is where a proof actually lands.
//
// SUBMISSIONS — the queue is real, the collection is empty
//
// CourseSubmission has nothing in it. The screen is built against the schema
// rather than against data, and says plainly that it is empty rather than
// looking broken. The field that decides a row is `gradeStatus`, not `grade`.

import express from "express";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { TrainingEnrollment } from "../models/TrainingEnrollment.js";
import { CourseSubmission } from "../models/CourseSubmission.js";
import { FollowUp, CALL_OUTCOMES, FOLLOWUP_STATUSES } from "../models/FollowUp.js";
import { Training } from "../models/Training.js";
import { User } from "../models/User.js";

const router = express.Router();

const DAY = 864e5;
const n0 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const age = (d) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / DAY) : null);

const nameOf = (u, fallbackEmail) =>
  [u?.firstName, u?.lastName].filter(Boolean).join(" ").trim() ||
  u?.username ||
  String(fallbackEmail || u?.email || "").split("@")[0] ||
  "Unknown";

const orgOf = (u) =>
  (u?.entitlements || []).map((e) => String(e.organizationName || "").trim()).find(Boolean) || "";

/* ─────────────────────────────────────────────────────────── enrolments ── */

router.get("/enrolments", requireAuth, requirePermission("trainings"), async (req, res, next) => {
  try {
    const view = String(req.query.view || "payment_pending").toLowerCase();
    const q = view === "all" ? {} : { status: view };

    const rows = await TrainingEnrollment.find(q).sort({ createdAt: -1 }).limit(500).lean();

    const [pending, approved, rejected, all] = await Promise.all([
      TrainingEnrollment.countDocuments({ status: "payment_pending" }),
      TrainingEnrollment.countDocuments({ status: "approved" }),
      TrainingEnrollment.countDocuments({ status: "rejected" }),
      TrainingEnrollment.estimatedDocumentCount(),
    ]);

    const userIds = [...new Set(rows.map((r) => String(r.userId)).filter(Boolean))];
    const trainIds = [...new Set(rows.map((r) => String(r.trainingId)).filter(Boolean))];

    const [users, trainings] = await Promise.all([
      User.find({ _id: { $in: userIds } })
        .select("_id firstName lastName email username entitlements.organizationName")
        .lean(),
      Training.find({ _id: { $in: trainIds } })
        .select("_id title mode date city country venue attendees")
        .lean(),
    ]);
    const byUser = new Map(users.map((u) => [String(u._id), u]));
    const byTraining = new Map(trainings.map((t) => [String(t._id), t]));

    const items = rows.map((e) => {
      const u = byUser.get(String(e.userId));
      const t = byTraining.get(String(e.trainingId));
      const raw = e.payment?.raw || {};
      const proof = String(raw.receiptUrl || "").trim();
      const form = e.formData || {};

      // His guard, minus the seat half. See the header for why.
      let blocked = null;
      if (!t) blocked = "The course on this record no longer exists";
      else if (!proof && !e.payment?.paid) blocked = "No proof of payment to check";

      return {
        id: String(e._id),
        ref: `#${String(e._id).slice(-6).toUpperCase()}`,
        status: e.status,
        who: String(form.fullName || "").trim() || nameOf(u, e.email),
        org: String(form.company || form.organisation || "").trim() || orgOf(u),
        email: String(form.email || u?.email || "").trim(),
        phone: String(form.phone || "").trim(),
        // Who is paying — his distinction, and the reason a mismatched proof
        // is a different conversation.
        payer: String(form.company || form.organisation || "").trim() ? "firm" : "self",
        course: t?.title || "Course no longer exists",
        mode: t?.mode || "",
        city: [t?.city, t?.country].filter(Boolean).join(", "),
        venue: t?.venue || "",
        starts: t?.date || null,
        amount: n0(e.payment?.amountNGN),
        paid: !!e.payment?.paid,
        method: String(raw.method || e.payment?.provider || "").replace(/_/g, " "),
        payerName: String(raw.payerName || "").trim(),
        bankName: String(raw.bankName || "").trim(),
        reference: String(raw.reference || e.payment?.reference || "").trim(),
        proof,
        note: String(raw.note || "").trim(),
        rejectReason: e.rejectReason || "",
        decidedBy: e.decidedBy || "",
        decidedAt: e.decidedAt || null,
        submittedAt: e.formSubmittedAt || e.createdAt,
        age: age(e.formSubmittedAt || e.createdAt),
        blocked,
      };
    });

    res.json({ items, counts: { payment_pending: pending, approved, rejected, all } });
  } catch (err) {
    next(err);
  }
});

/* ────────────────────────────────────────────────────────── submissions ── */

router.get("/submissions", requireAuth, requirePermission("learn"), async (req, res, next) => {
  try {
    const view = String(req.query.view || "pending").toLowerCase();
    const q = view === "all" ? {} : { gradeStatus: view };

    const rows = await CourseSubmission.find(q).sort({ createdAt: -1 }).limit(500).lean();

    const [pending, approved, rejected, all] = await Promise.all([
      CourseSubmission.countDocuments({ gradeStatus: "pending" }),
      CourseSubmission.countDocuments({ gradeStatus: "approved" }),
      CourseSubmission.countDocuments({ gradeStatus: "rejected" }),
      CourseSubmission.estimatedDocumentCount(),
    ]);

    const ids = [...new Set(rows.map((r) => String(r.userId)).filter(Boolean))];
    const users = await User.find({ _id: { $in: ids } })
      .select("_id firstName lastName email username entitlements.organizationName")
      .lean();
    const byId = new Map(users.map((u) => [String(u._id), u]));

    const items = rows.map((s) => {
      const u = byId.get(String(s.userId));
      const file = String(s.fileUrl || "").trim();
      return {
        id: String(s._id),
        ref: `#${String(s._id).slice(-6).toUpperCase()}`,
        status: s.gradeStatus || "pending",
        who: nameOf(u, s.email),
        org: orgOf(u),
        email: String(s.email || u?.email || "").trim(),
        course: s.courseSku || "",
        module: s.moduleCode || "",
        file,
        // The commonest reason a marker cannot mark, said out loud rather than
        // left to look normal. His point.
        blocked: file ? null : "Nothing was attached to this submission",
        note: String(s.note || "").trim(),
        feedback: String(s.feedback || "").trim(),
        gradedBy: s.gradedBy || "",
        gradedAt: s.gradedAt || null,
        sentAt: s.createdAt,
        age: age(s.createdAt),
      };
    });

    res.json({ items, counts: { pending, approved, rejected, all } });
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────────────────── follow-ups ── */

router.get("/followups", requireAuth, requirePermission("adminhub"), async (req, res, next) => {
  try {
    const view = String(req.query.view || "to_call").toLowerCase();
    const q = view === "all" ? {} : { status: view };

    const rows = await FollowUp.find(q)
      .sort({ maxDaysOverdue: -1, createdAt: -1 })
      .limit(500)
      .lean();

    const [toCall, inProgress, done, all] = await Promise.all([
      FollowUp.countDocuments({ status: "to_call" }),
      FollowUp.countDocuments({ status: "in_progress" }),
      FollowUp.countDocuments({ status: "done" }),
      FollowUp.estimatedDocumentCount(),
    ]);

    const items = rows.map((f) => ({
      id: String(f._id),
      who: [f.firstName, f.lastName].filter(Boolean).join(" ").trim() || String(f.email || "").split("@")[0],
      org: String(f.firmName || "").trim(),
      email: f.email || "",
      phone: String(f.phone || "").trim(),
      location: String(f.location || "").trim(),
      status: f.status || "to_call",
      // Why this person is on the list at all — expired licences, unpaid
      // orders, or both. The reason is the call.
      reasons: f.reasons || [],
      products: (f.products || []).map((p) => p.productName || p.productKey).filter(Boolean),
      overdue: n0(f.maxDaysOverdue),
      calls: n0(f.callCount),
      lastCalledAt: f.lastCalledAt || null,
      lastOutcome: String(f.lastOutcome || "").trim(),
      nextAt: f.nextFollowUpAt || null,
      assignedTo: String(f.assignedToName || "").trim(),
      // Somebody who let one licence lapse but still holds another is a
      // different call from somebody who has left entirely.
      hasOther: !!f.hasActiveOther,
      disabled: !!f.accountDisabled,
      note: String(f.note || "").trim(),
    }));

    // The vocabulary comes from the model, not from a copy in the client:
    // an outcome the screen offers that the endpoint rejects is a button that
    // fails, and the two lists drifting apart is how that happens.
    res.json({
      items,
      counts: { to_call: toCall, in_progress: inProgress, done, all },
      outcomes: CALL_OUTCOMES,
      statuses: FOLLOWUP_STATUSES,
    });
  } catch (err) {
    next(err);
  }
});

/* ──────────────────────────────────────────────────────── organisations ── */

/**
 * His framing, and ours by accident of the same design: "There is no
 * organisation object. This screen groups the account list by the company name
 * on each account... a lens, not an owner."
 *
 * True here too, and one level deeper than he knew: the company name is not
 * even on the account, it is on each ENTITLEMENT. So a firm is the set of
 * people who hold a licence naming it, and every figure below is derived from
 * those licences rather than stored anywhere.
 *
 * His one feature a lens needs and a record would not is MERGE — "Summit Build
 * Africa appears twice because somebody typed Ltd". Not built: folding two
 * spellings together needs somewhere to remember the fold, and there is no
 * such store. The screen shows near-duplicate names next to each other so they
 * can at least be seen.
 */
router.get("/organisations", requireAuth, requirePermission("users"), async (_req, res, next) => {
  try {
    const users = await User.find({ "entitlements.0": { $exists: true } })
      .select("firstName lastName email entitlements")
      .lean();

    const firms = new Map();
    for (const u of users) {
      for (const e of u.entitlements || []) {
        const name = String(e.organizationName || "").trim();
        if (!name) continue;
        let f = firms.get(name);
        if (!f) {
          f = { name, people: new Map(), products: new Set(), seats: 0, live: 0, expired: 0 };
          firms.set(name, f);
        }
        f.people.set(String(u._id), {
          id: String(u._id),
          name: nameOf(u),
          email: u.email || "",
        });
        if (e.productKey) f.products.add(e.productKey);
        const live =
          String(e.status).toLowerCase() === "active" &&
          (!e.expiresAt || new Date(e.expiresAt).getTime() >= Date.now());
        if (live) {
          f.seats += n0(e.seats) || 1;
          f.live += 1;
        } else {
          f.expired += 1;
        }
      }
    }

    const items = [...firms.values()]
      .map((f) => ({
        name: f.name,
        accounts: [...f.people.values()],
        headcount: f.people.size,
        products: [...f.products],
        seats: f.seats,
        live: f.live,
        expired: f.expired,
      }))
      .sort((a, b) => b.seats - a.seats || a.name.localeCompare(b.name));

    res.json({ items, total: items.length });
  } catch (err) {
    next(err);
  }
});

export default router;
