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

export const STAGES = [
  { id: "takeoff", name: "Takeoff" },
  { id: "priced", name: "Priced" },
  { id: "valuing", name: "Valuations" },
  { id: "final", name: "Final account" },
];
export const STAGE_ORDER = Object.fromEntries(STAGES.map((s, i) => [s.id, i]));

export function stageOf(p) {
  const pct = Number(p.progressPercent) || 0;
  if (pct >= 100) return "final";
  if (pct > 0) return "valuing";
  return Number(p.totalCost) > 0 ? "priced" : "takeoff";
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

