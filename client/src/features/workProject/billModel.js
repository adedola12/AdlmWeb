// The Bill tab's grouping, filtering and counts — his bill() without the markup.
//
// From work-proj.js:708-760. Everything here is about WHICH lines show and how
// they are grouped; not one figure is computed. Money comes from
// features/projects/lib/projectTotals.js, the same place the Overview tab and
// the classic bill read, for the reason overviewModel.js already gives: a second
// implementation is how two screens end up disagreeing about a contract sum.
//
// HIS FIELDS AND OURS
//
// His fixture line is { desc, el, qty, unit, trade, rate: <id>, keep, done, src }.
// A real line is { description, takeoffLine, qty, unit, trade, category, rate,
// percentComplete, ... } and stores the rate VALUE, not an id into a library —
// so his rateOf(it)/W.build(r) indirection collapses to reading it.rate. The
// readers below are the only place that difference lives.

import { safeNum } from "../projects/lib/projectTotals.js";

/** His descOf (work-proj.js:50). */
export const descOf = (it) => String(it?.description || it?.materialName || "").trim();

/** His unitOf (:54). */
export const unitOf = (it) => String(it?.unit || "").trim();

/** His tradeOf (:58). */
export const tradeOf = (it) => String(it?.trade || "").trim() || "Uncategorised";

/**
 * His elementOf (:67) — `it.cat || ELEMENT[tradeOf(it)] || 'Uncategorised'`.
 *
 * Our equivalent of his `cat` is `category`, which HERON and QUIV both set from
 * the bill's own section headings. He falls back to a trade→element table; we
 * fall back to the trade itself, because the table was his fixture's and the
 * real bill's own section is better than a guess at one.
 */
export const elementOf = (it) =>
  String(it?.category || "").trim() || tradeOf(it);

/** Where the quantity came from — his `it.el`. */
export const measuredAt = (it) => String(it?.takeoffLine || "").trim();

/** A line is priced when it has a rate. Same test as pricedSplit(). */
export const isPriced = (it) => safeNum(it?.rate) > 0;

/** His `it.done` — progress recorded on the line, 0-100. */
export const doneOf = (it) => {
  const n = safeNum(it?.percentComplete);
  return Math.max(0, Math.min(100, n));
};

/** Qty × rate for one line. The one multiplication, and it is his (:768). */
export const amountOf = (it) => safeNum(it?.qty) * safeNum(it?.rate);

/** His four filters (:719). `changed` needs the model-drift list. */
export const FILTERS = Object.freeze([
  { key: "all", label: "All" },
  { key: "unpriced", label: "Unpriced" },
  { key: "changed", label: "Changed in model" },
  { key: "progress", label: "In progress" },
]);

/** His "in progress": started and not finished. */
const inProgress = (it) => {
  const d = doneOf(it);
  return d > 0 && d < 100;
};

/**
 * Does this line pass the current filter and search?
 *
 * His matches() searches description AND the element it was measured at, which
 * is the pair a QS actually remembers a line by.
 */
export function matches(it, { query = "", filter = "all", changed = null } = {}) {
  if (!it) return false;
  if (filter === "unpriced" && isPriced(it)) return false;
  if (filter === "changed" && !changed) return false;
  if (filter === "progress" && !inProgress(it)) return false;
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  return `${descOf(it)} ${measuredAt(it)}`.toLowerCase().includes(q);
}

/**
 * The number beside each chip.
 *
 * His counts (:728). A chip with a count of 0 is not rendered at all — except
 * All, which is how you get back.
 */
export function chipCounts(items, driftByIndex = null) {
  const list = Array.isArray(items) ? items : [];
  return {
    all: list.length,
    unpriced: list.filter((it) => !isPriced(it)).length,
    changed: driftByIndex ? Object.keys(driftByIndex).length : 0,
    progress: list.filter(inProgress).length,
  };
}

/**
 * The bill, grouped his way.
 *
 * Returns one entry per section in first-appearance order, each with the
 * section's own total and its lines' ORIGINAL indexes — the index is the line's
 * identity everywhere else (the side panel, progress writes, the drift list), so
 * it must survive grouping and filtering.
 *
 * `letter` is his A · B · C section prefix, and a row's ref is letter.position,
 * numbered within the FILTERED set exactly as his `letter + '.' + (k + 1)` does.
 */
export function groupBill(items, { by = "element", query = "", filter = "all", driftByIndex = null } = {}) {
  const list = Array.isArray(items) ? items : [];
  const key = by === "trade" ? tradeOf : elementOf;

  const order = [];
  const bucket = new Map();
  list.forEach((it, i) => {
    const name = key(it);
    if (!bucket.has(name)) {
      bucket.set(name, []);
      order.push(name);
    }
    bucket.get(name).push(i);
  });

  return order.map((name, gi) => {
    const all = bucket.get(name);
    const shown = all.filter((i) =>
      matches(list[i], { query, filter, changed: driftByIndex?.[i] || null }),
    );
    return {
      name,
      letter: String.fromCharCode(65 + gi),
      // His sub total is over the WHOLE section, not the filtered rows: a
      // section's value does not change because you searched.
      total: all.reduce((a, i) => a + amountOf(list[i]), 0),
      indexes: shown,
      rows: shown.map((i, k) => ({
        index: i,
        ref: `${String.fromCharCode(65 + gi)}.${k + 1}`,
      })),
    };
  });
}

/**
 * Whether a big bill starts collapsed.
 *
 * His `big = p.items.length > 80`, and a section is open unless big — but a
 * search or a filter forces every matching section open, because a hit you
 * cannot see is the same as no hit.
 */
export function sectionOpen({ name, openMap = {}, itemCount = 0, query = "", filter = "all" }) {
  if (String(query || "").trim() || filter !== "all") return true;
  const explicit = openMap?.[name];
  if (explicit != null) return Boolean(explicit);
  return itemCount <= 80;
}

/** His fold-button label (:743): "Expand all" once everything is shut. */
export function foldLabel(groups, openMap = {}) {
  const names = (groups || []).map((g) => g.name);
  const allShut = names.length > 0 && names.every((n) => openMap?.[n] === false);
  return allShut ? "Expand all" : "Collapse all";
}

/**
 * The title his side panel gives a line — its description (work-proj.js:899).
 *
 * Here rather than beside the panel component, because a file that exports a
 * component may export nothing else.
 */
export function linePanelTitle(items, index) {
  const it = (Array.isArray(items) ? items : [])[index];
  return it ? descOf(it) || "Bill line" : "Bill line";
}
