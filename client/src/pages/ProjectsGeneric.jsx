// src/pages/ProjectsGeneric.jsx
import React from "react";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { API_BASE } from "../config";
import {
  FaInfoCircle,
  FaSearch,
  FaTimes,
  FaFolder,
  FaCubes,
  FaArrowLeft,
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

  if (t === "revit-materials" || t === "revit-material") {
    return {
      list: "/projects/revit/materials",
      one: (id) => "/projects/revit/materials/" + id,
      bySlug: (slug) => "/projects/revit/materials/by-slug/" + slug,
      del: (id) => "/projects/revit/materials/" + id,
      valuations: (id) => "/projects/revit/materials/" + id + "/valuations",
      share: (id) => "/projects/revit/materials/" + id + "/share",
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
    };
  }

  return {
    list: "/projects/" + t,
    one: (id) => "/projects/" + t + "/" + id,
    bySlug: (slug) => "/projects/" + t + "/by-slug/" + slug,
    del: (id) => "/projects/" + t + "/" + id,
    valuations: (id) => "/projects/" + t + "/" + id + "/valuations",
    share: (id) => "/projects/" + t + "/" + id + "/share",
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
    A.rateSyncEnabled === B.rateSyncEnabled
  );
}

function summarizeProjectItems(items, statusField) {
  const safeItems = Array.isArray(items) ? items : [];
  const itemCount = safeItems.length;
  let markedCount = 0;
  let totalCost = 0;
  let valuedAmount = 0;

  safeItems.forEach((item) => {
    const lineAmount = safeNum(item?.qty) * safeNum(item?.rate);
    totalCost += lineAmount;
    if (item?.[statusField]) {
      markedCount += 1;
      valuedAmount += lineAmount;
    }
  });

  return {
    itemCount,
    markedCount,
    totalCost,
    valuedAmount,
    remainingAmount: totalCost - valuedAmount,
    progressPercent: itemCount ? (markedCount / itemCount) * 100 : 0,
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
  const [searchParams, setSearchParams] = useSearchParams();

  const toolNorm = normTool(tool);
  const endpoints = React.useMemo(() => getEndpoints(tool), [tool]);

  const showMaterials = isMaterialsTool(tool);
  // Show Takeoffs / Materials toggle for tools that have both modes
  const toolFamily = toolNorm === "revit" || toolNorm === "revit-materials" || toolNorm === "revit-material"
    ? "revit"
    : toolNorm === "planswift" || toolNorm === "planswift-materials" || toolNorm === "planswift-material"
      ? "planswift"
      : null;
  const showRevitToggle = Boolean(toolFamily);
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
  const [categoryMap, setCategoryMap] = React.useState({});
  const [baseCategoryMap, setBaseCategoryMap] = React.useState({});
  const [tradeMap, setTradeMap] = React.useState({});
  const [baseTradeMap, setBaseTradeMap] = React.useState({});
  // "category" (default) | "trade" — controls how the BoQ table groups rows
  const [groupByMode, setGroupByMode] = React.useState("category");
  const [provisionalSums, setProvisionalSums] = React.useState([]);
  const [baseProvisionalSums, setBaseProvisionalSums] = React.useState([]);
  const [variations, setVariations] = React.useState([]);
  const [baseVariations, setBaseVariations] = React.useState([]);
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
  const [valuations, setValuations] = React.useState([]);
  const [valuationErr, setValuationErr] = React.useState("");
  const [loadingValuations, setLoadingValuations] = React.useState(false);
  const [selectedValuationDate, setSelectedValuationDate] = React.useState("");

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
      baseStatuses[k] = Boolean(its[i]?.[statusField]);
      uiStatuses[k] = Boolean(its[i]?.[statusField]);
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
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("project");
      return next;
    });
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

  async function load({ keepSelection = true } = {}) {
    setErr("");
    setNotice("");

    try {
      const list = await apiAuthed(endpoints.list, { token: accessToken });
      const safeList = Array.isArray(list) ? list : [];
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
      await loadValuations(p?._id || p?.id || id);
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

    setBulkBusy(true);
    setErr("");
    setNotice("");

    try {
      const results = await Promise.allSettled(
        uniq.map((id) =>
          apiAuthed(endpoints.del(id), {
            token: accessToken,
            method: "DELETE",
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
      await apiAuthed(endpoints.del(id), {
        token: accessToken,
        method: "DELETE",
      });

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
      next.splice(idx, 1);
      return next;
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

  const isDirty =
    !ratesEqual(rates, baseRates) ||
    !optionalNumberMapsEqual(actualQtyMap, baseActualQtyMap) ||
    !optionalNumberMapsEqual(actualRateMap, baseActualRateMap) ||
    !statusMapsEqual(statusMap, baseStatusMap) ||
    !categoryMapsEqual(categoryMap, baseCategoryMap) ||
    !categoryMapsEqual(tradeMap, baseTradeMap) ||
    !provisionalSumsEqual(provisionalSums, baseProvisionalSums) ||
    !variationsEqual(variations, baseVariations) ||
    !valuationSettingsEqual(valuationSettings, baseValuationSettings);

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
      };
      const updated = await apiAuthed(endpoints.one(selectedId), {
        token: accessToken,
        method: "PUT",
        body: payload,
      });
      setSel(updated);
      initRatesFromProject(updated);
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
    its.splice(rowIndex, 1);
    setSel((prev) => (prev ? { ...prev, items: its } : prev));
    // clear rate/status caches for the removed index
    setRates((prev) => {
      const next = {};
      its.forEach((it, i) => { next[itemKey(it, i)] = prev?.[itemKey(it, i)] ?? ""; });
      return next;
    });
  }

  function moveItem(fromIndex, toIndex) {
    if (!sel) return;
    const its = Array.isArray(sel?.items) ? [...sel.items] : [];
    if (fromIndex < 0 || fromIndex >= its.length) return;
    if (toIndex < 0 || toIndex >= its.length) return;
    if (fromIndex === toIndex) return;
    const [moved] = its.splice(fromIndex, 1);
    its.splice(toIndex, 0, moved);
    setSel((prev) => (prev ? { ...prev, items: its } : prev));
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

    const masterRows = Array.isArray(m?.materials) ? m.materials : [];
    const userRows = Array.isArray(lib?.materials) ? lib.materials : [];

    const candidatesByKey = {};

    for (const r of userRows) {
      const cand = toCandidate(r, "My Library");
      const nameKey = normalizeMaterialName(cand.description);
      if (!cand.description || cand.price <= 0) continue;
      pushCand(candidatesByKey, nameKey, cand);
    }

    for (const r of masterRows) {
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
      amount: isMarked ? 0 : fullAmount,
      valuedAmount: isMarked ? fullAmount : 0,
      isMarked,
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
  const progressCount = computedAll.filter((row) => row.isMarked).length;
  const progressPercent = computedAll.length
    ? (progressCount / computedAll.length) * 100
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
  const actualTrackedAmount = actualRows.reduce(
    (acc, row) => acc + safeNum(row.actualAmount),
    0,
  );
  const actualVarianceAmount = actualTrackedAmount - plannedActualScopeAmount;
  const actualVariancePercent = plannedActualScopeAmount > 0
    ? (actualVarianceAmount / plannedActualScopeAmount) * 100
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
      totalCost: grossAmount,
      valuedAmount,
      remainingAmount: totalAmount,
      progressPercent,
      actualCoverageCount,
      actualTrackedAmount,
      actualVarianceAmount,
    }),
    [
      computedAll.length,
      progressCount,
      grossAmount,
      valuedAmount,
      totalAmount,
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

  const categoryOptions = React.useMemo(
    () => allCategoriesForProductKey(toolNorm),
    [toolNorm],
  );

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

    // One sheet per category that has items.
    for (const cat of orderedCats) {
      const rows = byCategory.get(cat) || [];
      if (!rows.length) continue;

      const subtotal = rows.reduce(
        (acc, r) => acc + safeNum(r.fullAmount),
        0,
      );
      const aoa = [
        headers,
        ...rows.map((row, i) => [
          i + 1,
          row.description,
          Number(row.qty.toFixed(2)),
          row.unit,
          Number(row.rate.toFixed(2)),
          Number(row.fullAmount.toFixed(2)),
        ]),
        ["", "", "", "", "SUBTOTAL", Number(subtotal.toFixed(2))],
      ];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = cols;
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
      ...(variationsTotal !== 0
        ? [["Variations", cleanedVariations.length, Number(variationsTotal.toFixed(2))]]
        : []),
      [
        "PROJECT TOTAL",
        computedAll.length + cleanedProvSums.length + cleanedVariations.length,
        Number((grossAmount + provTotal + variationsTotal).toFixed(2)),
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

  // checkbox styling: no surrounding border look
  const checkboxCls =
    "h-4 w-4 accent-blue-600 border-0 outline-none ring-0 focus:ring-0 focus:outline-none";

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-4">
        {/* SIDEBAR */}
        <aside className="md:w-[260px]">
          <div className="card">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <SidebarIcon className="text-adlm-blue-700" />
              </div>
              <div className="min-w-0">
                <div className="text-xs text-slate-500">{sidebarMeta.app}</div>
                <div className="font-semibold truncate">
                  {sidebarMeta.section}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {sidebarMeta.hint}
                </div>
              </div>
            </div>

            {/* Back to dashboard */}
            <div className="mt-4">
              <Link
                to={DASHBOARD_PATH}
                className="w-full inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm border hover:bg-slate-50 transition"
                title="Back to dashboard"
              >
                <FaArrowLeft />
                Back to dashboard
              </Link>
            </div>

            {showRevitToggle && (
              <div className="mt-4 space-y-2">
                <Link
                  to={`/projects/${toolFamily}`}
                  className={[
                    "w-full inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm border transition",
                    toolNorm === toolFamily
                      ? "bg-adlm-blue-700 text-white border-adlm-blue-700"
                      : "hover:bg-slate-50",
                  ].join(" ")}
                >
                  <FaFolder />
                  Takeoffs
                </Link>

                <Link
                  to={`/projects/${toolFamily}-materials`}
                  className={[
                    "w-full inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm border transition",
                    isMaterialsTool(tool)
                      ? "bg-adlm-blue-700 text-white border-adlm-blue-700"
                      : "hover:bg-slate-50",
                  ].join(" ")}
                >
                  <FaCubes />
                  Materials
                </Link>
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <button
                className="btn btn-sm"
                onClick={() => load({ keepSelection: true })}
                disabled={bulkBusy}
                title="Refresh projects"
              >
                Refresh
              </button>

              {!!sel && (
                <button
                  className="btn btn-sm"
                  onClick={closeProject}
                  title="Back to projects"
                >
                  <span className="inline-flex items-center gap-2">
                    <FaArrowLeft /> Back
                  </span>
                </button>
              )}
            </div>

            {err && <div className="text-red-600 text-sm mt-3">{err}</div>}
            {notice && (
              <div className="text-green-700 text-sm mt-3">{notice}</div>
            )}
          </div>
        </aside>

        {/* MAIN */}
        <main className="flex-1">
          <div className="card">
            {/* HEADER */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="min-w-0">
                <h1 className="font-semibold truncate">{title}</h1>
                <div className="text-xs text-slate-500 mt-1">
                  {sel ? (
                    <>
                      <span className="text-slate-600">Opened:</span>{" "}
                      <b className="text-slate-800">{sel?.name}</b>
                    </>
                  ) : (
                    "Select a project folder to open"
                  )}
                </div>
              </div>

              {/* Search projects (always visible) */}
              {!sel && (
                <div className="w-full md:w-[420px]">
                  <div className="flex items-center gap-2 border rounded-md px-2 py-2 bg-white">
                    <FaSearch className="text-slate-500" />
                    <input
                      className="w-full outline-none text-sm"
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
                grossAmount={grossAmount}
                valuedAmount={valuedAmount}
                remainingAmount={totalAmount}
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
                onDeleteItem={deleteItem}
                onMoveItem={moveItem}
                rates={rates}
                openPickKey={openPickKey}
                onToggleOpenPickKey={(key) =>
                  setOpenPickKey((prev) => (prev === key ? null : key))
                }
                onClosePickKey={() => setOpenPickKey(null)}
                onPickCandidate={handlePickCandidate}
                onRateChange={handleRateChange}
                onSearchRateGen={searchRateGen}
                onActualQtyChange={handleActualQtyChange}
                onActualRateChange={handleActualRateChange}
                onStatusToggle={handleStatusToggle}
                onCategoryChange={handleCategoryChange}
                categoryOptions={categoryOptions}
                tradeOptions={tradesForProductKey(toolNorm)}
                onTradeChange={handleTradeChange}
                groupByMode={groupByMode}
                onGroupByModeChange={setGroupByMode}
                provisionalSums={provisionalSums}
                onAddProvisionalSum={handleAddProvisionalSum}
                onUpdateProvisionalSum={handleUpdateProvisionalSum}
                onRemoveProvisionalSum={handleRemoveProvisionalSum}
                variations={variations}
                onAddVariation={handleAddVariation}
                onUpdateVariation={handleUpdateVariation}
                onRemoveVariation={handleRemoveVariation}
                onToggleGroupLink={toggleGroupLink}
                isGroupLinked={isGroupLinked}
                getCandidatesForItem={getCandidatesForItem}
                publicShareEnabled={Boolean(sel?.publicShareEnabled)}
                publicToken={sel?.publicToken || null}
                onToggleShare={handleToggleShare}
                onBack={closeProject}
                onDelete={() => delProject(selectedId, sel?.name)}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}






