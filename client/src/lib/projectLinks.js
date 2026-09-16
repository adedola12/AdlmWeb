// src/lib/projectLinks.js
//
// Where a project opens, and which product it belongs to — one answer for the
// Work overview, the projects list and the programme.
//
// Projects open in the full workspace (/projects/:tool), the screen with the
// bill, budget, valuation, PM views and the Work area. The link carries the
// project's slug, not its database id: the id is an internal key and has no
// business in an address bar people copy and share. A project with no slug
// (very old saves) still falls back to the id, and the workspace swaps it for
// the slug as soon as the project loads.

// Storage keys that are a product's material & labour schedule, not a product.
const MATERIALS_BASE = {
  "revit-materials": "revit",
  "revit-material": "revit",
  "planswift-materials": "planswift",
  "planswift-material": "planswift",
  "mep-materials": "mep",
  "mep-material": "mep",
  "revitmep-materials": "mep",
  "civil3d-materials": "civil3d",
  "civil3d-material": "civil3d",
  "archicad-materials": "archicad",
  "archicad-material": "archicad",
};

/**
 * The product a rollup project belongs to.
 *
 * The API's baseProductKey files every BoQ import under QUIV. That was true
 * when imports were Quiv-only (July 2026), but since 12 Aug 2026 an import is
 * saved under the product it was imported into, so a HERON import stored as
 * "planswift" was shown in the QUIV folder and then opened as HERON. The
 * stored key is the truth for an import.
 */
export function projectBaseKey(p) {
  const k = String(p?.productKey || "").toLowerCase();
  if (p?.origin === "boq-import" && k) return MATERIALS_BASE[k] || k;
  return p?.baseProductKey || MATERIALS_BASE[k] || k || "other";
}

/** Normalise a /me/projects-rollup list so baseProductKey is right. */
export function normaliseRollup(list) {
  return (Array.isArray(list) ? list : []).map((p) => ({
    ...p,
    baseProductKey: projectBaseKey(p),
  }));
}

/** The workspace address for a project (by slug). */
export function projectWorkspaceHref(p) {
  const k = String(p?.productKey || "").toLowerCase();
  if (k === "archicad") return "/archicad";
  if (k === "rategen") return "/rategen";
  if (!k) return "/manage";
  const key = p?.slug || p?.id || p?._id || "";
  return key ? `/projects/${k}?project=${encodeURIComponent(key)}` : `/projects/${k}`;
}
