// The ICMS details a QS states once per project: the ICMS 3 attributes a bill
// does not carry (where, in what money, at what date, how big).
//
// The fields and the checks are the server's own (server/util/icmsExport.js,
// icmsDetailsFromBody, saved by PUT /projectsboq/:tool/:id/icms onto
// TakeoffProject.icms). The server checks again; these are here so the form can
// say what is wrong before a round trip, in the same words.
//
// What the QS leaves blank is not sent as blank-means-nothing: the report fills
// it with a stated assumption (icmsAttributes), and the form shows that
// assumption as the field's placeholder so the QS can see what the export will
// say if they leave it.

/** ICMS 3 Level 1 project types (server/assets/icms/icms3.json projectTypes). */
export const ICMS_PROJECT_TYPES = [
  { code: "01", title: "Buildings" },
  { code: "02", title: "Roads and runways" },
  { code: "03", title: "Railways" },
  { code: "04", title: "Bridges" },
  { code: "05", title: "Tunnels" },
  { code: "06", title: "Wastewater treatment works" },
  { code: "07", title: "Water treatment works" },
  { code: "08", title: "Pipelines" },
  { code: "09", title: "Wells and boreholes" },
  { code: "10", title: "Power-generating plants" },
  { code: "11", title: "Chemical plants" },
  { code: "12", title: "Refineries" },
  { code: "13", title: "Dams and reservoirs" },
  { code: "14", title: "Mines and quarries" },
  { code: "15", title: "Offshore structures" },
  { code: "16", title: "Near shore works" },
  { code: "17", title: "Ports" },
  { code: "18", title: "Waterway works" },
  { code: "19", title: "Land formation and reclamation" },
];

/**
 * Project stages. The four words are the ones the RICS Data Standard export
 * maps to its own status codes (icmsExport.js RDS_STATUS); blank lets the report
 * work the stage out from the contract.
 */
export const ICMS_STAGES = ["Estimate", "Tender", "Contract awarded", "Final account"];

/** Price basis: blank, or one of the two RDS values the JSON export carries. */
export const ICMS_PRICE_BASES = [
  { value: "fixedUnitRates", label: "Fixed unit rates" },
  { value: "unitRatesSubjectToFluctuatingAdjustment", label: "Unit rates subject to fluctuation" },
];

/** Carbon boundaries, in the words icmsExport.js rdsBoundary() reads. */
export const ICMS_CARBON_BOUNDARIES = [
  "Up front carbon (A1-A5)",
  "Products (A1-A3)",
  "Construction (A4-A5)",
  "Embodied carbon (A0-A5, B1-B5, C1-C4)",
];

export const ICMS_FIELDS = [
  "projectType",
  "country",
  "currency",
  "baseDate",
  "projectStatus",
  "priceBasis",
  "location",
  "gfaIpms1",
  "gfaIpms2",
  "carbonBoundary",
];

const MAX_AREA = 10_000_000;

const str = (v) => (v === undefined || v === null ? "" : String(v));

/**
 * The form's starting values, from the report's attributes (GET .../icms).
 * Only what the project STATES is filled in; an assumed value stays blank and
 * comes back as a placeholder (see placeholdersFrom).
 */
export function draftFromAttributes(attributes = {}) {
  const d = {};
  for (const k of ICMS_FIELDS) {
    const a = attributes?.[k];
    d[k] = a && a.stated ? str(a.value) : "";
  }
  if (!d.projectType) d.projectType = str(attributes?.projectType?.value) || "01";
  return d;
}

/** What the report will assume for each field left blank. */
export function placeholdersFrom(attributes = {}) {
  const p = {};
  for (const k of ICMS_FIELDS) {
    const a = attributes?.[k];
    p[k] = a && !a.stated && a.value !== null && a.value !== undefined ? str(a.value) : "";
  }
  return p;
}

/** The first thing wrong with a draft, in the server's words, or "". */
export function icmsDraftProblem(d = {}) {
  const t = str(d.projectType).trim();
  if (!ICMS_PROJECT_TYPES.some((p) => p.code === t)) return "Choose an asset type.";
  const country = str(d.country).trim().toUpperCase();
  if (country && !/^[A-Z]{2}$/.test(country)) return "Country must be a two-letter ISO 3166 code, e.g. NG.";
  const currency = str(d.currency).trim().toUpperCase();
  if (currency && !/^[A-Z]{3}$/.test(currency)) return "Currency must be a three-letter ISO 4217 code, e.g. NGN.";
  const date = str(d.baseDate).trim();
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)))) {
    return "Base date must be a date, YYYY-MM-DD.";
  }
  const areas = {};
  for (const [k, label] of [
    ["gfaIpms1", "Gross external"],
    ["gfaIpms2", "Gross internal"],
  ]) {
    const raw = str(d[k]).trim();
    if (!raw) continue;
    const v = Number(raw);
    if (!(v > 0) || v > MAX_AREA) return `${label} area must be a positive number of m2.`;
    areas[k] = v;
  }
  // By definition: IPMS 2 is measured inside the external walls IPMS 1 is
  // measured around, so it cannot be the larger. Two areas the wrong way round
  // are almost always typed into each other's box.
  if (areas.gfaIpms1 && areas.gfaIpms2 && areas.gfaIpms2 > areas.gfaIpms1) {
    return "The gross internal area (IPMS 2) cannot be larger than the gross external area (IPMS 1). Check they are not the wrong way round.";
  }
  return "";
}

/** The PUT body: every field, blanks cleared, codes upper-cased, areas as numbers. */
export function icmsBodyFrom(d = {}) {
  const area = (v) => {
    const raw = str(v).trim();
    return raw ? Number(raw) : null;
  };
  return {
    projectType: str(d.projectType).trim() || "01",
    country: str(d.country).trim().toUpperCase(),
    currency: str(d.currency).trim().toUpperCase(),
    baseDate: str(d.baseDate).trim(),
    projectStatus: str(d.projectStatus).trim(),
    priceBasis: str(d.priceBasis).trim(),
    location: str(d.location).trim(),
    gfaIpms1: area(d.gfaIpms1),
    gfaIpms2: area(d.gfaIpms2),
    carbonBoundary: str(d.carbonBoundary).trim(),
  };
}

/**
 * Cost and carbon per m2 from the report's perM2, for showing. Null when no
 * floor area is stated, which is the case the workbook cover asks the QS to fix.
 */
export function perM2Lines(report = {}) {
  const p = report?.perM2;
  if (!p || !(Number(p.area) > 0)) return null;
  const cur = str(report?.attributes?.currency?.value) || "NGN";
  const fmt = (v, digits = 0) =>
    Number(v || 0).toLocaleString("en-NG", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return {
    basis: `${p.basis}, ${fmt(p.area, 2).replace(/\.00$/, "")} m2`,
    cost: `${cur} ${fmt(p.cost)} per m2`,
    carbon: `${fmt(p.carbonKg, 1)} kgCO2e per m2`,
  };
}

/** Whether this reader may change the details. Samples and view-only shares may not. */
export function canEditIcms(project) {
  if (!project) return false;
  if (project.isSample) return false;
  if (project._access && project._access.canEdit === false) return false;
  return true;
}

export const icmsPath = (productKey, id) =>
  `/projectsboq/${encodeURIComponent(String(productKey || "").trim().toLowerCase())}/${encodeURIComponent(String(id || ""))}/icms`;
