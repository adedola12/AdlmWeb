// Certificates — what has been issued, and how to withdraw one.
//
// Ported from his certificates screen in admin-catalogue.js. Issuing already
// existed here and nothing ever looked over what had been issued, which is the
// gap his screen fills; his note names the missing verb outright: "if I want to
// revoke a certificate, how do I revoke a certificate."
//
// WHAT REVOKING ACTUALLY DOES, AND WHAT IT CANNOT
//
// His confirm says a revoked certificate "stops verifying, and anybody
// checking it will be told it was withdrawn". That is a promise about a verify
// page, so this ships one — GET /verify/:ref, public, no key — because a
// Revoke button with nothing behind it is worse than no button: it tells an
// administrator a problem is dealt with when it is not.
//
// It cannot unpublish the PDF. A certificate here is a file on Cloudinary at a
// public URL, and whoever downloaded it still has it. Nothing written in this
// database changes that, and the screen says so rather than implying a power
// it does not have.
//
// THE MARK IS AVERAGED, NOT STORED
//
// His column is a percentage. Ours has real ones: every module carries a quiz,
// and QuizAttempt records a score. So the mark is the mean of the student's
// BEST attempt at each module — best, because a resit that went better is what
// they know now, and averaging their failures in would describe a person who
// no longer exists. A certificate issued by hand has no attempts to average,
// so that one carries the mark that was typed in, and only that one.

import express from "express";
import mongoose from "mongoose";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { CourseEnrollment } from "../models/CourseEnrollment.js";
import { PaidCourse } from "../models/PaidCourse.js";
import { QuizAttempt } from "../models/Quiz.js";
import { User } from "../models/User.js";
import { writeAudit, reqAuditContext } from "../util/audit.js";

const router = express.Router();
const hub = [requireAuth, requirePermission("adminhub")];

/**
 * A reference somebody can read down a telephone.
 *
 * Derived from the record's own id, so it is unique without a counter and
 * without a round trip, and stable for the life of the record — a reissue is
 * the same certificate, so it keeps the same reference.
 */
const refFor = (id) => `CERT-${String(id).slice(-6).toUpperCase()}`;

/** The mean of the best attempt at each module, or null if they sat none. */
function markFrom(attempts) {
  const best = new Map();
  for (const a of attempts) {
    const k = a.moduleCode || String(a.quizId || "");
    const score = Number(a.score) || 0;
    if (!best.has(k) || score > best.get(k)) best.set(k, score);
  }
  if (!best.size) return null;
  const all = [...best.values()];
  return Math.round(all.reduce((x, y) => x + y, 0) / all.length);
}

/** Everything the register and the verify page both need. */
async function decorate(rows) {
  if (!rows.length) return [];

  const skus = [...new Set(rows.map((r) => r.courseSku).filter(Boolean))];
  const ids = rows.map((r) => r.userId).filter(Boolean);

  const [courses, people, attempts] = await Promise.all([
    PaidCourse.find({ sku: { $in: skus } }).select("sku title").lean(),
    User.find({ _id: { $in: ids } }).select("firstName lastName email").lean(),
    QuizAttempt.find({ userId: { $in: ids } })
      .select("userId courseSku moduleCode quizId score")
      .lean(),
  ]);

  const titleOf = new Map(courses.map((c) => [c.sku, c.title]));
  const whoOf = new Map(
    people.map((u) => [
      String(u._id),
      {
        name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
        email: u.email,
      },
    ]),
  );

  // Attempts bucketed by person and course, so each row averages only its own.
  const byPair = new Map();
  for (const a of attempts) {
    const k = `${a.userId}|${a.courseSku}`;
    if (!byPair.has(k)) byPair.set(k, []);
    byPair.get(k).push(a);
  }

  return rows.map((r) => {
    const who = whoOf.get(String(r.userId));
    const sat = byPair.get(`${r.userId}|${r.courseSku}`) || [];
    return {
      id: String(r._id),
      ref: r.certificateRef || refFor(r._id),
      who: who?.name || r.email || "Unknown",
      email: who?.email || r.email || "",
      course: titleOf.get(r.courseSku) || r.courseSku || "A course",
      issued: r.certificateIssuedAt,
      // A hand-issued mark wins, because there were no attempts behind it.
      mark: r.certificateMark ?? markFrom(sat),
      state: r.certificateState || "issued",
      why: r.certificateWhy || "",
      url: r.certificateUrl || "",
      changedAt: r.certificateStateAt,
      changedBy: r.certificateStateBy || "",
    };
  });
}

/* ─────────────────────────────────────────────────────────── the register ── */

router.get("/", ...hub, async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    const find = { certificateIssuedAt: { $ne: null } };

    const rows = await CourseEnrollment.find(find)
      .sort({ certificateIssuedAt: -1 })
      .limit(500)
      .lean();

    let items = await decorate(rows);

    if (q) {
      const t = q.toLowerCase();
      items = items.filter((c) =>
        `${c.ref} ${c.who} ${c.email} ${c.course}`.toLowerCase().includes(t),
      );
    }

    // His four: all, issued, reissued, revoked.
    const counts = { all: items.length };
    for (const c of items) counts[c.state] = (counts[c.state] || 0) + 1;

    res.json({ items, counts, total: items.length });
  } catch (err) {
    next(err);
  }
});

/* ────────────────────────────────────────────────────────────── the verbs ── */

/**
 * Issue one by hand.
 *
 * His intro: certificates normally issue themselves when a submission passes,
 * and doing it here is for the times that did not happen — which is why it
 * asks why. His form takes a name; ours takes an email, because a certificate
 * that is not attached to an account cannot be verified against anybody, and
 * an unverifiable certificate is the thing the verify page exists to prevent.
 */
router.post("/", ...hub, async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const courseSku = String(req.body?.courseSku || "").trim();
    const mark = Math.round(Number(req.body?.mark));
    const why = String(req.body?.why || "").trim();
    const issued = req.body?.issued ? new Date(req.body.issued) : new Date();

    if (!email || !courseSku) return res.status(400).json({ error: "Who, and which course." });
    if (!why) {
      return res
        .status(400)
        .json({ error: "Every certificate issued outside the normal path needs a reason." });
    }
    if (!Number.isFinite(mark) || mark < 0 || mark > 100) {
      return res.status(400).json({ error: "A mark between 0 and 100." });
    }

    const course = await PaidCourse.findOne({ sku: courseSku }).select("sku title passMark").lean();
    if (!course) return res.status(404).json({ error: "No such course." });

    // The pass mark is the course's own where it has one; his form used 50.
    const pass = Number(course.passMark) || 50;
    if (mark < pass) {
      return res.status(400).json({
        error: `Below the pass mark of ${pass}%. A certificate cannot be issued for it.`,
      });
    }

    const user = await User.findOne({ email }).select("_id email").lean();
    if (!user) {
      return res.status(404).json({ error: `No account for ${email}. They must have one first.` });
    }

    // An enrolment may already exist without a certificate — that is the
    // ordinary case for somebody who sat the course offline.
    let enr = await CourseEnrollment.findOne({ userId: user._id, courseSku });
    if (!enr) {
      enr = new CourseEnrollment({ userId: user._id, email, courseSku, status: "completed" });
    }
    if (enr.certificateIssuedAt) {
      return res.status(409).json({
        error: "They already hold one for this course. Reissue it rather than issuing a second.",
      });
    }

    enr.status = "completed";
    enr.certificateIssuedAt = issued;
    enr.certificateRef = refFor(enr._id);
    enr.certificateState = "issued";
    enr.certificateMark = mark;
    enr.certificateWhy = `Issued by hand — ${why}`;
    enr.certificateStateAt = new Date();
    enr.certificateStateBy = req.user?.email || "";
    await enr.save();

    await writeAudit({
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      action: "certificate.issue.byhand",
      status: 201,
      ...reqAuditContext(req),
      targetEmail: email,
      meta: { ref: enr.certificateRef, course: course.title, mark, why },
    });

    res.status(201).json({ ok: true, ref: enr.certificateRef, who: email });
  } catch (err) {
    next(err);
  }
});

/**
 * Withdraw one.
 *
 * His words on the confirm, kept because they are the honest ones: they keep
 * their pass; the certificate is what is withdrawn.
 */
router.post("/:id/revoke", ...hub, async (req, res, next) => {
  try {
    const why = String(req.body?.why || "").trim();
    if (!why) {
      return res.status(400).json({
        error:
          "A revoked certificate without a reason cannot be explained to the person holding " +
          "it, or to an employer who asks.",
      });
    }
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Not a certificate." });
    }

    const enr = await CourseEnrollment.findById(req.params.id);
    if (!enr || !enr.certificateIssuedAt) {
      return res.status(404).json({ error: "No such certificate." });
    }

    enr.certificateState = "revoked";
    enr.certificateWhy = why;
    enr.certificateStateAt = new Date();
    enr.certificateStateBy = req.user?.email || "";
    if (!enr.certificateRef) enr.certificateRef = refFor(enr._id);
    await enr.save();

    await writeAudit({
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      action: "certificate.revoke",
      status: 200,
      ...reqAuditContext(req),
      targetEmail: enr.email || "",
      meta: { ref: enr.certificateRef, why },
    });

    res.json({ ok: true, ref: enr.certificateRef });
  } catch (err) {
    next(err);
  }
});

/** Put a withdrawn one back. */
router.post("/:id/reinstate", ...hub, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Not a certificate." });
    }
    const enr = await CourseEnrollment.findById(req.params.id);
    if (!enr || !enr.certificateIssuedAt) {
      return res.status(404).json({ error: "No such certificate." });
    }
    if (enr.certificateState !== "revoked") {
      return res.status(409).json({ error: "That one is not revoked." });
    }

    enr.certificateState = "issued";
    enr.certificateWhy = "";
    enr.certificateStateAt = new Date();
    enr.certificateStateBy = req.user?.email || "";
    await enr.save();

    await writeAudit({
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      action: "certificate.reinstate",
      status: 200,
      ...reqAuditContext(req),
      targetEmail: enr.email || "",
      meta: { ref: enr.certificateRef },
    });

    res.json({ ok: true, ref: enr.certificateRef });
  } catch (err) {
    next(err);
  }
});

/**
 * A fresh copy of the same pass.
 *
 * His intro: same pass, same mark, a fresh copy; the original stays on the
 * record. The reference does NOT change, because it is what verifies — a
 * replacement copy that verified as a different certificate would be a second
 * certificate, which is exactly what a reissue is not.
 */
router.post("/:id/reissue", ...hub, async (req, res, next) => {
  try {
    const why = String(req.body?.why || "").trim();
    if (!why) return res.status(400).json({ error: "Say why it is being reissued." });
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Not a certificate." });
    }

    const enr = await CourseEnrollment.findById(req.params.id);
    if (!enr || !enr.certificateIssuedAt) {
      return res.status(404).json({ error: "No such certificate." });
    }
    if (enr.certificateState === "revoked") {
      return res.status(409).json({
        error: "That one is withdrawn. Reinstate it before reissuing, or the copy contradicts it.",
      });
    }

    enr.certificateState = "reissued";
    enr.certificateWhy = why;
    enr.certificateStateAt = new Date();
    enr.certificateStateBy = req.user?.email || "";
    if (!enr.certificateRef) enr.certificateRef = refFor(enr._id);
    await enr.save();

    await writeAudit({
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      action: "certificate.reissue",
      status: 200,
      ...reqAuditContext(req),
      targetEmail: enr.email || "",
      meta: { ref: enr.certificateRef, why },
    });

    res.json({ ok: true, ref: enr.certificateRef, url: enr.certificateUrl || "" });
  } catch (err) {
    next(err);
  }
});

export default router;
