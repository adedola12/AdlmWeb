// server/util/workBoard.js
//
// The rules of the work board (docs/WORK_BOARD.md). Pure, so they can be
// pinned by tests without Mongo or Express.
//
// The one rule that matters: from 22 Sep 2026 a new feature, button or
// improvement to an ADLM product is proposed with its business case first,
// and it may not be designed, built or shipped until the release approver has
// approved it. Fixes, infrastructure and releases are shown on the board for
// visibility but do not need that approval (a bug fix is not a product
// decision; a release already has its own sign-off desk).

export const PRODUCTS = [
  "quiv", "heron", "rategen", "mep", "civiq", "timepro", "archicad",
  "qs-app", "installer-hub", "mobile", "website", "ai-service",
  "marketplace", "whatsapp-bot", "infra", "platform",
];

export const PRODUCT_LABELS = {
  quiv: "QUIV (Revit)",
  heron: "HERON (PlanSwift)",
  rategen: "RateGen",
  mep: "Revit MEP Suite",
  civiq: "CIVIQ",
  timepro: "Time Pro",
  archicad: "QUIV for ArchiCAD",
  "qs-app": "QS Takeoff app",
  "installer-hub": "Installer Hub",
  mobile: "Mobile app",
  website: "Website / ADLM Cloud",
  "ai-service": "AI service",
  marketplace: "ADLM Market",
  "whatsapp-bot": "WhatsApp bot",
  infra: "Infrastructure",
  platform: "All products",
};

export const KINDS = ["feature", "button", "improvement", "fix", "infra", "release", "content", "design"];

// Kinds that are product decisions and so need the approver's yes first.
export const NEEDS_APPROVAL = new Set(["feature", "button", "improvement"]);

export const STAGES = [
  "proposed",          // written up, waiting for the approver
  "approved",          // approved, not started
  "in-design",         // the approver (or a designer) is designing it
  "building",          // being coded
  "testing",           // built, being checked
  "awaiting-signoff",  // packaged, waiting at the release desk
  "shipped",           // customers have it
  "on-hold",
  "declined",
];

// Stages a product decision can only reach once it has been approved.
const GATED_STAGES = new Set(["approved", "in-design", "building", "testing", "awaiting-signoff", "shipped"]);

export const DECISIONS = ["pending", "approved", "changes", "declined", "grandfathered", "not-required"];
export const DESIGN_STATUSES = ["not-needed", "needed", "in-progress", "ready", "adopted"];

// The business case a proposal must carry, in the order the form asks for it.
export const CASE_FIELDS = [
  { key: "problem", label: "Problem it solves", required: true },
  { key: "whoBenefits", label: "Who benefits", required: true },
  { key: "value", label: "Business value (revenue, retention, time saved)", required: true },
  { key: "cost", label: "Cost and effort", required: true },
  { key: "risks", label: "Risks", required: false },
  { key: "successMetric", label: "How we will know it worked", required: true },
  { key: "alternatives", label: "Alternatives, including doing nothing", required: false },
];

export const needsApproval = (kind) => NEEDS_APPROVAL.has(String(kind || ""));

// The decision a new item starts with.
export function initialDecision(kind) {
  return needsApproval(kind) ? "pending" : "not-required";
}

// Labels of the required business-case fields that are empty.
export function missingBusinessCase(kind, businessCase = {}) {
  if (!needsApproval(kind)) return [];
  return CASE_FIELDS.filter((f) => f.required && !String(businessCase?.[f.key] || "").trim()).map((f) => f.label);
}

// Can this item move to `stage`? Returns null when it can, else the reason.
export function stageBlock(item, stage) {
  if (!STAGES.includes(stage)) return `Unknown stage "${stage}".`;
  if (!GATED_STAGES.has(stage)) return null;
  if (!needsApproval(item?.kind)) return null;
  const d = item?.decision?.status || "pending";
  if (d === "approved" || d === "grandfathered") return null;
  if (d === "declined") return "The approver declined this proposal. Revise it and propose it again.";
  if (d === "changes") return "The approver asked for changes. Update the business case first.";
  return "This is a new feature: it cannot be designed, built or shipped until the approver approves it.";
}

// Who may decide. The approver decides everyone's proposals except their own;
// a proposal the approver wrote goes to the owner (a super-admin) instead, so
// nobody ever approves their own idea.
export function decideBlock({ isApprover, isSuperAdmin, email, approverEmail, item }) {
  if (!needsApproval(item?.kind)) return "This item does not need approval.";
  const me = String(email || "").trim().toLowerCase();
  if (item?.submittedBy && item.submittedBy === me) return "You proposed this, so you cannot also approve it.";
  if (isApprover) return null;
  const byApprover = !!approverEmail && item?.submittedBy === String(approverEmail).toLowerCase();
  if (isSuperAdmin && byApprover) return null;
  return "Only the release approver can approve proposals.";
}

// What a verdict does to the item. Returns the fields to $set.
export function applyVerdict(item, verdict, { by, note, at = new Date() }) {
  const set = {
    "decision.status": verdict,
    "decision.by": by,
    "decision.at": at,
    "decision.note": String(note || "").trim().slice(0, 4000),
  };
  if (verdict === "approved" && (item.stage === "proposed" || item.stage === "declined")) set.stage = "approved";
  if (verdict === "declined") set.stage = "declined";
  if (verdict === "changes") set.stage = "proposed";
  return set;
}

// After an edit to a proposal that was sent back or declined, it goes back
// in front of the approver. An approved item keeps its approval.
export function resubmitIfNeeded(item) {
  const d = item?.decision?.status;
  if (d === "changes" || d === "declined") {
    return { "decision.status": "pending", "decision.at": null, stage: "proposed" };
  }
  return {};
}

// Group for display: what needs the approver, what is moving, what is done.
export function boardSummary(items = []) {
  const count = (fn) => items.filter(fn).length;
  return {
    total: items.length,
    awaitingDecision: count((i) => needsApproval(i.kind) && i.decision?.status === "pending"),
    inDesign: count((i) => i.stage === "in-design" || i.design?.status === "in-progress"),
    designNeeded: count((i) => i.design?.status === "needed" && !["shipped", "declined"].includes(i.stage)),
    building: count((i) => i.stage === "building" || i.stage === "testing"),
    awaitingSignoff: count((i) => i.stage === "awaiting-signoff"),
    shipped: count((i) => i.stage === "shipped"),
  };
}
