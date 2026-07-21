// src/pages/ProjectsGeneric.jsx
import React from "react";
import { useAuth } from "../store.jsx";
import { useStepUp } from "../features/security/useStepUp.jsx";
import { apiAuthed } from "../http.js";
import { Link, useParams, useSearchParams, useNavigate } from "react-router-dom";
import { API_BASE } from "../config";
// ifcElements (which pulls in the ~1.5 MB web-ifc wasm wrapper) is imported
// dynamically inside handleUploadModel so it is code-split out of the main
// bundle and only fetched when a user actually uploads a model.
import {
  FaInfoCircle,
  FaSearch,
  FaTimes,
  FaFolder,
  FaCubes,
  FaThLarge,
  FaSyncAlt,
  FaUserPlus,
  FaKey,
  FaChartBar,
  FaTasks,
  FaFileExcel,
} from "react-icons/fa";
import * as XLSX from "xlsx";
import ProjectExplorerGrid from "../features/projects/ProjectExplorerGrid.jsx";
import ProjectOpenView from "../features/projects/ProjectOpenView.jsx";
import {
  allCategoriesForProductKey,
  deriveItemCategory,
  deriveItemTrade,
  tradesForProductKey,
  UNCATEGORIZED,
} from "../lib/boqCategory.js";

const DASHBOARD_PATH = "/dashboard";

const TITLES = {
  revit: "Revit Takeoffs",
  revitmep: "Revit MEP Projects",
  planswift: "PlanSwift Projects",
  civil3d: "Civil 3D Takeoffs",
  "revit-materials": "Revit Materials",
  "revit-material": "Revit Materials",
  "planswift-materials": "PlanSwift Materials",
  "planswift-material": "PlanSwift Materials",
};

function normTool(t) {
  return String(t || "")
    .trim()
    .toLowerCase();
}

function isMaterialsTool(tool) {
  const t = normTool(tool);
  return t === "revit-materials" || t === "revit-material"
      || t === "planswift-materials" || t === "planswift-material";
}

// ── BoQ Import (admin-granted Quiv feature) ──
// Users holding the quiv-boq-import entitlement (granted only by an admin)
// can create Quiv projects from an Excel Bill of Quantities. Imported
// projects are ordinary revit projects (origin "boq-import") — they live in
// this list, count toward storage, and carry every tab except 3D Model and
// linking.
const BOQ_IMPORT_PRODUCT_KEY = "quiv-boq-import";
const BOQ_IMPORT_ORIGIN = "boq-import";

function hasBoqImportAccess(user) {
  const ents = Array.isArray(user?.entitlements) ? user.entitlements : [];
  return ents.some(
    (e) =>
      e?.productKey === BOQ_IMPORT_PRODUCT_KEY &&
      String(e?.status || "").toLowerCase() === "active" &&
      (!e?.expiresAt || new Date(e.expiresAt).getTime() > Date.now()),
  );
}

function getSidebarMeta(tool) {
  const t = normTool(tool);

  if (t === "planswift") {
    return {
      app: "PlanSwift",
      section: "Projects",
      hint: "Browse projects like a file explorer",
      Icon: FaFolder,
    };
  }

  if (t === "revitmep") {
    return {
      app: "Revit MEP",
      section: "Projects",
      hint: "Browse projects like a file explorer",
      Icon: FaFolder,
    };
  }

  if (t === "revit") {
    return {
      app: "Revit Plugin",
      section: "Takeoffs",
      hint: "Browse projects like a file explorer",
      Icon: FaFolder,
    };
  }

  if (t === "civil3d") {
    return {
      app: "Civil 3D Plugin",
      section: "Takeoffs",
      hint: "Browse Civil 3D takeoffs saved from the plugin",
      Icon: FaFolder,
    };
  }

  if (t === "revit-materials" || t === "revit-material") {
    return {
      app: "Revit Plugin",
      section: "Materials",
      hint: "Browse projects like a file explorer",
      Icon: FaCubes,
    };
  }

  if (t === "planswift-materials" || t === "planswift-material") {
    return {
      app: "PlanSwift",
      section: "Materials",
      hint: "Browse material projects from PlanSwift",
      Icon: FaCubes,
    };
  }

  return {
    app: "Projects",
    section: "Browser",
    hint: "Browse projects like a file explorer",
    Icon: FaFolder,
  };
}

function getEndpoints(tool) {
  const t = normTool(tool);

  // PM routes use the same /:productKey/:id pattern as projects.js. We keep
  // the full tool name (incl. "-materials") in the URL so the server's
  // requestedProductKey() reads it back as the project's stored productKey
  // — otherwise materials projects wouldn't be found.
  const pmEndpoints = {
    pmDashboard: (id) => "/projects/" + t + "/" + id + "/pm/dashboard",
    pmUpdate: (id) => "/projects/" + t + "/" + id + "/pm",
    pmGenerateFromBoq: (id) =>
      "/projects/" + t + "/" + id + "/pm/generate-from-boq",
    pmImport: (id) => "/projects/" + t + "/" + id + "/pm/import",
    pmClearImports: (id) => "/projects/" + t + "/" + id + "/pm/clear-imports",
    pmReschedule: (id) => "/projects/" + t + "/" + id + "/pm/reschedule",
    pmCalendar: (id) => "/projects/" + t + "/" + id + "/pm/calendar.ics",
    pmReset: (id) => "/projects/" + t + "/" + id + "/pm",
  };

  if (t === "revit-materials" || t === "revit-material") {
    return {
      list: "/projects/revit/materials",
      one: (id) => "/projects/revit/materials/" + id,
      bySlug: (slug) => "/projects/revit/materials/by-slug/" + slug,
      del: (id) => "/projects/revit/materials/" + id,
      valuations: (id) => "/projects/revit/materials/" + id + "/valuations",
      share: (id) => "/projects/revit/materials/" + id + "/share",
      lock: (id) => "/projects/revit/materials/" + id + "/contract/lock",
      unlock: (id) => "/projects/revit/materials/" + id + "/contract/unlock",
      ...pmEndpoints,
    };
  }

  if (t === "planswift-materials" || t === "planswift-material") {
    return {
      list: "/projects/planswift/materials",
      one: (id) => "/projects/planswift/materials/" + id,
      bySlug: (slug) => "/projects/planswift/materials/by-slug/" + slug,
      del: (id) => "/projects/planswift/materials/" + id,
      valuations: (id) => "/projects/planswift/materials/" + id + "/valuations",
      share: (id) => "/projects/planswift/materials/" + id + "/share",
      lock: (id) => "/projects/planswift/materials/" + id + "/contract/lock",
      unlock: (id) => "/projects/planswift/materials/" + id + "/contract/unlock",
      ...pmEndpoints,
    };
  }

  return {
    list: "/projects/" + t,
    one: (id) => "/projects/" + t + "/" + id,
    bySlug: (slug) => "/projects/" + t + "/by-slug/" + slug,
    del: (id) => "/projects/" + t + "/" + id,
    valuations: (id) => "/projects/" + t + "/" + id + "/valuations",
    share: (id) => "/projects/" + t + "/" + id + "/share",
    lock: (id) => "/projects/" + t + "/" + id + "/contract/lock",
    unlock: (id) => "/projects/" + t + "/" + id + "/contract/unlock",
    budget: (id) => "/projects/" + t + "/" + id + "/budget",
    certificates: (id) => "/projects/" + t + "/" + id + "/certificates",
    certificate: (id, n) =>
      "/projects/" + t + "/" + id + "/certificates/" + n,
    certificateExport: (id, n) =>
      "/projects/" + t + "/" + id + "/certificates/" + n + "/export",
    finalAccountFinalize: (id) =>
      "/projects/" + t + "/" + id + "/final-account/finalize",
    finalAccountReopen: (id) =>
      "/projects/" + t + "/" + id + "/final-account/reopen",
    finalAccountExport: (id) =>
      "/projects/" + t + "/" + id + "/final-account/export",
    modelUpload: (id, disc) =>
      "/projects/" + t + "/" + id + "/models/" + disc,
    ...pmEndpoints,
  };
}

function materialDescription(it) {
  const takeoff = String(it?.takeoffLine || "").trim();
  const mat = String(it?.materialName || "").trim();
  if (takeoff || mat) return [takeoff, mat].filter(Boolean).join(" - ");
  return String(it?.description || "").trim();
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function parseOptionalNumber(value) {
  if (value == null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}
function actualInputValue(value) {
  const parsed = parseOptionalNumber(value);
  return parsed == null ? "" : String(parsed);
}
function optionalNumberMapsEqual(a, b) {
  const A = a || {};
  const B = b || {};
  const keys = new Set([...Object.keys(A), ...Object.keys(B)]);
  for (const k of keys) {
    if (parseOptionalNumber(A[k]) !== parseOptionalNumber(B[k])) return false;
  }
  return true;
}

function sanitizeFilename(name) {
  return String(name || "BoQ")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

// Excel sheet names: <=31 chars, no [ ] : * ? / \
function sanitizeSheetName(name) {
  return (
    String(name || "Sheet")
      .trim()
      .replace(/[[\]:*?/\\]/g, "-")
      .slice(0, 31) || "Sheet"
  );
}

/* -------------------- BOQ TEMPLATE (Elemental) -------------------- */

const BOQ_TEMPLATE_LS_KEY = "adlm:boqTemplate:v1";
const BOQ_DEFAULT_TEMPLATE_URL = "/boq-template.xlsx";

/**
 * IMPORTANT:
 * - Make sure your Excel template already has enough pre-formatted blank rows
 *   for line items (e.g. 300-800 rows), because SheetJS Community won't
 *   reliably preserve styling if we insert rows dynamically.
 *
 * Adjust these to match YOUR template layout:
 */
const BOQ_TEMPLATE_MAP = {
  sheetName: "BoQ", // <- change to your sheet name
  header: {
    projectNameCell: "B4", // <- optional
    dateCell: "B5", // <- optional
  },
  table: {
    firstRow: 12, // <- where first line item should be written
    maxRows: 500, // <- how many rows in template are reserved for items
    cols: {
      sn: "A",
      desc: "B",
      unit: "E",
      qty: "F",
      rate: "G",
      amount: "H",
    },
  },
  summary: {
    sheetName: "Summary", // we'll create if missing
  },
};

function _excelAddr(colLetter, row1Based) {
  return `${colLetter}${row1Based}`;
}

function _setCell(ws, addr, value) {
  // Keep template formatting by only setting the value
  ws[addr] = ws[addr] || {};
  if (typeof value === "number") {
    ws[addr].t = "n";
    ws[addr].v = value;
  } else if (value === null || value === undefined) {
    ws[addr].t = "s";
    ws[addr].v = "";
  } else {
    ws[addr].t = "s";
    ws[addr].v = String(value);
  }
}

function safeB64FromUint8(u8) {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    s += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  }
  return btoa(s);
}
function uint8FromB64(b64) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

async function readFileAsArrayBuffer(file) {
  return await file.arrayBuffer();
}

function saveBoqTemplateToLocal(arrayBuffer) {
  try {
    const u8 = new Uint8Array(arrayBuffer);
    const b64 = safeB64FromUint8(u8);
    localStorage.setItem(BOQ_TEMPLATE_LS_KEY, b64);
    return true;
  } catch {
    return false;
  }
}

function loadBoqTemplateFromLocal() {
  try {
    const b64 = localStorage.getItem(BOQ_TEMPLATE_LS_KEY);
    if (!b64) return null;
    return uint8FromB64(b64).buffer;
  } catch {
    return null;
  }
}

async function _loadBoqTemplateArrayBuffer() {
  const local = loadBoqTemplateFromLocal();
  if (local) return local;

  // fallback to bundled template in /public
  const res = await fetch(BOQ_DEFAULT_TEMPLATE_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(
      `BoQ template not found. Add it to client/public/boq-template.xlsx or upload it.`,
    );
  }
  return await res.arrayBuffer();
}

/**
 * Element grouping rules (fallback).
 * BEST: if your saved items already contain it.elementName or it.elementCode,
 * we will use that first.
 */
const ELEMENT_RULES = [
  {
    name: "Preliminaries",
    re: /(prelim|mobil|site\s*setup|temporary|general)/i,
  },
  {
    name: "Substructure",
    re: /(excavat|foundation|footing|pile|substructure|blinding|hardcore|dpc|ground\s*beam|oversite)/i,
  },
  {
    name: "Superstructure",
    re: /(column|beam|slab|frame|blockwork|wall|lintel|stair|roof|truss)/i,
  },
  {
    name: "Finishes",
    re: /(plaster|render|screed|tile|paint|ceiling|skirting|cladding|screeding)/i,
  },
  {
    name: "Fittings",
    re: /(door|window|ironmongery|sanitary|cabinet|fixture|kitchen)/i,
  },
  {
    name: "Services",
    re: /(electrical|plumbing|hvac|fire|drain|pipe|cable|lighting|conduit)/i,
  },
  {
    name: "External Works",
    re: /(paving|fence|gate|landscap|external|road|kerb|drainage)/i,
  },
];

function _inferElementName(item) {
  const explicit =
    String(item?.elementName || item?.element || "").trim() ||
    String(item?.elementCode || "").trim();
  if (explicit) return explicit;

  const text =
    `${String(item?.code || "")} ${String(item?.description || "")}`.trim();
  for (const r of ELEMENT_RULES) {
    if (r.re.test(text)) return r.name;
  }
  return "Unclassified";
}

function _boqDescFromItem(item, stripMetaFn) {
  // keep it clean like BoQ descriptions
  const d = stripMetaFn
    ? stripMetaFn(item?.description)
    : String(item?.description || "");
  return String(d || "")
    .replace(/\s+/g, " ")
    .trim();
}

// tooltip
function Tip({ text }) {
  return (
    <span className="relative inline-flex items-center group">
      <FaInfoCircle className="text-slate-500" />
      <span className="pointer-events-none absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block whitespace-nowrap text-xs bg-adlm-navy text-white px-2 py-1 rounded">
        {text}
      </span>
    </span>
  );
}

function ratesEqual(a, b) {
  const A = a || {};
  const B = b || {};
  const keys = new Set([...Object.keys(A), ...Object.keys(B)]);
  for (const k of keys) {
    if (safeNum(A[k]) !== safeNum(B[k])) return false;
  }
  return true;
}

function statusMapsEqual(a, b) {
  const A = a || {};
  const B = b || {};
  const keys = new Set([...Object.keys(A), ...Object.keys(B)]);
  for (const k of keys) {
    if (Boolean(A[k]) !== Boolean(B[k])) return false;
  }
  return true;
}

function categoryMapsEqual(a, b) {
  const A = a || {};
  const B = b || {};
  const keys = new Set([...Object.keys(A), ...Object.keys(B)]);
  for (const k of keys) {
    if (String(A[k] || "") !== String(B[k] || "")) return false;
  }
  return true;
}

function provisionalSumsEqual(a, b) {
  const A = Array.isArray(a) ? a : [];
  const B = Array.isArray(b) ? b : [];
  if (A.length !== B.length) return false;
  for (let i = 0; i < A.length; i++) {
    if (String(A[i]?.description || "") !== String(B[i]?.description || "")) return false;
    if (Number(A[i]?.amount || 0) !== Number(B[i]?.amount || 0)) return false;
  }
  return true;
}

function preliminaryItemsEqual(a, b) {
  const A = Array.isArray(a) ? a : [];
  const B = Array.isArray(b) ? b : [];
  if (A.length !== B.length) return false;
  for (let i = 0; i < A.length; i++) {
    const X = A[i] || {};
    const Y = B[i] || {};
    if (String(X.name || "") !== String(Y.name || "")) return false;
    if (Number(X.allocation || 0) !== Number(Y.allocation || 0)) return false;
    if (Boolean(X.completed) !== Boolean(Y.completed)) return false;
    if (String(X.notes || "") !== String(Y.notes || "")) return false;
  }
  return true;
}

function variationsEqual(a, b) {
  const A = Array.isArray(a) ? a : [];
  const B = Array.isArray(b) ? b : [];
  if (A.length !== B.length) return false;
  for (let i = 0; i < A.length; i++) {
    const X = A[i] || {};
    const Y = B[i] || {};
    if (String(X.description || "") !== String(Y.description || "")) return false;
    if (Number(X.qty || 0) !== Number(Y.qty || 0)) return false;
    if (String(X.unit || "") !== String(Y.unit || "")) return false;
    if (Number(X.rate || 0) !== Number(Y.rate || 0)) return false;
    if (String(X.reference || "") !== String(Y.reference || "")) return false;
    if (String(X.issuedAt || "") !== String(Y.issuedAt || "")) return false;
  }
  return true;
}

const DASHBOARD_CHART_MODES = new Set(["pie", "ribbon", "line"]);
const DEFAULT_VALUATION_SETTINGS = Object.freeze({
  showDailyLog: true,
  showValuationSettings: true,
  showActualColumns: false,
  dashboardChartMode: "pie",
  retentionPct: 5,
  vatPct: 7.5,
  withholdingPct: 2.5,
  basis: "boq",
});

function clampPercentage(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(100, Math.max(0, num));
}

function normalizeChartMode(value, fallback = DEFAULT_VALUATION_SETTINGS.dashboardChartMode) {
  const mode = String(value || "").trim().toLowerCase();
  return DASHBOARD_CHART_MODES.has(mode) ? mode : fallback;
}

function normalizeValuationSettings(settings) {
  const source = settings && typeof settings === "object" ? settings : {};
  return {
    showDailyLog:
      typeof source.showDailyLog === "boolean"
        ? source.showDailyLog
        : DEFAULT_VALUATION_SETTINGS.showDailyLog,
    showValuationSettings:
      typeof source.showValuationSettings === "boolean"
        ? source.showValuationSettings
        : DEFAULT_VALUATION_SETTINGS.showValuationSettings,
    showActualColumns:
      typeof source.showActualColumns === "boolean"
        ? source.showActualColumns
        : DEFAULT_VALUATION_SETTINGS.showActualColumns,
    dashboardChartMode: normalizeChartMode(source.dashboardChartMode),
    retentionPct: clampPercentage(
      source.retentionPct,
      DEFAULT_VALUATION_SETTINGS.retentionPct,
    ),
    vatPct: clampPercentage(source.vatPct, DEFAULT_VALUATION_SETTINGS.vatPct),
    withholdingPct: clampPercentage(
      source.withholdingPct,
      DEFAULT_VALUATION_SETTINGS.withholdingPct,
    ),
    rateSyncEnabled:
      typeof source.rateSyncEnabled === "boolean"
        ? source.rateSyncEnabled
        : false,
    basis:
      source.basis === "budget" || source.basis === "boq"
        ? source.basis
        : DEFAULT_VALUATION_SETTINGS.basis,
  };
}

function valuationSettingsEqual(a, b) {
  const A = normalizeValuationSettings(a);
  const B = normalizeValuationSettings(b);
  return (
    A.showDailyLog === B.showDailyLog &&
    A.showValuationSettings === B.showValuationSettings &&
    A.showActualColumns === B.showActualColumns &&
    A.dashboardChartMode === B.dashboardChartMode &&
    safeNum(A.retentionPct) === safeNum(B.retentionPct) &&
    safeNum(A.vatPct) === safeNum(B.vatPct) &&
    safeNum(A.withholdingPct) === safeNum(B.withholdingPct) &&
    A.rateSyncEnabled === B.rateSyncEnabled &&
    A.basis === B.basis
  );
}

function summarizeProjectItems(items, statusField) {
  const safeItems = Array.isArray(items) ? items : [];
  const itemCount = safeItems.length;
  let markedCount = 0;
  let partialCount = 0;
  let totalCost = 0;
  let valuedAmount = 0;
  // Partial-aware progress share: full count for ratified items, fractional
  // for in-progress ones. Mirrors the server-side aggregation.
  let progressShare = 0;

  safeItems.forEach((item) => {
    const lineAmount = safeNum(item?.qty) * safeNum(item?.rate);
    totalCost += lineAmount;
    const ratified = Boolean(item?.[statusField]);
    const pct = Math.max(0, Math.min(100, safeNum(item?.percentComplete)));
    const factor = ratified ? 1 : pct / 100;
    valuedAmount += lineAmount * factor;
    progressShare += factor;
    if (ratified) markedCount += 1;
    else if (factor > 0) partialCount += 1;
  });

  return {
    itemCount,
    markedCount,
    partialCount,
    totalCost,
    valuedAmount,
    remainingAmount: totalCost - valuedAmount,
    progressPercent: itemCount ? (progressShare / itemCount) * 100 : 0,
  };
}

function summarizeProjectRows(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const summary = safeRows.reduce(
    (acc, row) => {
      acc.projectCount += 1;
      acc.itemCount += safeNum(row?.itemCount);
      acc.markedCount += safeNum(row?.markedCount);
      acc.totalCost += safeNum(row?.totalCost);
      acc.valuedAmount += safeNum(row?.valuedAmount);
      acc.remainingAmount += safeNum(row?.remainingAmount);
      return acc;
    },
    {
      projectCount: 0,
      itemCount: 0,
      markedCount: 0,
      totalCost: 0,
      valuedAmount: 0,
      remainingAmount: 0,
      progressPercent: 0,
    },
  );

  summary.progressPercent = summary.itemCount
    ? (summary.markedCount / summary.itemCount) * 100
    : 0;

  return summary;
}

/** ---------------- Local cache helpers ----------------
 * v2 keys so old buggy cache won't override new behavior
 */
function cacheKey(tool, projectId) {
  return `takeoffRates:v2:${normTool(tool)}:${projectId}`;
}
function readCache(tool, projectId) {
  try {
    const raw = localStorage.getItem(cacheKey(tool, projectId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function writeCache(tool, projectId, payload) {
  try {
    localStorage.setItem(cacheKey(tool, projectId), JSON.stringify(payload));
  } catch {
    // Ignore local-only storage failures and keep the UI usable.
  }
}

function linkKey(tool, projectId) {
  return `takeoffLinks:v2:${normTool(tool)}:${projectId}`;
}
function readLinkCache(tool, projectId) {
  try {
    const raw = localStorage.getItem(linkKey(tool, projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
function writeLinkCache(tool, projectId, payload) {
  try {
    localStorage.setItem(linkKey(tool, projectId), JSON.stringify(payload));
  } catch {
    // Ignore local-only storage failures and keep the UI usable.
  }
}

function purgeLocal(tool, projectId) {
  try {
    localStorage.removeItem(cacheKey(tool, projectId));
    localStorage.removeItem(linkKey(tool, projectId));
  } catch {
    // Ignore local-only storage failures and keep the UI usable.
  }
}

function normalizeUnit(u) {
  const raw = String(u || "")
    .trim()
    .toLowerCase();
  if (!raw) return "";
  if (raw === "bag" || raw === "bags") return "bag";
  if (
    raw === "t" ||
    raw === "ton" ||
    raw === "tons" ||
    raw === "tonne" ||
    raw === "tonnes"
  )
    return "t";
  const compact = raw.replace(/\s+/g, "");
  if (compact === "m3" || compact === "cum") return "m3";
  if (/\b(litre|liter|ltr|l)\b/.test(raw)) return "l";
  return raw;
}

/** ---------------- Similarity auto-grouping (Takeoffs) ---------------- */

const BRACKET_RE = /\[[^\]]*\]/g;
const NON_WORD_RE = /[^a-z0-9\s]/g;

const STOP = new Set([
  "the",
  "and",
  "to",
  "of",
  "for",
  "in",
  "on",
  "at",
  "with",
  "without",
  "from",
  "all",
  "multiple",
  "picked",
  "floors",
  "floor",
  "level",
  "levels",
  "type",
  "generic",
  "interior",
  "exterior",
  "complete",
  "including",
  "as",
  "by",
  "into",
]);

const SYN = {
  rebar: "reinforcement",
  bars: "reinforcement",
  bar: "reinforcement",
  steel: "reinforcement",
  rendering: "render",
  plastering: "render",
  plaster: "render",
  rc: "concrete",
  rcc: "concrete",
};

function stripMeta(desc) {
  return String(desc || "")
    .replace(BRACKET_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeToken(w) {
  const t = String(w || "").trim();
  if (!t) return "";
  return SYN[t] || t;
}

function tokenize(desc) {
  const s = stripMeta(desc)
    .toLowerCase()
    .replace(/[â€“â€”-]+/g, "-")
    .replace(NON_WORD_RE, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!s) return [];

  const parts = s.split(" ").filter(Boolean);
  const out = [];
  for (const p of parts) {
    if (!p) continue;
    if (STOP.has(p)) continue;
    if (/^\d+$/.test(p)) continue;
    if (p.length < 2) continue;
    out.push(normalizeToken(p));
  }
  return out.filter(Boolean);
}

function groupLabelFromDesc(desc) {
  const s = stripMeta(desc);
  if (!s) return "Similar items";
  const parts = s
    .split(" - ")
    .map((x) => x.trim())
    .filter(Boolean);
  const label = parts.slice(0, 2).join(" - ") || s;
  return label.length > 60 ? `${label.slice(0, 60)}...` : label;
}

function buildSimilarityGroups(items, getText) {
  const N = Array.isArray(items) ? items.length : 0;
  if (!N) return { itemGroupId: [], groupMeta: {} };

  const tokenSets = new Array(N);
  const df = new Map();

  for (let i = 0; i < N; i++) {
    const text = getText(items[i]);
    const toks = tokenize(text);
    const set = new Set(toks);
    tokenSets[i] = set;

    for (const t of set) df.set(t, (df.get(t) || 0) + 1);
  }

  const idf = new Map();
  for (const [t, c] of df.entries()) {
    const w = Math.log((N + 1) / (c + 1)) + 1;
    idf.set(t, w);
  }

  const SIG_TOKENS = 4;
  const itemGroupId = new Array(N);
  const groupMeta = {};

  for (let i = 0; i < N; i++) {
    const set = tokenSets[i];
    const arr = Array.from(set);

    arr.sort((a, b) => {
      const wa = idf.get(a) || 1;
      const wb = idf.get(b) || 1;
      if (wb !== wa) return wb - wa;
      return a.localeCompare(b);
    });

    const top = arr.slice(0, SIG_TOKENS).sort((a, b) => a.localeCompare(b));
    const sig = top.length ? top.join("|") : "misc";

    itemGroupId[i] = sig;

    if (!groupMeta[sig]) {
      groupMeta[sig] = {
        id: sig,
        label: groupLabelFromDesc(getText(items[i])),
        count: 0,
      };
    }
    groupMeta[sig].count += 1;
  }

  return { itemGroupId, groupMeta };
}

/** ---------------- Materials grouping (by materialName) ---------------- */

const PAREN_RE = /\([^)]*\)/g;

function normalizeMaterialName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(PAREN_RE, " ")
    .replace(BRACKET_RE, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTakeoffLine(line) {
  return String(line || "")
    .replace(BRACKET_RE, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isBlockMaterial(materialNameNorm) {
  return /\bblocks?\b/.test(materialNameNorm);
}

function buildMaterialGroups(items) {
  const N = Array.isArray(items) ? items.length : 0;
  if (!N) return { itemGroupId: [], groupMeta: {} };

  const itemGroupId = new Array(N);
  const groupMeta = {};

  for (let i = 0; i < N; i++) {
    const it = items[i] || {};
    const matNorm = normalizeMaterialName(it.materialName);
    const takeoffNorm = normalizeTakeoffLine(it.takeoffLine);

    const gid = isBlockMaterial(matNorm)
      ? `block|${matNorm}|${takeoffNorm || "na"}`
      : `mat|${matNorm || "unknown"}`;

    itemGroupId[i] = gid;

    if (!groupMeta[gid]) {
      const label = isBlockMaterial(matNorm)
        ? `${(it.materialName || "Block").trim()} - ${(it.takeoffLine || "").trim()}`.trim()
        : `${(it.materialName || "Unknown Material").trim()}`;

      groupMeta[gid] = {
        id: gid,
        label: label.length > 60 ? `${label.slice(0, 60)}...` : label,
        count: 0,
      };
    }

    groupMeta[gid].count += 1;
  }

  return { itemGroupId, groupMeta };
}

/** ---------------- RateGen entitlement + auto-fill ---------------- */

const AUTO_FILL_PREF_KEY = "adlm:autoFillMaterialsRates:v1";
function readAutoFillPref() {
  try {
    const raw = localStorage.getItem(AUTO_FILL_PREF_KEY);
    if (raw == null) return null;
    return raw === "1";
  } catch {
    return null;
  }
}
function writeAutoFillPref(v) {
  try {
    localStorage.setItem(AUTO_FILL_PREF_KEY, v ? "1" : "0");
  } catch {
    // Ignore local-only storage failures and keep the UI usable.
  }
}

function entitlementActive(ent) {
  if (!ent) return false;
  if (String(ent.status || "").toLowerCase() !== "active") return false;
  if (ent.expiresAt && new Date(ent.expiresAt).getTime() < Date.now())
    return false;
  return true;
}

function pickKeyFromCandidate(c) {
  return `${normalizeMaterialName(c?.description)}|${normalizeUnit(c?.unit)}`;
}

export default function ProjectsGeneric() {
  const { tool } = useParams();
  const { accessToken, user: authUser } = useAuth();
  const { ensureVerified } = useStepUp();
  const stepUpEnabled = !!authUser?.stepUpEnabled;
  const [searchParams, setSearchParams] = useSearchParams();

  // Email-OTP "step-up" gate for destructive actions (delete / lock / unlock).
  // When the user has opted in, acquireStepUp() returns the X-Step-Up header,
  // prompting for an emailed code if there's no valid ~10-min session yet; when
  // they haven't opted in it returns undefined and the request runs as before.
  // ensureVerified() throws "Verification cancelled" if the modal is dismissed —
  // callers treat that as a silent abort.
  const acquireStepUp = React.useCallback(
    async ({ force = false } = {}) => {
      if (!stepUpEnabled && !force) return undefined;
      const token = await ensureVerified();
      return { "X-Step-Up": token };
    },
    [stepUpEnabled, ensureVerified],
  );

  // Run a single gated request. Pre-acquires the header when enabled, and if the
  // server still answers 428 STEP_UP_REQUIRED (e.g. the flag was toggled on
  // another device so our copy was stale), verifies and retries once.
  const runGated = React.useCallback(
    async (doRequest) => {
      let headers = await acquireStepUp();
      try {
        return await doRequest(headers);
      } catch (e) {
        if (e?.data?.code === "STEP_UP_REQUIRED") {
          headers = await acquireStepUp({ force: true });
          return await doRequest(headers);
        }
        throw e;
      }
    },
    [acquireStepUp],
  );

  const isStepUpCancel = (e) => e?.message === "Verification cancelled";
  const navigate = useNavigate();

  const toolNorm = normTool(tool);
  const endpoints = React.useMemo(() => getEndpoints(tool), [tool]);

  const showMaterials = isMaterialsTool(tool);
  // Show Takeoffs / Materials toggle for tools that have both modes
  const toolFamily = toolNorm === "revit" || toolNorm === "revit-materials" || toolNorm === "revit-material"
    ? "revit"
    : toolNorm === "planswift" || toolNorm === "planswift-materials" || toolNorm === "planswift-material"
      ? "planswift"
      : null;
  // Materials is no longer a separate project/list — the budget now lives as a
  // "Budget" tab inside each project (reads sel.materialItems). Hide the
  // Takeoffs/Materials switcher entirely.
  const showRevitToggle = false;
  const statusField = showMaterials ? "purchased" : "completed";
  const statusLabel = showMaterials ? "Purchased" : "Completed";
  const statusPastLabel = showMaterials
    ? "Purchased to date"
    : "Completed to date";

  const sidebarMeta = React.useMemo(() => getSidebarMeta(tool), [tool]);
  const SidebarIcon = sidebarMeta.Icon;

  const [rows, setRows] = React.useState([]);
  const [sel, setSel] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [storageInfo, setStorageInfo] = React.useState(null);

  // explorer selection
  const [selectedMap, setSelectedMap] = React.useState({});
  const selectedIds = React.useMemo(
    () => Object.keys(selectedMap || {}).filter(Boolean),
    [selectedMap],
  );
  const [bulkBusy, setBulkBusy] = React.useState(false);

  // rates editing
  const [rates, setRates] = React.useState({});
  const [baseRates, setBaseRates] = React.useState({});
  const [actualQtyMap, setActualQtyMap] = React.useState({});
  const [baseActualQtyMap, setBaseActualQtyMap] = React.useState({});
  const [actualRateMap, setActualRateMap] = React.useState({});
  const [baseActualRateMap, setBaseActualRateMap] = React.useState({});
  const [statusMap, setStatusMap] = React.useState({});
  const [baseStatusMap, setBaseStatusMap] = React.useState({});
  // Partial completion percentage per item (0-100). Mirrors statusMap so
  // the user can set "50% done" directly from the BoQ row without going
  // through the PM tab.
  const [percentMap, setPercentMap] = React.useState({});
  const [basePercentMap, setBasePercentMap] = React.useState({});
  const [categoryMap, setCategoryMap] = React.useState({});
  const [baseCategoryMap, setBaseCategoryMap] = React.useState({});
  const [tradeMap, setTradeMap] = React.useState({});
  const [baseTradeMap, setBaseTradeMap] = React.useState({});
  // "category" (default) | "trade" — controls how the BoQ table groups rows.
  // Remembered per user (localStorage) so the chosen arrangement sticks across
  // reloads and future projects.
  const [groupByMode, setGroupByMode] = React.useState(() => {
    if (typeof window === "undefined") return "category";
    try {
      return localStorage.getItem("adlm:boqGroupByMode") || "category";
    } catch {
      return "category";
    }
  });
  React.useEffect(() => {
    try {
      localStorage.setItem("adlm:boqGroupByMode", groupByMode);
    } catch {
      /* ignore */
    }
  }, [groupByMode]);
  // Set true when the user reorders bill items so the Save button activates
  // (item order isn't otherwise part of the dirty check). Reset on project
  // load — see the effect just after selectedId is defined.
  const [orderDirty, setOrderDirty] = React.useState(false);
  // Contract lock state — populated from the loaded project.
  const [contract, setContract] = React.useState({
    locked: false,
    preliminaryPercent: 7.5,
    contingencyPercent: 5,
    taxPercent: 7.5,
  });
  const [contractBusy, setContractBusy] = React.useState(false);
  const [certificates, setCertificates] = React.useState([]);
  const [finalAccount, setFinalAccount] = React.useState({ finalized: false });
  const [projectModels, setProjectModels] = React.useState({
    architectural: null,
    structural: null,
    mep: null,
  });
  const [certBusy, setCertBusy] = React.useState(false);
  const [modelUploadBusy, setModelUploadBusy] = React.useState({});
  const [provisionalSums, setProvisionalSums] = React.useState([]);
  const [baseProvisionalSums, setBaseProvisionalSums] = React.useState([]);
  const [variations, setVariations] = React.useState([]);
  const [baseVariations, setBaseVariations] = React.useState([]);
  const [preliminaryItems, setPreliminaryItems] = React.useState([]);
  const [basePreliminaryItems, setBasePreliminaryItems] = React.useState([]);
  // ── Undo stack for BoQ deletes ──────────────────────────────────────
  // Stores the last N deleted entries (measured items, preliminaries,
  // PC sums, variations) so the user can recover from an accidental
  // click on the trash icon. We keep snapshots of the full entity AND
  // its insertion-position so Undo restores order, not just contents.
  //
  // Each entry: { id, kind, item, index, label, ts }
  //   kind ∈ 'measured' | 'preliminary' | 'provisional' | 'variation'
  //   item is the JSON snapshot of the deleted entity
  //   index is where to splice it back in on Undo
  //
  // 5-deep on the visible stack but Undo button shows top 3 — gives a
  // small safety net beyond the user-visible window.
  const [boqUndoStack, setBoqUndoStack] = React.useState([]);
  const BOQ_UNDO_MAX = 5;
  // Helper: push a deletion snapshot. Truncates the stack to the cap so
  // older entries silently age out (the user only ever undoes recent
  // accidental clicks; deeper history would just clutter the UI).
  const pushBoqUndo = React.useCallback((entry) => {
    setBoqUndoStack((prev) => {
      const next = [{ ...entry, id: `${entry.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ts: Date.now() }, ...prev];
      return next.slice(0, BOQ_UNDO_MAX);
    });
  }, []);
  const [valuationSettings, setValuationSettings] = React.useState(
    DEFAULT_VALUATION_SETTINGS,
  );
  const [baseValuationSettings, setBaseValuationSettings] = React.useState(
    DEFAULT_VALUATION_SETTINGS,
  );

  // linked groups
  const [linkedGroups, setLinkedGroups] = React.useState({});
  const [onlyFillEmpty, setOnlyFillEmpty] = React.useState(true);

  // save UX
  const [saving, setSaving] = React.useState(false);
  const [notice, setNotice] = React.useState("");

  // ── BoQ Import (admin-granted Quiv feature) state ──
  const canBoqImport = toolNorm === "revit" && hasBoqImportAccess(authUser);
  const [boqImportOpen, setBoqImportOpen] = React.useState(false);
  const [boqImportBusy, setBoqImportBusy] = React.useState(false);
  const [boqImportFile, setBoqImportFile] = React.useState(null);
  const [boqImportName, setBoqImportName] = React.useState("");
  const [boqImportErr, setBoqImportErr] = React.useState("");
  const boqReimportInputRef = React.useRef(null);

  // "Add shared project" (claim a project shared with me by code)
  const [claimOpen, setClaimOpen] = React.useState(false);
  const [claimCode, setClaimCode] = React.useState("");
  const [claimBusy, setClaimBusy] = React.useState(false);
  const [claimErr, setClaimErr] = React.useState("");
  const [claimUpsell, setClaimUpsell] = React.useState(null); // { requiredProductKey, productName }
  const [valuations, setValuations] = React.useState([]);
  const [valuationErr, setValuationErr] = React.useState("");
  const [loadingValuations, setLoadingValuations] = React.useState(false);
  const [selectedValuationDate, setSelectedValuationDate] = React.useState("");

  // Project Management (PM) tab state — separately loaded from the BoQ so
  // the heavy compute lives server-side and the PM tab can refresh without
  // re-fetching the whole project document.
  const [pmDashboard, setPmDashboard] = React.useState(null);
  const [pmSaving, setPmSaving] = React.useState(false);
  const [pmImporting, setPmImporting] = React.useState(false);
  const [pmGenerating, setPmGenerating] = React.useState(false);
  const [pmImportError, setPmImportError] = React.useState("");
  // The parser returns a stable errorCode (e.g. MPP_NOT_ENABLED) when
  // .mpp import isn't possible — we track it separately so the client can
  // show the XML-export helper modal instead of a plain error toast.
  const [pmImportErrorCode, setPmImportErrorCode] = React.useState("");

  // search (items)
  const [itemQuery, setItemQuery] = React.useState("");

  // search projects list
  const [projectQuery, setProjectQuery] = React.useState("");

  const _boqFileRef = React.useRef(null);
  const [exportOpen, setExportOpen] = React.useState(false);
  const [_boqTemplateReady, setBoqTemplateReady] = React.useState(
    !!loadBoqTemplateFromLocal(),
  );

  // material resolve + picks
  const [matResolved, setMatResolved] = React.useState({
    pricesByKey: {},
    candidatesByKey: {},
  });
  const [matPicks, setMatPicks] = React.useState({});
  const [openPickKey, setOpenPickKey] = React.useState(null);

  // entitlement + auto-fill
  const [canRateGen, setCanRateGen] = React.useState(false);
  const [autoFillMaterialsRates, setAutoFillMaterialsRates] =
    React.useState(false);
  const [autoFillBusy, setAutoFillBusy] = React.useState(false);
  const autoFillAppliedRef = React.useRef({});

  // BOQ rate sync from RateGen (non-materials view)
  const [boqRateResolved, setBoqRateResolved] = React.useState(null);
  const [autoFillBoqRates, setAutoFillBoqRates] = React.useState(false);
  const [autoFillBoqBusy, setAutoFillBoqBusy] = React.useState(false);
  const autoFillBoqAppliedRef = React.useRef({});
  const prevZoneRef = React.useRef(authUser?.zone);
  const [openBoqPickKey, setOpenBoqPickKey] = React.useState(null);

  const rowId = (r) => r?._id || r?.id || null;
  const selectedId = sel?._id || sel?.id;

  function itemKey(it, i) {
    const sn = it?.sn ?? i + 1;
    const code = String(it?.code || "");
    const desc = showMaterials
      ? materialDescription(it)
      : String(it?.description || "");
    return `${sn}::${code}::${desc}`;
  }

  function itemText(it) {
    return showMaterials
      ? materialDescription(it)
      : String(it?.description || "");
  }

  const items = Array.isArray(sel?.items) ? sel.items : [];

  // Clear the reorder-dirty flag whenever a different project is opened.
  React.useEffect(() => {
    setOrderDirty(false);
  }, [selectedId]);

  const { itemGroupId, groupMeta } = React.useMemo(() => {
    if (showMaterials) return buildMaterialGroups(items);
    return buildSimilarityGroups(items, itemText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, showMaterials, items.length]);

  function groupIdForIndex(i) {
    return itemGroupId?.[i] || "";
  }
  function groupLabel(groupId) {
    return groupMeta?.[groupId]?.label || "Similar items";
  }
  function groupCount(groupId) {
    return safeNum(groupMeta?.[groupId]?.count);
  }
  function isGroupLinked(groupId) {
    return !!(groupId && linkedGroups?.[groupId]);
  }

  async function _onUploadBoqTemplate(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    try {
      const ab = await readFileAsArrayBuffer(file);
      const ok = saveBoqTemplateToLocal(ab);
      if (!ok) throw new Error("Could not store template in browser storage.");
      setBoqTemplateReady(true);
      setNotice("BoQ template uploaded. Elemental export will use it.");
      setErr("");
    } catch (ex) {
      setErr(ex?.message || "Failed to upload BoQ template");
    }
  }

  function initRatesFromProject(project) {
    const its = Array.isArray(project?.items) ? project.items : [];
    const base = {};
    const ui = {};
    const baseActualQty = {};
    const uiActualQty = {};
    const baseActualRate = {};
    const uiActualRate = {};
    const baseStatuses = {};
    const uiStatuses = {};
    const basePercents = {};
    const uiPercents = {};
    const baseCategories = {};
    const uiCategories = {};
    for (let i = 0; i < its.length; i++) {
      const k = itemKey(its[i], i);
      const r = safeNum(its[i]?.rate);
      const actualQty = parseOptionalNumber(its[i]?.actualQty);
      const actualRate = parseOptionalNumber(its[i]?.actualRate);
      base[k] = r;
      ui[k] = r > 0 ? String(r) : "";
      baseActualQty[k] = actualQty;
      uiActualQty[k] = actualInputValue(actualQty);
      baseActualRate[k] = actualRate;
      uiActualRate[k] = actualInputValue(actualRate);
      const ratified = Boolean(its[i]?.[statusField]);
      baseStatuses[k] = ratified;
      uiStatuses[k] = ratified;
      // Lazy migration: a ratified item is treated as 100% even if the
      // stored percentComplete is still 0 (legacy data).
      const storedPct = Math.max(
        0,
        Math.min(100, Number(its[i]?.percentComplete) || 0),
      );
      const pct = ratified && storedPct < 100 ? 100 : storedPct;
      basePercents[k] = pct;
      uiPercents[k] = pct;
      const cat =
        String(its[i]?.category || "").trim() ||
        deriveItemCategory(its[i], toolNorm);
      baseCategories[k] = cat;
      uiCategories[k] = cat;
    }
    // Initialize trade map: use saved item.trade when present, otherwise
    // fall back to the rule-based classifier so existing projects get a
    // sensible default for the new Trade grouping view.
    const baseTrades = {};
    const uiTrades = {};
    for (let i = 0; i < its.length; i++) {
      const k = itemKey(its[i], i);
      const t =
        String(its[i]?.trade || "").trim() ||
        deriveItemTrade(its[i], toolNorm);
      baseTrades[k] = t;
      uiTrades[k] = t;
    }
    setBaseRates(base);
    setBaseActualQtyMap(baseActualQty);
    setActualQtyMap(uiActualQty);
    setBaseActualRateMap(baseActualRate);
    setActualRateMap(uiActualRate);
    setBaseStatusMap(baseStatuses);
    setStatusMap(uiStatuses);
    setBasePercentMap(basePercents);
    setPercentMap(uiPercents);
    setBaseCategoryMap(baseCategories);
    setCategoryMap(uiCategories);
    setBaseTradeMap(baseTrades);
    setTradeMap(uiTrades);
    const sums = Array.isArray(project?.provisionalSums)
      ? project.provisionalSums.map((s) => ({
          description: String(s?.description || ""),
          amount: Number(s?.amount) || 0,
        }))
      : [];
    setProvisionalSums(sums);
    setBaseProvisionalSums(sums.map((s) => ({ ...s })));
    const vars = Array.isArray(project?.variations)
      ? project.variations.map((v) => ({
          description: String(v?.description || ""),
          qty: Number(v?.qty) || 0,
          unit: String(v?.unit || ""),
          rate: Number(v?.rate) || 0,
          reference: String(v?.reference || ""),
          issuedAt: v?.issuedAt
            ? new Date(v.issuedAt).toISOString().slice(0, 10)
            : "",
        }))
      : [];
    setVariations(vars);
    setBaseVariations(vars.map((v) => ({ ...v })));
    const prelimItems = Array.isArray(project?.preliminaryItems)
      ? project.preliminaryItems.map((p) => ({
          name: String(p?.name || ""),
          allocation: Number(p?.allocation) || 0,
          completed: Boolean(p?.completed),
          completedAt: p?.completedAt || null,
          notes: String(p?.notes || ""),
        }))
      : [];
    setPreliminaryItems(prelimItems);
    setBasePreliminaryItems(prelimItems.map((p) => ({ ...p })));
    const contractSrc = project?.contract || {};
    setContract({
      locked: Boolean(contractSrc.locked),
      lockedAt: contractSrc.lockedAt || null,
      approvedAt: contractSrc.approvedAt || null,
      preliminaryPercent:
        Number.isFinite(Number(contractSrc.preliminaryPercent))
          ? Number(contractSrc.preliminaryPercent)
          : 7.5,
      // Contingency + tax — default to QS-standard values if the
      // project predates the feature (old projects have no field).
      contingencyPercent:
        Number.isFinite(Number(contractSrc.contingencyPercent))
          ? Number(contractSrc.contingencyPercent)
          : 5,
      taxPercent:
        Number.isFinite(Number(contractSrc.taxPercent))
          ? Number(contractSrc.taxPercent)
          : 7.5,
      contractSum: Number(contractSrc.contractSum) || 0,
      measuredAtLock: Number(contractSrc.measuredAtLock) || 0,
      provisionalAtLock: Number(contractSrc.provisionalAtLock) || 0,
      preliminaryAtLock: Number(contractSrc.preliminaryAtLock) || 0,
      contingencyAtLock: Number(contractSrc.contingencyAtLock) || 0,
      taxAtLock: Number(contractSrc.taxAtLock) || 0,
      hasLockPin: Boolean(contractSrc.hasLockPin),
    });
    setCertificates(
      Array.isArray(project?.certificates)
        ? project.certificates.map((c) => ({ ...c }))
        : [],
    );
    setFinalAccount({
      finalized: Boolean(project?.finalAccount?.finalized),
      finalizedAt: project?.finalAccount?.finalizedAt || null,
      measuredWorkFinal: Number(project?.finalAccount?.measuredWorkFinal) || 0,
      provisionalFinal: Number(project?.finalAccount?.provisionalFinal) || 0,
      preliminaryFinal: Number(project?.finalAccount?.preliminaryFinal) || 0,
      variationsFinal: Number(project?.finalAccount?.variationsFinal) || 0,
      retentionReleased: Number(project?.finalAccount?.retentionReleased) || 0,
      totalCertifiedToDate:
        Number(project?.finalAccount?.totalCertifiedToDate) || 0,
      agreedContractSum: Number(project?.finalAccount?.agreedContractSum) || 0,
      finalContractValue: Number(project?.finalAccount?.finalContractValue) || 0,
      savings: Number(project?.finalAccount?.savings) || 0,
      notes: String(project?.finalAccount?.notes || ""),
    });
    const mo = project?.models || {};
    setProjectModels({
      architectural: mo.architectural?.url ? mo.architectural : null,
      structural: mo.structural?.url ? mo.structural : null,
      mep: mo.mep?.url ? mo.mep : null,
    });
    const normalizedSettings = normalizeValuationSettings(
      project?.valuationSettings,
    );
    setBaseValuationSettings(normalizedSettings);
    setValuationSettings(normalizedSettings);
    const cached = project?._id ? readCache(tool, project._id) : null;
    if (cached && cached?.rates && typeof cached.rates === "object") {
      const nextUi = { ...ui };
      for (const [k, v] of Object.entries(cached.rates)) {
        if (!(k in nextUi)) continue;
        const serverVal = safeNum(base[k]);
        const cacheVal = safeNum(v);
        if (serverVal === 0 && cacheVal !== 0) nextUi[k] = String(cacheVal);
      }
      setRates(nextUi);
    } else {
      setRates(ui);
    }
    if (cached && cached?.actualQty && typeof cached.actualQty === "object") {
      const nextActualQty = { ...uiActualQty };
      for (const [k, v] of Object.entries(cached.actualQty)) {
        if (!(k in nextActualQty)) continue;
        const serverVal = parseOptionalNumber(baseActualQty[k]);
        const cacheVal = parseOptionalNumber(v);
        // Only restore from cache if the server item has never had actuals
        // recorded — if actualRecordedAt is set, the server value is authoritative.
        const idx = its.findIndex((it, i) => itemKey(it, i) === k);
        const serverEverRecorded = idx >= 0 && its[idx]?.actualRecordedAt != null;
        if (!serverEverRecorded && serverVal == null && cacheVal != null) {
          nextActualQty[k] = actualInputValue(cacheVal);
        }
      }
      setActualQtyMap(nextActualQty);
    }
    if (cached && cached?.actualRate && typeof cached.actualRate === "object") {
      const nextActualRate = { ...uiActualRate };
      for (const [k, v] of Object.entries(cached.actualRate)) {
        if (!(k in nextActualRate)) continue;
        const serverVal = parseOptionalNumber(baseActualRate[k]);
        const cacheVal = parseOptionalNumber(v);
        // Only restore from cache if the server item has never had actuals
        // recorded — if actualRecordedAt is set, the server value is authoritative.
        const idx = its.findIndex((it, i) => itemKey(it, i) === k);
        const serverEverRecorded = idx >= 0 && its[idx]?.actualRecordedAt != null;
        if (!serverEverRecorded && serverVal == null && cacheVal != null) {
          nextActualRate[k] = actualInputValue(cacheVal);
        }
      }
      setActualRateMap(nextActualRate);
    }
    if (project?._id) {
      const lk = readLinkCache(tool, project._id);
      if (lk && typeof lk === "object") {
        setLinkedGroups(lk.linkedGroups || {});
        setMatPicks(lk.matPicks || {});
      } else {
        setLinkedGroups({});
        setMatPicks({});
      }
    } else {
      setLinkedGroups({});
      setMatPicks({});
    }
  }

  function closeProject() {
    setSel(null);
    setRates({});
    setBaseRates({});
    setActualQtyMap({});
    setBaseActualQtyMap({});
    setActualRateMap({});
    setBaseActualRateMap({});
    setStatusMap({});
    setBaseStatusMap({});
    setPercentMap({});
    setBasePercentMap({});
    setCategoryMap({});
    setBaseCategoryMap({});
    setProvisionalSums([]);
    setBaseProvisionalSums([]);
    setValuationSettings(DEFAULT_VALUATION_SETTINGS);
    setBaseValuationSettings(DEFAULT_VALUATION_SETTINGS);
    setLinkedGroups({});
    setValuations([]);
    setValuationErr("");
    setSelectedValuationDate("");
    setItemQuery("");
    setNotice("");
    setErr("");
    setPmDashboard(null);
    setPmImportError("");
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("project");
      return next;
    });
  }

  async function loadPmDashboard(projectId = selectedId) {
    if (!projectId) {
      setPmDashboard(null);
      return;
    }
    try {
      const data = await apiAuthed(endpoints.pmDashboard(projectId), {
        token: accessToken,
      });
      if (data?.ok && data?.dashboard) {
        setPmDashboard(data.dashboard);
      }
    } catch (e) {
      // Non-fatal — the PM tab simply shows an empty state.
      console.warn("loadPmDashboard failed:", e?.message || e);
    }
  }

  async function handlePmSave(payload) {
    if (!selectedId) return;
    setPmSaving(true);
    setPmImportError("");
    try {
      const data = await apiAuthed(endpoints.pmUpdate(selectedId), {
        token: accessToken,
        method: "PATCH",
        body: payload,
      });
      if (data?.dashboard) setPmDashboard(data.dashboard);
      setNotice("PM plan saved.");
    } catch (e) {
      setPmImportError(e?.message || "Failed to save PM plan.");
    } finally {
      setPmSaving(false);
    }
  }

  async function handlePmGenerateFromBoq({ projectStart, projectFinish } = {}) {
    if (!selectedId) return;
    setPmGenerating(true);
    setPmImportError("");
    try {
      const body = {};
      if (projectStart) body.projectStart = projectStart;
      if (projectFinish) body.projectFinish = projectFinish;
      const data = await apiAuthed(endpoints.pmGenerateFromBoq(selectedId), {
        token: accessToken,
        method: "POST",
        body,
      });
      if (data?.dashboard) setPmDashboard(data.dashboard);
      setNotice(`Generated ${data?.generated || 0} task(s) from BoQ.`);
    } catch (e) {
      setPmImportError(e?.message || "Failed to generate tasks from BoQ.");
    } finally {
      setPmGenerating(false);
    }
  }

  async function handlePmImportFile(file) {
    if (!selectedId || !file) return;
    setPmImporting(true);
    setPmImportError("");
    setPmImportErrorCode("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(
        `${API_BASE}${endpoints.pmImport(selectedId)}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: form,
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Capture the errorCode so the import UI can branch — e.g. show
        // an XML-export helper modal on MPP_NOT_ENABLED instead of just
        // a red toast.
        if (data?.errorCode) setPmImportErrorCode(String(data.errorCode));
        throw new Error(data?.error || `Import failed (${res.status})`);
      }
      if (data?.dashboard) setPmDashboard(data.dashboard);
      // Build a richer notice that explains auto-linking + merge
      // behaviour. On re-imports the user wants to know their progress
      // wasn't wiped — the merge counts answer that directly.
      const a = data?.autoLink || {};
      const m = data?.merge || {};
      const parts = [];
      // First-time vs re-import wording. data.merge.added > 0 with
      // updated = 0 is the first-import path; updated > 0 means this
      // is a re-import.
      if (data?.replaceExisting) {
        parts.push(
          `Imported ${data?.imported || 0} task${data?.imported === 1 ? "" : "s"} from ${data?.format || "file"} (replaced existing).`,
        );
      } else if (m.updated > 0) {
        parts.push(
          `Re-imported from ${data?.format || "file"}: ${m.updated} task${m.updated === 1 ? "" : "s"} refreshed (schedule + critical path), progress + BoQ links preserved.${m.added > 0 ? ` ${m.added} new task${m.added === 1 ? "" : "s"} added.` : ""}`,
        );
      } else {
        parts.push(
          `Imported ${data?.imported || 0} task${data?.imported === 1 ? "" : "s"} from ${data?.format || "file"}.`,
        );
      }
      if (a.linkedCount) {
        const learned = a.learnedCount
          ? ` (${a.learnedCount} re-used from past mappings)`
          : "";
        parts.push(`Auto-linked ${a.linkedCount} new task${a.linkedCount === 1 ? "" : "s"} to BoQ items${learned}.`);
      }
      setNotice(parts.join(" "));
    } catch (e) {
      setPmImportError(e?.message || "Import failed.");
    } finally {
      setPmImporting(false);
    }
  }

  function handlePmDismissImportError() {
    setPmImportError("");
    setPmImportErrorCode("");
  }

  async function handlePmReset() {
    if (!selectedId) return;
    if (!window.confirm("Reset all PM data (tasks, risks, issues)? This cannot be undone.")) return;
    try {
      const data = await apiAuthed(endpoints.pmReset(selectedId), {
        token: accessToken,
        method: "DELETE",
      });
      if (data?.dashboard) setPmDashboard(data.dashboard);
      setNotice("PM data cleared.");
    } catch (e) {
      setPmImportError(e?.message || "Failed to reset PM data.");
    }
  }

  async function handlePmClearImports() {
    if (!selectedId) return;
    const imports = pmDashboard?.tasks?.filter((t) => String(t?.source || "").startsWith("msproject")).length || 0;
    const msg = imports > 0
      ? `Delete ${imports} imported MS Project task(s) and clear the import history? Manual and BoQ-linked tasks will be preserved. This cannot be undone.`
      : "Clear the import history? No imported tasks remain.";
    if (!window.confirm(msg)) return;
    try {
      const data = await apiAuthed(endpoints.pmClearImports(selectedId), {
        token: accessToken,
        method: "POST",
      });
      if (data?.dashboard) setPmDashboard(data.dashboard);
      setNotice(
        data?.removed
          ? `Removed ${data.removed} imported task(s).`
          : "Import history cleared.",
      );
    } catch (e) {
      setPmImportError(e?.message || "Failed to clear imports.");
    }
  }

  // Re-cascade task dates through the predecessor graph. Uses the project's
  // current projectStart as the anchor; tasks with no predecessors snap to
  // that date, tasks with predecessors slide to start = max(pred end).
  async function handlePmReschedule(opts = {}) {
    if (!selectedId) return;
    const anchor = pmDashboard?.projectStart
      ? new Date(pmDashboard.projectStart).toLocaleDateString()
      : null;
    if (!anchor && !opts.projectStart) {
      setPmImportError(
        "Set a project start date in the Project header first.",
      );
      return;
    }
    if (
      opts.confirm !== false &&
      !window.confirm(
        `Reschedule all tasks from ${opts.projectStart ? new Date(opts.projectStart).toLocaleDateString() : anchor}? ` +
          `Tasks with no predecessors will move to that date; everything else flows from their predecessor end dates.`,
      )
    ) {
      return;
    }
    try {
      const data = await apiAuthed(endpoints.pmReschedule(selectedId), {
        token: accessToken,
        method: "POST",
        body: opts.projectStart ? { projectStart: opts.projectStart } : {},
      });
      if (data?.dashboard) setPmDashboard(data.dashboard);
      const r = data?.reschedule || {};
      const parts = [];
      if (r.changed) parts.push(`${r.changed} task${r.changed === 1 ? "" : "s"} moved`);
      if (r.anchored) parts.push(`${r.anchored} anchored at start`);
      if (r.cycles) parts.push(`${r.cycles} cycle(s) detected`);
      setNotice(parts.length ? `Rescheduled — ${parts.join(", ")}.` : "Rescheduled.");
    } catch (e) {
      setPmImportError(e?.message || "Failed to reschedule tasks.");
    }
  }

  // Download the project schedule as a .ics file. Fetched via auth'd fetch
  // so the Bearer token can travel; we then turn the response into a Blob
  // and trigger a browser download. Calendar name = project name.
  async function handlePmExportCalendar() {
    if (!selectedId) return;
    try {
      const res = await fetch(`${API_BASE}${endpoints.pmCalendar(selectedId)}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
      if (!res.ok) {
        const errPayload = await res.json().catch(() => ({}));
        throw new Error(errPayload?.error || `Export failed (${res.status})`);
      }
      // Prefer the server-supplied filename if exposed; fall back to a
      // sanitized project name.
      let filename = "";
      const hdr = res.headers.get("X-Calendar-Filename");
      if (hdr) {
        try { filename = decodeURIComponent(hdr); } catch { /* ignore */ }
      }
      if (!filename) {
        const safe = (sel?.name || "project")
          .replace(/[\\/:*?"<>|]+/g, "-")
          .replace(/\s+/g, " ")
          .trim();
        filename = `${safe || "project"}.ics`;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Defer revoke so older browsers don't cancel the download.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(`Calendar exported: ${filename}`);
    } catch (e) {
      setPmImportError(e?.message || "Failed to export calendar.");
    }
  }

  async function loadValuations(projectId = selectedId) {
    if (!projectId) {
      setValuations([]);
      setValuationErr("");
      setSelectedValuationDate("");
      return;
    }

    setLoadingValuations(true);
    setValuationErr("");

    try {
      const data = await apiAuthed(endpoints.valuations(projectId), {
        token: accessToken,
      });
      const logs = Array.isArray(data?.logs) ? data.logs : [];
      setValuations(logs);
      setSelectedValuationDate((prev) => {
        if (prev && logs.some((log) => log.date === prev)) return prev;
        return logs[0]?.date || "";
      });
    } catch (e) {
      setValuations([]);
      setSelectedValuationDate("");
      setValuationErr(e.message || "Failed to load valuation log");
    } finally {
      setLoadingValuations(false);
    }
  }

  // Redeem a share code → join the project as a collaborator. On the plugin
  // gate (403) the server returns the required product so we can upsell.
  async function claimSharedProject() {
    const code = String(claimCode || "").trim();
    if (!code) {
      setClaimErr("Enter a share code.");
      return;
    }
    setClaimBusy(true);
    setClaimErr("");
    setClaimUpsell(null);
    try {
      const data = await apiAuthed("/projects/claim", {
        token: accessToken,
        method: "POST",
        body: { code },
      });
      const pk = normTool(data?.productKey || toolNorm);
      const projKey = data?.slug || data?.projectId || "";
      setClaimOpen(false);
      setClaimCode("");
      if (pk === toolNorm) {
        // Same tool — refresh this list, sync the URL, then open the project.
        await load({ keepSelection: false });
        if (projKey) {
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set("project", projKey);
            return next;
          });
        }
        if (data?.projectId) await view(data.projectId);
        setNotice("Project added to your list.");
      } else {
        // Different tool — route to that tool's projects with it preselected.
        navigate(`/projects/${pk}?project=${encodeURIComponent(projKey)}`);
      }
    } catch (e) {
      if (e?.status === 403 && e?.data?.requiredProductKey) {
        setClaimUpsell({
          requiredProductKey: e.data.requiredProductKey,
          productName: e.data.productName || e.data.requiredProductKey,
        });
        setClaimErr(
          e.data.error || "You don't have the required subscription.",
        );
      } else {
        setClaimErr(e?.data?.error || e?.message || "Could not add the project.");
      }
    } finally {
      setClaimBusy(false);
    }
  }

  // ── BoQ Import (admin-granted Quiv feature) actions ──

  async function downloadBoqTemplate() {
    try {
      const res = await fetch(`${API_BASE}/projects/revit/import-boq/template`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`Template download failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "adlm-boq-import-template.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setBoqImportErr(e?.message || "Failed to download the template");
    }
  }

  function importWarningsText(data) {
    const warnings = Array.isArray(data?._importWarnings)
      ? data._importWarnings
      : [];
    return warnings.length ? ` ${warnings.join(" ")}` : "";
  }

  async function submitBoqImport() {
    if (!boqImportFile) {
      setBoqImportErr("Choose an Excel .xlsx workbook to import.");
      return;
    }
    setBoqImportBusy(true);
    setBoqImportErr("");
    try {
      const form = new FormData();
      form.append("file", boqImportFile);
      if (boqImportName.trim()) form.append("name", boqImportName.trim());
      const res = await fetch(`${API_BASE}/projects/revit/import-boq`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Import failed (${res.status})`);
      setBoqImportOpen(false);
      setBoqImportFile(null);
      setBoqImportName("");
      await load({ keepSelection: false });
      const newId = data?._id || data?.id;
      if (newId) await view(newId);
      setNotice(
        `Imported "${data?.name || "project"}" from the Excel BoQ.${importWarningsText(data)}`,
      );
    } catch (e) {
      setBoqImportErr(e?.message || "Import failed");
    } finally {
      setBoqImportBusy(false);
    }
  }

  // Refresh an imported project from a newer copy of its workbook (updated
  // actual columns, added lines/categories). Server preserves completion
  // history and procurement marks.
  async function reimportBoq(file) {
    if (!file || !selectedId) return;
    setBoqImportBusy(true);
    setErr("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(
        `${API_BASE}/projects/revit/${selectedId}/import-boq`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: form,
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data?.error || `Re-import failed (${res.status})`);
      await view(selectedId);
      setNotice(`Bill updated from the Excel re-import.${importWarningsText(data)}`);
    } catch (e) {
      setErr(e?.message || "Re-import failed");
    } finally {
      setBoqImportBusy(false);
      if (boqReimportInputRef.current) boqReimportInputRef.current.value = "";
    }
  }

  async function load({ keepSelection = true } = {}) {
    setErr("");
    setNotice("");

    try {
      const [list, storage] = await Promise.all([
        apiAuthed(endpoints.list, { token: accessToken }),
        isMaterialsTool(tool)
          ? Promise.resolve(null)
          : apiAuthed(`/projects/${normTool(tool)}/storage`, { token: accessToken }).catch(() => null),
      ]);
      const safeList = Array.isArray(list) ? list : [];
      if (storage) setStorageInfo(storage);
      setRows(safeList);

      if (!keepSelection) setSelectedMap({});

      // Only auto-open if ?project= exists (file-explorer UX)
      const preselectKey = searchParams.get("project");
      if (preselectKey) {
        const isObjectId = /^[a-f\d]{24}$/i.test(preselectKey);
        if (isObjectId) {
          // Legacy: load by ObjectId
          const found = safeList.find((x) => rowId(x) === preselectKey);
          if (found) await view(preselectKey);
          else closeProject();
        } else {
          // New: load by slug
          const found = safeList.find((x) => x.slug === preselectKey);
          if (found) await view(rowId(found));
          else {
            // Try loading by slug from server directly
            try {
              const p = await apiAuthed(endpoints.bySlug(preselectKey), { token: accessToken });
              if (p) {
                setSel(p);
                initRatesFromProject(p);
                await loadValuations(p?._id || p?.id);
              } else {
                closeProject();
              }
            } catch {
              closeProject();
            }
          }
        }
      } else {
        // keep current open project if still valid
        if (selectedId) {
          const stillThere = safeList.some((x) => rowId(x) === selectedId);
          if (!stillThere) closeProject();
        }
      }
    } catch (e) {
      setErr(e.message || "Failed to load projects");
      closeProject();
      setRows([]);
    }
  }

  async function view(id) {
    if (!id || id === "undefined") {
      setErr("Invalid project id");
      return;
    }

    setErr("");
    setNotice("");
    setItemQuery("");
    setValuationErr("");

    try {
      const p = await apiAuthed(endpoints.one(id), { token: accessToken });
      setSel(p);

      // Use slug in URL if available, otherwise fall back to ID
      const urlKey = p?.slug || id;
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("project", urlKey);
        return next;
      });

      initRatesFromProject(p);
      const openedId = p?._id || p?.id || id;
      await loadValuations(openedId);
      // PM dashboard load is best-effort and runs in the background so the
      // BoQ tab doesn't have to wait on it.
      loadPmDashboard(openedId);
    } catch (e) {
      setErr(e.message || "Failed to open project");
      closeProject();
    }
  }

  async function deleteMany(
    ids,
    { confirmLabel = "Delete selected projects" } = {},
  ) {
    const uniq = Array.from(new Set((ids || []).filter(Boolean)));
    if (!uniq.length) return;

    const ok = window.confirm(
      `${confirmLabel}?\n\nCount: ${uniq.length}\n\nThis cannot be undone.`,
    );
    if (!ok) return;

    // Verify once up front (not per-item) so a bulk delete prompts for a single
    // code and every DELETE in the batch carries the same step-up token.
    let stepHeaders;
    try {
      stepHeaders = await acquireStepUp();
    } catch (e) {
      if (isStepUpCancel(e)) return;
      setErr(e?.message || "Verification failed");
      return;
    }

    setBulkBusy(true);
    setErr("");
    setNotice("");

    try {
      const results = await Promise.allSettled(
        uniq.map((id) =>
          apiAuthed(endpoints.del(id), {
            token: accessToken,
            method: "DELETE",
            headers: stepHeaders,
          }),
        ),
      );

      const deletedIds = [];
      const failedIds = [];

      results.forEach((r, i) => {
        if (r.status === "fulfilled") deletedIds.push(uniq[i]);
        else failedIds.push(uniq[i]);
      });

      for (const id of deletedIds) purgeLocal(tool, id);
      setRows((prev) =>
        Array.isArray(prev)
          ? prev.filter((r) => !deletedIds.includes(rowId(r)))
          : [],
      );
      // If current open project was deleted, go back to explorer
      if (selectedId && deletedIds.includes(selectedId)) {
        closeProject();
      }

      // Clear selections that are gone
      setSelectedMap((prev) => {
        const next = { ...(prev || {}) };
        for (const id of deletedIds) delete next[id];
        return next;
      });

      if (failedIds.length) {
        setErr(
          `Deleted ${deletedIds.length}. Failed ${failedIds.length}. Please retry.`,
        );
      } else {
        setNotice(`Deleted ${deletedIds.length} project(s).`);
      }
    } catch (e) {
      setErr(e?.message || "Failed to delete projects");
    } finally {
      setBulkBusy(false);
    }
  }

  async function delProject(id, name) {
    if (!id) return;

    const ok = window.confirm(
      `Delete this saved project?\n\n${name || "Untitled"}\n\nThis cannot be undone.`,
    );
    if (!ok) return;

    setErr("");
    setNotice("");

    try {
      await runGated((headers) =>
        apiAuthed(endpoints.del(id), {
          token: accessToken,
          method: "DELETE",
          headers,
        }),
      );

      purgeLocal(tool, id);

      setRows((prev) =>
        Array.isArray(prev) ? prev.filter((r) => rowId(r) !== id) : [],
      );

      if (selectedId === id) closeProject();

      setSelectedMap((prev) => {
        const next = { ...(prev || {}) };
        delete next[id];
        return next;
      });

      setNotice("Project deleted.");
    } catch (e) {
      if (isStepUpCancel(e)) return;
      setErr(e?.message || "Failed to delete project");
    }
  }

  function applyRateToGroupFromRow(groupId, rowIndex, rateValueRaw) {
    if (!sel || !groupId) return;
    const its = Array.isArray(sel?.items) ? sel.items : [];
    const gv = safeNum(rateValueRaw);
    if (gv === 0) return;

    setRates((prev) => {
      const next = { ...(prev || {}) };

      for (let j = 0; j < its.length; j++) {
        if (j === rowIndex) continue;
        if (groupIdForIndex(j) !== groupId) continue;

        const kj = itemKey(its[j], j);

        const existing = (() => {
          const raw = next[kj];
          if (String(raw ?? "").trim() === "") return safeNum(its[j]?.rate);
          return safeNum(raw);
        })();

        if (onlyFillEmpty && existing !== 0) continue;
        next[kj] = String(gv);
      }
      return next;
    });
  }

  function toggleGroupLink(groupId, currentRowIndex) {
    if (!groupId) return;
    if (groupCount(groupId) < 2) return;

    const its = Array.isArray(sel?.items) ? sel.items : [];
    const it = its[currentRowIndex];
    if (!it) return;

    const k0 = itemKey(it, currentRowIndex);
    const currentVal =
      String(rates?.[k0] ?? "").trim() === ""
        ? safeNum(it?.rate)
        : safeNum(rates?.[k0]);

    setLinkedGroups((prev) => {
      const next = { ...(prev || {}) };
      const nowOn = !next[groupId];
      next[groupId] = nowOn;

      if (nowOn && currentVal !== 0) {
        setTimeout(
          () => applyRateToGroupFromRow(groupId, currentRowIndex, currentVal),
          0,
        );
      }
      return next;
    });
  }

  function handleRateChange(rowIndex, value) {
    if (!sel) return;
    const its = Array.isArray(sel?.items) ? sel.items : [];
    const it = its[rowIndex];
    if (!it) return;
    const k0 = itemKey(it, rowIndex);
    const groupId = groupIdForIndex(rowIndex);
    setRates((prev) => {
      const next = { ...(prev || {}), [k0]: value };
      if (!groupId || !isGroupLinked(groupId)) return next;
      if (String(value ?? "").trim() === "") return next;
      for (let j = 0; j < its.length; j++) {
        if (j === rowIndex) continue;
        if (groupIdForIndex(j) !== groupId) continue;
        const kj = itemKey(its[j], j);
        const existing =
          String(next[kj] ?? "").trim() === ""
            ? safeNum(its[j]?.rate)
            : safeNum(next[kj]);
        if (onlyFillEmpty && existing !== 0) continue;
        next[kj] = value;
      }
      return next;
    });
  }
  function handleActualQtyChange(rowIndex, value) {
    if (!sel) return;
    const its = Array.isArray(sel?.items) ? sel.items : [];
    const it = its[rowIndex];
    if (!it) return;
    const key = itemKey(it, rowIndex);
    setActualQtyMap((prev) => ({ ...(prev || {}), [key]: value }));
  }
  function handleActualRateChange(rowIndex, value) {
    if (!sel) return;
    const its = Array.isArray(sel?.items) ? sel.items : [];
    const it = its[rowIndex];
    if (!it) return;
    const key = itemKey(it, rowIndex);
    setActualRateMap((prev) => ({ ...(prev || {}), [key]: value }));
  }
  function handleAddProvisionalSum() {
    setProvisionalSums((prev) => [
      ...(Array.isArray(prev) ? prev : []),
      { description: "", amount: 0 },
    ]);
  }
  function handleUpdateProvisionalSum(idx, patch) {
    setProvisionalSums((prev) => {
      const next = Array.isArray(prev) ? [...prev] : [];
      if (idx < 0 || idx >= next.length) return prev;
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }
  function handleRemoveProvisionalSum(idx) {
    setProvisionalSums((prev) => {
      const next = Array.isArray(prev) ? [...prev] : [];
      if (idx < 0 || idx >= next.length) return prev;
      const removed = next[idx];
      // Snapshot for undo BEFORE we mutate the array.
      pushBoqUndo({
        kind: "provisional",
        item: JSON.parse(JSON.stringify(removed)),
        index: idx,
        label: removed?.description || `PC sum #${idx + 1}`,
      });
      next.splice(idx, 1);
      return next;
    });
  }
  function handleAddVariation() {
    setVariations((prev) => [
      ...(Array.isArray(prev) ? prev : []),
      {
        description: "",
        qty: 0,
        unit: "",
        rate: 0,
        reference: "",
        issuedAt: "",
      },
    ]);
  }
  function handleUpdateVariation(idx, patch) {
    setVariations((prev) => {
      const next = Array.isArray(prev) ? [...prev] : [];
      if (idx < 0 || idx >= next.length) return prev;
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }
  function handleRemoveVariation(idx) {
    setVariations((prev) => {
      const next = Array.isArray(prev) ? [...prev] : [];
      if (idx < 0 || idx >= next.length) return prev;
      const removed = next[idx];
      pushBoqUndo({
        kind: "variation",
        item: JSON.parse(JSON.stringify(removed)),
        index: idx,
        label: removed?.description || `Variation #${idx + 1}`,
      });
      next.splice(idx, 1);
      return next;
    });
  }

  // ── Preliminary items ──
  function handleUpdatePreliminaryItem(idx, patch) {
    setPreliminaryItems((prev) => {
      const next = Array.isArray(prev) ? [...prev] : [];
      if (idx < 0 || idx >= next.length) return prev;
      const updated = { ...next[idx], ...patch };
      // If flipping to completed, stamp completedAt (user-editable on server).
      if (patch.completed === true && !updated.completedAt) {
        updated.completedAt = new Date().toISOString();
      }
      if (patch.completed === false) {
        updated.completedAt = null;
      }
      next[idx] = updated;
      return next;
    });
  }
  function handleAddPreliminaryItem() {
    setPreliminaryItems((prev) => [
      ...(Array.isArray(prev) ? prev : []),
      { name: "", allocation: 0, completed: false, completedAt: null, notes: "", actualAmount: 0 },
    ]);
  }
  function handleRemovePreliminaryItem(idx) {
    setPreliminaryItems((prev) => {
      const next = Array.isArray(prev) ? [...prev] : [];
      if (idx < 0 || idx >= next.length) return prev;
      const removed = next[idx];
      pushBoqUndo({
        kind: "preliminary",
        item: JSON.parse(JSON.stringify(removed)),
        index: idx,
        label: removed?.name || `Preliminary #${idx + 1}`,
      });
      next.splice(idx, 1);
      return next;
    });
  }
  function handleNormalizePreliminaryAllocations() {
    setPreliminaryItems((prev) => {
      const arr = Array.isArray(prev) ? prev : [];
      if (!arr.length) return prev;
      const even = Number((100 / arr.length).toFixed(2));
      // Leftover cents go to the first row so the total sums to 100.0 exactly.
      const diff = Number((100 - even * arr.length).toFixed(2));
      return arr.map((p, i) => ({
        ...p,
        allocation: i === 0 ? Number((even + diff).toFixed(2)) : even,
      }));
    });
  }
  function handleCategoryChange(rowIndex, category) {
    if (!sel) return;
    const its = Array.isArray(sel?.items) ? sel.items : [];
    const it = its[rowIndex];
    if (!it) return;
    const key = itemKey(it, rowIndex);
    setCategoryMap((prev) => ({
      ...(prev || {}),
      [key]: String(category || ""),
    }));
  }
  function handleTradeChange(rowIndex, trade) {
    if (!sel) return;
    const its = Array.isArray(sel?.items) ? sel.items : [];
    const it = its[rowIndex];
    if (!it) return;
    const key = itemKey(it, rowIndex);
    setTradeMap((prev) => ({
      ...(prev || {}),
      [key]: String(trade || ""),
    }));
  }
  function handleStatusToggle(rowIndex, checked) {
    if (!sel) return;
    const its = Array.isArray(sel?.items) ? sel.items : [];
    const it = its[rowIndex];
    if (!it) return;
    const key = itemKey(it, rowIndex);
    setStatusMap((prev) => ({ ...(prev || {}), [key]: Boolean(checked) }));
    // Toggling status also pulls / pushes percentComplete to the threshold
    // — checking → 100%, unchecking → 0% — so the two stay consistent.
    setPercentMap((prev) => ({
      ...(prev || {}),
      [key]: checked ? 100 : 0,
    }));
  }

  function handlePercentChange(rowIndex, value) {
    if (!sel) return;
    const its = Array.isArray(sel?.items) ? sel.items : [];
    const it = its[rowIndex];
    if (!it) return;
    const key = itemKey(it, rowIndex);
    const pct = Math.max(0, Math.min(100, Number(value) || 0));
    setPercentMap((prev) => ({ ...(prev || {}), [key]: pct }));
    // Mirror to the binary status: 100% = ratified, anything less = not yet.
    setStatusMap((prev) => ({ ...(prev || {}), [key]: pct >= 100 }));
  }

  function handleValuationSettingChange(field, value) {
    setValuationSettings((prev) => {
      const next = normalizeValuationSettings(prev);
      if (field === "showDailyLog") {
        next.showDailyLog = Boolean(value);
      } else if (field === "showValuationSettings") {
        next.showValuationSettings = Boolean(value);
      } else if (field === "showActualColumns") {
        next.showActualColumns = Boolean(value);
      } else if (field === "dashboardChartMode") {
        next.dashboardChartMode = normalizeChartMode(value, next.dashboardChartMode);
      } else if (field === "basis") {
        next.basis = value === "budget" ? "budget" : "boq";
      } else if (
        field === "retentionPct" ||
        field === "vatPct" ||
        field === "withholdingPct"
      ) {
        next[field] = clampPercentage(value, next[field]);
      } else if (field === "rateSyncEnabled") {
        next.rateSyncEnabled = Boolean(value);
      }
      return { ...next };
    });
  }

  // Compare percentComplete maps numerically — small JS rounding noise can
  // happen when the server echoes back floats, so we treat anything within
  // 0.01 % as equal.
  function percentMapsEqual(a, b) {
    const A = a || {};
    const B = b || {};
    const keys = new Set([...Object.keys(A), ...Object.keys(B)]);
    for (const k of keys) {
      if (Math.abs(safeNum(A[k]) - safeNum(B[k])) > 0.01) return false;
    }
    return true;
  }

  const isDirty =
    !ratesEqual(rates, baseRates) ||
    !optionalNumberMapsEqual(actualQtyMap, baseActualQtyMap) ||
    !optionalNumberMapsEqual(actualRateMap, baseActualRateMap) ||
    !statusMapsEqual(statusMap, baseStatusMap) ||
    !percentMapsEqual(percentMap, basePercentMap) ||
    !categoryMapsEqual(categoryMap, baseCategoryMap) ||
    !categoryMapsEqual(tradeMap, baseTradeMap) ||
    !provisionalSumsEqual(provisionalSums, baseProvisionalSums) ||
    !variationsEqual(variations, baseVariations) ||
    !preliminaryItemsEqual(preliminaryItems, basePreliminaryItems) ||
    !valuationSettingsEqual(valuationSettings, baseValuationSettings) ||
    orderDirty;

  async function saveRatesToCloud() {
    if (!sel || !selectedId) return;
    if (!isDirty) return;
    setSaving(true);
    setErr("");
    setNotice("");
    try {
      const its = Array.isArray(sel?.items) ? sel.items : [];
      const updatedItems = its.map((it, i) => {
        const k = itemKey(it, i);
        const raw = rates?.[k];
        const use =
          String(raw ?? "").trim() === "" ? safeNum(it?.rate) : safeNum(raw);
        const statusValue = Boolean(statusMap?.[k]);
        // percentComplete falls back to the stored value when no UI input
        // has touched it; statusValue = true forces 100%.
        const storedPct = Math.max(
          0,
          Math.min(100, safeNum(it?.percentComplete)),
        );
        const uiPct =
          percentMap?.[k] != null
            ? Math.max(0, Math.min(100, safeNum(percentMap[k])))
            : storedPct;
        const nextPercent = statusValue ? 100 : uiPct;
        const nextActualQty =
          String(actualQtyMap?.[k] ?? "").trim() === ""
            ? parseOptionalNumber(it?.actualQty)
            : parseOptionalNumber(actualQtyMap?.[k]);
        const nextActualRate =
          String(actualRateMap?.[k] ?? "").trim() === ""
            ? parseOptionalNumber(it?.actualRate)
            : parseOptionalNumber(actualRateMap?.[k]);
        const nextCategory =
          String(categoryMap?.[k] ?? "").trim() ||
          String(it?.category || "").trim();
        const nextTrade =
          String(tradeMap?.[k] ?? "").trim() ||
          String(it?.trade || "").trim();
        return {
          ...it,
          rate: use,
          actualQty: nextActualQty,
          actualRate: nextActualRate,
          [statusField]: statusValue,
          percentComplete: nextPercent,
          category: nextCategory,
          trade: nextTrade,
        };
      });
      const payload = {
        baseVersion: sel?.version,
        items: updatedItems,
        valuationSettings: normalizeValuationSettings(valuationSettings),
        provisionalSums: provisionalSums
          .map((s) => ({
            description: String(s?.description || "").trim(),
            amount: Number(s?.amount) || 0,
          }))
          .filter((s) => s.description || s.amount > 0),
        variations: variations
          .map((v) => ({
            description: String(v?.description || "").trim(),
            qty: Number(v?.qty) || 0,
            unit: String(v?.unit || "").trim(),
            rate: Number(v?.rate) || 0,
            reference: String(v?.reference || "").trim(),
            issuedAt: v?.issuedAt || null,
          }))
          .filter((v) => v.description || v.qty > 0 || v.rate > 0),
        preliminaryPercent: Number(contract?.preliminaryPercent) || 0,
        // Contingency + tax (VAT) percentages — only sent when not
        // locked. Server clamps to 0-100. Locked contracts ignore
        // these (the at-lock values stay frozen).
        contingencyPercent: Number(contract?.contingencyPercent) || 0,
        taxPercent: Number(contract?.taxPercent) || 0,
        preliminaryItems: preliminaryItems.map((p) => ({
          name: String(p?.name || "").trim(),
          allocation: Number(p?.allocation) || 0,
          completed: Boolean(p?.completed),
          completedAt: p?.completedAt || null,
          notes: String(p?.notes || "").trim(),
          // actualAmount — QS-recorded spend (added in earlier session)
          actualAmount: Number(p?.actualAmount) || 0,
        })),
      };
      const updated = await apiAuthed(endpoints.one(selectedId), {
        token: accessToken,
        method: "PUT",
        body: payload,
      });
      setSel(updated);
      initRatesFromProject(updated);
      setOrderDirty(false); // order is now persisted
      setRows((prev) =>
        Array.isArray(prev)
          ? prev.map((row) =>
              rowId(row) === selectedId
                ? {
                    ...row,
                    id: updated?._id || updated?.id || selectedId,
                    name: updated?.name || row?.name,
                    updatedAt: updated?.updatedAt || row?.updatedAt,
                    version: updated?.version ?? row?.version,
                    ...summarizeProjectItems(updated?.items, statusField),
                  }
                : row,
            )
          : prev,
      );
      await loadValuations(updated?._id || updated?.id || selectedId);
      // PM tasks linked to BoQ items inherit cost from qty × rate — refresh
      // the dashboard so the tiles reflect the new totals.
      loadPmDashboard(updated?._id || updated?.id || selectedId);
      setNotice("Saved. Rates, actuals, valuation settings, and progress were updated.");
    } catch (e) {
      const msg = e?.message || "Failed to save";
      if (String(msg).toLowerCase().includes("conflict")) {
        setErr(
          "This project was updated elsewhere. Please refresh and try again.",
        );
      } else {
        setErr(msg);
      }
    } finally {
      setSaving(false);
    }
  }

  /* ---------- Delete / reorder BOQ rows ---------- */
  function deleteItem(rowIndex) {
    if (!sel) return;
    const its = Array.isArray(sel?.items) ? [...sel.items] : [];
    if (rowIndex < 0 || rowIndex >= its.length) return;
    const removed = its[rowIndex];
    // Snapshot for undo BEFORE the splice. We also stash the rate
    // cache value for this row so undo restores it intact (otherwise
    // the row reappears with a blank rate field).
    const rateKey = itemKey(removed, rowIndex);
    const cachedRate = rates?.[rateKey];
    pushBoqUndo({
      kind: "measured",
      item: JSON.parse(JSON.stringify(removed)),
      index: rowIndex,
      label: removed?.description || removed?.materialName || `Row ${rowIndex + 1}`,
      cachedRate,
    });
    its.splice(rowIndex, 1);
    setSel((prev) => (prev ? { ...prev, items: its } : prev));
    // clear rate/status caches for the removed index
    setRates((prev) => {
      const next = {};
      its.forEach((it, i) => { next[itemKey(it, i)] = prev?.[itemKey(it, i)] ?? ""; });
      return next;
    });
  }

  // Restore a deleted BoQ entry from the undo stack. Splices the item
  // back into its array at the original index (or at the end if the
  // array has shrunk below that). Pops the entry off the stack so
  // repeated Undo clicks walk back through history.
  const handleBoqUndo = React.useCallback((entryId) => {
    setBoqUndoStack((prev) => {
      const entry = prev.find((e) => e.id === entryId);
      if (!entry) return prev;
      const { kind, item, index, cachedRate } = entry;
      if (kind === "measured") {
        setSel((cur) => {
          if (!cur) return cur;
          const its = Array.isArray(cur.items) ? [...cur.items] : [];
          const at = Math.min(Math.max(0, index), its.length);
          its.splice(at, 0, item);
          return { ...cur, items: its };
        });
        if (cachedRate != null) {
          // Re-seed the rate cache at the new index's key so the row
          // shows its original rate immediately, not a blank cell.
          setRates((prevRates) => ({ ...(prevRates || {}), [itemKey(item, index)]: cachedRate }));
        }
      } else if (kind === "provisional") {
        setProvisionalSums((cur) => {
          const next = Array.isArray(cur) ? [...cur] : [];
          const at = Math.min(Math.max(0, index), next.length);
          next.splice(at, 0, item);
          return next;
        });
      } else if (kind === "variation") {
        setVariations((cur) => {
          const next = Array.isArray(cur) ? [...cur] : [];
          const at = Math.min(Math.max(0, index), next.length);
          next.splice(at, 0, item);
          return next;
        });
      } else if (kind === "preliminary") {
        setPreliminaryItems((cur) => {
          const next = Array.isArray(cur) ? [...cur] : [];
          const at = Math.min(Math.max(0, index), next.length);
          next.splice(at, 0, item);
          return next;
        });
      }
      return prev.filter((e) => e.id !== entryId);
    });
  }, [setSel, setRates, setProvisionalSums, setVariations, setPreliminaryItems]);

  const handleBoqUndoClear = React.useCallback(() => {
    setBoqUndoStack([]);
  }, []);

  function moveItem(fromIndex, toIndex) {
    if (!sel) return;
    const its = Array.isArray(sel?.items) ? [...sel.items] : [];
    if (fromIndex < 0 || fromIndex >= its.length) return;
    if (toIndex < 0 || toIndex >= its.length) return;
    if (fromIndex === toIndex) return;
    const [moved] = its.splice(fromIndex, 1);
    its.splice(toIndex, 0, moved);
    setSel((prev) => (prev ? { ...prev, items: its } : prev));
    setOrderDirty(true); // so the Save button activates and persists the order
  }

  React.useEffect(() => {
    if (!selectedId) return;
    writeCache(tool, selectedId, {
      version: sel?.version ?? 0,
      rates: rates || {},
      actualQty: actualQtyMap || {},
      actualRate: actualRateMap || {},
      savedAt: Date.now(),
    });
  }, [tool, selectedId, sel?.version, rates, actualQtyMap, actualRateMap]);
  React.useEffect(() => {
    if (!selectedId) return;
    writeLinkCache(tool, selectedId, {
      linkedGroups: linkedGroups || {},
      matPicks: matPicks || {},
      savedAt: Date.now(),
    });
  }, [tool, selectedId, linkedGroups, matPicks]);

  /** ---------------- Entitlements check (RateGen) ---------------- */
  React.useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;

    (async () => {
      try {
        const resp = await apiAuthed("/api/entitlements", {
          token: accessToken,
        });
        const ents = Array.isArray(resp?.entitlements) ? resp.entitlements : [];
        const rg = ents.find(
          (e) => String(e.productKey || "").toLowerCase() === "rategen",
        );
        const ok = entitlementActive(rg);
        if (!cancelled) setCanRateGen(ok);
      } catch {
        if (!cancelled) setCanRateGen(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  React.useEffect(() => {
    if (!showMaterials) return;

    if (!canRateGen) {
      setAutoFillMaterialsRates(false);
      return;
    }

    const pref = readAutoFillPref();
    if (pref == null) {
      setAutoFillMaterialsRates(true);
      writeAutoFillPref(true);
    } else {
      setAutoFillMaterialsRates(!!pref);
    }
  }, [showMaterials, canRateGen]);

  /** ---------------- Auto-fill material rates from RateGen ---------------- */
  function toCandidate(row, source) {
    const description = String(row?.description || "").trim();
    const unit = String(row?.unit || "").trim();
    const price = safeNum(row?.price);
    const category = String(row?.category || "").trim();

    return { description, unit, price, category, source }; // source: "My Library" | "Master"
  }

  function pushCand(candidatesByKey, nameKey, cand) {
    if (!nameKey) return;
    if (!candidatesByKey[nameKey]) candidatesByKey[nameKey] = [];

    const pk = pickKeyFromCandidate(cand);
    const arr = candidatesByKey[nameKey];
    const idx = arr.findIndex((x) => pickKeyFromCandidate(x) === pk);

    if (idx >= 0) {
      const cur = arr[idx];
      const curIsUser = String(cur?.source || "")
        .toLowerCase()
        .includes("my");
      const newIsUser = String(cand?.source || "")
        .toLowerCase()
        .includes("my");

      if (newIsUser && !curIsUser) arr[idx] = cand;
      else if (safeNum(cand.price) > safeNum(cur.price)) arr[idx] = cand;
    } else {
      arr.push(cand);
    }
  }

  function bestCandidateForUnit(candidates, reqUnitRaw) {
    const reqUnit = normalizeUnit(reqUnitRaw);
    if (!Array.isArray(candidates) || candidates.length === 0) return null;

    const sorted = [...candidates].sort((a, b) => {
      const au = String(a?.source || "")
        .toLowerCase()
        .includes("my")
        ? 0
        : 1;
      const bu = String(b?.source || "")
        .toLowerCase()
        .includes("my")
        ? 0
        : 1;
      if (au !== bu) return au - bu;
      return safeNum(b?.price) - safeNum(a?.price);
    });

    if (reqUnit) {
      const hit = sorted.find((c) => normalizeUnit(c?.unit) === reqUnit);
      if (hit) return hit;
    }

    return sorted[0];
  }

  async function fetchLegacyMaterialCatalog() {
    const [m, lib] = await Promise.all([
      apiAuthed("/rategen/master", { token: accessToken }),
      apiAuthed("/rategen/library", { token: accessToken }),
    ]);

    // Material + Labour component prices (NOT composite "actual" rates).
    // Both user-library and master rows share the same {description, unit,
    // price} shape, so a single toCandidate() handles materials and labour.
    const masterMaterials = Array.isArray(m?.materials) ? m.materials : [];
    const masterLabour = Array.isArray(m?.labour) ? m.labour : [];
    const userMaterials = Array.isArray(lib?.materials) ? lib.materials : [];
    const userLabour = Array.isArray(lib?.labour) ? lib.labour : [];

    const candidatesByKey = {};

    // User library takes precedence (pushCand prefers "my" source).
    for (const r of userMaterials) {
      const cand = toCandidate(r, "My Library");
      const nameKey = normalizeMaterialName(cand.description);
      if (!cand.description || cand.price <= 0) continue;
      pushCand(candidatesByKey, nameKey, cand);
    }

    for (const r of userLabour) {
      const cand = toCandidate(r, "My Library");
      const nameKey = normalizeMaterialName(cand.description);
      if (!cand.description || cand.price <= 0) continue;
      pushCand(candidatesByKey, nameKey, cand);
    }

    for (const r of masterMaterials) {
      const cand = toCandidate(r, "Master");
      const nameKey = normalizeMaterialName(cand.description);
      if (!cand.description || cand.price <= 0) continue;
      pushCand(candidatesByKey, nameKey, cand);
    }

    for (const r of masterLabour) {
      const cand = toCandidate(r, "Master");
      const nameKey = normalizeMaterialName(cand.description);
      if (!cand.description || cand.price <= 0) continue;
      pushCand(candidatesByKey, nameKey, cand);
    }

    return { candidatesByKey };
  }

  async function autoFillMaterialRates(project) {
    if (!showMaterials) return;
    if (!canRateGen) return;
    if (!project?._id) return;

    const its = Array.isArray(project?.items) ? project.items : [];

    const uniq = new Map();
    for (const it of its) {
      const name = String(it?.materialName || "").trim();
      if (!name) continue;
      const unit = String(it?.unit || "").trim();
      const key = `${normalizeMaterialName(name)}|${normalizeUnit(unit)}`;
      if (!uniq.has(key)) uniq.set(key, { name, unit });
    }

    const reqItems = Array.from(uniq.values());
    if (!reqItems.length) return;

    setAutoFillBusy(true);
    setErr("");
    setNotice("");

    try {
      const { candidatesByKey } = await fetchLegacyMaterialCatalog();

      setMatResolved({
        pricesByKey: {},
        candidatesByKey: candidatesByKey || {},
      });

      let matched = 0;
      let filled = 0;
      let unitConflicts = 0;

      setRates((prev) => {
        const next = { ...(prev || {}) };

        for (let i = 0; i < its.length; i++) {
          const it = its[i] || {};
          const k = itemKey(it, i);

          const matKey = normalizeMaterialName(it.materialName);
          const candidates = Array.isArray(candidatesByKey?.[matKey])
            ? candidatesByKey[matKey]
            : [];

          if (!candidates.length) continue;

          const pickedKey = matPicks?.[matKey] || null;
          const picked = pickedKey
            ? candidates.find((c) => pickKeyFromCandidate(c) === pickedKey)
            : null;

          const best = picked || bestCandidateForUnit(candidates, it?.unit);
          if (!best) continue;

          matched += 1;

          const price = safeNum(best.price);
          if (price <= 0) continue;

          const reqUnit = normalizeUnit(it.unit);
          const hitUnit = normalizeUnit(best.unit);

          if (reqUnit && hitUnit && reqUnit !== hitUnit) {
            unitConflicts += 1;
            continue;
          }

          const existing =
            String(next[k] ?? "").trim() === ""
              ? safeNum(it?.rate)
              : safeNum(next[k]);

          if (onlyFillEmpty && existing !== 0) continue;

          next[k] = String(price);
          filled += 1;
        }

        return next;
      });

      setNotice(
        filled > 0
          ? `Auto-filled ${filled} material rate(s). (${matched} match(es) found${
              unitConflicts ? `, ${unitConflicts} unit conflict(s)` : ""
            })`
          : `No rates were auto-filled. (${matched} match(es) found${
              unitConflicts ? `, ${unitConflicts} unit conflict(s)` : ""
            })`,
      );
    } catch (e) {
      setErr(e?.message || "Failed to auto-fill material rates");
    } finally {
      setAutoFillBusy(false);
    }
  }

  React.useEffect(() => {
    if (!showMaterials) return;
    if (!autoFillMaterialsRates) return;
    if (!canRateGen) return;
    if (!sel || !selectedId) return;

    if (autoFillAppliedRef.current[selectedId]) return;
    autoFillAppliedRef.current[selectedId] = true;

    autoFillMaterialRates(sel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMaterials, autoFillMaterialsRates, canRateGen, selectedId]);

  function toggleAutoFill(v) {
    setAutoFillMaterialsRates(v);
    writeAutoFillPref(v);

    if (selectedId) delete autoFillAppliedRef.current[selectedId];
    if (v && sel) autoFillMaterialRates(sel);
  }

  function getCandidatesForItem(item) {
    if (!showMaterials) return [];
    const matKey = normalizeMaterialName(item?.materialName);
    return Array.isArray(matResolved?.candidatesByKey?.[matKey])
      ? matResolved.candidatesByKey[matKey]
      : [];
  }

  function handlePickCandidate(rowIndex, candidate) {
    if (!candidate) return;
    const it = items[rowIndex];
    if (!it) return;

    const mk = normalizeMaterialName(it.materialName);
    const pk = pickKeyFromCandidate(candidate);

    setMatPicks((prev) => ({
      ...(prev || {}),
      [mk]: pk,
    }));
    handleRateChange(rowIndex, String(safeNum(candidate.price) || 0));
    setOpenPickKey(null);
  }

  /* ---------- BOQ Rate Sync from RateGen (non-materials) ---------- */

  function normalizeBoqDescription(desc) {
    return String(desc || "")
      .toLowerCase()
      .replace(/\[.*?\]/g, " ")
      .replace(/\(.*?\)/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  async function syncBoqRates(project) {
    if (showMaterials) return;
    if (!canRateGen) return;
    if (!project?._id) return;

    const its = Array.isArray(project?.items) ? project.items : [];

    const uniq = new Map();
    for (const it of its) {
      const desc = String(it?.description || "").trim();
      if (!desc) continue;
      const unit = String(it?.unit || "").trim();
      const key = `${normalizeBoqDescription(desc)}|${normalizeUnit(unit)}`;
      if (!uniq.has(key)) uniq.set(key, { description: desc, unit });
    }

    const reqItems = Array.from(uniq.values());
    if (!reqItems.length) return;

    setAutoFillBoqBusy(true);
    setErr("");
    setNotice("");

    try {
      const result = await apiAuthed("/rategen-v2/library/rate-items/resolve", {
        token: accessToken,
        method: "POST",
        body: { items: reqItems, limitCandidates: 10 },
      });

      setBoqRateResolved(result);

      let matched = 0;
      let filled = 0;

      setRates((prev) => {
        const next = { ...(prev || {}) };

        for (let i = 0; i < its.length; i++) {
          const it = its[i] || {};
          const k = itemKey(it, i);
          const descKey = normalizeBoqDescription(it.description);
          const candidates = Array.isArray(result?.candidatesByKey?.[descKey])
            ? result.candidatesByKey[descKey]
            : [];

          if (!candidates.length) continue;

          const best = candidates[0];
          if (!best) continue;

          matched += 1;

          const totalCost = safeNum(best.totalCost);
          if (totalCost <= 0) continue;

          const existing =
            String(next[k] ?? "").trim() === ""
              ? safeNum(it?.rate)
              : safeNum(next[k]);

          if (onlyFillEmpty && existing !== 0) continue;

          next[k] = String(totalCost);
          filled += 1;
        }

        return next;
      });

      setNotice(
        filled > 0
          ? `Synced ${filled} rate(s) from RateGen. (${matched} match(es) found)`
          : `No rates filled. (${matched} match(es) found)`,
      );
    } catch (e) {
      setErr(e?.message || "Failed to sync rates from RateGen");
    } finally {
      setAutoFillBoqBusy(false);
    }
  }

  // Auto-sync rates from RateGen when toggle is on or rateSyncEnabled is saved
  const shouldAutoSyncBoq = autoFillBoqRates || Boolean(valuationSettings?.rateSyncEnabled);
  React.useEffect(() => {
    if (showMaterials) return;
    if (!shouldAutoSyncBoq) return;
    if (!canRateGen) return;
    if (!sel || !selectedId) return;

    if (autoFillBoqAppliedRef.current[selectedId]) return;
    autoFillBoqAppliedRef.current[selectedId] = true;

    syncBoqRates(sel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMaterials, shouldAutoSyncBoq, canRateGen, selectedId]);

  // Detect zone changes and re-sync rates
  React.useEffect(() => {
    const currentZone = authUser?.zone;
    if (!currentZone) return;
    if (prevZoneRef.current === currentZone) return;

    prevZoneRef.current = currentZone;

    // Zone changed: invalidate pool + sync caches
    setRateGenPool([]);
    setRateGenPoolLoaded(false);
    autoFillBoqAppliedRef.current = {};

    // Re-sync for the currently open project
    if (shouldAutoSyncBoq && sel && selectedId) {
      syncBoqRates(sel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.zone]);

  function toggleAutoFillBoq(v) {
    setAutoFillBoqRates(v);
    if (selectedId) delete autoFillBoqAppliedRef.current[selectedId];
    if (v && sel) syncBoqRates(sel);
  }

  function getBoqCandidatesForItem(item) {
    if (showMaterials) return [];
    const descKey = normalizeBoqDescription(item?.description);
    return Array.isArray(boqRateResolved?.candidatesByKey?.[descKey])
      ? boqRateResolved.candidatesByKey[descKey]
      : [];
  }

  function handlePickBoqCandidate(rowIndex, candidate) {
    if (!candidate) return;
    handleRateChange(rowIndex, String(safeNum(candidate.totalCost) || 0));
    setOpenBoqPickKey(null);
  }

  // ── Pre-loaded RateGen user rates for client-side search ──
  const [rateGenPool, setRateGenPool] = React.useState([]);
  const [rateGenPoolLoading, setRateGenPoolLoading] = React.useState(false);
  const [rateGenPoolLoaded, setRateGenPoolLoaded] = React.useState(false);

  const loadRateGenPool = React.useCallback(async () => {
    if (!canRateGen || !accessToken) return;
    setRateGenPoolLoading(true);
    try {
      // Fetch the user's library which contains rateOverrides[] and customRates[]
      // This matches what the RateGen page shows under "My Rate Overrides" and "My Custom Rates"
      const lib = await apiAuthed("/rategen/library", { token: accessToken });

      const rateOverrides = Array.isArray(lib?.rateOverrides) ? lib.rateOverrides : [];
      const customRates = Array.isArray(lib?.customRates) ? lib.customRates : [];

      // Normalize both sources into a unified pool for searching
      const pool = [];

      for (const r of rateOverrides) {
        const desc = String(r?.description || "").trim();
        const total = Number(r?.totalCost || 0);
        if (!desc || !Number.isFinite(total) || total <= 0) continue;
        pool.push({
          description: desc,
          unit: String(r?.unit || ""),
          totalCost: total,
          netCost: Number(r?.netCost || 0),
          sectionLabel: String(r?.sectionLabel || r?.sectionKey || ""),
          source: "user-override",
        });
      }

      for (const r of customRates) {
        const desc = String(r?.description || r?.title || "").trim();
        const total = Number(r?.totalCost || 0);
        if (!desc || !Number.isFinite(total) || total <= 0) continue;
        pool.push({
          description: desc,
          unit: String(r?.unit || ""),
          totalCost: total,
          netCost: Number(r?.netCost || 0),
          sectionLabel: String(r?.sectionLabel || r?.sectionKey || ""),
          source: "user-custom",
        });
      }

      setRateGenPool(pool);
      setRateGenPoolLoaded(true);
    } catch {
      setRateGenPool([]);
    } finally {
      setRateGenPoolLoading(false);
    }
  }, [canRateGen, accessToken]);

  // Auto-load pool when RateGen is available
  React.useEffect(() => {
    if (canRateGen && !rateGenPoolLoaded && !rateGenPoolLoading) {
      loadRateGenPool();
    }
  }, [canRateGen, rateGenPoolLoaded, rateGenPoolLoading, loadRateGenPool]);

  /**
   * Client-side fuzzy search for RateGen rates by name.
   * Searches the pre-loaded pool — instant, no API call.
   */
  async function searchRateGen(query) {
    if (!query || query.length < 2) return [];
    const q = query.trim().toLowerCase();
    const qWords = q.split(/\s+/).filter(Boolean);

    const matches = rateGenPool
      .map((r) => {
        const descLower = r.description.toLowerCase();
        const sectionLower = r.sectionLabel.toLowerCase();
        let score = 0;
        for (const w of qWords) {
          if (descLower.includes(w)) score += 2;
          else if (sectionLower.includes(w)) score += 1;
        }
        if (score === 0) return null;
        return { ...r, score };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || a.description.localeCompare(b.description))
      .slice(0, 10);

    return matches;
  }

  // ── Material + Labour price pool (materials view) ──
  // The composite `rateGenPool` above is built from full build-up rates
  // (rateOverrides + customRates) — wrong source for the Materials module,
  // where each line is a single material or labour component. This pool is
  // built from the RateGen Material + Labour price tables (master + the
  // user's own overrides) so the materials rate cell searches component
  // prices, not headline construction rates.
  const [materialRatePool, setMaterialRatePool] = React.useState([]);
  const [materialRatePoolLoading, setMaterialRatePoolLoading] = React.useState(false);
  const [materialRatePoolLoaded, setMaterialRatePoolLoaded] = React.useState(false);

  const loadMaterialRatePool = React.useCallback(async () => {
    if (!canRateGen || !accessToken) return;
    setMaterialRatePoolLoading(true);
    try {
      const [m, lib] = await Promise.all([
        apiAuthed("/rategen/master", { token: accessToken }),
        apiAuthed("/rategen/library", { token: accessToken }),
      ]);

      // Dedupe by name|unit|kind, preferring the user's own price over master.
      const byKey = new Map();
      const add = (rows, kind, source, userOwned) => {
        for (const r of Array.isArray(rows) ? rows : []) {
          const description = String(r?.description || r?.name || "").trim();
          const unit = String(r?.unit || "").trim();
          const price = Number(r?.price ?? r?.defaultUnitPrice ?? 0);
          if (!description || !Number.isFinite(price) || price <= 0) continue;
          const key = `${description.toLowerCase()}|${unit.toLowerCase()}|${kind}`;
          const existing = byKey.get(key);
          if (existing && !(userOwned && !existing.userOwned)) continue;
          byKey.set(key, {
            description,
            unit,
            totalCost: price,
            netCost: price,
            sectionLabel: kind, // "Material" | "Labour"
            source,
            kind,
            userOwned,
          });
        }
      };

      // User overrides first (preferred), then master fills the gaps.
      add(lib?.materials, "Material", "user-material", true);
      add(lib?.labour, "Labour", "user-labour", true);
      add(m?.materials, "Material", "master-material", false);
      add(m?.labour, "Labour", "master-labour", false);

      setMaterialRatePool(Array.from(byKey.values()));
      setMaterialRatePoolLoaded(true);
    } catch {
      setMaterialRatePool([]);
    } finally {
      setMaterialRatePoolLoading(false);
    }
  }, [canRateGen, accessToken]);

  // Auto-load the material/labour pool when the materials view is active OR a
  // project is open (the Budget tab prices its rows from the same pool).
  React.useEffect(() => {
    if (!showMaterials && !selectedId) return;
    if (!canRateGen) return;
    if (materialRatePoolLoaded || materialRatePoolLoading) return;
    loadMaterialRatePool();
  }, [
    showMaterials,
    selectedId,
    canRateGen,
    materialRatePoolLoaded,
    materialRatePoolLoading,
    loadMaterialRatePool,
  ]);

  // Client-side fuzzy search over the Material + Labour pool. Same scoring
  // as searchRateGen, but returns component prices for the materials view.
  async function searchMaterialRates(query) {
    if (!query || query.length < 2) return [];
    const q = query.trim().toLowerCase();
    const qWords = q.split(/\s+/).filter(Boolean);

    return materialRatePool
      .map((r) => {
        const descLower = r.description.toLowerCase();
        const kindLower = String(r.sectionLabel || "").toLowerCase();
        let score = 0;
        for (const w of qWords) {
          if (descLower.includes(w)) score += 2;
          else if (kindLower.includes(w)) score += 1;
        }
        if (score === 0) return null;
        return { ...r, score };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || a.description.localeCompare(b.description))
      .slice(0, 10);
  }

  // ── Contract lock / unlock ──
  async function handleLockContract({ preliminaryPercent, approvedAt, notes, lockPin } = {}) {
    if (!selectedId || !accessToken) return null;
    if (contract.locked) return contract;
    // With email step-up enabled, the OTP is the only gate — no PIN. Otherwise
    // a 4-digit PIN is required; bail early so the UI re-opens the PIN prompt
    // instead of toasting.
    if (!stepUpEnabled && !/^\d{4}$/.test(String(lockPin || ""))) {
      return { error: "LOCK_PIN_REQUIRED", message: "Enter a 4-digit PIN to lock." };
    }
    setContractBusy(true);
    try {
      const result = await runGated((headers) =>
        apiAuthed(endpoints.lock(selectedId), {
          token: accessToken,
          method: "POST",
          headers,
          body: {
            preliminaryPercent: Number(preliminaryPercent ?? contract.preliminaryPercent),
            // Pass the contingency + tax % so they get frozen at lock
            // time alongside the other rates. The server uses them in
            // the contractSum cascade.
            contingencyPercent: Number(contract.contingencyPercent),
            taxPercent: Number(contract.taxPercent),
            approvedAt: approvedAt || new Date().toISOString(),
            notes: notes || "",
            // Only send a PIN when one was actually entered (step-up flow sends
            // none — the server accepts that because the OTP was verified).
            ...(/^\d{4}$/.test(String(lockPin || ""))
              ? { lockPin: String(lockPin).trim() }
              : {}),
          },
        }),
      );
      if (result?.contract) {
        const c = result.contract;
        setContract({
          locked: Boolean(c.locked),
          lockedAt: c.lockedAt || null,
          approvedAt: c.approvedAt || null,
          preliminaryPercent:
            Number.isFinite(Number(c.preliminaryPercent)) ? Number(c.preliminaryPercent) : 7.5,
          contractSum: Number(c.contractSum) || 0,
          measuredAtLock: Number(c.measuredAtLock) || 0,
          provisionalAtLock: Number(c.provisionalAtLock) || 0,
          preliminaryAtLock: Number(c.preliminaryAtLock) || 0,
        });
        // Refresh sel version so subsequent PUTs don't 409.
        setSel((prev) =>
          prev ? { ...prev, contract: c, version: result.version ?? prev.version } : prev,
        );
        setNotice("Contract locked. New items now flow to Variations; re-measured qty goes to Actual qty.");
      }
      return result;
    } catch (e) {
      if (isStepUpCancel(e)) {
        return { error: "STEP_UP_CANCELLED", message: "Email verification cancelled." };
      }
      const code = e?.data?.code || null;
      if (code === "LOCK_PIN_REQUIRED") {
        return { error: code, message: e?.message || "Enter a 4-digit PIN to lock." };
      }
      setErr(e?.message || "Failed to lock contract");
      return null;
    } finally {
      setContractBusy(false);
    }
  }

  async function handleUnlockContract({ lockPin } = {}) {
    if (!selectedId || !accessToken) return null;
    if (!contract.locked) return contract;
    // For contracts that have a PIN set (locked under this version
    // onwards), the caller must supply it. The ContractPanel triggers a
    // PIN modal before calling this; legacy unlock-without-PIN works
    // through the same code path because lockPin defaults to undefined.
    // With email step-up enabled, the OTP is the only gate — skip PIN entry and
    // the legacy confirm; the step-up modal (via runGated below) is the prompt.
    if (!stepUpEnabled) {
      const hasPin = Boolean(contract?.hasLockPin || sel?.contract?.hasLockPin);
      if (hasPin) {
        if (!/^\d{4}$/.test(String(lockPin || ""))) {
          return { error: "LOCK_PIN_REQUIRED", message: "Enter the 4-digit PIN to unlock." };
        }
      } else {
        // Fallback for legacy unprotected locks — keep the confirmation prompt.
        if (!window.confirm(
          "Unlock this contract? Once unlocked, the team can edit item qty and descriptions freely — variations will no longer be auto-tracked until you lock again.",
        )) return null;
      }
    }
    setContractBusy(true);
    try {
      const result = await runGated((headers) =>
        apiAuthed(endpoints.unlock(selectedId), {
          token: accessToken,
          method: "POST",
          headers,
          body: lockPin ? { lockPin: String(lockPin).trim() } : {},
        }),
      );
      if (result?.contract) {
        setContract((prev) => ({
          ...prev,
          locked: false,
          lockedAt: null,
        }));
        setSel((prev) =>
          prev ? { ...prev, contract: result.contract, version: result.version ?? prev.version } : prev,
        );
        setNotice("Contract unlocked. Structural edits are now enabled.");
      }
      return result;
    } catch (e) {
      if (isStepUpCancel(e)) {
        return { error: "STEP_UP_CANCELLED", message: "Email verification cancelled." };
      }
      // Surface the PIN-specific code so the modal can show "Wrong PIN"
      // inline and stay open; other errors fall through to the toast.
      const code = e?.data?.code || null;
      if (code === "LOCK_PIN_INVALID" || code === "LOCK_PIN_REQUIRED") {
        return { error: code, message: e?.message || "Wrong PIN." };
      }
      setErr(e?.message || "Failed to unlock contract");
      return null;
    } finally {
      setContractBusy(false);
    }
  }

  function handlePreliminaryPercentChange(value) {
    const n = Math.max(0, Math.min(100, Number(value) || 0));
    setContract((prev) => ({ ...(prev || {}), preliminaryPercent: n }));
  }
  function handleContingencyPercentChange(value) {
    const n = Math.max(0, Math.min(100, Number(value) || 0));
    setContract((prev) => ({ ...(prev || {}), contingencyPercent: n }));
  }
  function handleTaxPercentChange(value) {
    const n = Math.max(0, Math.min(100, Number(value) || 0));
    setContract((prev) => ({ ...(prev || {}), taxPercent: n }));
  }

  // ── Interim certificates ──
  async function handleIssueCertificate(overrides = {}) {
    if (!selectedId || !accessToken) return null;
    setCertBusy(true);
    try {
      const result = await apiAuthed(endpoints.certificates(selectedId), {
        token: accessToken,
        method: "POST",
        body: overrides || {},
      });
      if (result?.certificate) {
        setCertificates((prev) => [...(prev || []), result.certificate]);
        setSel((prev) =>
          prev
            ? {
                ...prev,
                certificates: [...(prev.certificates || []), result.certificate],
                version: result.version ?? prev.version,
              }
            : prev,
        );
        setNotice(
          `Certificate #${String(result.certificate.number).padStart(2, "0")} issued.`,
        );
      }
      return result;
    } catch (e) {
      setErr(e?.message || "Failed to issue certificate");
      return null;
    } finally {
      setCertBusy(false);
    }
  }

  async function handleUpdateCertificate(number, patch) {
    if (!selectedId || !accessToken) return null;
    try {
      const result = await apiAuthed(
        endpoints.certificate(selectedId, number),
        {
          token: accessToken,
          method: "PUT",
          body: patch,
        },
      );
      if (result?.certificate) {
        setCertificates((prev) =>
          (prev || []).map((c) =>
            Number(c.number) === Number(number) ? result.certificate : c,
          ),
        );
      }
      return result;
    } catch (e) {
      setErr(e?.message || "Failed to update certificate");
      return null;
    }
  }

  async function handleDeleteCertificate(number) {
    if (!selectedId || !accessToken) return;
    if (!window.confirm(
      `Delete certificate #${String(number).padStart(2, "0")}? Only the latest cert can be deleted.`,
    )) return;
    try {
      await apiAuthed(endpoints.certificate(selectedId, number), {
        token: accessToken,
        method: "DELETE",
      });
      setCertificates((prev) =>
        (prev || []).filter((c) => Number(c.number) !== Number(number)),
      );
      setNotice(`Certificate #${String(number).padStart(2, "0")} deleted.`);
    } catch (e) {
      setErr(e?.message || "Failed to delete certificate");
    }
  }

  async function handleDownloadCertificate(number) {
    if (!selectedId || !accessToken) return;
    const base = API_BASE || window.location.origin;
    const absUrl = new URL(
      endpoints.certificateExport(selectedId, number),
      base,
    ).toString();
    try {
      const res = await fetch(absUrl, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${sanitizeFilename(sel?.name || "Project")} - IPC ${String(number).padStart(2, "0")}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setErr(e?.message || "Failed to download certificate");
    }
  }

  // ── Final account ──
  async function handleFinalizeAccount(notes) {
    if (!selectedId || !accessToken) return null;
    if (!window.confirm(
      "Finalize the account? This freezes all items, variations and certificates. You can reopen it if you need to adjust.",
    )) return null;
    try {
      const result = await apiAuthed(endpoints.finalAccountFinalize(selectedId), {
        token: accessToken,
        method: "POST",
        body: { notes: notes || "" },
      });
      if (result?.finalAccount) {
        setFinalAccount({ ...result.finalAccount });
        setSel((prev) =>
          prev
            ? { ...prev, finalAccount: result.finalAccount, version: result.version ?? prev.version }
            : prev,
        );
        setNotice("Final account finalized.");
      }
      return result;
    } catch (e) {
      setErr(e?.message || "Failed to finalize account");
      return null;
    }
  }

  async function handleReopenFinalAccount() {
    if (!selectedId || !accessToken) return null;
    if (!window.confirm(
      "Reopen the final account? Items / variations / certificates become editable again.",
    )) return null;
    try {
      const result = await apiAuthed(endpoints.finalAccountReopen(selectedId), {
        token: accessToken,
        method: "POST",
      });
      if (result?.finalAccount) {
        setFinalAccount({ ...result.finalAccount });
        setSel((prev) =>
          prev
            ? { ...prev, finalAccount: result.finalAccount, version: result.version ?? prev.version }
            : prev,
        );
        setNotice("Final account reopened.");
      }
      return result;
    } catch (e) {
      setErr(e?.message || "Failed to reopen final account");
      return null;
    }
  }

  async function handleDownloadFinalAccount() {
    if (!selectedId || !accessToken) return;
    const base = API_BASE || window.location.origin;
    const absUrl = new URL(
      endpoints.finalAccountExport(selectedId),
      base,
    ).toString();
    try {
      const res = await fetch(absUrl, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${sanitizeFilename(sel?.name || "Project")} - Final Account.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setErr(e?.message || "Failed to download final account");
    }
  }

  // ── IFC model upload (100 MB limit on the server) ──
  async function handleUploadModel(discipline, file) {
    if (!selectedId || !accessToken || !file) return null;
    if (!["architectural", "structural", "mep"].includes(discipline)) return null;
    const MAX = 100 * 1024 * 1024;
    if (file.size > MAX) {
      setErr(`File is ${(file.size / 1024 / 1024).toFixed(1)} MB — limit is 100 MB.`);
      return null;
    }
    setModelUploadBusy((prev) => ({ ...prev, [discipline]: true }));
    try {
      // Build this project's Element-ID universe (union of every BoQ line's
      // elementIds) so we only send the IFC Tags that belong to the project —
      // keeps the payload bounded by project size, not the whole model.
      const projectElementIds = new Set();
      for (const it of items) {
        for (const raw of it?.elementIds || []) {
          const n = Number(raw);
          if (Number.isFinite(n) && n > 0) projectElementIds.add(n);
        }
      }

      // Parse the IFC in-browser to read each element's Revit Element ID (the
      // IFC `Tag`). .frag uploads carry no Tags — the server marks them
      // "unchecked" rather than running the ID gate.
      const lower = String(file.name || "").toLowerCase();
      let presentElementIds = null;
      let ifcElementCount = 0;
      if (!lower.endsWith(".frag")) {
        setNotice(`Reading ${discipline} model…`);
        try {
          const { extractPresentElementIds } = await import(
            "../lib/ifcElements.js"
          );
          const parsed = await extractPresentElementIds(file, projectElementIds);
          presentElementIds = parsed.presentElementIds;
          ifcElementCount = parsed.ifcElementCount;
        } catch (parseErr) {
          setErr(
            `Couldn't read "${file.name}" as an IFC: ${parseErr?.message || parseErr}. ` +
              `Re-export it from Revit (IFC, with Element IDs) and try again.`,
          );
          return null;
        }
      }

      const base = API_BASE || window.location.origin;
      const absUrl = new URL(
        endpoints.modelUpload(selectedId, discipline),
        base,
      ).toString();
      const form = new FormData();
      form.append("file", file);
      if (presentElementIds) {
        form.append("presentElementIds", JSON.stringify(presentElementIds));
        form.append("ifcElementCount", String(ifcElementCount));
      }
      const res = await fetch(absUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
        credentials: "include",
      });
      if (!res.ok) {
        // The validation gate returns structured JSON (HTTP 422).
        let payload = null;
        try {
          payload = await res.json();
        } catch {
          payload = null;
        }
        if (payload?.code === "MODEL_ELEMENT_MISMATCH") {
          const sample = Array.isArray(payload.sampleMissing)
            ? payload.sampleMissing.slice(0, 8).join(", ")
            : "";
          throw new Error(
            `Wrong or outdated ${discipline} model — it is missing ` +
              `${payload.missingCount} of ${payload.requiredCount} element(s) your ` +
              `${discipline} quantities were measured from` +
              `${sample ? ` (e.g. IDs ${sample}…)` : ""}. ` +
              `Re-export the IFC from the same Revit model and try again.`,
          );
        }
        throw new Error(payload?.error || `Upload failed (${res.status})`);
      }
      const result = await res.json();
      if (result?.model) {
        setProjectModels((prev) => ({ ...prev, [discipline]: result.model }));
        const v = result.validation || result.model.validation;
        if (v?.status === "valid") {
          setNotice(
            `${discipline} model verified — all ${v.matchedCount}/${v.requiredCount} ` +
              `quantity elements found.`,
          );
        } else if (v?.status === "no-quantities") {
          setNotice(
            `${discipline} model uploaded. No ${discipline} quantities to validate against yet.`,
          );
        } else if (v?.status === "unchecked") {
          setNotice(
            `${discipline} model uploaded (fragments — not Element-ID checked).`,
          );
        } else {
          setNotice(`${discipline} model uploaded.`);
        }
      }
      return result;
    } catch (e) {
      setErr(e?.message || "Model upload failed");
      return null;
    } finally {
      setModelUploadBusy((prev) => ({ ...prev, [discipline]: false }));
    }
  }

  async function handleDeleteModel(discipline) {
    if (!selectedId || !accessToken) return;
    if (!window.confirm(`Delete the ${discipline} model?`)) return;
    try {
      await apiAuthed(endpoints.modelUpload(selectedId, discipline), {
        token: accessToken,
        method: "DELETE",
      });
      setProjectModels((prev) => ({ ...prev, [discipline]: null }));
      setNotice(`${discipline} model deleted.`);
    } catch (e) {
      setErr(e?.message || "Delete failed");
    }
  }

  // ── Share project dashboard ──
  async function handleToggleShare(enable) {
    if (!selectedId || !accessToken) return null;
    try {
      const result = await apiAuthed(endpoints.share(selectedId), {
        token: accessToken,
        method: "POST",
        body: { enable },
      });
      // Update sel with new share state
      setSel((prev) => prev ? {
        ...prev,
        publicShareEnabled: result.publicShareEnabled,
        publicToken: result.publicToken,
      } : prev);
      return result;
    } catch (e) {
      setErr(e?.message || "Failed to toggle sharing");
      return null;
    }
  }

  // compute all rows
  const computedAll = items.map((it, i) => {
    const k = itemKey(it, i);
    const qty = safeNum(it?.qty);
    const rate =
      String(rates?.[k] ?? "").trim() === ""
        ? safeNum(it?.rate)
        : safeNum(rates?.[k]);
    const fullAmount = rate * qty;
    const actualQty =
      String(actualQtyMap?.[k] ?? "").trim() === ""
        ? parseOptionalNumber(it?.actualQty)
        : parseOptionalNumber(actualQtyMap?.[k]);
    const actualRate =
      String(actualRateMap?.[k] ?? "").trim() === ""
        ? parseOptionalNumber(it?.actualRate)
        : parseOptionalNumber(actualRateMap?.[k]);
    const actualHasData = actualQty != null || actualRate != null;
    const resolvedActualQty = actualQty != null ? actualQty : qty;
    const resolvedActualRate = actualRate != null ? actualRate : rate;
    const actualAmount = actualHasData
      ? resolvedActualQty * resolvedActualRate
      : null;
    const isMarked = Boolean(statusMap?.[k]);
    // Partial completion: prefer the UI map (live edits), fall back to the
    // stored value. When the binary status is ticked, treat as 100%.
    const storedPct = Math.max(
      0,
      Math.min(100, safeNum(it?.percentComplete)),
    );
    const uiPct =
      percentMap?.[k] != null
        ? Math.max(0, Math.min(100, safeNum(percentMap[k])))
        : storedPct;
    const percentComplete = isMarked ? 100 : uiPct;
    const valuationFactor = isMarked ? 1 : percentComplete / 100;
    const gid = groupIdForIndex(i);
    const category =
      String(categoryMap?.[k] ?? "").trim() ||
      String(it?.category || "").trim() ||
      deriveItemCategory(it, toolNorm);
    const trade =
      String(tradeMap?.[k] ?? "").trim() ||
      String(it?.trade || "").trim() ||
      deriveItemTrade(it, toolNorm);
    return {
      i,
      key: k,
      sn: it?.sn ?? i + 1,
      description: itemText(it),
      qty,
      unit: String(it?.unit || ""),
      groupId: gid,
      groupLabel: groupLabel(gid),
      groupCount: groupCount(gid),
      category,
      trade,
      rate,
      fullAmount,
      actualQty,
      actualRate,
      actualAmount,
      actualHasData,
      actualVarianceAmount:
        actualAmount == null ? null : actualAmount - fullAmount,
      actualRecordedAt: it?.actualRecordedAt || null,
      actualUpdatedAt: it?.actualUpdatedAt || null,
      // Outstanding amount = full minus what's been valued so far.
      amount: fullAmount * (1 - valuationFactor),
      valuedAmount: fullAmount * valuationFactor,
      isMarked,
      percentComplete,
      valuationFactor,
      isPartial: !isMarked && percentComplete > 0,
      markedAt:
        statusField === "purchased" ? it?.purchasedAt || null : it?.completedAt || null,
    };
  });
  const grossAmount = computedAll.reduce(
    (acc, row) => acc + safeNum(row.fullAmount),
    0,
  );
  const valuedAmount = computedAll.reduce(
    (acc, row) => acc + safeNum(row.valuedAmount),
    0,
  );
  const totalAmount = computedAll.reduce(
    (acc, row) => acc + safeNum(row.amount),
    0,
  );

  // ── Full-scope project totals (measured + PC + prelim + variations) ──
  // The Overview dashboard previously showed `grossAmount` (measured
  // only) as the "Planned total", which silently undercounted users who
  // had PC sums, preliminaries, or variations — they saw 84.8M while
  // the BoQ tab and PM dashboard agreed on 93.4M.
  //
  // Mirrors the server's computeProjectScope so all three views (BoQ
  // tab, Overview dashboard, PM dashboard) reconcile on the same number.
  const provTotalForOverview = (Array.isArray(provisionalSums) ? provisionalSums : [])
    .reduce((acc, p) => acc + safeNum(p?.amount), 0);
  const provDoneAmount = (Array.isArray(provisionalSums) ? provisionalSums : [])
    .reduce((acc, p) => acc + (p?.completed ? safeNum(p?.amount) : 0), 0);

  const variationsTotalForOverview = (Array.isArray(variations) ? variations : [])
    .reduce((acc, v) => acc + safeNum(v?.qty) * safeNum(v?.rate), 0);
  const variationsDoneAmount = (Array.isArray(variations) ? variations : [])
    .reduce(
      (acc, v) =>
        v?.completed ? acc + safeNum(v?.qty) * safeNum(v?.rate) : acc,
      0,
    );

  const preliminaryPctForOverview = safeNum(contract?.preliminaryPercent) || 7.5;
  const preliminaryPoolForOverview =
    ((grossAmount + provTotalForOverview) * preliminaryPctForOverview) / 100;
  // Pro-rate the preliminary pool by the allocation of each completed item.
  // Mirrors the server: each item gets (allocation / totalAllocation) of
  // the pool when ticked complete.
  const prelimItemsArr = Array.isArray(preliminaryItems) ? preliminaryItems : [];
  const prelimAllocTotal = prelimItemsArr.reduce(
    (acc, p) => acc + safeNum(p?.allocation),
    0,
  );
  const prelimAllocBase = prelimAllocTotal > 0 ? prelimAllocTotal : 100;
  const prelimDoneAmountForOverview = prelimItemsArr.reduce(
    (acc, p) =>
      p?.completed
        ? acc + (preliminaryPoolForOverview * safeNum(p?.allocation)) / prelimAllocBase
        : acc,
    0,
  );

  // Full project total — what the user sees on the BoQ tab as "Project
  // total" and on the PM Dashboard as "BAC". Same formula across all
  // three views.
  const fullProjectTotal =
    grossAmount + provTotalForOverview + preliminaryPoolForOverview + variationsTotalForOverview;
  // Full earned-to-date — measured items × completion + executed PC +
  // executed variations + completed prelim items.
  const fullValuedAmount =
    valuedAmount + provDoneAmount + prelimDoneAmountForOverview + variationsDoneAmount;
  // Full outstanding — what's still left to earn / claim.
  const fullRemainingAmount = Math.max(0, fullProjectTotal - fullValuedAmount);
  const progressCount = computedAll.filter((row) => row.isMarked).length;
  const partialCount = computedAll.filter((row) => row.isPartial).length;
  // Partial-aware progress: full point for ratified items, fractional for
  // in-progress ones. Matches the server math so PM + BoQ tiles agree.
  const progressShare = computedAll.reduce(
    (acc, row) => acc + safeNum(row.valuationFactor),
    0,
  );
  const progressPercent = computedAll.length
    ? (progressShare / computedAll.length) * 100
    : 0;
  const actualRows = computedAll.filter((row) => row.actualHasData);
  const actualCoverageCount = actualRows.length;
  const actualCoveragePercent = computedAll.length
    ? (actualCoverageCount / computedAll.length) * 100
    : 0;
  const plannedActualScopeAmount = actualRows.reduce(
    (acc, row) => acc + safeNum(row.fullAmount),
    0,
  );
  const measuredActualTracked = actualRows.reduce(
    (acc, row) => acc + safeNum(row.actualAmount),
    0,
  );

  // Tracked value now spans the FULL scope, not just measured:
  //   • Measured items with actualQty/actualRate (already in actualRows)
  //   • Completed preliminary items — actualAmount (user-entered) OR
  //     the planned-share-of-pool as the fall-back
  //   • Executed PC sums — declared amount
  //   • Executed variations — qty × rate
  // Mirrors the server-side "actualProjectCost" formula so the Overview
  // dashboard, public client view, and PM dashboard all reconcile.
  const prelimActualTracked = (preliminaryItems || []).reduce((acc, p) => {
    // Prefer user-entered actualAmount (added in earlier session);
    // fall back to the planned share when completed but no actual
    // figure typed.
    if (safeNum(p?.actualAmount) > 0) return acc + safeNum(p?.actualAmount);
    if (p?.completed) {
      const totalAlloc = (preliminaryItems || []).reduce(
        (a, pp) => a + safeNum(pp?.allocation),
        0,
      );
      const base = totalAlloc > 0 ? totalAlloc : 100;
      const provTotal = (provisionalSums || []).reduce(
        (a, s) => a + safeNum(s?.amount),
        0,
      );
      const pool =
        ((grossAmount + provTotal) *
          safeNum(contract?.preliminaryPercent || 0)) /
        100;
      return acc + (pool * safeNum(p?.allocation)) / base;
    }
    return acc;
  }, 0);
  const provActualTracked = (provisionalSums || []).reduce(
    (acc, s) => (s?.completed ? acc + safeNum(s?.amount) : acc),
    0,
  );
  const variationActualTracked = (variations || []).reduce(
    (acc, v) =>
      v?.completed ? acc + safeNum(v?.qty) * safeNum(v?.rate) : acc,
    0,
  );
  const actualTrackedAmount =
    measuredActualTracked +
    prelimActualTracked +
    provActualTracked +
    variationActualTracked;

  // Variance compares full tracked spend against the full project
  // value (so the percentage reads "you've recorded X% of the planned
  // scope as done"). Falls back to measured-only when fullProjectTotal
  // isn't yet computed (early in the loading sequence).
  const trackedScopeReference = fullProjectTotal > 0
    ? fullProjectTotal
    : plannedActualScopeAmount;
  const actualVarianceAmount = actualTrackedAmount - trackedScopeReference;
  const actualVariancePercent = trackedScopeReference > 0
    ? (actualVarianceAmount / trackedScopeReference) * 100
    : 0;
  const actualQtyOverrideCount = actualRows.filter(
    (row) => row.actualQty != null,
  ).length;
  const actualRateOverrideCount = actualRows.filter(
    (row) => row.actualRate != null,
  ).length;
  const latestActualDate = actualRows.reduce((latest, row) => {
    const candidate = new Date(row.actualUpdatedAt || row.actualRecordedAt || 0);
    if (Number.isNaN(candidate.getTime())) return latest;
    if (!latest) return candidate;
    return candidate.getTime() > latest.getTime() ? candidate : latest;
  }, null);
  const liveProjectSummary = React.useMemo(
    () => ({
      itemCount: computedAll.length,
      markedCount: progressCount,
      // Persist the FULL project total (measured + PC + prelim + variations)
      // so the projects list shows the same total users see on the BoQ tab
      // and Overview dashboard. Pre-fix this stored only `grossAmount`
      // (measured only), causing the list card to silently undercount.
      totalCost: fullProjectTotal,
      valuedAmount: fullValuedAmount,
      remainingAmount: fullRemainingAmount,
      progressPercent,
      actualCoverageCount,
      actualTrackedAmount,
      actualVarianceAmount,
    }),
    [
      computedAll.length,
      progressCount,
      fullProjectTotal,
      fullValuedAmount,
      fullRemainingAmount,
      progressPercent,
      actualCoverageCount,
      actualTrackedAmount,
      actualVarianceAmount,
    ],
  );
  React.useEffect(() => {
    if (!selectedId) return;
    setRows((prev) =>
      Array.isArray(prev)
        ? prev.map((row) =>
            rowId(row) === selectedId
              ? {
                  ...row,
                  ...liveProjectSummary,
                  updatedAt: sel?.updatedAt || row?.updatedAt,
                }
              : row,
          )
        : prev,
    );
  }, [liveProjectSummary, selectedId, sel?.updatedAt]);
  const q = String(itemQuery || "")
    .trim()
    .toLowerCase();
  const computedShown = !q
    ? computedAll
    : computedAll.filter((row) => {
        return (
          String(row.description || "")
            .toLowerCase()
            .includes(q) ||
          String(row.groupLabel || "")
            .toLowerCase()
            .includes(q) ||
          String(row.category || "")
            .toLowerCase()
            .includes(q) ||
          String(row.sn || "")
            .toLowerCase()
            .includes(q)
        );
      });

  // Categories the user has created on ANY project — remembered per user
  // (localStorage) so a section made once is offered on every future project.
  const [userCategories, setUserCategories] = React.useState([]);
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(`adlm:customCategories:${toolNorm}`);
      const arr = raw ? JSON.parse(raw) : [];
      setUserCategories(
        Array.isArray(arr) ? arr.filter((c) => typeof c === "string") : [],
      );
    } catch {
      setUserCategories([]);
    }
  }, [toolNorm]);

  const categoryOptions = React.useMemo(() => {
    // Canonical per-product list (…, "Uncategorized") + this project's custom
    // categories + the user's remembered categories, inserted before
    // "Uncategorized" so it stays last.
    const excluded = new Set(
      (Array.isArray(sel?.excludedCategories) ? sel.excludedCategories : []).map(
        (c) => String(c).toLowerCase(),
      ),
    );
    const base = allCategoriesForProductKey(toolNorm).filter(
      (c) => !excluded.has(String(c).toLowerCase()),
    );
    const custom = [
      ...(Array.isArray(sel?.customCategories) ? sel.customCategories : []),
      ...userCategories,
    ];
    const seen = new Set(base.map((c) => String(c).toLowerCase()));
    const extra = [];
    for (const c of custom) {
      const t = String(c || "").trim();
      if (t && !seen.has(t.toLowerCase()) && !excluded.has(t.toLowerCase())) {
        seen.add(t.toLowerCase());
        extra.push(t);
      }
    }
    if (!extra.length) return base;
    const last = base[base.length - 1];
    return [...base.slice(0, -1), ...extra, last];
  }, [toolNorm, sel?.customCategories, sel?.excludedCategories, userCategories]);

  // Codes whose bill rate is derived from a priced material/labour build-up —
  // those BoQ rate cells become read-only (the Budget tab drives them).
  const budgetDrivenCodes = React.useMemo(() => {
    const totals = new Map();
    for (const b of sel?.budgetItems || []) {
      const code = String(b?.billIdentity || "").trim().toLowerCase();
      if (!code) continue;
      totals.set(code, (totals.get(code) || 0) + safeNum(b.qty) * safeNum(b.rate));
    }
    const set = new Set();
    for (const [code, net] of totals) if (net > 0) set.add(code);
    return set;
  }, [sel?.budgetItems]);

  // Add a user-defined category for this project's bill arrangement; persists
  // immediately (items untouched — only customCategories[] is sent).
  async function handleRemoveCategory(name) {
    const t = String(name || "").trim();
    if (!t || !selectedId || !accessToken) return;
    const existing = Array.isArray(sel?.customCategories) ? sel.customCategories : [];
    // Remove from custom list; for canonical categories add to excludedCategories
    const nextCustom = existing.filter((c) => String(c).toLowerCase() !== t.toLowerCase());
    const nextExcluded = [
      ...(Array.isArray(sel?.excludedCategories) ? sel.excludedCategories : []),
    ];
    if (!nextExcluded.some((c) => c.toLowerCase() === t.toLowerCase())) {
      nextExcluded.push(t);
    }
    try {
      const updated = await apiAuthed(endpoints.one(selectedId), {
        token: accessToken,
        method: "PUT",
        body: {
          baseVersion: sel?.version,
          customCategories: nextCustom,
          excludedCategories: nextExcluded,
        },
      });
      setSel(updated);
      setNotice(`Category "${t}" removed.`);
    } catch (e) {
      setErr(e?.message || "Couldn't remove the category.");
    }
  }

  async function handleAddCategory(name) {
    const t = String(name || "").trim();
    if (!t) return;
    const canonical = allCategoriesForProductKey(toolNorm).map((c) =>
      String(c).toLowerCase(),
    );
    const isCanonical = canonical.includes(t.toLowerCase());

    // Remember at user level (future projects) unless it's a built-in.
    if (!isCanonical && !userCategories.some((c) => c.toLowerCase() === t.toLowerCase())) {
      const nextUser = [...userCategories, t];
      setUserCategories(nextUser);
      try {
        localStorage.setItem(
          `adlm:customCategories:${toolNorm}`,
          JSON.stringify(nextUser),
        );
      } catch {
        /* ignore */
      }
    }

    // Persist on the current project too, so it round-trips server-side.
    if (!selectedId || !accessToken) return;
    const existing = Array.isArray(sel?.customCategories)
      ? sel.customCategories
      : [];
    if (
      isCanonical ||
      existing.some((c) => String(c).toLowerCase() === t.toLowerCase())
    ) {
      return;
    }
    try {
      const updated = await apiAuthed(endpoints.one(selectedId), {
        token: accessToken,
        method: "PUT",
        body: { baseVersion: sel?.version, customCategories: [...existing, t] },
      });
      setSel(updated);
      setNotice(`Category “${t}” added.`);
    } catch (e) {
      setErr(e?.message || "Couldn't add the category.");
    }
  }

  // User-remembered work sections (trades), parallel to userCategories.
  const [userTrades, setUserTrades] = React.useState([]);
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(`adlm:customTrades:${toolNorm}`);
      const arr = raw ? JSON.parse(raw) : [];
      setUserTrades(
        Array.isArray(arr) ? arr.filter((c) => typeof c === "string") : [],
      );
    } catch {
      setUserTrades([]);
    }
  }, [toolNorm]);

  const tradeOptions = React.useMemo(() => {
    const base = Array.isArray(tradesForProductKey(toolNorm))
      ? tradesForProductKey(toolNorm)
      : [];
    const seen = new Set(base.map((c) => String(c).toLowerCase()));
    const extra = [];
    for (const c of userTrades) {
      const t = String(c || "").trim();
      if (t && !seen.has(t.toLowerCase())) {
        seen.add(t.toLowerCase());
        extra.push(t);
      }
    }
    return extra.length ? [...base, ...extra] : base;
  }, [toolNorm, userTrades]);

  // Add a user-defined work section (trade). Trade picks ride on item.trade at
  // save, so this only needs user-level memory to surface the new section.
  function handleAddTrade(name) {
    const t = String(name || "").trim();
    if (!t) return;
    const base = tradesForProductKey(toolNorm).map((c) =>
      String(c).toLowerCase(),
    );
    if (
      base.includes(t.toLowerCase()) ||
      userTrades.some((c) => c.toLowerCase() === t.toLowerCase())
    ) {
      return;
    }
    const next = [...userTrades, t];
    setUserTrades(next);
    try {
      localStorage.setItem(`adlm:customTrades:${toolNorm}`, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    setNotice(`Work section “${t}” added.`);
  }

  const selectedValuation = React.useMemo(
    () =>
      valuations.find((log) => log.date === selectedValuationDate) ||
      valuations[0] ||
      null,
    [valuations, selectedValuationDate],
  );

  function exportGenericBoQ(groupBy = "category") {
    if (!sel) return;

    const headers = ["S/N", "Description", "Qty", "Unit", "Rate", "Amount"];
    const cols = [
      { wch: 6 },
      { wch: 60 },
      { wch: 12 },
      { wch: 10 },
      { wch: 14 },
      { wch: 16 },
    ];

    // Group rows by either category (building element) or trade (work section).
    // Preserve canonical ordering, then append any extras at the end.
    const useTrade = String(groupBy).toLowerCase() === "trade";
    const canonical = useTrade
      ? tradesForProductKey(toolNorm)
      : categoryOptions;

    const byCategory = new Map();
    for (const row of computedAll) {
      // For trade grouping, classify by item description since trade is
      // independent of the saved UI category.
      const rawItem = items[row.i] || row;
      const groupName = useTrade
        ? deriveItemTrade(rawItem, toolNorm)
        : String(row.category || UNCATEGORIZED).trim() || UNCATEGORIZED;
      const key = groupName || "Other";
      if (!byCategory.has(key)) byCategory.set(key, []);
      byCategory.get(key).push(row);
    }
    const orderedCats = [
      ...canonical.filter((c) => byCategory.has(c)),
      ...[...byCategory.keys()].filter((c) => !canonical.includes(c)),
    ];

    const wb = XLSX.utils.book_new();

    // ── Material & Labour budget breakdown (formula-linked) ─────────────
    // One block per bill line: its material + labour rows with live
    // Amount = Qty×Rate, a Net = SUM(...), Overhead/Profit %, and a derived
    // Bill rate = Net×(1+(O/H+Profit)/100)/billQty. Each bill line's Rate on
    // the category sheets then links back to that derived rate, so the whole
    // workbook re-prices from the build-up — for every export type.
    const budgetByCode = new Map();
    for (const b of sel?.budgetItems || []) {
      const code = String(b?.billIdentity || "").trim().toLowerCase();
      if (!code) continue;
      if (!budgetByCode.has(code)) budgetByCode.set(code, []);
      budgetByCode.get(code).push(b);
    }
    const rateCellByCode = new Map(); // bill code -> "'Sheet'!F12"
    const kindRankX = (l) => {
      const s = String(l?.componentKind || "").toLowerCase();
      return s === "material" ? 0 : s === "labour" || s === "labor" ? 1 : 2;
    };
    const kindLabelX = (k) => {
      const s = String(k || "").toLowerCase();
      if (s === "labour" || s === "labor") return "Labour";
      return s ? s[0].toUpperCase() + s.slice(1) : "Material";
    };
    if (budgetByCode.size) {
      const budgetSheetName = sanitizeSheetName("Material & Labour");
      const bAoa = [["Bill item / Resource", "Type", "Unit", "Qty", "Rate", "Amount"]];
      const bFormulas = [];
      for (const row of computedAll) {
        const rawItem = items[row.i] || {};
        const code = String(rawItem.code || "").trim().toLowerCase();
        const blk = code ? budgetByCode.get(code) : null;
        if (!blk || !blk.length) continue;
        const lines = [...blk].sort((a, b) => kindRankX(a) - kindRankX(b));
        bAoa.push([row.description, "", "", Number(safeNum(row.qty).toFixed(2)), "", ""]);
        const headerRow = bAoa.length; // 1-based row of the bill-line header
        const firstRow = headerRow + 1;
        for (const l of lines) {
          bAoa.push([
            "    " + String(l.materialName || l.description || "").trim(),
            kindLabelX(l.componentKind),
            l.unit || "",
            Number(safeNum(l.qty).toFixed(4)),
            Number(safeNum(l.rate).toFixed(2)),
            null,
          ]);
          const r = bAoa.length;
          bFormulas.push({ addr: `F${r}`, f: `D${r}*E${r}` });
        }
        const lastRow = bAoa.length;
        bAoa.push(["Net build-up", "", "", "", "", null]);
        const netRow = bAoa.length;
        bFormulas.push({ addr: `F${netRow}`, f: `SUM(F${firstRow}:F${lastRow})` });
        const oh = blk.reduce((a, l) => Math.max(a, safeNum(l.overheadPercent)), 0);
        const pr = blk.reduce((a, l) => Math.max(a, safeNum(l.profitPercent)), 0);
        bAoa.push(["Overhead %", "", "", "", "", oh]);
        const ohRow = bAoa.length;
        bAoa.push(["Profit %", "", "", "", "", pr]);
        const prRow = bAoa.length;
        bAoa.push(["Bill rate (Material + Labour + O&P)", "", "", "", "", null]);
        const rateRow = bAoa.length;
        bFormulas.push({
          addr: `F${rateRow}`,
          f: `IF(D${headerRow}=0,F${netRow}*(1+(F${ohRow}+F${prRow})/100),F${netRow}*(1+(F${ohRow}+F${prRow})/100)/D${headerRow})`,
        });
        rateCellByCode.set(code, `'${budgetSheetName}'!F${rateRow}`);
        bAoa.push(["", "", "", "", "", ""]);
      }
      const bws = XLSX.utils.aoa_to_sheet(bAoa);
      bws["!cols"] = [{ wch: 48 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 16 }];
      for (const { addr, f } of bFormulas) bws[addr] = { t: "n", f };
      XLSX.utils.book_append_sheet(wb, bws, budgetSheetName);
    }

    // One sheet per category that has items — Amount and Rate are formulas so
    // the BoQ stays linked to the build-up.
    for (const cat of orderedCats) {
      const rows = byCategory.get(cat) || [];
      if (!rows.length) continue;

      const aoa = [
        headers,
        ...rows.map((row, i) => [
          i + 1,
          row.description,
          Number(safeNum(row.qty).toFixed(2)),
          row.unit,
          Number(safeNum(row.rate).toFixed(2)),
          null,
        ]),
        ["", "", "", "", "SUBTOTAL", null],
      ];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = cols;
      rows.forEach((row, i) => {
        const r = i + 2; // 1-based row (header is row 1)
        const code = String(items[row.i]?.code || "").trim().toLowerCase();
        const ref = code ? rateCellByCode.get(code) : null;
        if (ref) ws[`E${r}`] = { t: "n", f: ref }; // Rate ← build-up
        ws[`F${r}`] = { t: "n", f: `C${r}*E${r}` }; // Amount = Qty×Rate
      });
      const subtotalRow = rows.length + 2;
      ws[`F${subtotalRow}`] = { t: "n", f: `SUM(F2:F${rows.length + 1})` };
      XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(cat));
    }

    // Variations sheet — instruction-driven, separate from measured work.
    const cleanedVariations = (Array.isArray(variations) ? variations : [])
      .map((v) => ({
        description: String(v?.description || "").trim(),
        qty: Number(v?.qty) || 0,
        unit: String(v?.unit || "").trim(),
        rate: Number(v?.rate) || 0,
        reference: String(v?.reference || "").trim(),
        issuedAt: String(v?.issuedAt || ""),
      }))
      .filter((v) => v.description || v.qty > 0 || v.rate > 0);
    const variationsTotal = cleanedVariations.reduce(
      (acc, v) => acc + v.qty * v.rate,
      0,
    );
    if (cleanedVariations.length) {
      const varAoa = [
        ["S/N", "Reference", "Description", "Qty", "Unit", "Rate", "Amount", "Issued"],
        ...cleanedVariations.map((v, i) => [
          i + 1,
          v.reference,
          v.description,
          Number(v.qty.toFixed(2)),
          v.unit,
          Number(v.rate.toFixed(2)),
          Number((v.qty * v.rate).toFixed(2)),
          v.issuedAt,
        ]),
        ["", "", "", "", "", "TOTAL", Number(variationsTotal.toFixed(2)), ""],
      ];
      const varWs = XLSX.utils.aoa_to_sheet(varAoa);
      varWs["!cols"] = [
        { wch: 6 },
        { wch: 16 },
        { wch: 50 },
        { wch: 10 },
        { wch: 8 },
        { wch: 14 },
        { wch: 16 },
        { wch: 12 },
      ];
      XLSX.utils.book_append_sheet(wb, varWs, "Variations");
    }

    // Provisional sums sheet
    const cleanedProvSums = (Array.isArray(provisionalSums) ? provisionalSums : [])
      .map((s) => ({
        description: String(s?.description || "").trim(),
        amount: Number(s?.amount) || 0,
      }))
      .filter((s) => s.description || s.amount > 0);
    const provTotal = cleanedProvSums.reduce((acc, s) => acc + s.amount, 0);
    if (cleanedProvSums.length) {
      const psAoa = [
        ["S/N", "Description", "Amount"],
        ...cleanedProvSums.map((s, i) => [
          i + 1,
          s.description,
          Number(s.amount.toFixed(2)),
        ]),
        ["", "TOTAL", Number(provTotal.toFixed(2))],
      ];
      const psWs = XLSX.utils.aoa_to_sheet(psAoa);
      psWs["!cols"] = [{ wch: 6 }, { wch: 60 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, psWs, "Provisional Sums");
    }

    // Preliminaries sheet (pool, allocations, done status)
    const preliminaryPct = Number(contract?.preliminaryPercent) || 0;
    const preliminaryPool = ((grossAmount + provTotal) * preliminaryPct) / 100;
    const cleanedPrelim = (Array.isArray(preliminaryItems) ? preliminaryItems : [])
      .map((p) => ({
        name: String(p?.name || "").trim(),
        allocation: Number(p?.allocation) || 0,
        completed: Boolean(p?.completed),
        completedAt: p?.completedAt || null,
      }))
      .filter((p) => p.name || p.allocation > 0);
    const allocTotalForExport = cleanedPrelim.reduce(
      (acc, p) => acc + p.allocation,
      0,
    );
    const allocBase = allocTotalForExport > 0 ? allocTotalForExport : 100;
    const prelimDoneAmount = cleanedPrelim.reduce(
      (acc, p) =>
        p.completed ? acc + (preliminaryPool * p.allocation) / allocBase : acc,
      0,
    );
    if (cleanedPrelim.length) {
      const header = [
        "S/N",
        "Preliminary item",
        "Alloc %",
        "Amount",
        "Done",
        "Done amount",
        "Done date",
      ];
      const rows = cleanedPrelim.map((p, i) => {
        const amt = (preliminaryPool * p.allocation) / allocBase;
        return [
          i + 1,
          p.name,
          Number(p.allocation.toFixed(2)),
          Number(amt.toFixed(2)),
          p.completed ? "Yes" : "",
          p.completed ? Number(amt.toFixed(2)) : 0,
          p.completedAt ? new Date(p.completedAt).toISOString().slice(0, 10) : "",
        ];
      });
      const prelimAoa = [
        [
          `Preliminaries pool: ${preliminaryPct.toFixed(1)}% of measured + PC = ${preliminaryPool.toFixed(2)}`,
        ],
        [],
        header,
        ...rows,
        [
          "",
          "POOL TOTAL",
          Number(allocTotalForExport.toFixed(2)),
          Number(preliminaryPool.toFixed(2)),
          "",
          "",
          "",
        ],
        ["", "DONE", "", "", "", Number(prelimDoneAmount.toFixed(2)), ""],
        [
          "",
          "OUTSTANDING",
          "",
          "",
          "",
          Number((preliminaryPool - prelimDoneAmount).toFixed(2)),
          "",
        ],
      ];
      const prelimWs = XLSX.utils.aoa_to_sheet(prelimAoa);
      prelimWs["!cols"] = [
        { wch: 6 },
        { wch: 44 },
        { wch: 10 },
        { wch: 14 },
        { wch: 8 },
        { wch: 16 },
        { wch: 14 },
      ];
      XLSX.utils.book_append_sheet(wb, prelimWs, "Preliminaries");
    }

    // Summary sheet — per-group totals + grand total.
    const summaryAoa = [
      [useTrade ? "Trade / Work section" : "Category", "Items", "Amount"],
      ...orderedCats.map((cat) => {
        const rows = byCategory.get(cat) || [];
        const subtotal = rows.reduce(
          (acc, r) => acc + safeNum(r.fullAmount),
          0,
        );
        return [cat, rows.length, Number(subtotal.toFixed(2))];
      }),
      ["Measured work — subtotal", computedAll.length, Number(grossAmount.toFixed(2))],
      ...(provTotal > 0
        ? [["Provisional sums", cleanedProvSums.length, Number(provTotal.toFixed(2))]]
        : []),
      ...(preliminaryPool > 0
        ? [
            [
              `Preliminaries (${preliminaryPct.toFixed(1)}%)`,
              cleanedPrelim.length,
              Number(preliminaryPool.toFixed(2)),
            ],
            ...(prelimDoneAmount > 0
              ? [
                  [
                    "  of which: done",
                    cleanedPrelim.filter((p) => p.completed).length,
                    Number(prelimDoneAmount.toFixed(2)),
                  ],
                  [
                    "  of which: outstanding",
                    cleanedPrelim.filter((p) => !p.completed).length,
                    Number((preliminaryPool - prelimDoneAmount).toFixed(2)),
                  ],
                ]
              : []),
          ]
        : []),
      ...(variationsTotal !== 0
        ? [["Variations", cleanedVariations.length, Number(variationsTotal.toFixed(2))]]
        : []),
      [
        "PROJECT TOTAL",
        computedAll.length +
          cleanedProvSums.length +
          cleanedVariations.length +
          cleanedPrelim.filter((p) => p.completed || p.allocation > 0).length,
        Number(
          (grossAmount + provTotal + preliminaryPool + variationsTotal).toFixed(2),
        ),
      ],
    ];
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryAoa);
    summaryWs["!cols"] = [{ wch: 30 }, { wch: 10 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");

    const filename = `${sanitizeFilename(sel?.name || "Project")} - BoQ${
      useTrade ? " (Trade)" : ""
    }.xlsx`;
    XLSX.writeFile(wb, filename);
  }

  // add near the top with other imports

  // helper
  function filenameFromDisposition(disposition, fallback) {
    const cd = String(disposition || "");
    const m = cd.match(/filename\*?=(?:UTF-8'')?"?([^"]+)"?/i);
    if (!m) return fallback;
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return m[1];
    }
  }

  async function exportElementalBoQFromBackend(
    buildingType = "bungalow",
    foundationType,
    format = "elemental",
  ) {
    if (!selectedId) return;

    const normalizedBuilding = buildingType === "multistorey" ? "multistorey" : "bungalow";
    const base = API_BASE || window.location.origin;
    const qs = new URLSearchParams({ building: normalizedBuilding });
    if (foundationType) qs.set("foundation", String(foundationType));
    if (format && format !== "elemental") qs.set("format", String(format));
    const path = `/projectsboq/${toolNorm}/${selectedId}/export/boq?${qs.toString()}`;
    const absUrl = new URL(path, base).toString();

    const res = await fetch(absUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
      credentials: "include",
    });

    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || "Failed to export BoQ");
    }

    const ct = String(res.headers.get("content-type") || "").toLowerCase();

    // If we accidentally got HTML/JSON, don't download it as .xlsx
    const looksExcel =
      ct.includes("spreadsheetml.sheet") ||
      ct.includes("application/octet-stream");
    if (!looksExcel) {
      const txt = await res.text();
      throw new Error(
        `Export returned non-Excel content-type: ${ct}\n` + txt.slice(0, 300),
      );
    }

    const blob = await res.blob();
    const cd = res.headers.get("content-disposition");
    const formatLabel = format === "trade" ? "Trade" : "Elemental";
    const fallbackName = `${sanitizeFilename(sel?.name || "Project")} - ${formatLabel} BOQ.xlsx`;
    const filename = filenameFromDisposition(cd, fallbackName);

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }
  React.useEffect(() => {
    load({ keepSelection: true });
    // eslint-disable-next-line
  }, [accessToken, tool]);

  // Explorer filtering
  const projectQ = String(projectQuery || "")
    .trim()
    .toLowerCase();
  const rowsShown = !projectQ
    ? rows
    : rows.filter((r) =>
        String(r?.name || "")
          .toLowerCase()
          .includes(projectQ),
      );
  const sectionSummary = React.useMemo(
    () => summarizeProjectRows(rowsShown),
    [rowsShown],
  );

  // Explorer selection helpers
  function toggleSelect(id) {
    if (!id) return;
    setSelectedMap((prev) => {
      const next = { ...(prev || {}) };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
  }
  function selectAllShown() {
    const ids = rowsShown.map((r) => rowId(r)).filter(Boolean);
    setSelectedMap((prev) => {
      const next = { ...(prev || {}) };
      ids.forEach((id) => (next[id] = true));
      return next;
    });
  }
  function clearSelection() {
    setSelectedMap({});
  }

  const title = TITLES[tool] || "Projects";

  // Persist procurement marking from the Budget tab. Isolated PUT that only
  // updates budgetItems[] — never touches the BoQ/valuation save path.
  async function saveBudgetProcurement(nextBudgetItems) {
    if (!selectedId || !endpoints.budget) return;
    try {
      const updated = await apiAuthed(endpoints.budget(selectedId), {
        token: accessToken,
        method: "PUT",
        body: { baseVersion: sel?.version, budgetItems: nextBudgetItems },
      });
      setSel(updated);
      // Re-init the derived item state so the valuation figures reflect the
      // budget-driven % (when basis = budget the server reconciles items).
      initRatesFromProject(updated);
      setNotice("Procurement updated.");
    } catch (e) {
      setErr(e?.message || "Couldn't save procurement.");
    }
  }

  // checkbox styling: no surrounding border look
  const checkboxCls =
    "h-4 w-4 accent-blue-600 border-0 outline-none ring-0 focus:ring-0 focus:outline-none";

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className={`mx-auto flex flex-col gap-4 ${sel ? "max-w-[1700px]" : "max-w-7xl md:flex-row"}`}>
        {/* SIDEBAR — vertical while browsing; collapses to a slim
            horizontal bar once a project is open so the data tables get
            the full width of the screen. */}
        <aside className={sel ? "w-full" : "md:w-[260px]"}>
          {sel ? (
            <div className="space-y-3">
              <div className="card !p-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-adlm-blue-700 to-adlm-blue-600 text-white shadow-glow-blue">
                    <SidebarIcon className="text-base" />
                  </div>
                  <div className="min-w-0 leading-tight">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-adlm-dark-dim">
                      {sidebarMeta.app}
                    </div>
                    <div className="truncate text-sm font-bold text-slate-900 dark:text-white">
                      {sidebarMeta.section}
                    </div>
                  </div>
                </div>

                {showRevitToggle && (
                  <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-adlm-dark-border dark:bg-white/5">
                    <Link
                      to={`/projects/${toolFamily}`}
                      className={[
                        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                        toolNorm === toolFamily
                          ? "bg-white text-adlm-blue-700 shadow-depth dark:bg-adlm-dark-panel dark:text-adlm-blue-300"
                          : "text-slate-600 hover:bg-white/70 dark:text-adlm-dark-muted dark:hover:bg-white/5",
                      ].join(" ")}
                    >
                      <FaFolder className="text-[12px]" />
                      Takeoffs
                    </Link>
                    <Link
                      to={`/projects/${toolFamily}-materials`}
                      className={[
                        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                        isMaterialsTool(tool)
                          ? "bg-white text-adlm-blue-700 shadow-depth dark:bg-adlm-dark-panel dark:text-adlm-blue-300"
                          : "text-slate-600 hover:bg-white/70 dark:text-adlm-dark-muted dark:hover:bg-white/5",
                      ].join(" ")}
                    >
                      <FaCubes className="text-[12px]" />
                      Materials
                    </Link>
                  </div>
                )}

                <div className="ml-auto flex items-center gap-2">
                  <Link
                    to={DASHBOARD_PATH}
                    title="Back to dashboard"
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-depth active:translate-y-0 dark:border-adlm-dark-border dark:bg-adlm-dark-panel dark:text-adlm-dark-text"
                  >
                    <FaThLarge className="text-[12px]" />
                    <span className="hidden sm:inline">Dashboard</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => load({ keepSelection: true })}
                    disabled={bulkBusy}
                    title="Refresh projects"
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-depth active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 dark:border-adlm-dark-border dark:bg-adlm-dark-panel dark:text-adlm-dark-text"
                  >
                    <FaSyncAlt className={`text-[12px] ${bulkBusy ? "animate-spin" : ""}`} />
                    <span className="hidden sm:inline">{bulkBusy ? "Refreshing…" : "Refresh"}</span>
                  </button>
                  {canBoqImport &&
                    sel?.origin === BOQ_IMPORT_ORIGIN &&
                    sel?._access?.canEdit !== false && (
                      <>
                        <input
                          ref={boqReimportInputRef}
                          type="file"
                          accept=".xlsx,.xlsm"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) reimportBoq(f);
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => boqReimportInputRef.current?.click()}
                          disabled={boqImportBusy}
                          title="Update this project from a newer copy of its Excel BoQ"
                          className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-depth active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                        >
                          <FaFileExcel className="text-[12px]" />
                          <span className="hidden sm:inline">
                            {boqImportBusy ? "Updating…" : "Update from Excel"}
                          </span>
                        </button>
                      </>
                    )}
                </div>
              </div>

              {err && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {err}
                </div>
              )}
              {notice && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  {notice}
                </div>
              )}
            </div>
          ) : (
          <div className="card !p-0 overflow-hidden md:sticky md:top-6">
            {/* Identity band — tells the user exactly which tool & mode
                they're in, so the rest of the sidebar is purely navigation. */}
            <div className="relative overflow-hidden bg-gradient-to-br from-adlm-blue-700 to-adlm-blue-600 p-4 text-white">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-white/10 blur-2xl"
              />
              <div className="relative flex items-start gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
                  <SidebarIcon className="text-lg text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-100/90">
                    {sidebarMeta.app}
                  </div>
                  <div className="truncate text-base font-bold leading-tight">
                    {sidebarMeta.section}
                  </div>
                  <div className="mt-0.5 text-[11px] leading-snug text-blue-100/80">
                    {sidebarMeta.hint}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4 p-3">
              {/* Group 1 — Mode: switch between Takeoffs and Materials for
                  the same tool. A segmented control reads as "pick one",
                  unlike the old stack of identical bordered links. */}
              {showRevitToggle && (
                <div>
                  <div className="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-adlm-dark-dim">
                    Mode
                  </div>
                  <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-adlm-dark-border dark:bg-white/5">
                    <Link
                      to={`/projects/${toolFamily}`}
                      className={[
                        "inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition",
                        toolNorm === toolFamily
                          ? "bg-white text-adlm-blue-700 shadow-depth dark:bg-adlm-dark-panel dark:text-adlm-blue-300"
                          : "text-slate-600 hover:bg-white/70 dark:text-adlm-dark-muted dark:hover:bg-white/5",
                      ].join(" ")}
                    >
                      <FaFolder className="text-[12px]" />
                      Takeoffs
                    </Link>
                    <Link
                      to={`/projects/${toolFamily}-materials`}
                      className={[
                        "inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition",
                        isMaterialsTool(tool)
                          ? "bg-white text-adlm-blue-700 shadow-depth dark:bg-adlm-dark-panel dark:text-adlm-blue-300"
                          : "text-slate-600 hover:bg-white/70 dark:text-adlm-dark-muted dark:hover:bg-white/5",
                      ].join(" ")}
                    >
                      <FaCubes className="text-[12px]" />
                      Materials
                    </Link>
                  </div>
                </div>
              )}

              {/* Group 2 — Navigate: leave the tool or refresh the list.
                  "Back to projects" lives on the project header itself,
                  so it isn't duplicated here. */}
              <div>
                <div className="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-adlm-dark-dim">
                  Navigate
                </div>
                <div className="space-y-1.5">
                  <Link
                    to={DASHBOARD_PATH}
                    className="group flex items-center gap-2.5 rounded-xl border border-transparent px-3 py-2 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:border-slate-200 hover:bg-slate-50 hover:shadow-sm dark:text-adlm-dark-text dark:hover:border-adlm-dark-border dark:hover:bg-white/5"
                    title="Back to dashboard"
                  >
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-100 text-slate-500 transition group-hover:bg-blue-50 group-hover:text-adlm-blue-700 dark:bg-white/10 dark:text-adlm-dark-muted">
                      <FaThLarge className="text-[12px]" />
                    </span>
                    Dashboard
                  </Link>
                  <button
                    type="button"
                    onClick={() => load({ keepSelection: true })}
                    disabled={bulkBusy}
                    title="Refresh projects"
                    className="group flex w-full items-center gap-2.5 rounded-xl border border-transparent px-3 py-2 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:border-slate-200 hover:bg-slate-50 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 dark:text-adlm-dark-text dark:hover:border-adlm-dark-border dark:hover:bg-white/5"
                  >
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-100 text-slate-500 transition group-hover:bg-blue-50 group-hover:text-adlm-blue-700 dark:bg-white/10 dark:text-adlm-dark-muted">
                      <FaSyncAlt className={`text-[12px] ${bulkBusy ? "animate-spin" : ""}`} />
                    </span>
                    {bulkBusy ? "Refreshing…" : "Refresh projects"}
                  </button>
                  {toolNorm === "revit" && (
                    <Link
                      to="/pm-tracker"
                      title="PM Tracker — standalone project schedules (QUIV)"
                      className="group flex items-center gap-2.5 rounded-xl border border-transparent px-3 py-2 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:border-slate-200 hover:bg-slate-50 hover:shadow-sm dark:text-adlm-dark-text dark:hover:border-adlm-dark-border dark:hover:bg-white/5"
                    >
                      <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-100 text-slate-500 transition group-hover:bg-blue-50 group-hover:text-adlm-blue-700 dark:bg-white/10 dark:text-adlm-dark-muted">
                        <FaTasks className="text-[12px]" />
                      </span>
                      <span className="flex-1">PM Tracker</span>
                      <span className="rounded-full bg-adlm-blue-700/10 px-1.5 py-0.5 text-[10px] font-semibold text-adlm-blue-700 dark:bg-adlm-blue-700/20 dark:text-adlm-blue-300">
                        QUIV
                      </span>
                    </Link>
                  )}
                  {canBoqImport && (
                    <button
                      type="button"
                      onClick={() => {
                        setBoqImportErr("");
                        setBoqImportOpen(true);
                      }}
                      title="Create a project from an Excel Bill of Quantities (admin-granted feature)"
                      className="group flex w-full items-center gap-2.5 rounded-xl border border-transparent px-3 py-2 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:border-slate-200 hover:bg-slate-50 hover:shadow-sm dark:text-adlm-dark-text dark:hover:border-adlm-dark-border dark:hover:bg-white/5"
                    >
                      <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-50 text-emerald-600 transition group-hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300">
                        <FaFileExcel className="text-[12px]" />
                      </span>
                      <span className="flex-1 text-left">Import Excel BoQ</span>
                      <span className="rounded-full bg-emerald-600/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                        QUIV
                      </span>
                    </button>
                  )}
                  {/* Portfolio Dashboard sits last — it's the cross-product
                      roll-up you leave the tool for, so it anchors the group. */}
                  <Link
                    to="/portfolio-dashboard"
                    title="Portfolio dashboard — all projects"
                    className="group flex items-center gap-2.5 rounded-xl border border-transparent px-3 py-2 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:border-slate-200 hover:bg-slate-50 hover:shadow-sm dark:text-adlm-dark-text dark:hover:border-adlm-dark-border dark:hover:bg-white/5"
                  >
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-100 text-slate-500 transition group-hover:bg-blue-50 group-hover:text-adlm-blue-700 dark:bg-white/10 dark:text-adlm-dark-muted">
                      <FaChartBar className="text-[12px]" />
                    </span>
                    Portfolio Dashboard
                  </Link>
                </div>
              </div>

              {err && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {err}
                </div>
              )}
              {notice && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  {notice}
                </div>
              )}
            </div>
          </div>
          )}
        </aside>

        {/* MAIN */}
        <main className="flex-1">
          <div className="card">
            {/* HEADER */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="min-w-0">
                {sel ? (
                  <>
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-adlm-dark-dim">
                      <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-adlm-orange" />
                      {title}
                    </div>
                    <h1 className="mt-1 flex items-center gap-2.5 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                      <span aria-hidden="true" className="h-7 w-1.5 rounded-full bg-gradient-to-b from-adlm-orange to-amber-400 flex-shrink-0" />
                      <span className="truncate">{sel?.name || "Untitled project"}</span>
                    </h1>
                  </>
                ) : (
                  <>
                    <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                      <span aria-hidden="true" className="h-6 w-1.5 rounded-full bg-gradient-to-b from-adlm-orange to-amber-400 flex-shrink-0" />
                      <span className="truncate">{title}</span>
                    </h1>
                    <div className="text-xs text-slate-500 dark:text-adlm-dark-muted mt-1">
                      Select a project folder to open
                    </div>
                  </>
                )}
              </div>

              {/* Search projects + Add shared project (always visible) */}
              {!sel && (
                <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center md:w-auto">
                  <div className="w-full md:w-[420px]">
                    <div className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-adlm-dark-border px-3 py-2 bg-white dark:bg-adlm-dark-panel shadow-depth focus-within:ring-2 focus-within:ring-adlm-blue-700/40 transition">
                      <FaSearch className="text-slate-400" />
                      <input
                        className="w-full outline-none text-sm bg-transparent"
                        placeholder="Search projects..."
                        value={projectQuery}
                        onChange={(e) => setProjectQuery(e.target.value)}
                      />
                      {!!projectQuery && (
                        <button
                          type="button"
                          className="text-slate-500 hover:text-slate-700"
                          onClick={() => setProjectQuery("")}
                          title="Clear"
                        >
                          <FaTimes />
                        </button>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setClaimErr("");
                      setClaimUpsell(null);
                      setClaimCode("");
                      setClaimOpen(true);
                    }}
                    title="Add a project a colleague shared with you (enter the share code)"
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-adlm-blue-700 shadow-depth transition hover:-translate-y-0.5 dark:border-adlm-dark-border dark:bg-adlm-dark-panel dark:text-adlm-blue-300"
                  >
                    <FaUserPlus /> Add shared project
                  </button>
                </div>
              )}
            </div>

            {!sel ? (
              <ProjectExplorerGrid
                rowsShown={rowsShown}
                selectedIdsCount={selectedIds.length}
                bulkBusy={bulkBusy}
                selectedMap={selectedMap}
                checkboxCls={checkboxCls}
                onSelectAllShown={selectAllShown}
                onClearSelection={clearSelection}
                onDeleteSelected={() =>
                  deleteMany(selectedIds, {
                    confirmLabel: "Delete selected projects",
                  })
                }
                onDeleteAll={() =>
                  deleteMany(
                    rows.map((row) => rowId(row)).filter(Boolean),
                    {
                      confirmLabel: "Delete ALL projects",
                    },
                  )
                }
                onOpenProject={view}
                onToggleSelect={toggleSelect}
                onDeleteProject={delProject}
                sectionSummary={sectionSummary}
                statusPastLabel={statusPastLabel}
                storageInfo={storageInfo}
              />
            ) : (
              <ProjectOpenView
                actualCoverageCount={actualCoverageCount}
                actualCoveragePercent={actualCoveragePercent}
                actualLatestAt={latestActualDate}
                actualPlannedAmount={plannedActualScopeAmount}
                actualQtyInputs={actualQtyMap}
                actualQtyOverrideCount={actualQtyOverrideCount}
                actualRateInputs={actualRateMap}
                actualRateOverrideCount={actualRateOverrideCount}
                actualTrackedAmount={actualTrackedAmount}
                actualVarianceAmount={actualVarianceAmount}
                actualVariancePercent={actualVariancePercent}
                projectName={sel?.name || "Project"}
                selectedId={selectedId}
                showMaterials={showMaterials}
                statusLabel={statusLabel}
                statusPastLabel={statusPastLabel}
                checkboxCls={checkboxCls}
                onlyFillEmpty={onlyFillEmpty}
                onToggleOnlyFillEmpty={setOnlyFillEmpty}
                canRateGen={canRateGen}
                autoFillMaterialsRates={autoFillMaterialsRates}
                onToggleAutoFill={toggleAutoFill}
                autoFillBusy={autoFillBusy}
                onSyncPrices={() => sel && autoFillMaterialRates(sel)}
                autoFillBoqRates={autoFillBoqRates}
                autoFillBoqBusy={autoFillBoqBusy}
                canRateGenBoq={!showMaterials && canRateGen}
                onSyncBoqRates={() => sel && syncBoqRates(sel)}
                onToggleAutoFillBoq={toggleAutoFillBoq}
                getBoqCandidatesForItem={getBoqCandidatesForItem}
                onPickBoqCandidate={handlePickBoqCandidate}
                openBoqPickKey={openBoqPickKey}
                onToggleOpenBoqPickKey={(key) =>
                  setOpenBoqPickKey((prev) => (prev === key ? null : key))
                }
                onCloseBoqPickKey={() => setOpenBoqPickKey(null)}
                rateSyncEnabled={Boolean(valuationSettings?.rateSyncEnabled)}
                onToggleRateSyncEnabled={(checked) =>
                  handleValuationSettingChange("rateSyncEnabled", checked)
                }
                rateGenPoolCount={rateGenPool.length}
                rateGenPoolLoading={rateGenPoolLoading}
                rateGenPoolLoaded={rateGenPoolLoaded}
                onReloadRateGenPool={loadRateGenPool}
                rateInfoText={
                  showMaterials
                    ? canRateGen
                      ? "Auto-fill uses Admin RateGen and your saved material prices."
                      : "Subscribe to RateGen to auto-fill material prices."
                    : "Update rates, actuals, and completion status, then save to keep the valuation log current."
                }
                linkedGroupsCount={
                  Object.keys(linkedGroups).filter(
                    (groupId) => linkedGroups[groupId],
                  ).length || 0
                }
                isDirty={isDirty}
                saving={saving}
                onSave={saveRatesToCloud}
                exportOpen={exportOpen}
                onToggleExportOpen={() => setExportOpen((value) => !value)}
                onExportGenericBoQ={() => {
                  setExportOpen(false);
                  exportGenericBoQ("category");
                }}
                onExportGenericTradeBoQ={() => {
                  setExportOpen(false);
                  exportGenericBoQ("trade");
                }}
                onExportElementalBoQ={async (buildingType, foundationType, format) => {
                  setExportOpen(false);
                  try {
                    await exportElementalBoQFromBackend(
                      buildingType,
                      foundationType,
                      format || "elemental",
                    );
                  } catch (e) {
                    setErr(e?.message || "Failed to export BoQ");
                  }
                }}
                itemQuery={itemQuery}
                onItemQueryChange={setItemQuery}
                onClearItemQuery={() => setItemQuery("")}
                // Pass the FULL project scope (measured + PC + prelim +
                // variations) so the Overview's "Planned total" matches the
                // BoQ tab's "Project total" and the PM Dashboard's BAC.
                // Previously these passed `grossAmount` (measured only) which
                // silently undercounted users with PC sums / prelims set up.
                grossAmount={fullProjectTotal}
                valuedAmount={fullValuedAmount}
                remainingAmount={fullRemainingAmount}
                dashboardChartMode={valuationSettings?.dashboardChartMode || "pie"}
                onDashboardChartModeChange={(mode) =>
                  handleValuationSettingChange("dashboardChartMode", mode)
                }
                valuations={valuations}
                selectedValuation={selectedValuation}
                selectedValuationDate={selectedValuationDate}
                onSelectValuationDate={setSelectedValuationDate}
                loadingValuations={loadingValuations}
                valuationErr={valuationErr}
                valuationSettings={valuationSettings}
                onValuationSettingChange={handleValuationSettingChange}
                showDailyValuationLog={Boolean(valuationSettings?.showDailyLog)}
                onToggleShowDailyValuationLog={(checked) =>
                  handleValuationSettingChange("showDailyLog", checked)
                }
                showValuationSettings={Boolean(valuationSettings?.showValuationSettings)}
                onToggleShowValuationSettings={(checked) =>
                  handleValuationSettingChange("showValuationSettings", checked)
                }
                showActualColumns={Boolean(valuationSettings?.showActualColumns)}
                onToggleShowActualColumns={(checked) =>
                  handleValuationSettingChange("showActualColumns", checked)
                }
                progressPercent={progressPercent}
                progressCount={progressCount}
                progressTotal={computedAll.length}
                comparisonRows={computedAll}
                computedShown={computedShown}
                items={items}
                budgetItems={sel?.budgetItems || []}
                materialItems={sel?.materialItems || []}
                onSaveBudget={saveBudgetProcurement}
                productKey={toolNorm}
                projectOrigin={sel?.origin || ""}
                projectId={selectedId}
                accessToken={accessToken}
                access={sel?._access}
                linkedSummaries={sel?.linkedSummaries || []}
                onLinkedChange={(updated) => setSel(updated)}
                onDeleteItem={deleteItem}
                onMoveItem={moveItem}
                boqUndoStack={boqUndoStack}
                onBoqUndo={handleBoqUndo}
                onBoqUndoClear={handleBoqUndoClear}
                rates={rates}
                openPickKey={openPickKey}
                onToggleOpenPickKey={(key) =>
                  setOpenPickKey((prev) => (prev === key ? null : key))
                }
                onClosePickKey={() => setOpenPickKey(null)}
                onPickCandidate={handlePickCandidate}
                onRateChange={handleRateChange}
                onSearchRateGen={showMaterials ? searchMaterialRates : searchRateGen}
                onSearchBudgetRates={searchMaterialRates}
                budgetRateGenReady={canRateGen}
                budgetDrivenCodes={budgetDrivenCodes}
                onAddCategory={handleAddCategory}
                onRemoveCategory={handleRemoveCategory}
                onAddTrade={handleAddTrade}
                onActualQtyChange={handleActualQtyChange}
                onActualRateChange={handleActualRateChange}
                onStatusToggle={handleStatusToggle}
                percentMap={percentMap}
                onPercentChange={handlePercentChange}
                onCategoryChange={handleCategoryChange}
                categoryOptions={categoryOptions}
                tradeOptions={tradeOptions}
                onTradeChange={handleTradeChange}
                groupByMode={groupByMode}
                onGroupByModeChange={setGroupByMode}
                contract={contract}
                contractBusy={contractBusy}
                stepUpEnabled={stepUpEnabled}
                onLockContract={handleLockContract}
                onUnlockContract={handleUnlockContract}
                onPreliminaryPercentChange={handlePreliminaryPercentChange}
                certificates={certificates}
                certBusy={certBusy}
                onIssueCertificate={handleIssueCertificate}
                onUpdateCertificate={handleUpdateCertificate}
                onDeleteCertificate={handleDeleteCertificate}
                onDownloadCertificate={handleDownloadCertificate}
                finalAccount={finalAccount}
                onFinalizeAccount={handleFinalizeAccount}
                onReopenFinalAccount={handleReopenFinalAccount}
                onDownloadFinalAccount={handleDownloadFinalAccount}
                projectModels={projectModels}
                modelUploadBusy={modelUploadBusy}
                onUploadModel={handleUploadModel}
                onDeleteModel={handleDeleteModel}
                provisionalSums={provisionalSums}
                onAddProvisionalSum={handleAddProvisionalSum}
                onUpdateProvisionalSum={handleUpdateProvisionalSum}
                onRemoveProvisionalSum={handleRemoveProvisionalSum}
                variations={variations}
                onAddVariation={handleAddVariation}
                onUpdateVariation={handleUpdateVariation}
                onRemoveVariation={handleRemoveVariation}
                preliminaryItems={preliminaryItems}
                onUpdatePreliminaryItem={handleUpdatePreliminaryItem}
                onAddPreliminaryItem={handleAddPreliminaryItem}
                onRemovePreliminaryItem={handleRemovePreliminaryItem}
                onNormalizePreliminaryAllocations={handleNormalizePreliminaryAllocations}
                // Project-total cascade % values (Contingency, Tax/VAT).
                // Editable inline on the Project Total card.
                preliminaryPercent={contract?.preliminaryPercent}
                contingencyPercent={contract?.contingencyPercent}
                taxPercent={contract?.taxPercent}
                onContingencyPercentChange={handleContingencyPercentChange}
                onTaxPercentChange={handleTaxPercentChange}
                onToggleGroupLink={toggleGroupLink}
                isGroupLinked={isGroupLinked}
                getCandidatesForItem={getCandidatesForItem}
                publicShareEnabled={Boolean(sel?.publicShareEnabled)}
                publicToken={sel?.publicToken || null}
                onToggleShare={handleToggleShare}
                pmDashboard={pmDashboard}
                pmSaving={pmSaving}
                pmImporting={pmImporting}
                pmGenerating={pmGenerating}
                pmImportError={pmImportError}
                pmImportErrorCode={pmImportErrorCode}
                onPmDismissImportError={handlePmDismissImportError}
                onPmSave={handlePmSave}
                onPmGenerateFromBoq={handlePmGenerateFromBoq}
                onPmImportFile={handlePmImportFile}
                onPmReset={handlePmReset}
                onPmClearImports={handlePmClearImports}
                onPmReschedule={handlePmReschedule}
                onPmExportCalendar={handlePmExportCalendar}
                onBack={closeProject}
                onDelete={() => delProject(selectedId, sel?.name)}
              />
            )}
          </div>
        </main>
      </div>

      {/* Add-shared-project (claim by code) modal */}
      {claimOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => !claimBusy && setClaimOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-adlm-dark-border dark:bg-adlm-dark-bg">
            <div className="flex items-center justify-between bg-gradient-to-r from-adlm-blue-700 to-adlm-blue-600 px-5 py-4 text-white">
              <div className="flex items-center gap-2.5">
                <FaUserPlus />
                <div className="text-sm font-bold">Add a shared project</div>
              </div>
              <button
                type="button"
                onClick={() => setClaimOpen(false)}
                className="rounded-lg p-1.5 text-white/80 transition hover:bg-white/15 hover:text-white"
                aria-label="Close"
              >
                <FaTimes />
              </button>
            </div>
            <div className="space-y-3 p-5">
              <p className="text-xs text-slate-500 dark:text-adlm-dark-muted">
                Enter the share code a colleague gave you. You'll need the
                matching plugin subscription to open the project.
              </p>
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-adlm-dark-border">
                <FaKey className="text-slate-400" />
                <input
                  autoFocus
                  className="w-full bg-transparent font-mono text-sm tracking-wider outline-none dark:text-adlm-dark-text"
                  placeholder="e.g. ABCDE-FGHIJ"
                  value={claimCode}
                  onChange={(e) => setClaimCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") claimSharedProject();
                  }}
                />
              </div>

              {claimErr ? (
                <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-300">
                  {claimErr}
                  {claimUpsell ? (
                    <div className="mt-2">
                      <Link
                        to={`/product/${claimUpsell.requiredProductKey}`}
                        onClick={() => setClaimOpen(false)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-adlm-orange px-3 py-1.5 text-xs font-bold text-white shadow-glow-orange"
                      >
                        Get {claimUpsell.productName}
                      </Link>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setClaimOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={claimSharedProject}
                  disabled={claimBusy}
                  className="btn-3d inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                >
                  {claimBusy ? "Adding…" : "Add project"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Import Excel BoQ modal (admin-granted Quiv feature) ── */}
      {boqImportOpen ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          onClick={() => {
            if (!boqImportBusy) setBoqImportOpen(false);
          }}
        >
          <div
            className="card w-full max-w-md !p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                  <FaFileExcel className="text-emerald-600" />
                  Import Excel BoQ
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-adlm-dark-muted">
                  Creates a Quiv project from an Excel Bill of Quantities.
                  Categories, planned-vs-actual columns and an optional
                  Material &amp; Labour sheet are read from the workbook — the
                  budget is generated automatically and stays live across the
                  Dashboard, BoQ, Budget and Valuation tabs.
                </p>
              </div>
              <button
                type="button"
                className="text-slate-400 transition hover:text-slate-600"
                onClick={() => setBoqImportOpen(false)}
                title="Close"
              >
                <FaTimes />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <label className="block text-xs font-semibold text-slate-600 dark:text-adlm-dark-muted">
                Project name (optional)
                <input
                  className="input mt-1 w-full"
                  placeholder="Defaults to the file name"
                  value={boqImportName}
                  onChange={(e) => setBoqImportName(e.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600 dark:text-adlm-dark-muted">
                Excel workbook (.xlsx)
                <input
                  type="file"
                  accept=".xlsx,.xlsm"
                  className="input mt-1 w-full"
                  onChange={(e) => setBoqImportFile(e.target.files?.[0] || null)}
                />
              </label>
              <button
                type="button"
                className="text-xs font-semibold text-adlm-blue-700 hover:underline dark:text-adlm-blue-300"
                onClick={downloadBoqTemplate}
              >
                Download the import template
              </button>
              {boqImportErr ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {boqImportErr}
                </div>
              ) : null}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBoqImportOpen(false)}
                disabled={boqImportBusy}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitBoqImport}
                disabled={boqImportBusy || !boqImportFile}
                className="btn-3d inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                {boqImportBusy ? "Importing…" : "Import project"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}






