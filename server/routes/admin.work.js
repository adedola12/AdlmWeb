// server/routes/admin.work.js
//
// The work board (docs/WORK_BOARD.md): everything in flight across ADLM, and
// the proposal-first rule for new features. Same audience as the release desk.
//
//   GET  /admin/work                  items, summary, who you are
//   POST /admin/work                  propose (a feature needs its business case)
//   PATCH /admin/work/:id             edit: the proposer or a super-admin
//   POST /admin/work/:id/decide       approve | changes | declined
//   POST /admin/work/:id/design       design track: status, link, notes
//   POST /admin/work/:id/comment      anyone on the board
//
// There is no delete. A dropped idea is declined or put on hold, so the
// history of what was proposed and why stays readable.
import express from "express";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { WorkItem } from "../models/WorkItem.js";
import { isSuperAdminRole } from "../util/rbac.js";
import { esc, gateMail, getGateConfig, isApprover, ownerEmail, recordGateEvent } from "../util/releaseGate.js";
import {
  CASE_FIELDS,
  DESIGN_STATUSES,
  KINDS,
  PRODUCTS,
  PRODUCT_LABELS,
  STAGES,
  applyVerdict,
  boardSummary,
  decideBlock,
  initialDecision,
  missingBusinessCase,
  needsApproval,
  partitionDecidable,
  resubmitIfNeeded,
  stageBlock,
} from "../util/workBoard.js";
import { boardUrl, notifyApprover } from "../util/workBoardNotice.js";

const router = express.Router();
router.use(requireAuth, requirePermission("releases"));

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const me = (req) => String(req.user?.email || "").trim().toLowerCase();
const clip = (v, n = 4000) => String(v ?? "").trim().slice(0, n);


function refuseViewOnly(req, res) {
  if (req.designMode || req.demoMode) {
    res.status(403).json({ error: "View-only session." });
    return true;
  }
  return false;
}

// Only the fields a person may write; everything else is set by the rules.
function pickEditable(body = {}) {
  const out = {};
  if (body.title !== undefined) out.title = clip(body.title, 200);
  if (body.summary !== undefined) out.summary = clip(body.summary, 2000);
  if (Array.isArray(body.products)) out.products = body.products.filter((p) => PRODUCTS.includes(p));
  if (body.kind !== undefined && KINDS.includes(body.kind)) out.kind = body.kind;
  for (const k of ["progress", "pending"]) if (body[k] !== undefined) out[k] = clip(body[k]);
  if (body.blockedOn !== undefined) out.blockedOn = clip(body.blockedOn, 1000);
  if (body.refs !== undefined) out.refs = clip(body.refs, 1000);
  if (body.businessCase && typeof body.businessCase === "object") {
    for (const f of CASE_FIELDS) {
      if (body.businessCase[f.key] !== undefined) out[`businessCase.${f.key}`] = clip(body.businessCase[f.key]);
    }
  }
  if (body.design && typeof body.design === "object" && body.design.surfaces !== undefined) {
    out["design.surfaces"] = clip(body.design.surfaces);
  }
  return out;
}

// Rebuild the nested business case from $set keys, to check it is complete.
function caseFrom(item, set) {
  const bc = { ...(item?.businessCase?.toObject?.() || item?.businessCase || {}) };
  for (const f of CASE_FIELDS) if (set[`businessCase.${f.key}`] !== undefined) bc[f.key] = set[`businessCase.${f.key}`];
  return bc;
}

async function context(req) {
  const cfg = await getGateConfig();
  return {
    cfg,
    email: me(req),
    approver: isApprover(cfg, me(req)),
    superAdmin: isSuperAdminRole(req.userRole),
  };
}

function title(item) {
  const prods = (item.products || []).map((p) => PRODUCT_LABELS[p] || p).join(", ");
  return `<strong>${esc(item.title)}</strong>${prods ? ` (${esc(prods)})` : ""}`;
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { cfg, email, approver, superAdmin } = await context(req);
    const items = await WorkItem.find({}).sort({ sortOrder: 1, updatedAt: -1 }).lean();
    res.json({
      ok: true,
      approver: { email: cfg.approverEmail, name: cfg.approverName },
      you: { email, isApprover: approver, isSuperAdmin: superAdmin },
      summary: boardSummary(items),
      options: { products: PRODUCTS, productLabels: PRODUCT_LABELS, kinds: KINDS, stages: STAGES, designStatuses: DESIGN_STATUSES, caseFields: CASE_FIELDS },
      items,
    });
  }),
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    if (refuseViewOnly(req, res)) return;
    const { email } = await context(req);
    const set = pickEditable(req.body);
    if (!set.title) return res.status(400).json({ error: "Give it a title." });
    const kind = set.kind || "feature";
    const missing = missingBusinessCase(kind, caseFrom(null, set));
    if (missing.length) {
      return res.status(400).json({ error: `A new ${kind} needs its business case first. Missing: ${missing.join(", ")}.`, missing });
    }
    const doc = { kind };
    for (const [k, v] of Object.entries(set)) {
      const [a, b] = k.split(".");
      if (b) (doc[a] ||= {})[b] = v;
      else doc[a] = v;
    }
    doc.stage = needsApproval(kind) ? "proposed" : STAGES.includes(req.body?.stage) ? req.body.stage : "building";
    doc.decision = { status: initialDecision(kind) };
    doc.design = { ...(doc.design || {}), status: DESIGN_STATUSES.includes(req.body?.design?.status) ? req.body.design.status : "needed" };
    doc.submittedBy = email;
    const item = await WorkItem.create(doc);

    if (needsApproval(kind)) {
      await notifyApprover(item.toObject(), {
        lines: ["Nothing is designed or built until you approve it. Read the business case, then approve, ask for changes or decline."],
      });
    }
    res.status(201).json({ ok: true, item });
  }),
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    if (refuseViewOnly(req, res)) return;
    const { email, superAdmin } = await context(req);
    const item = await WorkItem.findById(req.params.id);
    if (!item) return res.status(404).json({ error: "Not found" });
    if (!superAdmin && item.submittedBy !== email) {
      return res.status(403).json({ error: "Only whoever proposed it, or a super-admin, can edit it." });
    }

    const set = pickEditable(req.body);
    const nextKind = set.kind || item.kind;
    const missing = missingBusinessCase(nextKind, caseFrom(item, set));
    if (missing.length) return res.status(400).json({ error: `The business case is missing: ${missing.join(", ")}.`, missing });

    // Changing a fix into a feature makes it a product decision.
    if (set.kind && !needsApproval(item.kind) && needsApproval(set.kind)) {
      set["decision.status"] = "pending";
      set.stage = "proposed";
    }
    Object.assign(set, resubmitIfNeeded(item));

    const stage = req.body?.stage;
    if (stage !== undefined && set.stage === undefined) {
      const block = stageBlock({ kind: nextKind, decision: { status: set["decision.status"] || item.decision?.status } }, stage);
      if (block) return res.status(409).json({ error: block });
      set.stage = stage;
    }
    const updated = await WorkItem.findByIdAndUpdate(item._id, { $set: set }, { new: true, runValidators: true });
    res.json({ ok: true, item: updated });
  }),
);

router.post(
  "/:id/decide",
  asyncHandler(async (req, res) => {
    if (refuseViewOnly(req, res)) return;
    const { cfg, email, approver, superAdmin } = await context(req);
    const item = await WorkItem.findById(req.params.id);
    if (!item) return res.status(404).json({ error: "Not found" });
    const block = decideBlock({ isApprover: approver, isSuperAdmin: superAdmin, email, approverEmail: cfg.approverEmail, item });
    if (block) return res.status(403).json({ error: block });

    const verdict = String(req.body?.verdict || "");
    if (!["approved", "changes", "declined"].includes(verdict)) {
      return res.status(400).json({ error: "verdict must be approved, changes or declined" });
    }
    const note = clip(req.body?.note);
    if (verdict !== "approved" && note.length < 5) return res.status(400).json({ error: "Say why, so it can be fixed." });

    const updated = await WorkItem.findByIdAndUpdate(item._id, { $set: applyVerdict(item, verdict, { by: email, note }) }, { new: true });
    await recordGateEvent("work.decision", { itemId: String(item._id), title: item.title, verdict, note }, req);
    const word = { approved: "Approved", changes: "Changes requested", declined: "Declined" }[verdict];
    await gateMail({
      to: [ownerEmail(), item.submittedBy],
      subject: `${word}: ${item.title}`,
      title: `Proposal ${word.toLowerCase()}`,
      lines: [title(item), `${esc(email)}: ${word.toLowerCase()}.`, note ? `<em>${esc(note)}</em>` : ""].filter(Boolean),
      cta: { label: "Open the work board", href: boardUrl() },
    });
    res.json({ ok: true, item: updated });
  }),
);

// POST /admin/work/decide-many   one verdict, many proposals
//
// WHY THIS EXISTS
//
// The approver decides in batches — he reads the board, or settles a dozen on a
// call, and then has to register what he decided. Forty-five proposals through
// /:id/decide is forty-five round trips and, worse, forty-five emails: that
// route mails the owner and the submitter on every decision, which is right for
// one and a mailbox flood for forty-five.
//
// So this applies the SAME rules per item and sends ONE summary instead.
//
// WHAT IT DOES NOT DO
//
// It does not relax who may decide. decideBlock runs per item exactly as it
// does for a single decision — including the rule that you cannot approve your
// own proposal — and an item that fails it is skipped and named in the reply
// rather than quietly approved. decision.by is still the caller's own address,
// so the record says who actually pressed it. There is no way here to record a
// decision as somebody else.
router.post(
  "/decide-many",
  asyncHandler(async (req, res) => {
    if (refuseViewOnly(req, res)) return;
    const { cfg, email, approver, superAdmin } = await context(req);

    const verdict = String(req.body?.verdict || "");
    if (!["approved", "changes", "declined"].includes(verdict)) {
      return res.status(400).json({ error: "verdict must be approved, changes or declined" });
    }
    const note = clip(req.body?.note);
    if (verdict !== "approved" && note.length < 5) {
      return res.status(400).json({ error: "Say why, so it can be fixed." });
    }

    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    if (!ids.length) return res.status(400).json({ error: "Name the proposals to decide." });
    // A ceiling so a mistyped request cannot sweep the whole board in one call.
    if (ids.length > 100) return res.status(400).json({ error: "At most 100 at a time." });

    const items = await WorkItem.find({ _id: { $in: ids } });
    const { decidable, blocked } = partitionDecidable(items, {
      isApprover: approver,
      isSuperAdmin: superAdmin,
      email,
      approverEmail: cfg.approverEmail,
    });
    const decided = [];
    const skipped = blocked.map(({ item, reason }) => ({
      id: String(item._id),
      title: item.title,
      reason,
    }));

    for (const item of decidable) {
      await WorkItem.findByIdAndUpdate(item._id, {
        $set: applyVerdict(item, verdict, { by: email, note }),
      });
      // One audit event per item, as a single decision writes: the trail has to
      // read the same whether a thing was decided alone or in a batch.
      await recordGateEvent(
        "work.decision",
        { itemId: String(item._id), title: item.title, verdict, note, batch: true },
        req,
      );
      decided.push({ id: String(item._id), title: item.title });
    }

    const missing = ids.filter((id) => !items.some((i) => String(i._id) === id));
    const word = { approved: "Approved", changes: "Changes requested", declined: "Declined" }[verdict];

    if (decided.length) {
      await gateMail({
        to: [ownerEmail()],
        subject: `${word}: ${decided.length} proposal${decided.length === 1 ? "" : "s"}`,
        title: `${decided.length} proposal${decided.length === 1 ? "" : "s"} ${word.toLowerCase()}`,
        lines: [
          `${esc(email)}: ${word.toLowerCase()}.`,
          note ? `<em>${esc(note)}</em>` : "",
          ...decided.slice(0, 50).map((d) => esc(d.title)),
          decided.length > 50 ? `and ${decided.length - 50} more` : "",
        ].filter(Boolean),
        cta: { label: "Open the work board", href: boardUrl() },
      });
    }

    res.json({ ok: true, verdict, decided, skipped, missing });
  }),
);

router.post(
  "/:id/design",
  asyncHandler(async (req, res) => {
    if (refuseViewOnly(req, res)) return;
    const { email, approver, superAdmin } = await context(req);
    if (!approver && !superAdmin) return res.status(403).json({ error: "Only the approver or a super-admin updates the design track." });
    const item = await WorkItem.findById(req.params.id);
    if (!item) return res.status(404).json({ error: "Not found" });

    const set = { "design.updatedBy": email, "design.updatedAt": new Date() };
    const status = req.body?.status;
    if (status !== undefined) {
      if (!DESIGN_STATUSES.includes(status)) return res.status(400).json({ error: "Unknown design status." });
      set["design.status"] = status;
    }
    for (const k of ["link", "notes", "surfaces"]) if (req.body?.[k] !== undefined) set[`design.${k}`] = clip(req.body[k], k === "link" ? 500 : 4000);
    const updated = await WorkItem.findByIdAndUpdate(item._id, { $set: set }, { new: true, runValidators: true });

    if (status === "ready" && item.design?.status !== "ready") {
      await gateMail({
        to: [ownerEmail(), item.submittedBy],
        subject: `Design ready: ${item.title}`,
        title: "The design is ready to build against",
        lines: [title(item), `Marked ready by ${esc(email)}.`, updated.design.link ? `Design: ${esc(updated.design.link)}` : ""].filter(Boolean),
        cta: { label: "Open the work board", href: boardUrl() },
      });
    }
    res.json({ ok: true, item: updated });
  }),
);

router.post(
  "/:id/comment",
  asyncHandler(async (req, res) => {
    if (refuseViewOnly(req, res)) return;
    const text = clip(req.body?.text);
    if (text.length < 2) return res.status(400).json({ error: "Write something first." });
    const updated = await WorkItem.findByIdAndUpdate(
      req.params.id,
      { $push: { comments: { by: me(req), byName: clip(req.user?.name || req.user?.firstName || "", 120), text, at: new Date() } } },
      { new: true },
    );
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true, item: updated });
  }),
);

export default router;
