// The life of a bill line's rate lock, from the first keystroke to the save.
//
// A line the QS priced himself carries `rateLockedAt`, and the server then
// stops re-deriving its rate from the Budget build-up (see
// server/util/deriveBillRates.js). Releasing that stamp hands the line back to
// the Budget — which CHANGES THE LINE'S RATE on the very next save. On a 100 m³
// line priced at ₦12,000 over a build-up worth ₦9,000, that is ₦300,000.
//
// So three rules, and this module is where they live because the page they
// serve (pages/ProjectsGeneric.jsx) cannot be unit-tested:
//
//   1. A cell the QS is editing never goes read-only under him. Inside one
//      unsaved session editability may only ever WIDEN: the lock decision is
//      taken from the line as STORED, and a pending stamp can only unlock.
//   2. A release is a decision, not a keystroke. Backspacing a cell on the way
//      to retyping it reports itself as `editing` and leaves the stamp alone;
//      only COMMITTING the empty cell (blur, Enter, clicking away) releases.
//   3. Whatever the QS has pending, the save writes the stored figure until he
//      changes it — `rateFieldsForSave` is the one place that decides.
//
// Pure — no React, no network. Unit-tested in rateStamp.test.js.

import { isRateApplied } from "./rateReconcile.js";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * What a rate cell's `onChange` meta does to that line's stamp.
 *
 * Returns the next stamp, or `null` for "leave the stamp exactly as it was" —
 * which is the whole answer for a keystroke mid-edit.
 *
 *   { source: "editing" } — the cell's text changed on the way to something
 *       else. The rate map takes the text so the QS can see what he is typing;
 *       the stamp does not move.
 *   { source: "cleared" } — an empty cell, COMMITTED. A deliberate release: the
 *       line goes back to being derived from its Budget build-up. The plugin's
 *       appliedRateKey is kept (`keepRateKey`) — that records which library rate
 *       produced the figure and is not ours to erase.
 *   { source: "rategen", rateKey } — a pick out of the library.
 *   { source: "typed" } — a figure the QS entered or worked out by formula.
 */
export function nextRateStamp(meta, { keepRateKey = "", now = null } = {}) {
  if (!meta) return null;
  const source = String(meta.source || "");
  if (source === "editing") return null;
  if (source === "cleared") {
    return { appliedRateKey: String(keepRateKey || ""), rateLockedAt: null };
  }
  return {
    appliedRateKey:
      source === "rategen" ? String(meta.rateKey || "").trim() : "",
    rateLockedAt: now || new Date().toISOString(),
  };
}

/**
 * What an unsaved edit lets the screen do with one line.
 *
 *   rateApplied — is this line the QS's own rate? Stored OR pending, never
 *       "pending only": a pending stamp may unlock a cell, and may never lock
 *       one. That is rule 1 — the QS cannot be shut out of the cell he is in.
 *   released — the QS has committed a release that is not saved yet. The line
 *       still holds its old rate on screen and in the database; the next save
 *       hands it to the Budget. The screen says so before that happens.
 */
export function rateEditState(storedItem, stamp) {
  const stored = isRateApplied(storedItem);
  return {
    rateApplied: stored || (stamp ? isRateApplied(stamp) : false),
    released: stored && Boolean(stamp) && !isRateApplied(stamp),
  };
}

/**
 * The bill codes whose rate the Budget build-up drives — the read-only cells.
 *
 * `stampFor(item, index)` hands back the pending stamp for a line, or null.
 * A code is Budget-driven when something under it is priced and the line is
 * not the QS's own; `rateEditState` is what decides the second half, so a
 * keystroke can never move a code into this set.
 */
export function budgetDrivenCodes(items, budgetItems, stampFor) {
  const applied = new Set();
  const rows = Array.isArray(items) ? items : [];
  for (let i = 0; i < rows.length; i += 1) {
    const it = rows[i];
    const code = String(it?.code || "").trim().toLowerCase();
    if (!code) continue;
    const stamp = stampFor ? stampFor(it, i) : null;
    if (rateEditState(it, stamp).rateApplied) applied.add(code);
  }
  const net = new Map();
  for (const b of Array.isArray(budgetItems) ? budgetItems : []) {
    const code = String(b?.billIdentity || "").trim().toLowerCase();
    if (!code) continue;
    net.set(code, (net.get(code) || 0) + num(b?.qty) * num(b?.rate));
  }
  const driven = new Set();
  for (const [code, total] of net) {
    if (total > 0 && !applied.has(code)) driven.add(code);
  }
  return driven;
}

/**
 * The three rate fields a save writes for one line.
 *
 * `rawValue` is the cell's unsaved text. An EMPTY cell is not a rate of zero —
 * it falls back to the stored figure, and it is the stamp (released or not)
 * that decides whether the server keeps that figure or re-derives the line.
 */
export function rateFieldsForSave(storedItem, rawValue, stamp) {
  const blank = String(rawValue ?? "").trim() === "";
  return {
    rate: blank ? num(storedItem?.rate) : num(rawValue),
    appliedRateKey: stamp
      ? String(stamp.appliedRateKey || "")
      : String(storedItem?.appliedRateKey || ""),
    rateLockedAt: stamp
      ? (stamp.rateLockedAt ?? null)
      : (storedItem?.rateLockedAt ?? null),
  };
}
