// server/routes/admin.releases.js
//
// The release approver's desk. See docs/RELEASE_GATE.md.
//
//   GET  /admin/releases                 pending, recent, who approves
//   POST /admin/releases/:id/approve     approver only; makes it live
//   POST /admin/releases/:id/reject      approver only; note required
//   POST /admin/releases/:id/emergency   super-admin only; ships now, recorded,
//                                        emailed, and flagged for review
//   POST /admin/releases/:id/review      approver only; upholds or objects to
//                                        an emergency release after the fact
//
// Deliberately absent: any route that changes who the approver is. That is
// done by server/scripts/release-gate.mjs, which records and emails the change,
// so the approver cannot be swapped from a browser tab.
import express from "express";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { ReleaseCandidate } from "../models/ReleaseCandidate.js";
import { isSuperAdminRole } from "../util/rbac.js";
import {
  EMERGENCY_REVIEW_HOURS,
  MIN_EMERGENCY_REASON,
  describeCandidate,
  esc,
  gateMail,
  getGateConfig,
  isApprover,
  ownerEmail,
  recordGateEvent,
  releasesUrl,
} from "../util/releaseGate.js";
import { applyCandidate } from "../util/releaseGateFlow.js";

const router = express.Router();
router.use(requireAuth, requirePermission("releases"));

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const me = (req) => String(req.user?.email || "").trim().toLowerCase();

// The view-only roles (Design Access, demo) can open this screen but must
// never decide anything, even simulated.
function refuseViewOnly(req, res) {
  if (req.designMode || req.demoMode) {
    res.status(403).json({ error: "View-only session." });
    return true;
  }
  return false;
}

async function loadCandidate(req, res, status) {
  const c = await ReleaseCandidate.findById(req.params.id);
  if (!c) {
    res.status(404).json({ error: "Release not found" });
    return null;
  }
  if (status && c.status !== status) {
    res.status(409).json({ error: `This release is ${c.status}, not ${status}.` });
    return null;
  }
  return c;
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const cfg = await getGateConfig();
    const [pending, recent, awaitingReview] = await Promise.all([
      ReleaseCandidate.find({ status: "pending" }).sort({ submittedAt: -1 }).lean(),
      ReleaseCandidate.find({ status: { $ne: "pending" } }).sort({ updatedAt: -1 }).limit(50).lean(),
      ReleaseCandidate.find({ status: "emergency", reviewedAt: null }).sort({ decidedAt: -1 }).lean(),
    ]);
    res.json({
      ok: true,
      approver: { email: cfg.approverEmail, name: cfg.approverName, github: cfg.approverGithub },
      you: {
        email: me(req),
        isApprover: isApprover(cfg, me(req)),
        canEmergency: isSuperAdminRole(req.userRole),
      },
      emergencyReviewHours: EMERGENCY_REVIEW_HOURS,
      pending,
      awaitingReview,
      recent,
    });
  }),
);

router.post(
  "/:id/approve",
  asyncHandler(async (req, res) => {
    if (refuseViewOnly(req, res)) return;
    const cfg = await getGateConfig();
    if (!isApprover(cfg, me(req))) {
      return res.status(403).json({ error: "Only the release approver can sign a release off." });
    }
    const c = await loadCandidate(req, res, "pending");
    if (!c) return;
    if (c.submittedBy && c.submittedBy === me(req)) {
      return res.status(403).json({ error: "You submitted this release, so you cannot also approve it." });
    }

    // Claim it atomically so two clicks cannot apply it twice.
    const claimed = await ReleaseCandidate.findOneAndUpdate(
      { _id: c._id, status: "pending" },
      {
        $set: {
          status: "approved",
          decidedBy: me(req),
          decidedAt: new Date(),
          decisionNote: String(req.body?.note || "").trim().slice(0, 2000),
        },
      },
      { new: true },
    );
    if (!claimed) return res.status(409).json({ error: "Someone else already decided this release." });

    const { item, releaseNotice } = await applyCandidate(claimed, { actor: me(req) });
    await recordGateEvent(
      "release.approved",
      { productKey: claimed.productKey, candidateId: String(claimed._id), toVersion: claimed.toVersion, note: claimed.decisionNote },
      req,
    );
    await gateMail({
      to: [ownerEmail(), claimed.submittedBy],
      subject: `Approved: ${claimed.displayName} v${claimed.toVersion} is live`,
      title: "Release approved",
      lines: [describeCandidate(claimed), `Signed off by ${esc(me(req))}.`, claimed.decisionNote ? `Note: ${esc(claimed.decisionNote)}` : ""].filter(Boolean),
    });
    res.json({ ok: true, candidate: claimed, item, releaseNotice });
  }),
);

router.post(
  "/:id/reject",
  asyncHandler(async (req, res) => {
    if (refuseViewOnly(req, res)) return;
    const cfg = await getGateConfig();
    if (!isApprover(cfg, me(req))) {
      return res.status(403).json({ error: "Only the release approver can reject a release." });
    }
    const note = String(req.body?.note || "").trim();
    if (note.length < 5) return res.status(400).json({ error: "Say what needs fixing." });
    const c = await loadCandidate(req, res, "pending");
    if (!c) return;

    c.status = "rejected";
    c.decidedBy = me(req);
    c.decidedAt = new Date();
    c.decisionNote = note.slice(0, 2000);
    await c.save();

    await recordGateEvent("release.rejected", { productKey: c.productKey, candidateId: String(c._id), toVersion: c.toVersion, note }, req);
    await gateMail({
      to: [ownerEmail(), c.submittedBy],
      subject: `Changes requested: ${c.displayName} v${c.toVersion}`,
      title: "Release sent back",
      lines: [describeCandidate(c), `${esc(me(req))} did not approve it:`, `<em>${esc(note)}</em>`],
      cta: { label: "Open releases", href: releasesUrl() },
    });
    res.json({ ok: true, candidate: c });
  }),
);

router.post(
  "/:id/emergency",
  asyncHandler(async (req, res) => {
    if (refuseViewOnly(req, res)) return;
    if (!isSuperAdminRole(req.userRole)) {
      return res.status(403).json({ error: "Only a super-admin can force an emergency release." });
    }
    const reason = String(req.body?.reason || "").trim();
    if (reason.length < MIN_EMERGENCY_REASON) {
      return res.status(400).json({ error: `Give the reason in at least ${MIN_EMERGENCY_REASON} characters. It is emailed to the approver.` });
    }
    const c = await loadCandidate(req, res, "pending");
    if (!c) return;
    const cfg = await getGateConfig();

    // Record FIRST, and refuse if the locked trail cannot be written: an
    // emergency release that leaves no permanent record is exactly what this
    // gate exists to prevent.
    const trail = await recordGateEvent(
      "release.emergency",
      {
        productKey: c.productKey,
        candidateId: String(c._id),
        fromVersion: c.fromVersion,
        toVersion: c.toVersion,
        reason,
        approverEmail: cfg.approverEmail,
      },
      req,
    );
    if (!trail.s3) {
      return res.status(503).json({
        error: "The locked audit log could not be written, so the emergency release was refused. Nothing was shipped.",
      });
    }

    const claimed = await ReleaseCandidate.findOneAndUpdate(
      { _id: c._id, status: "pending" },
      {
        $set: {
          status: "emergency",
          decidedBy: me(req),
          decidedAt: new Date(),
          emergencyReason: reason.slice(0, 2000),
          reviewDueAt: new Date(Date.now() + EMERGENCY_REVIEW_HOURS * 3600 * 1000),
        },
      },
      { new: true },
    );
    if (!claimed) return res.status(409).json({ error: "Someone else already decided this release." });

    const { item, releaseNotice } = await applyCandidate(claimed, { actor: me(req) });
    await gateMail({
      to: [cfg.approverEmail, ownerEmail()],
      subject: `EMERGENCY release without sign-off: ${claimed.displayName} v${claimed.toVersion}`,
      title: "A release went out without your sign-off",
      lines: [
        describeCandidate(claimed),
        `Forced live by <strong>${esc(me(req))}</strong> at ${esc(new Date().toUTCString())}.`,
        `Reason given: <em>${esc(reason)}</em>`,
        `Please review it within ${EMERGENCY_REVIEW_HOURS} hours and either uphold it or object. This is permanently recorded in the locked audit log.`,
      ],
      cta: { label: "Review the emergency release", href: releasesUrl() },
    });
    res.json({ ok: true, candidate: claimed, item, releaseNotice });
  }),
);

router.post(
  "/:id/review",
  asyncHandler(async (req, res) => {
    if (refuseViewOnly(req, res)) return;
    const cfg = await getGateConfig();
    if (!isApprover(cfg, me(req))) {
      return res.status(403).json({ error: "Only the release approver reviews emergency releases." });
    }
    const verdict = String(req.body?.verdict || "");
    if (!["upheld", "objected"].includes(verdict)) {
      return res.status(400).json({ error: "verdict must be upheld or objected" });
    }
    const note = String(req.body?.note || "").trim();
    if (verdict === "objected" && note.length < 5) return res.status(400).json({ error: "Say what is wrong with it." });
    const c = await loadCandidate(req, res, "emergency");
    if (!c) return;
    if (c.reviewedAt) return res.status(409).json({ error: "Already reviewed." });

    c.reviewedBy = me(req);
    c.reviewedAt = new Date();
    c.reviewVerdict = verdict;
    c.decisionNote = note.slice(0, 2000);
    await c.save();

    await recordGateEvent("release.emergency-reviewed", { productKey: c.productKey, candidateId: String(c._id), verdict, note }, req);
    await gateMail({
      to: [ownerEmail(), c.decidedBy],
      subject: `Emergency release ${verdict}: ${c.displayName} v${c.toVersion}`,
      title: verdict === "upheld" ? "Emergency release upheld" : "The approver objected to an emergency release",
      lines: [describeCandidate(c), note ? `Note: <em>${esc(note)}</em>` : ""].filter(Boolean),
    });
    res.json({ ok: true, candidate: c });
  }),
);

export default router;
