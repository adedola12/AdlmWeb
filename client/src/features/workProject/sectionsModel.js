// The bill's sections: what they are, what order they are in, and what the
// bill engine thinks they should be.
//
// WHERE THE ORDER IS KEPT, AND WHY THERE IS NO NEW FIELD
//
// `customCategories` is already on the project, already accepted by the PUT
// (routes/projects.js:4075 — trimmed, de-duped, capped at 200) and, being an
// array, already carries an order. So it is used as the project's own ordered
// list of sections rather than adding a second field that could disagree with
// it. No server change, and nothing new for a plugin to learn.
//
// A section a bill line actually uses but the list does not name is NOT
// dropped: it is appended in the order it first appears on the bill. That
// matters because the sections come from the take-off in the first place, and a
// list that silently hid one would hide the lines filed under it.
//
// SUGGESTIONS COME FROM THE BILL ENGINE, NOT FROM HERE
//
// lib/boqCategory.js is the classifier the server uses on every save
// (deriveItemCategory). Asking it, rather than writing a second set of rules
// here, is the whole point: a suggestion that disagreed with what the server
// files a line under on the next save would be worse than no suggestion.

import { categoriesForProductKey, rulesForProductKey } from "../../lib/boqCategory.js";
import { elementOf } from "./billModel.js";

const clean = (v) => String(v || "").trim();
const key = (v) => clean(v).toLowerCase();

/** Every section the bill actually uses, in the order the lines first use them. */
export function sectionsOnBill(items) {
  const seen = new Map();
  for (const it of Array.isArray(items) ? items : []) {
    const name = elementOf(it);
    if (!name) continue;
    if (!seen.has(key(name))) seen.set(key(name), name);
  }
  return [...seen.values()];
}

/**
 * The project's sections, in order.
 *
 * `customCategories` first, in its own order, then anything the bill uses that
 * the list does not name. A name in the list that no line uses is kept — that
 * is how an empty section a QS has just added survives until they file
 * something under it.
 */
export function orderedSections(project) {
  const listed = (Array.isArray(project?.customCategories) ? project.customCategories : [])
    .map(clean)
    .filter(Boolean);
  const out = [];
  const seen = new Set();
  for (const name of listed) {
    if (seen.has(key(name))) continue;
    seen.add(key(name));
    out.push(name);
  }
  for (const name of sectionsOnBill(project?.items)) {
    if (seen.has(key(name))) continue;
    seen.add(key(name));
    out.push(name);
  }
  return out;
}

/** How many bill lines sit in each section, so an empty one can say so. */
export function sectionCounts(items) {
  const counts = new Map();
  for (const it of Array.isArray(items) ? items : []) {
    const k = key(elementOf(it));
    if (!k) continue;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return counts;
}

/**
 * Move a section, by index in the ordered list.
 *
 * Returns a patch for saveProject, or null when the move changes nothing —
 * so a drag that ends where it started does not write.
 */
export function withSectionMoved(project, from, to) {
  const order = orderedSections(project);
  if (from === to) return null;
  if (from < 0 || from >= order.length) return null;
  if (to < 0 || to >= order.length) return null;
  const next = [...order];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return { customCategories: next };
}

/**
 * Add a section.
 *
 * Refuses a blank, and refuses one the project already has under any casing —
 * two sections whose names differ only by case would group as one on every
 * screen while reading as two here.
 */
export function withSectionAdded(project, name) {
  const wanted = clean(name);
  if (!wanted) return null;
  const order = orderedSections(project);
  if (order.some((s) => key(s) === key(wanted))) return null;
  return { customCategories: [...order, wanted] };
}

/**
 * Rename a section: the list entry AND every line filed under it.
 *
 * Both, or the lines would re-appear under the old name the moment
 * orderedSections read the bill again.
 */
export function withSectionRenamed(project, from, to) {
  const was = clean(from);
  const now = clean(to);
  if (!was || !now || key(was) === key(now)) return null;
  const order = orderedSections(project);
  if (order.some((s) => key(s) === key(now))) return null;
  const items = Array.isArray(project?.items) ? project.items : [];
  return {
    customCategories: order.map((s) => (key(s) === key(was) ? now : s)),
    items: items.map((it) => (key(elementOf(it)) === key(was) ? { ...it, category: now } : it)),
  };
}

/**
 * What the bill engine reads this line AS, from its text alone.
 *
 * Deliberately not deriveItemCategory(): that keeps an existing valid category
 * and only classifies a line that has none, because on a save it must never
 * overwrite where a QS has filed something. Which means it can never say a line
 * is in the wrong place — asked about a column already filed under
 * Substructure, it answers "Substructure".
 *
 * A suggestion is the opposite question: ignore where it is, and say what the
 * text looks like. Same rules, from the same module — rulesForProductKey is
 * what deriveItemCategory itself runs — so a suggestion and the next save
 * cannot be built on two different rule sets.
 */
export function suggestSectionFor(item, productKey) {
  const haystack = [item?.description, item?.takeoffLine, item?.materialName, item?.type, item?.code]
    .map((v) => String(v || ""))
    .join(" ");
  if (!haystack.trim()) return "";
  for (const rule of rulesForProductKey(productKey)) {
    if (rule.re.test(haystack)) return rule.name;
  }
  return "";
}

/**
 * Lines the engine would file somewhere other than where they are.
 *
 * Only lines it is confident about: an Uncategorized answer is the engine
 * saying it does not know, which is not a reason to move anything.
 */
export function misfiledLines(project, productKey) {
  const items = Array.isArray(project?.items) ? project.items : [];
  const out = [];
  items.forEach((it, index) => {
    const suggested = suggestSectionFor(it, productKey);
    if (!suggested) return;
    const now = elementOf(it);
    if (key(now) === key(suggested)) return;
    out.push({ index, now, suggested, description: clean(it?.description) || clean(it?.takeoffLine) });
  });
  return out;
}

/**
 * The arrangement the engine would use: its own canonical order first, then
 * whatever else the project has, in the order it already had it.
 *
 * Returns null when the project is already in that order, so "suggest an
 * arrangement" can say there is nothing to change rather than offering a
 * no-op.
 */
export function suggestedArrangement(project, productKey) {
  const canonical = categoriesForProductKey(productKey).map(clean);
  const order = orderedSections(project);
  const ranked = [
    ...canonical.filter((c) => order.some((s) => key(s) === key(c))),
    ...order.filter((s) => !canonical.some((c) => key(c) === key(s))),
  ];
  // Keep the project's own spelling, not the engine's.
  const next = ranked.map((r) => order.find((s) => key(s) === key(r)) || r);
  const same = next.length === order.length && next.every((s, i) => key(s) === key(order[i]));
  return same ? null : { customCategories: next };
}

/** Move one line into a section — the drop half of drag and drop. */
export function withLineSection(project, index, section) {
  const items = Array.isArray(project?.items) ? project.items : [];
  if (index < 0 || index >= items.length) return null;
  const name = clean(section);
  if (!name) return null;
  if (key(elementOf(items[index])) === key(name)) return null;
  return {
    items: items.map((it, i) => (i === index ? { ...it, category: name } : it)),
  };
}
