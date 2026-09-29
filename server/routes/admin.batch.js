// server/routes/admin.batch.js
//
// The batch half of the release approver's desk (docs/RELEASE_GATE.md).
//
//   GET  /admin/releases/batch            the batch being tested, if any
//   POST /admin/releases/batch            prepare one (staff): title, sheet, items
//   POST /admin/releases/batch/:id/approve   approver only -> merge is unlocked
//   POST /admin/releases/batch/:id/reject    approver only, note required
//   POST /admin/releases/batch/:id/verdict   approver only, one flow's verdict
//
// Approving does not merge anything here. It records the approval against the
// exact commit tested; .github/workflows/batch-merge.yml sees it within five
// minutes and does the merge, and GitHub's own required status check refuses
// any merge into main without it. So the approver never touches GitHub, and a
// tampered database row still cannot ship code by itself: the check reads this
// API, and every approval is written to the locked audit log as well.
import express from "express";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { ReleaseBatch } from "../models/ReleaseBatch.js";
import {
  esc,
  gateMail,
  getGateConfig,
  isApprover,
  ownerEmail,
  recordGateEvent,
  releasesUrl,
} from "../util/releaseGate.js";

const router = express.Router();
router.use(requireAuth, requirePermission("releases"));

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const me = (req) => String(req.user?.email || "").trim().toLowerCase();

function refuseViewOnly(req, res) {
  if (req.designMode || req.demoMode) {
    res.status(403).json({ error: "View-only session." });
    return true;
  }
  return false;
}

async function requireApprover(req, res) {
  const cfg = await getGateConfig();
  if (!isApprover(cfg, me(req))) {
    res.status(403).json({ error: "Only the release approver can decide a batch." });
    return null;
  }
  return cfg;
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const cfg = await getGateConfig();
    const [current, recent] = await Promise.all([
      ReleaseBatch.findOne({ status: { $in: ["testing", "approved", "changes-requested"] } })
        .sort({ createdAt: -1 })
        .lean(),
      ReleaseBatch.find({ status: { $in: ["merged", "superseded", "failed"] } })
        .sort({ updatedAt: -1 })
        .limit(10)
        .lean(),
    ]);
    res.json({ ok: true, batch: current || null, recent, isApprover: isApprover(cfg, me(req)) });
  }),
);

/** Prepare a batch. Any staff member with the releases area may do this. */
router.post(
  "/",
  asyncHandler(async (req, res) => {
    if (refuseViewOnly(req, res)) return;
    const title = String(req.body?.title || "").trim();
    const headSha = String(req.body?.headSha || "").trim().toLowerCase();
    if (!title) return res.status(400).json({ error: "A batch needs a title." });
    if (!/^[0-9a-f]{40}$/.test(headSha)) {
      return res.status(400).json({ error: "headSha must be the full 40-character commit on the release branch." });
    }

    // One batch at a time: a new one supersedes whatever was still being
    // tested or sent back. An ALREADY APPROVED batch is left alone on purpose
    // — preparing the next batch must not withdraw an approval that a merge is
    // relying on right now. It becomes irrelevant by itself, because the
    // approval only ever matches the commit it was given for.
    await ReleaseBatch.updateMany(
      { status: { $in: ["testing", "changes-requested"] } },
      { $set: { status: "superseded" } },
    );

    const batch = await ReleaseBatch.create({
      title,
      headSha,
      sheetUrl: String(req.body?.sheetUrl || "").trim(),
      items: Array.isArray(req.body?.items) ? req.body.items : [],
      preparedBy: me(req),
    });

    await recordGateEvent("batch.prepared", { batchId: String(batch._id), title, headSha }, req);
    res.status(201).json({ ok: true, batch });
  }),
);

router.post(
  "/:id/approve",
  asyncHandler(async (req, res) => {
    if (refuseViewOnly(req, res)) return;
    const cfg = await requireApprover(req, res);
    if (!cfg) return;

    const batch = await ReleaseBatch.findById(req.params.id);
    if (!batch) return res.status(404).json({ error: "Batch not found" });
    if (batch.status === "merged") return res.status(409).json({ error: "This batch is already live." });
    if (batch.status === "superseded") {
      return res.status(409).json({ error: "A newer batch replaced this one. Test the current batch instead." });
    }

    batch.status = "approved";
    batch.approvedBy = me(req);
    batch.approvedAt = new Date();
    batch.approvalNote = String(req.body?.note || "").trim().slice(0, 2000);
    await batch.save();

    // Recorded before anything can act on it: the merge workflow reads the
    // approval, so the permanent record must exist first.
    const trail = await recordGateEvent(
      "batch.approved",
      { batchId: String(batch._id), title: batch.title, headSha: batch.headSha, note: batch.approvalNote },
      req,
    );

    await gateMail({
      to: [ownerEmail(), batch.preparedBy],
      subject: `Approved: ${batch.title}`,
      title: "The batch is approved",
      lines: [
        `<strong>${esc(batch.title)}</strong> was approved by ${esc(me(req))}.`,
        `Tested build: <code>${esc(batch.headSha.slice(0, 7))}</code>. It goes live within a few minutes.`,
        batch.approvalNote ? `Note: <em>${esc(batch.approvalNote)}</em>` : "",
      ].filter(Boolean),
      cta: { label: "Open the release desk", href: releasesUrl() },
    });

    res.json({
      ok: true,
      batch,
      recorded: trail,
      message: "Approved. The release goes to customers within about five minutes; nothing else to do.",
    });
  }),
);

router.post(
  "/:id/reject",
  asyncHandler(async (req, res) => {
    if (refuseViewOnly(req, res)) return;
    const cfg = await requireApprover(req, res);
    if (!cfg) return;
    const note = String(req.body?.note || "").trim();
    if (note.length < 5) return res.status(400).json({ error: "Say what needs changing." });

    const batch = await ReleaseBatch.findById(req.params.id);
    if (!batch) return res.status(404).json({ error: "Batch not found" });
    if (batch.status === "merged") return res.status(409).json({ error: "This batch is already live." });

    batch.status = "changes-requested";
    batch.approvalNote = note.slice(0, 2000);
    batch.approvedBy = "";
    batch.approvedAt = null;
    await batch.save();

    await recordGateEvent("batch.changes-requested", { batchId: String(batch._id), title: batch.title, note }, req);
    await gateMail({
      to: [ownerEmail(), batch.preparedBy],
      subject: `Changes requested: ${batch.title}`,
      title: "The batch was sent back",
      lines: [`<strong>${esc(batch.title)}</strong>`, `${esc(me(req))} asked for changes:`, `<em>${esc(note)}</em>`],
      cta: { label: "Open the release desk", href: releasesUrl() },
    });
    res.json({ ok: true, batch });
  }),
);

/** One flow's verdict, saved as he works down the sheet. */
router.post(
  "/:id/verdict",
  asyncHandler(async (req, res) => {
    if (refuseViewOnly(req, res)) return;
    const cfg = await requireApprover(req, res);
    if (!cfg) return;
    const key = String(req.body?.key || "").trim();
    const verdict = String(req.body?.verdict || "").trim();
    const allowed = ["works", "needs-change", "could-not-test", "keep", "change", "remove"];
    if (!key || !allowed.includes(verdict)) {
      return res.status(400).json({ error: `verdict must be one of ${allowed.join(", ")}` });
    }

    const batch = await ReleaseBatch.findById(req.params.id);
    if (!batch) return res.status(404).json({ error: "Batch not found" });
    const item = (batch.items || []).find((i) => i.key === key);
    if (!item) return res.status(404).json({ error: "No such item on the sheet." });

    item.verdict = verdict;
    item.note = String(req.body?.note || "").trim().slice(0, 2000);
    await batch.save();
    res.json({ ok: true, item });
  }),
);

export default router;
