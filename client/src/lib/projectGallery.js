// What his project gallery needs to know about one of our projects (P0.4).
// Shared by the gallery, the tool pages and Work's overview.

export const SOURCES = {
  revit: { name: "QUIV", icon: "/ds/ic-quiv.png", host: "Revit", slug: "quiv" },
  planswift: { name: "HERON", icon: "/ds/ic-heron.png", host: "PlanSwift", slug: "heron" },
  mep: { name: "Revit MEP", icon: "/ds/ic-mep.png", host: "Revit", slug: "mep" },
  civil3d: { name: "CIVIQ", icon: "/ds/ic-civiq.png", host: "Civil 3D", slug: "civiq" },
  "qs-takeoff": { name: "Time Pro", icon: "/ds/ic-timepro.png", host: "Time Pro", slug: "timepro" },
  archicad: { name: "ArchiCAD", icon: "", host: "ArchiCAD", slug: "archicad" },
};

// His six stages (work.js STAGES, 17 Sep 2026). Each one is now read from
// something the project actually holds, rather than guessed from how much of
// the bill is ticked off (S18, PR2-24 and PR2-25).
export const STAGES = [
  { id: "takeoff", name: "Takeoff" },
  { id: "priced", name: "Priced" },
  { id: "tendered", name: "Tendered" },
  { id: "locked", name: "Contract locked" },
  { id: "valuing", name: "Valuations" },
  { id: "final", name: "Final account" },
];
export const STAGE_ORDER = Object.fromEntries(STAGES.map((s, i) => [s.id, i]));

/**
 * Where a project has got to.
 *
 * Read the furthest thing that has happened, newest first. Before S18 this
 * guessed from progressPercent, which said "Final account" for any job whose
 * lines were all ticked — including one that had never issued a certificate,
 * let alone closed its account. The list endpoint now returns the five facts
 * below, so the stage is read rather than inferred.
 *
 * An older API response carries none of them; it then falls back to priced or
 * takeoff, which are the two stages that never needed them.
 */
export function stageOf(p) {
  if (p?.finalized) return "final";
  if ((Number(p?.certificateCount) || 0) > 0) return "valuing";
  if (p?.contractLocked) return "locked";
  if (p?.tenderedAt) return "tendered";
  return Number(p?.totalCost) > 0 ? "priced" : "takeoff";
}

/**
 * The one figure the gallery calls "Estimated": the whole grand summary, the
 * same total the Bill shows, computed server side (the list's estimatedTotal).
 *
 * A row from an older API has no estimatedTotal. Rather than invent one from
 * fields it does not carry, fall back to totalCost, the measured work — which
 * is what the card showed before S18.
 */
export function estimatedOf(p) {
  const estimated = Number(p?.estimatedTotal);
  if (Number.isFinite(estimated)) return estimated;
  return Number(p?.totalCost) || 0;
}

export const sourceOf = (p) => p.baseProductKey || p.productKey || "";

export function compact(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e9) return `₦${(v / 1e9).toFixed(2)}bn`;
  if (Math.abs(v) >= 1e6) return `₦${(v / 1e6).toFixed(1)}m`;
  if (Math.abs(v) >= 1e3) return `₦${Math.round(v / 1e3)}k`;
  return `₦${Math.round(v)}`;
}

export const short = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "–");

