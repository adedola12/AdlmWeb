// One shape for the rows the Bill edits, as they travel:
//
//   stored document  →  editor row  →  save payload  →  stored document
//
// WHY THIS EXISTS
// The project save used to rebuild a provisional sum, a variation and a
// preliminary item field by field, listing only the fields the editor of the
// day happened to touch. The server replaces the whole array on a PUT, so
// every field left off that list was not "unchanged" — it was erased:
//
//   • a PC sum lost `kind` and came back as a provisional sum;
//   • a variation lost `completed` (so an executed one quietly un-executed),
//     lost `source`, and lost the `decidedAt` / `decidedBy` decision trail;
//   • a preliminary item lost `actualAmount`, the QS's recorded spend;
//   • on a merged (federated) project the rows also lost the
//     `sourceProjectId` tag the server routes them home by, so the save was
//     refused outright.
//
// A row now travels WHOLE. These helpers normalise the handful of fields the
// editors actually type into and carry everything else through untouched, so
// the server's sanitiser stays the single whitelist. Adding a field to the
// model never again needs an edit here.
//
// Nothing here has state and nothing here rounds: callers format.

import { safeNum } from "./projectTotals.js";
import { normalizeVariationStatus } from "../../../lib/variations.js";

/**
 * Which named group a sum belongs to. `kind` is optional (S18) and anything
 * that is not the literal "pc" is a provisional sum — which is what the whole
 * list has always been — so no legacy row moves group.
 */
export function normalizeSumKind(value) {
  return String(value ?? "").trim().toLowerCase() === "pc" ? "pc" : "provisional";
}

/** Where a variation came from. Matches the server's enum and its default. */
export function normalizeVariationSource(value) {
  return String(value ?? "").trim() === "post-lock-new-item"
    ? "post-lock-new-item"
    : "manual";
}

/** A stored date as an <input type="date"> value, or "" when there is none. */
export function toDateInput(value) {
  if (!value) return "";
  const s = String(value);
  // Already a yyyy-mm-dd the editor wrote.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

// ── Provisional / PC sums ────────────────────────────────────────────────

/** A stored sum as the Bill's editor holds it. Every other field is kept. */
export function provisionalSumRow(raw) {
  const s = raw || {};
  return {
    ...s,
    description: String(s.description || ""),
    amount: safeNum(s.amount),
    kind: normalizeSumKind(s.kind),
    completed: Boolean(s.completed),
    completedAt: s.completedAt || null,
  };
}

/** The same row on its way back to the server. */
export function provisionalSumForSave(row) {
  const s = provisionalSumRow(row);
  return { ...s, description: s.description.trim() };
}

/** A brand-new, empty sum in one of the two named groups. */
export function newProvisionalSumRow(kind) {
  const isPc = normalizeSumKind(kind) === "pc";
  return provisionalSumRow({
    description: isPc ? "New PC sum" : "New provisional sum",
    amount: 0,
    kind: isPc ? "pc" : "provisional",
  });
}

// ── Variations ───────────────────────────────────────────────────────────

/** A stored variation as the Bill's editor holds it. Every field is kept. */
export function variationRow(raw) {
  const v = raw || {};
  return {
    ...v,
    description: String(v.description || ""),
    qty: safeNum(v.qty),
    unit: String(v.unit || ""),
    rate: safeNum(v.rate),
    reference: String(v.reference || ""),
    issuedAt: toDateInput(v.issuedAt),
    // A row with no status is one written before the field existed: it has
    // always counted, so it reads as approved. See lib/variations.js.
    status: normalizeVariationStatus(v.status),
    source: normalizeVariationSource(v.source),
    completed: Boolean(v.completed),
    completedAt: v.completedAt || null,
    decidedAt: v.decidedAt || null,
    decidedBy: v.decidedBy || null,
  };
}

/** The same row on its way back to the server. */
export function variationForSave(row) {
  const v = variationRow(row);
  return {
    ...v,
    description: v.description.trim(),
    unit: v.unit.trim(),
    reference: v.reference.trim(),
    issuedAt: v.issuedAt || null,
  };
}

/**
 * A brand-new variation raised from the Bill.
 *
 * PENDING, never approved: a variation is money, and money moves on a
 * decision, not on a keystroke. It is approved or rejected on the Valuation
 * tab's Variations view — the same rule the "Add variation" button there
 * follows, so the two ways in agree.
 */
export function newVariationRow() {
  return variationRow({
    description: "",
    qty: 0,
    unit: "",
    rate: 0,
    reference: "",
    issuedAt: "",
    status: "pending",
    source: "manual",
  });
}

// ── Preliminary items ────────────────────────────────────────────────────

/** A stored preliminary item as the Bill's editor holds it. */
export function preliminaryItemRow(raw) {
  const p = raw || {};
  return {
    ...p,
    name: String(p.name || ""),
    allocation: safeNum(p.allocation),
    completed: Boolean(p.completed),
    completedAt: p.completedAt || null,
    notes: String(p.notes || ""),
    // The QS's recorded spend on this line. It was dropped on load and sent
    // back as 0 on every save, which wiped it.
    actualAmount: safeNum(p.actualAmount),
  };
}

/** The same row on its way back to the server. */
export function preliminaryItemForSave(row) {
  const p = preliminaryItemRow(row);
  return { ...p, name: p.name.trim(), notes: p.notes.trim() };
}

/** A brand-new, empty preliminary item. */
export function newPreliminaryItemRow() {
  return preliminaryItemRow({ name: "", allocation: 0 });
}
