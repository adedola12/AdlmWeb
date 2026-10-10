// server/routes/admin.prospecting.js
//
// The outbound prospecting approval dashboard's API. Mounted at
// /admin/prospecting, behind designMode and demoModeGuard like every admin
// router, so Design Access sees placeholder data and demo roles only ever see
// demo rows.
//
// Two gates:
//   reviewerGate  "prospecting"        the queue and its actions, the prospect
//                                      table, the stats, reading profiles.
//                                      Staff-grantable.
//   adminGate     "prospecting_admin"  editing profiles, the suppression list,
//                                      NDPA delete-on-request. Not grantable:
//                                      super-admins only.
//
// Every change is written to the audit log as prospecting.<action>. The
// logic lives in util/prospecting/review.js.
import express from "express";
import mongoose from "mongoose";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { writeAudit, reqAuditContext } from "../util/audit.js";
import { createReview, ReviewError } from "../util/prospecting/review.js";
import { IdealCustomerProfile } from "../models/IdealCustomerProfile.js";
import { Prospect, PROSPECT_STATUSES } from "../models/Prospect.js";
import { ProspectContact } from "../models/ProspectContact.js";
import { OutreachDraft } from "../models/OutreachDraft.js";
import { Suppression } from "../models/Suppression.js";

const router = express.Router();
const review = createReview({ IdealCustomerProfile, Prospect, ProspectContact, OutreachDraft, Suppression });

// Named, so the route test can prove every endpoint sits behind one of them.
const reviewerPermission = requirePermission("prospecting");
const adminPermission = requirePermission("prospecting_admin");
export const reviewerGate = [requireAuth, reviewerPermission];
export const adminGate = [requireAuth, adminPermission];
reviewerPermission.gate = "prospecting";
adminPermission.gate = "prospecting_admin";

const actor = (req) => String(req.user?.email || "").toLowerCase();
const validId = (id) => mongoose.isValidObjectId(id);

/** Runs a handler, maps ReviewError to its status, logs anything else. */
const handle = (fn) => async (req, res) => {
  try {
    const out = await fn(req, res);
    if (!res.headersSent) res.json({ ok: true, ...out });
  } catch (err) {
    if (err instanceof ReviewError) {
      return res.status(err.status).json({ ok: false, error: err.message, ...(err.problems ? { problems: err.problems } : {}) });
    }
    console.error("[admin.prospecting]", req.method, req.path, err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
};

const idParam = (req) => {
  if (!validId(req.params.id)) throw new ReviewError(400, "Invalid id.");
  return req.params.id;
};

function audit(req, action, meta) {
  // Fire-and-forget: writeAudit never throws.
  writeAudit({ ...reqAuditContext(req), actorId: req.user?._id || req.user?.id, actorEmail: actor(req), action: `prospecting.${action}`, status: 200, meta });
}

/* ───────────────────────────── reviewer ───────────────────────────── */

// GET /admin/prospecting/stats?from=&to=&profile=
router.get("/stats", reviewerGate, handle(async (req) => {
  const profileId = req.query.profile && validId(req.query.profile) ? req.query.profile : undefined;
  return { stats: await review.stats({ from: req.query.from, to: req.query.to, profileId }) };
}));

// GET /admin/prospecting/queue?profile=&limit=
router.get("/queue", reviewerGate, handle(async (req) => {
  const profileId = req.query.profile && validId(req.query.profile) ? req.query.profile : undefined;
  return review.queue({ profileId, limit: Number(req.query.limit) || 25 });
}));

// GET /admin/prospecting/drafts/:id
router.get("/drafts/:id", reviewerGate, handle(async (req) => ({ draft: await review.getDraft(idParam(req)) })));

// POST /admin/prospecting/drafts/:id/approve   { emails?: [{subject, body} x3] }
router.post("/drafts/:id/approve", reviewerGate, handle(async (req) => {
  const out = await review.approve(idParam(req), { by: actor(req), emails: req.body?.emails });
  audit(req, out.draft.edited ? "draft.edit-approve" : "draft.approve", { draftId: out.draft._id, prospectId: out.draft.prospectId });
  return out;
}));

// POST /admin/prospecting/drafts/:id/reject   { reason }
router.post("/drafts/:id/reject", reviewerGate, handle(async (req) => {
  const out = await review.reject(idParam(req), { by: actor(req), reason: req.body?.reason });
  audit(req, "draft.reject", { draftId: out.draft._id, prospectId: out.draft.prospectId, reason: out.draft.rejectReason });
  return out;
}));

// POST /admin/prospecting/prospects/:id/bad-fit   { reason }
router.post("/prospects/:id/bad-fit", reviewerGate, handle(async (req) => {
  const out = await review.badFit(idParam(req), { by: actor(req), reason: req.body?.reason });
  audit(req, "prospect.bad-fit", { prospectId: out.prospect._id, domain: out.prospect.domain });
  return out;
}));

// POST /admin/prospecting/prospects/:id/outcome   { outcome: "replied" | "booked" }
router.post("/prospects/:id/outcome", reviewerGate, handle(async (req) => {
  const out = await review.recordOutcome(idParam(req), { outcome: req.body?.outcome });
  audit(req, `prospect.${req.body?.outcome}`, { prospectId: out.prospect._id });
  return out;
}));

// GET /admin/prospecting/prospects?profile=&status=&from=&to=&q=&page=&limit=
router.get("/prospects", reviewerGate, handle(async (req) => {
  const status = PROSPECT_STATUSES.includes(String(req.query.status)) ? String(req.query.status) : undefined;
  const profileId = req.query.profile && validId(req.query.profile) ? req.query.profile : undefined;
  const out = await review.listProspects({
    profileId, status, from: req.query.from, to: req.query.to, q: req.query.q, page: req.query.page, limit: req.query.limit,
  });
  return { ...out, statuses: PROSPECT_STATUSES };
}));

// GET /admin/prospecting/prospects/:id
router.get("/prospects/:id", reviewerGate, handle(async (req) => ({ prospect: await review.getProspect(idParam(req)) })));

// GET /admin/prospecting/profiles
router.get("/profiles", reviewerGate, handle(async () => ({ profiles: await review.listProfiles() })));

/* ───────────────────────────── admin only ───────────────────────────── */

// POST /admin/prospecting/profiles
router.post("/profiles", adminGate, handle(async (req) => {
  const profile = await review.createProfile(req.body);
  audit(req, "profile.create", { profileId: profile._id, key: profile.key });
  return { profile };
}));

// PATCH /admin/prospecting/profiles/:id
router.patch("/profiles/:id", adminGate, handle(async (req) => {
  const profile = await review.updateProfile(idParam(req), req.body);
  audit(req, "profile.update", { profileId: profile._id, fields: Object.keys(req.body || {}) });
  return { profile };
}));

// POST /admin/prospecting/suppressions   { email } | { domain }, note
router.post("/suppressions", adminGate, handle(async (req) => {
  const out = await review.suppress({ email: req.body?.email, domain: req.body?.domain, note: String(req.body?.note || ""), by: actor(req) });
  // The audit row carries the hash, never the address.
  audit(req, "suppression.add", { kind: out.kind, domain: out.domain, emailHash: out.emailHash });
  return { suppression: { kind: out.kind, domain: out.domain } };
}));

// POST /admin/prospecting/suppressions/check   { email } | { domain }
// A POST so an email address never sits in a URL or an access log.
router.post("/suppressions/check", adminGate, handle(async (req) => review.checkSuppressed({ email: req.body?.email, domain: req.body?.domain })));

// DELETE /admin/prospecting/prospects/:id   { note }   NDPA delete-on-request
router.delete("/prospects/:id", adminGate, handle(async (req) => {
  const out = await review.deleteOnRequest(idParam(req), { by: actor(req), note: req.body?.note });
  audit(req, "prospect.delete-on-request", { domain: out.domain, contacts: out.contacts, drafts: out.drafts, note: String(req.body?.note || "").slice(0, 300) });
  return { deleted: out };
}));

export default router;
