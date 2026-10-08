// Which documents a project can be exported as, and where each one comes from.
//
// Every row here is a file the SERVER builds. That is the whole reason this
// exists: the overflow menu dropped "Export to Excel" — which is on Richard's
// own list (headModel.js) — because the export was taken to be "~400 lines of
// workbook building in ProjectsGeneric". That is true of one workbook, the
// generic BoQ built in the browser with SheetJS. For these seven the client side
// is a fetch, so they have been one afternoon away from the new workspace since
// the day it shipped.
//
// WHAT IS NOT OFFERED IS AS DELIBERATE AS WHAT IS
//
// A row appears only when the project actually holds what the document is made
// of, and only when this reader is allowed it. The alternative — list all seven
// always and let the server refuse — is the pattern this codebase has just spent
// a day removing: a control that does nothing tells a QS the product is broken.
//
// Two permissions, and BOTH gate EVERYTHING. This was wrong in the first version
// of this file and the mistake is worth recording, because it was made by reading
// one function and not the one it calls:
//
//   canSeeRates   A bill without its rates is not a bill, so a full collaborator
//                 without RateGen is refused the lot (RATES_NOT_VISIBLE,
//                 projects.boq.js:263).
//   canExport     A view-only reader is refused the lot too. The priced documents
//                 say so where you would look for it (VIEW_ONLY,
//                 projects.js:5604) — but the four BILL exports refuse it as
//                 well, two calls down: loadProjectForExport calls
//                 findProjectDoc, and findProjectDoc throws 403 VIEW_ONLY from
//                 canExportProject at projects.boq.js:189. Reading
//                 loadProjectForExport alone says there is no such check, and
//                 that reading put four workbooks in front of a reader the server
//                 always refuses.
//
// Both default to TRUE when _access is absent, which is what the server itself
// does for an owner (projects.js:617) — the field only appears on a project
// loaded through the access layer, and a missing one must not lock an owner out
// of their own documents.

import { sanitizeFilename } from "../../lib/downloadWorkbook.js";
import { certificatesNewestFirst } from "./valuationsModel.js";

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * The documents this project can be exported as, for this reader.
 *
 * @param {object} project  the full project (not the rollup summary)
 * @param {object} p
 * @param {string} p.productKey
 * @param {string} p.saveId   the project's database id, which the API keys on
 * @returns {Array<{key:string,label:string,note:string,path:string,fallbackName:string,failureMessage:string}>}
 */
export function exportsFor(project, { productKey = "", saveId = "" } = {}) {
  const tool = String(productKey || "").trim().toLowerCase();
  const id = String(saveId || "").trim();
  if (!project || !tool || !id) return [];

  const access = project._access || null;
  const canSeeRates = access ? access.canSeeRates !== false : true;
  const canExport = access ? access.canExport !== false : true;
  // Either one refuses everything. canExport used to gate only the priced
  // documents, which offered a view-only collaborator four bill workbooks that
  // findProjectDoc refuses with 403 VIEW_ONLY before an exporter ever runs.
  if (!canSeeRates || !canExport) return [];

  const name = sanitizeFilename(project.name || "Project");
  const items = Array.isArray(project.items) ? project.items : [];
  const rows = [];

  if (items.length) {
    // ?building= is required by the route and defaults to bungalow there too;
    // it is sent explicitly so the workbook does not change shape if that
    // default ever does.
    rows.push({
      key: "boq-elemental",
      label: "Bill of quantities, elemental",
      note: "The bill cut against the elemental mapping, with the milestone and WBS sheets.",
      path: `/projectsboq/${tool}/${id}/export/boq?building=bungalow`,
      fallbackName: `${name} - Elemental BOQ.xlsx`,
      failureMessage: "Could not export the elemental bill of quantities",
    });
    rows.push({
      key: "boq-trade",
      label: "Bill of quantities, by trade",
      note: "The same bill cut by trade instead of by element.",
      path: `/projectsboq/${tool}/${id}/export/boq?building=bungalow&format=trade`,
      fallbackName: `${name} - Trade BOQ.xlsx`,
      failureMessage: "Could not export the bill of quantities by trade",
    });
    rows.push({
      key: "bill-budget",
      label: "The bill as measured, with its budget",
      note:
        "Your own sections, subtitles, order and totals — not re-cut against a " +
        "mapping — with the material, labour and plant schedules beside them. " +
        "This is the one an imported bill needs.",
      path: `/projectsboq/${tool}/${id}/export/bill-budget`,
      fallbackName: `${name} - Bill & Budget.xlsx`,
      failureMessage: "Could not export the bill and budget",
    });
    rows.push({
      key: "bill-budget-trade",
      label: "The bill with its budget, grouped by trade",
      note: "The same workbook, its sections grouped by trade.",
      path: `/projectsboq/${tool}/${id}/export/bill-budget?groupBy=trade`,
      fallbackName: `${name} - Bill & Budget by trade.xlsx`,
      failureMessage: "Could not export the bill and budget by trade",
    });
  }

  // Newest first, like the Valuations tab lists them, so the one a QS almost
  // always wants is the one at the top.
  for (const c of certificatesNewestFirst(project)) {
    const no = n(c?.number);
    if (!no) continue;
    rows.push({
      key: `certificate-${no}`,
      label: `Payment certificate ${no}`,
      note: "The certificate as issued, with its retention and deductions.",
      path: `/projects/${tool}/${id}/certificates/${no}/export`,
      fallbackName: `${name} - IPC ${no}.xlsx`,
      failureMessage: `Could not export payment certificate ${no}`,
    });
  }

  // The server refuses with 400 unless the account is finalised, so an
  // unfinalised one is not offered rather than offered and refused.
  if (project.finalAccount?.finalized) {
    rows.push({
      key: "final-account",
      label: "Final account",
      note: "The settled account, with every certificate paid against it.",
      path: `/projects/${tool}/${id}/final-account/export`,
      fallbackName: `${name} - Final account.xlsx`,
      failureMessage: "Could not export the final account",
    });
  }

  return rows;
}

/**
 * Why there is nothing to export, in the reader's terms.
 *
 * Four different causes, and a panel that said "nothing to export" for all of
 * them would be wrong three times. The two refusals in particular must not be
 * confused: telling a VIEW-ONLY reader that "an active RateGen subscription lifts
 * this" sells them a subscription that would not — canExport would still refuse
 * every document, including the four bill workbooks.
 *
 * `failed` is passed by the caller because the project being null has two
 * meanings and only the caller knows which: still loading, or the load failed.
 * Saying "still loading" under a banner that says the read failed tells a reader
 * to wait for something that will never arrive.
 */
export function noExportsReason(project, { productKey = "", saveId = "", failed = false } = {}) {
  if (failed) return "failed";
  if (!project || !productKey || !saveId) return "loading";
  const access = project._access || null;
  if (access && access.canExport === false) return "view-only";
  if (access && access.canSeeRates === false) return "rates-hidden";
  if (!(Array.isArray(project.items) ? project.items : []).length) return "no-bill";
  return "";
}

export default exportsFor;
// The Export menu on the project head: which workbooks and reports a project
// offers, and where each one is fetched from.
//
// The classic workspace (ProjectOpenView ExportMenu) was the only place these
// lived, so on this page a QS had to know to leave for the older screen to get
// a bill out. Every workbook here is the SAME server export that menu calls
// (/projectsboq/:tool/:id/export/...), so the two screens hand over identical
// files. The client-built "generic BoQ" is left out: it is assembled from the
// classic page's own state, and the bill & budget export supersedes it.

export const PDF_REPORTS = [
  { key: "report", label: "Project report", note: "PDF" },
  { key: "pm-report", label: "Project management report", note: "PDF", needsPm: true },
];

// One entry per server workbook. `query` is what the export route reads.
const WORKBOOKS = [
  {
    key: "bb-cat",
    group: "bill",
    label: "Bill & budget",
    note: "Your own sections, with material, labour and plant schedules",
    route: "bill-budget",
    query: {},
    file: "Bill & Budget",
  },
  {
    key: "bb-trade",
    group: "bill",
    label: "Bill & budget by trade",
    note: "The same workbook, sectioned by work section",
    route: "bill-budget",
    query: { groupBy: "trade" },
    file: "Bill & Budget (trade)",
  },
  { key: "el-b", group: "elemental", label: "Bungalow", route: "boq", query: { building: "bungalow" }, file: "Elemental BOQ" },
  { key: "el-m", group: "elemental", label: "Multi-storey", route: "boq", query: { building: "multistorey" }, file: "Elemental BOQ" },
  { key: "tr-b", group: "trade", label: "Bungalow", route: "boq", query: { building: "bungalow", format: "trade" }, file: "Trade BOQ" },
  { key: "tr-m", group: "trade", label: "Multi-storey", route: "boq", query: { building: "multistorey", format: "trade" }, file: "Trade BOQ" },
  { key: "ms-b", group: "milestone", label: "Bungalow", route: "boq", query: { building: "bungalow", format: "milestone" }, file: "Milestone BOQ" },
  { key: "ms-m", group: "milestone", label: "Multi-storey", route: "boq", query: { building: "multistorey", format: "milestone" }, file: "Milestone BOQ" },
  // ICMS 3, with the classic menu's labels (ProjectOpenView ExportMenu) so the
  // two screens name the same file the same way.
  {
    key: "icms-x",
    group: "icms",
    label: "ICMS 3 cost and carbon (Excel)",
    note: "Cost by Group · carbon by Group · every line",
    route: "icms",
    query: {},
    file: "ICMS 3",
  },
  {
    key: "icms-j",
    group: "icms",
    label: "ICMS 3 cost and carbon (JSON)",
    note: "The same report as data, with full ICMS 3 codes",
    route: "icms",
    query: { format: "json" },
    file: "ICMS 3",
    ext: "json",
  },
];

// Not a file: opens the ICMS details form, which the two ICMS exports read.
export const ICMS_DETAILS_ITEM = { key: "icms-details", label: "ICMS details…", kind: "icms-details" };

const GROUPS = [
  { key: "bill", label: "Bill & budget, Excel" },
  { key: "elemental", label: "Elemental BoQ, Excel", note: "by building element" },
  { key: "trade", label: "Trade BoQ, Excel", note: "by work section (NRM2-style)" },
  { key: "milestone", label: "Milestone BoQ, Excel", note: "one bill per stage" },
  { key: "icms", label: "ICMS 3", note: "international cost and carbon report" },
  { key: "pdf", label: "Reports, PDF" },
];

// The menu, group by group. An imported bill is already in the QS's own
// arrangement, so the menu says the bill & budget export is the one that keeps
// it; the other three re-cut the bill against a standard arrangement.
export function exportMenu({ canSeePm = true, isBoqImport = false } = {}) {
  return GROUPS.map((g) => {
    const items =
      g.key === "pdf"
        ? PDF_REPORTS.filter((r) => canSeePm || !r.needsPm).map(({ key, label, note }) => ({
            key,
            label,
            note,
            kind: "report",
          }))
        : WORKBOOKS.filter((w) => w.group === g.key).map(({ key, label, note }) => ({
            key,
            label,
            note: note || "",
            kind: "workbook",
          }));
    if (g.key === "icms") items.push({ ...ICMS_DETAILS_ITEM, note: "" });
    const hint =
      g.key === "bill" && isBoqImport
        ? "This bill came from Excel: this export keeps its own sections and totals."
        : "";
    return { key: g.key, label: g.label, note: g.note || "", hint, items };
  }).filter((g) => g.items.length);
}

// Where a workbook is fetched from, and what to call it if the server sends no
// filename. Null for anything that is not a workbook.
export function workbookRequest(key, { productKey, projectId, projectName } = {}) {
  const w = WORKBOOKS.find((x) => x.key === key);
  if (!w || !productKey || !projectId) return null;
  const tool = encodeURIComponent(String(productKey).trim().toLowerCase());
  const qs = new URLSearchParams(w.query).toString();
  const path = `/projectsboq/${tool}/${encodeURIComponent(projectId)}/export/${w.route}${qs ? `?${qs}` : ""}`;
  return { path, filename: `${safeName(projectName)} - ${w.file}.${w.ext || "xlsx"}`, json: w.ext === "json" };
}

export function safeName(name) {
  const s = String(name || "")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s || "Project";
}

// The filename the server chose, from Content-Disposition, else the fallback.
export function filenameFrom(disposition, fallback) {
  const m = String(disposition || "").match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  if (!m) return fallback;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}
