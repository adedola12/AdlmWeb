// src/lib/projectLinks.js
//
// Where a project opens, and which product it belongs to — one answer for the
// Work overview, the projects list and the programme.
//
// Projects open in the classic workspace (/projects/:tool), the screen with the
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

/** A storage key that holds a material & labour schedule. */
export function isMaterialsKey(k) {
  return /-materials?$/.test(String(k || "").toLowerCase());
}

/** The product a materials key belongs to ("planswift-materials" → "planswift"). */
export function materialsBase(k) {
  const key = String(k || "").toLowerCase();
  return MATERIALS_BASE[key] || key.replace(/-materials?$/, "");
}

/**
 * Materials are a project's Budget, not a place of their own.
 *
 * A schedule saved with its bill (its sourceProjectId, or the same product
 * and slug, or the slug with "-material(s)" on the end) is already the Budget inside that project, so it
 * is dropped from project lists. A schedule with no bill behind it — older
 * saves, MEP and CIVIQ schedules — stays listed as a project of its own
 * product and opens on the project page, where its lines are its Budget.
 */
export function foldMaterials(list) {
  const rows = Array.isArray(list) ? list : [];
  const billRows = rows.filter((p) => !isMaterialsKey(p?.productKey));
  const bills = new Set(
    billRows
      .filter((p) => p?.slug)
      .map((p) => `${String(p.productKey).toLowerCase()}::${p.slug}`),
  );
  const billIds = new Set(billRows.map((p) => String(p?.id || p?._id || "")).filter(Boolean));
  return rows.filter((p) => {
    if (!isMaterialsKey(p?.productKey)) return true;
    // Saved with its bill: the server records which one.
    if (p?.sourceProjectId && billIds.has(String(p.sourceProjectId))) return false;
    const base = materialsBase(p.productKey);
    const slug = String(p?.slug || "");
    const bare = slug.replace(/-materials?$/, "");
    return !(bills.has(`${base}::${slug}`) || bills.has(`${base}::${bare}`));
  });
}

/** Normalise a /me/projects-rollup list so baseProductKey is right. */
export function normaliseRollup(list) {
  return (Array.isArray(list) ? list : []).map((p) => ({
    ...p,
    baseProductKey: projectBaseKey(p),
  }));
}

/**
 * The workspace address for a project (by slug).
 *
 * `newBuild` sends it to Richard's project page instead of the classic
 * workspace. It was a parameter rather than a global because the answer once
 * differed per VIEWER: while /work/* was staff-only, a customer linked there
 * was bounced straight back by NewBuildGate, so the link was decided per
 * reader to save them the hop.
 *
 * Since 5 Oct 2026 the new page is everybody's (owner's decision), so every
 * caller in the app passes true and the parameter survives only for the two
 * places that genuinely still want the old address: the "Open the classic
 * workspace" links the new build offers for what it cannot do yet, and the
 * classic build's own internal navigation.
 * workspace. It is a parameter rather than a global because the answer differs
 * per VIEWER, not per project: callers ask lib/newBuildAccess.js (through
 * useProjectHref) whether this viewer is sent to /work/*. Since go-live that is
 * everyone signed in; before it, only staff.
 *
 * ArchiCAD and RateGen are unchanged either way: neither has a page under
 * /work/project, and both had their own home before this.
 */
export function projectWorkspaceHref(p, { newBuild = false } = {}) {
  const k = String(p?.productKey || "").toLowerCase();
  if (k === "archicad") {
    const key = p?.slug || p?.id || p?._id || "";
    return key ? `/archicad/${encodeURIComponent(key)}/boq` : "/archicad";
  }
  const key = p?.slug || p?.id || p?._id || "";
  // A RateGen project is a priced bill saved from RateGen's Price a bill: it opens
  // like any other project. Without one, RateGen means its rates page.
  if (k === "rategen" && !key) return "/rategen";
  if (!k) return "/manage";
  if (newBuild && key) {
    return `/work/project/${encodeURIComponent(k)}/${encodeURIComponent(key)}`;
  }
  return key ? `/projects/${k}?project=${encodeURIComponent(key)}` : `/projects/${k}`;
}

/**
 * The new project page's name for a tab the classic workspace calls `tab`.
 *
 * The two builds do not name the same tab the same thing, and resolveTab()
 * answers a name it does not know with Overview — silently. So a link to the
 * classic "valuation" tab, translated by nobody, does not land on Valuations:
 * it lands on the project summary, where a QS with a certificate waiting sees
 * a summary, finds nothing to decide, and concludes there is nothing to decide.
 * Of the names the app actually emits, only "bill" and "pm" matched as spelt.
 *
 * "work" is the one with no equivalent: the classic Work area put the model,
 * the bill, the schedule and Ada on one screen, and the new build has no such
 * tab. Overview is the honest answer there, not a mistranslation.
 *
 * A name already in the new build's own spelling passes straight through, so
 * this is safe to apply to either build's tab names.
 */
const NEW_BUILD_TAB = {
  dashboard: "overview",
  budget: "rates",
  valuation: "valuations",
  work: "overview",
};

export function newBuildTab(tab) {
  const t = String(tab || "").trim().toLowerCase();
  return NEW_BUILD_TAB[t] || t;
}

/**
 * Where a project opens AT A TAB on the new build — and, on the Bill, at a line.
 *
 * Returns a /work/project/ address with ?tab= on it, or, for the products that
 * have no page there, whatever projectWorkspaceHref answers for them: ArchiCAD
 * goes to its own BoQ screen and RateGen to /rategen, and a tab on the end
 * would be a parameter neither screen reads. Callers that must know which they
 * got can test the answer for "/work/project/".
 *
 * Two translations happen here and both are load-bearing:
 *
 *   the tab   through newBuildTab above. Overview is the ABSENCE of ?tab=,
 *             which is how the shell itself writes it, so a link to it reads
 *             the same as the address a reader would get by clicking.
 *
 *   the line  the new Bill searches by text (?q=) and has no notion of a line
 *             key, so a remembered line is only worth carrying when we kept
 *             its label too. Handing the search box an internal key would
 *             filter the bill down to nothing, and an empty bill reads as a
 *             project whose lines are gone rather than as a missed jump.
 */
export function newBuildPlaceHref(place) {
  const base = projectWorkspaceHref(
    { productKey: place?.productKey, slug: place?.key },
    { newBuild: true },
  );
  if (!base.startsWith("/work/project/")) return base;
  const tab = newBuildTab(place?.tab);
  const q = new URLSearchParams();
  if (tab && tab !== "overview") q.set("tab", tab);
  if (tab === "bill" && place?.lineLabel) q.set("q", place.lineLabel);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}
