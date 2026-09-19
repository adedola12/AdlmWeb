// Where somebody last was in a project (P0.4, his "continue where you left
// off", tab and line). Kept in this browser only: it is a convenience, not a
// record, and a blocked or cleared storage simply means the Work overview
// falls back to the most recently touched project.

const KEY = "adlm-last-place";

/** @returns {{ productKey: string, key: string, name?: string, tab?: string, tabLabel?: string, line?: string, lineLabel?: string, at: number } | null} */
export function readPlace() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    return v && v.productKey && v.key ? v : null;
  } catch {
    return null;
  }
}

export function rememberPlace(place) {
  if (!place?.productKey || !place?.key) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...place, at: Date.now() }));
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
