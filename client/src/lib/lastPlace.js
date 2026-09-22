// Where somebody last was in a project (P0.4, his "continue where you left
// off", tab and line). Kept in this browser only: it is a convenience, not a
// record, and a blocked or cleared storage simply means the Work overview
// falls back to the most recently touched project.
//
// S18/WH-05: his rebuilt overview lists the THREE most recent places, not one,
// so this is now a map keyed by "<productKey>:<key>" under the same storage
// key. The single-object shape written before this change is still read, as
// one entry, so nobody's remembered place is lost by the upgrade.

const KEY = "adlm-last-place";

/** How many places are kept. Beyond this, the oldest is dropped. */
const MAX = 10;

const valid = (p) => !!(p && p.productKey && p.key);

const idOf = (p) => `${p.productKey}:${p.key}`;

function readAll() {
  let raw;
  try {
    raw = JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    return {};
  }
  if (!raw || typeof raw !== "object") return {};
  // The pre-S18 shape: one place, stored bare.
  if (valid(raw)) return { [idOf(raw)]: raw };
  const out = {};
  for (const v of Object.values(raw)) if (valid(v)) out[idOf(v)] = v;
  return out;
}

/**
 * The places this browser remembers, most recent first.
 * @param {number} [n] how many to return; all of them when left out.
 * @returns {Array<{ productKey: string, key: string, name?: string, tab?: string, tabLabel?: string, line?: string, lineLabel?: string, at: number }>}
 */
export function readPlaces(n) {
  const rows = Object.values(readAll()).sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0));
  return typeof n === "number" ? rows.slice(0, n) : rows;
}

/** @returns {{ productKey: string, key: string, name?: string, tab?: string, tabLabel?: string, line?: string, lineLabel?: string, at: number } | null} */
export function readPlace() {
  return readPlaces(1)[0] || null;
}

export function rememberPlace(place) {
  if (!valid(place)) return;
  try {
    const all = readAll();
    // Two writes inside the same millisecond would otherwise tie, and a tie
    // makes "most recent" fall back to whatever order the keys happen to be
    // in — which is not an order anybody chose. One millisecond of nudge
    // keeps the list strictly in the order things were actually opened.
    const newest = Math.max(0, ...Object.values(all).map((p) => Number(p.at) || 0));
    all[idOf(place)] = { ...place, at: Math.max(Date.now(), newest + 1) };
    const kept = Object.values(all)
      .sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0))
      .slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(kept.map((p) => [idOf(p), p]))));
  } catch {
    /* storage blocked: nothing is remembered */
  }
}

/** The workspace address that reopens a place: the project, its tab, its line. */
export function placeHref(place) {
  const q = new URLSearchParams({ project: place.key });
  if (place.tab) q.set("tab", place.tab);
  if (place.tab === "bill" && place.line) q.set("line", place.line);
  return `/projects/${encodeURIComponent(place.productKey)}?${q.toString()}`;
}
