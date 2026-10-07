// Small shared helpers for the assignment screens (R11/R13).

/** The in-page anchor for one assignment: /dash-assignments#<this>. */
export function anchorOf(a) {
  return `${a.courseSku}-${a.moduleCode}`.replace(/[^A-Za-z0-9_-]/g, "-");
}

/** Which tab an assignment sits under on the Assignments page. */
export function tabOf(a) {
  if (a.state === "marked") return "marked";
  if (a.state === "submitted") return "submitted";
  return "todo";
}

export function niceDate(iso) {
  if (!iso) return "–";
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
