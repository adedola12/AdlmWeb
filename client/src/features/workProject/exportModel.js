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
];

const GROUPS = [
  { key: "bill", label: "Bill & budget, Excel" },
  { key: "elemental", label: "Elemental BoQ, Excel", note: "by building element" },
  { key: "trade", label: "Trade BoQ, Excel", note: "by work section (NRM2-style)" },
  { key: "milestone", label: "Milestone BoQ, Excel", note: "one bill per stage" },
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
  return { path, filename: `${safeName(projectName)} - ${w.file}.xlsx` };
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
