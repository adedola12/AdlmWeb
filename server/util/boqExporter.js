// server/util/boqExporter.js
import ExcelJS from "exceljs";
import dayjs from "dayjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  allCategoriesForProductKey,
  deriveItemCategory,
  UNCATEGORIZED,
} from "./boqCategory.js";

/* =========================
   Paths
   ========================= */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_MAPPING_PATH = path.join(
  __dirname,
  "..",
  "assets",
  "boq",
  "boq-mapping.json",
);

/* =========================
   Text helpers
   ========================= */
function cellToString(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "object") {
    if (Array.isArray(v.richText))
      return v.richText.map((x) => x.text || "").join("");
    if (typeof v.text === "string") return v.text;
    if (typeof v.formula === "string") return `=${v.formula}`;
    if (v.result != null) return String(v.result);
  }
  return String(v);
}

function normSpace(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(s) {
  return normSpace(String(s || ""))
    .toLowerCase()
    .replace(/–|—/g, "-")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripMetaSuffix(desc) {
  // removes: "Something ... [L:... | T:...]"
  const s = String(desc || "");
  const i = s.indexOf("[L:");
  const j = s.indexOf("[T:");
  let cut = -1;
  if (i >= 0 && j >= 0) cut = Math.min(i, j);
  else if (i >= 0) cut = i;
  else if (j >= 0) cut = j;
  return normSpace(cut >= 0 ? s.slice(0, cut) : s);
}

function parseMeta(desc) {
  // reads meta from "... [L:LEVEL | T:TYPE]"
  const s = String(desc || "");
  const getBetween = (token) => {
    const i = s.indexOf(token);
    if (i < 0) return "";
    const start = i + token.length;
    const end = s.indexOf("]", start);
    return normSpace(end >= 0 ? s.slice(start, end) : s.slice(start));
  };
  return { level: getBetween("[L:"), type: getBetween("[T:") };
}

/* =========================
   Phrase expansions (short -> long)
   ========================= */
const PHRASE_EXPANSIONS = [
  { re: /\bdpm\b/gi, to: "damp proof membrane" },
  { re: /\bdpc\b/gi, to: "damp proof course" },
  { re: /\bbrc\b/gi, to: "reinforcement mesh" },
  { re: /\boversite\b/gi, to: "oversite ground floor slab" },
  { re: /\bstrip\b/gi, to: "strip foundation trench" },
  { re: /\bfooting\b/gi, to: "foundation footing" },
  { re: /\bcompact(?:ing)?\b/gi, to: "leveling compacting" },
];

function expandPhrases(s) {
  let out = String(s || "");
  for (const x of PHRASE_EXPANSIONS) out = out.replace(x.re, x.to);
  return out;
}

/* =========================
   Tokenization + scoring
   ========================= */
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
  "ditto",
  "overall",
  "thick",
  "thickness",
  "less",
  "equal",
  "not",
  "exceeding",
  "maximum",
  "min",
  "max",
]);

const SYN = {
  rebar: "reinforcement",
  bars: "reinforcement",
  bar: "reinforcement",
  steel: "reinforcement",
  mesh: "reinforcement",
  rc: "concrete",
  rcc: "concrete",
  plastering: "render",
  rendering: "render",
};

function tokenize(s) {
  const t = normalizeText(expandPhrases(s));
  if (!t) return [];
  return t
    .split(" ")
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => x.length >= 2)
    .filter((x) => !STOP.has(x))
    .filter((x) => !/^\d+(\.\d+)?$/.test(x))
    .map((x) => SYN[x] || x);
}

function jaccardScore(aTokens, bTokens) {
  const A = new Set(aTokens);
  const B = new Set(bTokens);
  if (!A.size || !B.size) return 0;

  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  const uni = A.size + B.size - inter;
  return uni ? inter / uni : 0;
}

/* =========================
   Unit helpers + conversions
   ========================= */
function normalizeUnit(u) {
  const raw = normalizeText(u).replace("²", "2").replace("³", "3");
  if (!raw) return "";

  // area / volume / length
  if (raw === "m2" || raw === "sqm" || raw === "sq m" || raw === "sq.m")
    return "sq.m";
  if (raw === "m3" || raw === "cum" || raw === "cu m" || raw === "cu.m")
    return "cu.m";
  if (raw === "m" || raw === "lm" || raw === "lin m" || raw === "lin.m")
    return "lin.m";

  // count
  if (
    raw === "no" ||
    raw === "nr" ||
    raw === "nos" ||
    raw === "number" ||
    raw === "nr."
  )
    return "nr.";

  // mass
  if (
    raw === "ton" ||
    raw === "tons" ||
    raw === "t" ||
    raw === "tonne" ||
    raw === "tonnes"
  )
    return "tonnes";

  if (raw === "kg" || raw === "kilogram" || raw === "kilograms") return "kg";
  if (raw === "item") return "item";
  if (raw === "sum") return "sum";

  return raw;
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n) {
  return Math.round(safeNum(n) * 100) / 100;
}

function unitCompatible(fromU, toU) {
  const A = normalizeUnit(fromU);
  const B = normalizeUnit(toU);
  if (!A || !B) return false;
  if (A === B) return true;

  // allow kg -> tonnes mapping when BOQ is tonnes
  if (A === "kg" && B === "tonnes") return true;

  return false;
}

function convertQty(qty, fromU, toU) {
  const A = normalizeUnit(fromU);
  const B = normalizeUnit(toU);
  const q = safeNum(qty);

  if (A === B) return q;
  if (A === "kg" && B === "tonnes") return q / 1000;

  return q;
}

/* =========================
   Unit override enforcement (YOUR REQUIREMENT)
   ========================= */
function unitDisplayFromTakeoff(u) {
  const raw = String(u || "")
    .trim()
    .toLowerCase();
  if (!raw) return "";
  const compact = raw.replace("²", "2").replace("³", "3").replace(/\s+/g, "");
  if (compact === "m2") return "m2";
  if (compact === "m3") return "m3";
  return "";
}

function unitGroup(u) {
  const n = normalizeUnit(u);
  if (!n) return "none";
  if (n === "sq.m") return "area";
  if (n === "cu.m") return "volume";
  if (n === "lin.m") return "length";
  if (n === "nr.") return "count";
  if (n === "tonnes" || n === "kg") return "mass";
  if (n === "item") return "item";
  if (n === "sum") return "sum";
  return "other";
}

function candidatesByTakeoffUnit(takeoffUnitRaw, templateLines) {
  const disp = unitDisplayFromTakeoff(takeoffUnitRaw);
  if (disp === "m2")
    return templateLines.filter((ln) => unitGroup(ln.unit) === "area");
  if (disp === "m3")
    return templateLines.filter((ln) => unitGroup(ln.unit) === "volume");
  return templateLines;
}

/* =========================
   Template sheet detection
   ========================= */
function looksLikeBoqHeaderRow(ws) {
  const r1 = ws.getRow(1);
  const a = normalizeText(cellToString(r1.getCell(1).value));
  const b = normalizeText(cellToString(r1.getCell(2).value));
  const c = normalizeText(cellToString(r1.getCell(3).value));
  const d = normalizeText(cellToString(r1.getCell(4).value));
  const e = normalizeText(cellToString(r1.getCell(5).value));
  const f = normalizeText(cellToString(r1.getCell(6).value));

  return (
    a.includes("item") &&
    b.includes("description") &&
    c.includes("unit") &&
    d.includes("qty") &&
    e.includes("rate") &&
    f.includes("amount")
  );
}

function findBoqWorksheet(workbook) {
  const byName = workbook.worksheets.find((w) =>
    String(w.name || "")
      .toLowerCase()
      .includes("boq"),
  );
  if (byName) return byName;

  const byHeader = workbook.worksheets.find(looksLikeBoqHeaderRow);
  return byHeader || workbook.worksheets[0];
}

/* =========================
   Build BOQ index (context path)
   ========================= */
function isItemCode(v) {
  const s = normSpace(v);
  if (!s) return false;
  return /^[A-Z]{1,2}$/.test(s) || /^\d+(\.\d+)?$/.test(s);
}

function looksLikeHeadingRow(ws, r) {
  const row = ws.getRow(r);
  const a = normSpace(cellToString(row.getCell(1).value));
  const b = normSpace(cellToString(row.getCell(2).value));
  const c = normSpace(cellToString(row.getCell(3).value));
  const d = normSpace(cellToString(row.getCell(4).value));
  const e = normSpace(cellToString(row.getCell(5).value));
  const f = normSpace(cellToString(row.getCell(6).value));

  if (!b) return false;
  if (c || d || e || f) return false; // headings normally have no unit/qty/rate/amount
  if (isItemCode(a)) return false;

  return true;
}

function normalizeHeading(h) {
  return normSpace(h).replace(/\s+/g, " ").trim();
}

function headingLevelFromText(h) {
  const txt = normalizeHeading(h);
  const low = txt.toLowerCase();

  if (low.includes("bill nr") || low.startsWith("bill")) return 0;
  const isUpper = txt.length <= 40 && txt === txt.toUpperCase();
  if (isUpper) return 1;
  if (/^\d/.test(txt) || txt.includes(":")) return 2;
  return 3;
}

function buildDescWithContext(
  ws,
  rowNumber,
  { maxBack = 18, maxBlank = 2 } = {},
) {
  const parts = [];
  let blanks = 0;

  for (let r = rowNumber; r >= 2 && r >= rowNumber - maxBack; r--) {
    const row = ws.getRow(r);

    const a = normSpace(cellToString(row.getCell(1).value));
    const b = normSpace(cellToString(row.getCell(2).value));
    const c = normSpace(cellToString(row.getCell(3).value));
    const d = normSpace(cellToString(row.getCell(4).value));
    const e = normSpace(cellToString(row.getCell(5).value));
    const f = normSpace(cellToString(row.getCell(6).value));

    // stop when we hit previous detail row (has Unit), but not the starting row
    if (r !== rowNumber && c) break;

    const empty = !(a || b || c || d || e || f);
    if (empty) {
      blanks += 1;
      if (blanks > maxBlank) break;
      continue;
    }
    blanks = 0;

    if (b) parts.push(b);
  }

  return normSpace(expandPhrases(parts.reverse().join(" ")));
}

function extractTemplateLinesWithIndex(ws) {
  const lines = [];
  let context = [];

  // reuse the same context rules you used earlier (string-based)
  function updateContext(prev, heading) {
    const h = normalizeHeading(heading);
    const low = h.toLowerCase();

    if (low.includes("bill nr") || low.startsWith("bill")) return [h];

    const isUpper = h.length <= 40 && h === h.toUpperCase();
    if (isUpper) {
      const bill = prev.find((x) => x.toLowerCase().includes("bill")) || "";
      const next = [];
      if (bill) next.push(bill);
      next.push(h);
      return next;
    }

    if (/^\d/.test(h) || h.includes(":")) {
      const bill = prev.find((x) => x.toLowerCase().includes("bill")) || "";
      const sec = prev.find((x) => x === x.toUpperCase()) || "";
      const next = [];
      if (bill) next.push(bill);
      if (sec) next.push(sec);
      next.push(h);
      return next;
    }

    const keep = prev.slice(0, 3);
    keep.push(h);
    return keep.slice(-4);
  }

  ws.eachRow((row, rowNumber) => {
    if (rowNumber < 1) return;

    if (looksLikeHeadingRow(ws, rowNumber)) {
      const heading = normSpace(cellToString(row.getCell(2).value));
      context = updateContext(context, heading);
      return;
    }

    const unit = normSpace(cellToString(row.getCell(3).value));
    if (!unit) return;

    const itemRaw = cellToString(row.getCell(1).value);
    const prevItemRaw = cellToString(
      ws.getRow(rowNumber - 1)?.getCell(1)?.value,
    );

    const item = isItemCode(itemRaw) ? itemRaw : null;
    const prevItem = isItemCode(prevItemRaw) ? prevItemRaw : null;

    const itemCode = item || prevItem || "";
    const fullDesc = buildDescWithContext(ws, rowNumber);

    if (/carried to summary|to collection|from page|collection/i.test(fullDesc))
      return;

    lines.push({
      row: rowNumber,
      itemCode,
      unit: normSpace(unit),
      desc: fullDesc,
      descNorm: normalizeText(fullDesc),
      tokens: tokenize(fullDesc),
      path: (context || []).map((x) => normalizeHeading(x)),
      pathNorm: (context || []).map((x) => normalizeText(x)),
    });
  });

  return lines;
}

/* =========================
   Excel writing helpers
   ========================= */
function parseDirectRefFormula(formula) {
  const m = String(formula || "")
    .trim()
    .match(/^([A-Z]{1,3})(\d+)$/i);
  if (!m) return null;
  return { col: m[1].toUpperCase(), row: Number(m[2]) };
}

function setNumberCellPreserveFormulaRefs(ws, addr, value) {
  const cell = ws.getCell(addr);

  if (cell?.value && typeof cell.value === "object" && cell.value.formula) {
    const ref = parseDirectRefFormula(cell.value.formula);
    if (ref) {
      ws.getCell(`${ref.col}${ref.row}`).value = safeNum(value);
      return;
    }
  }

  cell.value = safeNum(value);
}

function setTextCellPreserveFormulaRefs(ws, addr, text) {
  const cell = ws.getCell(addr);

  if (cell?.value && typeof cell.value === "object" && cell.value.formula) {
    const ref = parseDirectRefFormula(cell.value.formula);
    if (ref) {
      ws.getCell(`${ref.col}${ref.row}`).value = String(text ?? "");
      return;
    }
  }

  cell.value = String(text ?? "");
}

/* =========================
   Mapping rules loader
   ========================= */
function loadMappingConfig() {
  const p =
    String(process.env.BOQ_MAPPING_PATH || "").trim() || DEFAULT_MAPPING_PATH;
  try {
    if (!fs.existsSync(p)) return { rules: [] };
    const raw = fs.readFileSync(p, "utf8");
    const json = JSON.parse(raw);
    const rules = Array.isArray(json?.rules) ? json.rules : [];
    return { rules };
  } catch {
    return { rules: [] };
  }
}

function compileRules(rulesRaw) {
  const compiled = [];

  for (const r of rulesRaw || []) {
    const take = r?.takeoff || {};
    const boq = r?.boq || {};
    const unit = r?.unit || {};

    const reTakeoff =
      take.type === "regex" && take.match ? new RegExp(take.match, "i") : null;

    const sectionIncludes = Array.isArray(boq.sectionIncludes)
      ? boq.sectionIncludes
      : [];
    const descIncludes = Array.isArray(boq.descIncludes)
      ? boq.descIncludes
      : [];

    compiled.push({
      id: r?.id || "rule",
      reTakeoff,
      takeoffStartsWith:
        take.type === "startsWith" ? String(take.value || "") : "",
      itemCode: boq.itemCode ? String(boq.itemCode).trim() : "",
      sectionIncludesNorm: sectionIncludes.map((x) => normalizeText(x)),
      descIncludesNorm: descIncludes.map((x) => normalizeText(x)),
      unitFrom: unit.from ? String(unit.from) : "",
      unitTo: unit.to ? String(unit.to) : "",
    });
  }

  return compiled;
}

function ruleMatchesTakeoff(rule, takeoffBase) {
  if (rule.reTakeoff) return rule.reTakeoff.test(takeoffBase);
  if (rule.takeoffStartsWith)
    return takeoffBase
      .toLowerCase()
      .startsWith(rule.takeoffStartsWith.toLowerCase());
  return false;
}

function lineMatchesRule(rule, line) {
  if (rule.itemCode) {
    const ic = String(line.itemCode || "")
      .trim()
      .toLowerCase();
    if (ic !== rule.itemCode.toLowerCase()) return false;
  }

  if (rule.sectionIncludesNorm.length) {
    const pathStr = line.pathNorm.join(" ");
    const ok = rule.sectionIncludesNorm.every((x) => pathStr.includes(x));
    if (!ok) return false;
  }

  if (rule.descIncludesNorm.length) {
    const dn = line.descNorm;
    const ok = rule.descIncludesNorm.every((x) => dn.includes(x));
    if (!ok) return false;
  }

  return true;
}

/* =========================
   Special match: doors/windows by dimensions
   ========================= */
function parseOpeningTakeoff(desc) {
  const s = stripMetaSuffix(desc);
  const kind = s.toLowerCase().startsWith("door ")
    ? "door"
    : s.toLowerCase().startsWith("window ")
      ? "window"
      : null;
  if (!kind) return null;

  const open = s.lastIndexOf("(");
  const close = s.lastIndexOf(")");
  if (open < 0 || close <= open) return { kind, wMm: 0, hMm: 0 };

  const inner = s
    .slice(open + 1, close)
    .replace(/m/gi, "")
    .trim()
    .replace(/x/gi, "×");

  const parts = inner
    .split("×")
    .map((x) => x.trim())
    .filter(Boolean);

  if (parts.length !== 2) return { kind, wMm: 0, hMm: 0 };

  const wM = Number(parts[0]);
  const hM = Number(parts[1]);
  if (!Number.isFinite(wM) || !Number.isFinite(hM))
    return { kind, wMm: 0, hMm: 0 };

  return { kind, wMm: Math.round(wM * 1000), hMm: Math.round(hM * 1000) };
}

function extractMmPairsFromBoqText(text) {
  const s = String(text || "").replace(/×/g, "x");
  const m = s.match(/(\d{2,5})\s*x\s*(\d{2,5})/i);
  if (!m) return null;
  return { w: Number(m[1]), h: Number(m[2]) };
}

function matchOpeningBySize(takeoff, lines) {
  const info = parseOpeningTakeoff(takeoff.description);
  if (!info || !info.wMm || !info.hMm) return null;

  const candidates = lines.filter((ln) => normalizeUnit(ln.unit) === "nr.");

  let best = null;
  for (const ln of candidates) {
    const pair = extractMmPairsFromBoqText(ln.desc);
    if (!pair) continue;

    const d1 = Math.abs(pair.w - info.wMm) + Math.abs(pair.h - info.hMm);
    const d2 = Math.abs(pair.w - info.hMm) + Math.abs(pair.h - info.wMm);
    const dist = Math.min(d1, d2);

    if (dist > 20) continue;
    if (!best || dist < best.dist) best = { line: ln, score: 1, dist };
  }

  return best;
}

/* =========================
   Anchors for safer fuzzy matching
   ========================= */
const ANCHOR_GROUPS = [
  { keys: new Set(["hardcore"]) },
  { keys: new Set(["laterite"]) },
  { keys: new Set(["membrane", "damp"]) },
  { keys: new Set(["formwork", "soffit", "edges"]) },
  { keys: new Set(["excavation", "excavate", "trench"]) },
  { keys: new Set(["blockwork", "block", "brick"]) },
  { keys: new Set(["reinforcement"]) },
];

function detectAnchorKeys(tokens) {
  const s = new Set(tokens);
  const out = new Set();
  for (const g of ANCHOR_GROUPS) {
    if ([...g.keys].some((k) => s.has(k))) {
      for (const k of g.keys) out.add(k);
    }
  }
  return out;
}

/* =========================
   Fuzzy match
   ========================= */
function fuzzyBestMatch(takeoff, lines) {
  const desc = expandPhrases(takeoff.description || "");
  const tTokens = tokenize(desc);
  if (!tTokens.length) return null;

  const disp = unitDisplayFromTakeoff(takeoff.unit);
  let candidates =
    disp === "m2" || disp === "m3"
      ? candidatesByTakeoffUnit(takeoff.unit, lines)
      : lines.filter((ln) => unitCompatible(takeoff.unit, ln.unit));

  if (!candidates.length) return null;

  const anchors = detectAnchorKeys(tTokens);

  if (anchors.has("reinforcement")) {
    const reinf = candidates.filter((ln) =>
      ln.tokens.includes("reinforcement"),
    );
    if (!reinf.length) return null;
    candidates = reinf;
  } else if (anchors.size) {
    const filtered = candidates.filter((ln) => {
      const s = new Set(ln.tokens);
      for (const k of anchors) if (s.has(k)) return true;
      return false;
    });
    if (filtered.length) candidates = filtered;
  }

  let best = null;

  for (const ln of candidates) {
    const base = jaccardScore(tTokens, ln.tokens);

    const a = normalizeText(desc);
    const b = ln.descNorm;
    const containsBonus = a.includes(b) || b.includes(a) ? 0.15 : 0;

    const overlapAnchors = (() => {
      const A = new Set(tTokens);
      const B = new Set(ln.tokens);
      let n = 0;
      for (const k of anchors) if (A.has(k) && B.has(k)) n += 1;
      return n;
    })();

    const score = base + containsBonus + overlapAnchors * 0.08;

    if (!best || score > best.score) best = { line: ln, score };
  }

  return best;
}

/* =========================
   TRIM UNUSED: build a compact BOQ sheet
   ========================= */
function deepClone(obj) {
  if (!obj) return obj;
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    // fallback shallow clone
    return { ...obj };
  }
}

function getLastRowNumber(ws) {
  return ws.lastRow?.number || ws.rowCount || 1;
}

function rowHasAnyValueAtoF(ws, r) {
  const row = ws.getRow(r);
  for (let c = 1; c <= 6; c++) {
    const v = normSpace(cellToString(row.getCell(c).value));
    if (v) return true;
  }
  return false;
}

function isTotalCarryRow(ws, r) {
  const row = ws.getRow(r);
  const b = normSpace(cellToString(row.getCell(2).value));
  if (!b) return false;
  return /carried to summary|to collection|from page|collection/i.test(b);
}

function rowIsDetail(ws, r) {
  const row = ws.getRow(r);
  const unit = normSpace(cellToString(row.getCell(3).value));
  return !!unit;
}

function copyRowAtoF(
  oldWs,
  newWs,
  oldRowNum,
  newRowNum,
  { forceAmountValue = false } = {},
) {
  const oldRow = oldWs.getRow(oldRowNum);
  const newRow = newWs.getRow(newRowNum);

  newRow.height = oldRow.height;
  newRow.hidden = oldRow.hidden;

  for (let c = 1; c <= 6; c++) {
    const oc = oldRow.getCell(c);
    const nc = newRow.getCell(c);

    nc.value = oc.value;
    nc.style = deepClone(oc.style);
    if (oc.numFmt) nc.numFmt = oc.numFmt;
  }

  if (forceAmountValue) {
    const qty = safeNum(oldRow.getCell(4).value);
    const rate = safeNum(oldRow.getCell(5).value);
    const amount = qty * rate;
    const f = newRow.getCell(6);
    f.value = amount;
    // keep style/numFmt already copied
  }

  newRow.commit?.();
}

function copyColumnsMeta(oldWs, newWs) {
  const cols = [];
  const count = Math.max(6, oldWs.columnCount || 6);

  for (let i = 1; i <= count; i++) {
    const oc = oldWs.getColumn(i);
    cols.push({
      width: oc.width,
      style: deepClone(oc.style),
      hidden: oc.hidden,
      outlineLevel: oc.outlineLevel,
    });
  }
  newWs.columns = cols;

  // basic worksheet settings
  newWs.views = deepClone(oldWs.views);
  newWs.pageSetup = deepClone(oldWs.pageSetup);
  newWs.properties = deepClone(oldWs.properties);
}

function parseAddr(a) {
  const m = String(a || "").match(/^([A-Z]+)(\d+)$/i);
  if (!m) return null;
  return { col: m[1].toUpperCase(), row: Number(m[2]) };
}

function parseMergeRange(rng) {
  const s = String(rng || "");
  const parts = s.split(":");
  if (parts.length !== 2) return null;
  const a = parseAddr(parts[0]);
  const b = parseAddr(parts[1]);
  if (!a || !b) return null;
  return { a, b };
}

function compactBoqWorksheet(workbook, wsOld, usedDetailRowsSet) {
  const oldName = wsOld.name || "BOQ";
  const tmpName = `${oldName}__export_tmp`;

  const newWs = workbook.addWorksheet(tmpName);
  copyColumnsMeta(wsOld, newWs);

  const last = getLastRowNumber(wsOld);

  // heading context levels (store row numbers)
  const ctx = [null, null, null, null];
  let lastWrittenCtx = [null, null, null, null];

  // buffer for item description rows that belong to the NEXT detail row
  let itemBuf = [];
  let lastBufWasBlank = false;

  // map for merges
  const oldToNewRow = new Map();

  function flushHeadingsIfNeeded(newRowCursor) {
    // write only from the first level that changed
    let firstDiff = -1;
    for (let i = 0; i < 4; i++) {
      if (ctx[i] !== lastWrittenCtx[i]) {
        firstDiff = i;
        break;
      }
    }
    if (firstDiff < 0) return newRowCursor;

    for (let i = firstDiff; i < 4; i++) {
      if (ctx[i] != null) {
        // skip totals/collection rows even if they look like headings
        if (!isTotalCarryRow(wsOld, ctx[i])) {
          copyRowAtoF(wsOld, newWs, ctx[i], newRowCursor);
          oldToNewRow.set(ctx[i], newRowCursor);
          newRowCursor += 1;
        }
      }
    }

    lastWrittenCtx = [...ctx];
    return newRowCursor;
  }

  let outRow = 1;

  for (let r = 1; r <= last; r++) {
    // hard skip totals rows everywhere
    if (isTotalCarryRow(wsOld, r)) {
      itemBuf = [];
      lastBufWasBlank = false;
      continue;
    }

    const row = wsOld.getRow(r);

    const bText = normSpace(cellToString(row.getCell(2).value));
    const isHeading = looksLikeHeadingRow(wsOld, r);
    const isDetail = rowIsDetail(wsOld, r);

    // headings update context
    if (isHeading) {
      const lvl = headingLevelFromText(bText);
      ctx[lvl] = r;
      for (let i = lvl + 1; i < 4; i++) ctx[i] = null;

      // headings reset item buffer (new context)
      itemBuf = [];
      lastBufWasBlank = false;
      continue;
    }

    // detail row => either used or unused
    if (isDetail) {
      const isUsed = usedDetailRowsSet.has(r);

      if (!isUsed) {
        // discard item buffer for unused line
        itemBuf = [];
        lastBufWasBlank = false;
        continue;
      }

      // Used detail: write headings (once per context), then buffered description rows, then the detail row
      outRow = flushHeadingsIfNeeded(outRow);

      // write buffered rows (description/notes) that came before this detail row
      for (const rr of itemBuf) {
        copyRowAtoF(wsOld, newWs, rr, outRow);
        oldToNewRow.set(rr, outRow);
        outRow += 1;
      }
      itemBuf = [];
      lastBufWasBlank = false;

      // write the detail row; force amount value (qty * rate) to avoid broken formulas after compaction
      copyRowAtoF(wsOld, newWs, r, outRow, { forceAmountValue: true });
      oldToNewRow.set(r, outRow);
      outRow += 1;

      continue;
    }

    // non-heading, non-detail row
    const hasValue = rowHasAnyValueAtoF(wsOld, r);

    if (!hasValue) {
      // keep max 1 blank row in buffer, only if buffer already has something
      if (itemBuf.length > 0 && !lastBufWasBlank) {
        itemBuf.push(r);
        lastBufWasBlank = true;
      }
      continue;
    }

    // value row: keep as part of upcoming item description block
    itemBuf.push(r);
    lastBufWasBlank = false;
  }

  // copy merges (best effort, mostly horizontal merges)
  const merges = wsOld.model?.merges || [];
  for (const m of merges) {
    const mr = parseMergeRange(m);
    if (!mr) continue;

    const sOld = mr.a.row;
    const eOld = mr.b.row;

    // only apply if all rows in range exist in the new sheet
    let ok = true;
    for (let rr = sOld; rr <= eOld; rr++) {
      if (!oldToNewRow.has(rr)) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    const sNew = oldToNewRow.get(sOld);
    const eNew = oldToNewRow.get(eOld);

    try {
      newWs.mergeCells(`${mr.a.col}${sNew}:${mr.b.col}${eNew}`);
    } catch {
      // ignore merge errors
    }
  }

  // remove old + rename new to old sheet name
  workbook.removeWorksheet(wsOld.id);
  newWs.name = oldName;

  return newWs;
}

/* =========================
   Public API
   ========================= */
export async function exportBoqFromTemplate({
  templatePath,
  projectName = "Project",
  items = [],
  productKey = "",
  options = {},
}) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);

  // Ensure Excel recalculates formulas on open (still useful for other sheets)
  workbook.calcProperties.fullCalcOnLoad = true;

  const ws = findBoqWorksheet(workbook);

  const templateLines = extractTemplateLinesWithIndex(ws);

  // Clear QTY cells on all “writeable” detail rows (keeps formulas in Amount col intact)
  for (const ln of templateLines) {
    const qtyCell = ws.getCell(`D${ln.row}`);
    const v = qtyCell.value;
    const isFormula =
      v && typeof v === "object" && typeof v.formula === "string";
    if (!isFormula) qtyCell.value = 0;
  }

  // Load mapping rules
  const { rules } = loadMappingConfig();
  const compiledRules = compileRules(rules);

  // Normalize takeoffs
  const takeoffs = (Array.isArray(items) ? items : [])
    .map((it, idx) => {
      const rawDesc = String(
        it?.description || it?.name || it?.takeoffLine || "",
      ).trim();

      const baseDesc = stripMetaSuffix(rawDesc);
      const meta = parseMeta(rawDesc);

      return {
        idx,
        sn: it?.sn ?? idx + 1,
        description: baseDesc,
        rawDescription: rawDesc,
        level: meta.level || String(it?.level || ""),
        type: meta.type || String(it?.type || ""),
        unit: String(it?.unit || "").trim(),
        qty: safeNum(it?.qty),
        rate: safeNum(it?.rate),
      };
    })
    .filter((x) => x.description && x.qty > 0);

  const FUZZY_THRESH = Number(options.matchThreshold ?? 0.12);

  // Aggregation: row -> { qty, rate, hits, unitTo, unitOverride }
  const agg = new Map();
  const mappingRows = [];

  function upsertAgg(row, templateLine, takeoff) {
    const cur = agg.get(row) || {
      qty: 0,
      rate: 0,
      hits: 0,
      unitTo: templateLine?.unit || "",
      unitOverride: "",
    };

    const uo = unitDisplayFromTakeoff(takeoff.unit);
    if (!cur.unitOverride && (uo === "m2" || uo === "m3"))
      cur.unitOverride = uo;

    agg.set(row, cur);
    return cur;
  }

  for (const t of takeoffs) {
    // 1) openings by size
    const openHit = matchOpeningBySize(t, templateLines);
    if (openHit) {
      const row = openHit.line.row;
      const cur = upsertAgg(row, openHit.line, t);

      const qtyToWrite = convertQty(t.qty, t.unit, openHit.line.unit);
      cur.qty += qtyToWrite;
      if (t.rate > 0) cur.rate = t.rate;
      cur.hits += 1;

      mappingRows.push({
        sn: t.sn,
        takeoffDesc: t.rawDescription,
        unit: t.unit,
        qty: round2(t.qty),
        matchedRow: row,
        templateItem: openHit.line.itemCode,
        templateUnit: openHit.line.unit,
        templateDesc: openHit.line.desc,
        score: 1,
        action: "MATCHED_DIMENSIONS",
      });
      continue;
    }

    // 2) rule mapping
    let ruleBest = null;
    let ruleBestRule = null;

    for (const rule of compiledRules) {
      if (!ruleMatchesTakeoff(rule, t.description)) continue;

      const candidates = templateLines
        .filter((ln) => {
          if (rule.unitTo)
            return normalizeUnit(ln.unit) === normalizeUnit(rule.unitTo);
          return unitCompatible(t.unit, ln.unit);
        })
        .filter((ln) => lineMatchesRule(rule, ln));

      if (!candidates.length) continue;

      let best = null;
      const tt = tokenize(t.description);
      for (const ln of candidates) {
        const s = jaccardScore(tt, ln.tokens);
        if (!best || s > best.score) best = { line: ln, score: s };
      }

      if (best && (!ruleBest || best.score > ruleBest.score)) {
        ruleBest = best;
        ruleBestRule = rule;
      }
    }

    if (ruleBest && ruleBest.line) {
      const row = ruleBest.line.row;
      const cur = upsertAgg(row, ruleBest.line, t);

      const fromU = ruleBestRule?.unitFrom || t.unit;
      const toU = ruleBestRule?.unitTo || ruleBest.line.unit;
      const qtyToWrite = convertQty(t.qty, fromU, toU);

      cur.qty += qtyToWrite;
      if (t.rate > 0) cur.rate = t.rate;
      cur.hits += 1;

      mappingRows.push({
        sn: t.sn,
        takeoffDesc: t.rawDescription,
        unit: t.unit,
        qty: round2(t.qty),
        matchedRow: row,
        templateItem: ruleBest.line.itemCode,
        templateUnit: ruleBest.line.unit,
        templateDesc: ruleBest.line.desc,
        score: round2(ruleBest.score),
        action: "MATCHED_RULE",
      });
      continue;
    }

    // 3) fuzzy fallback
    const fuzzy = fuzzyBestMatch(t, templateLines);
    if (!fuzzy || fuzzy.score < FUZZY_THRESH) {
      mappingRows.push({
        sn: t.sn,
        takeoffDesc: t.rawDescription,
        unit: t.unit,
        qty: round2(t.qty),
        matchedRow: "",
        templateItem: "",
        templateUnit: "",
        templateDesc: "",
        score: fuzzy ? round2(fuzzy.score) : 0,
        action: "UNMATCHED",
      });
      continue;
    }

    const row = fuzzy.line.row;
    const cur = upsertAgg(row, fuzzy.line, t);

    const qtyToWrite = convertQty(t.qty, t.unit, fuzzy.line.unit);
    cur.qty += qtyToWrite;
    if (t.rate > 0) cur.rate = t.rate;
    cur.hits += 1;

    mappingRows.push({
      sn: t.sn,
      takeoffDesc: t.rawDescription,
      unit: t.unit,
      qty: round2(t.qty),
      matchedRow: row,
      templateItem: fuzzy.line.itemCode,
      templateUnit: fuzzy.line.unit,
      templateDesc: fuzzy.line.desc,
      score: round2(fuzzy.score),
      action: "MATCHED_FUZZY",
    });
  }

  // Write into template before compaction
  for (const [row, v] of agg.entries()) {
    if (v.unitOverride === "m2" || v.unitOverride === "m3") {
      setTextCellPreserveFormulaRefs(ws, `C${row}`, v.unitOverride);
    }
    setNumberCellPreserveFormulaRefs(ws, `D${row}`, round2(v.qty));
    if (v.rate > 0)
      setNumberCellPreserveFormulaRefs(ws, `E${row}`, round2(v.rate));
  }

  // ✅ NEW: TRIM UNUSED ROWS/SECTIONS (default true)
  const trimUnused = options?.trimUnused !== false;

  if (trimUnused) {
    const usedDetailRows = new Set(
      [...agg.entries()]
        .filter(([, v]) => safeNum(v.qty) > 0)
        .map(([row]) => row),
    );

    compactBoqWorksheet(workbook, ws, usedDetailRows);
  }

  // Remove old sheets if they exist
  const oldMap = workbook.getWorksheet("Mapping");
  if (oldMap) workbook.removeWorksheet(oldMap.id);

  const oldIdx = workbook.getWorksheet("TemplateIndex");
  if (oldIdx) workbook.removeWorksheet(oldIdx.id);

  // Mapping sheet (audit)
  const mapWs = workbook.addWorksheet("Mapping");
  mapWs.columns = [
    { header: "S/N", key: "sn", width: 8 },
    { header: "Takeoff Description", key: "takeoffDesc", width: 55 },
    { header: "Unit", key: "unit", width: 10 },
    { header: "Qty", key: "qty", width: 12 },
    { header: "Matched Row", key: "matchedRow", width: 12 },
    { header: "Template Item", key: "templateItem", width: 12 },
    { header: "Template Unit", key: "templateUnit", width: 12 },
    { header: "Template Description", key: "templateDesc", width: 65 },
    { header: "Score", key: "score", width: 10 },
    { header: "Action", key: "action", width: 18 },
  ];
  for (const r of mappingRows) mapWs.addRow(r);
  mapWs.getRow(1).font = { bold: true };
  mapWs.addRow([]);
  mapWs.addRow(["Project", projectName]);
  mapWs.addRow(["Exported At", dayjs().format("YYYY-MM-DD HH:mm")]);
  mapWs.addRow(["Fuzzy Threshold", FUZZY_THRESH]);
  mapWs.addRow(["Rules Loaded", compiledRules.length]);
  mapWs.addRow(["Trim Unused", trimUnused ? "Yes" : "No"]);

  // Template index sheet
  const idxWs = workbook.addWorksheet("TemplateIndex");
  idxWs.columns = [
    { header: "Row", key: "row", width: 8 },
    { header: "Path", key: "path", width: 60 },
    { header: "Item", key: "itemCode", width: 8 },
    { header: "Unit", key: "unit", width: 10 },
    { header: "Description", key: "desc", width: 90 },
  ];
  for (const ln of templateLines) {
    idxWs.addRow({
      row: ln.row,
      path: ln.path.join(" > "),
      itemCode: ln.itemCode,
      unit: ln.unit,
      desc: ln.desc,
    });
  }
  idxWs.getRow(1).font = { bold: true };

  // Grouped per-category sheets + Summary sheet (mirror of the in-app BoQ table grouping).
  appendGroupedCategorySheets(workbook, items, productKey);

  const buf = await workbook.xlsx.writeBuffer();

  const safeName = String(projectName || "Project")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

  return {
    buffer: Buffer.isBuffer(buf) ? buf : Buffer.from(buf),
    filename: `${safeName} - Elemental BOQ.xlsx`,
  };
}

/* =========================
   Grouped category sheets
   ========================= */
function sanitizeSheetName(name, used) {
  const base =
    String(name || "Sheet")
      .trim()
      .replace(/[\[\]:*?\/\\]/g, "-")
      .slice(0, 31) || "Sheet";
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  // Disambiguate (rare) — append " (n)" but keep <=31 chars
  for (let i = 2; i < 100; i++) {
    const suffix = ` (${i})`;
    const truncated = base.slice(0, 31 - suffix.length) + suffix;
    if (!used.has(truncated)) {
      used.add(truncated);
      return truncated;
    }
  }
  used.add(base);
  return base;
}

function appendGroupedCategorySheets(workbook, items, productKey) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return;

  // Group items by category — derive on the fly for any item missing the field.
  const byCategory = new Map();
  for (const it of list) {
    const cat =
      String(it?.category || "").trim() ||
      deriveItemCategory(it, productKey) ||
      UNCATEGORIZED;
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(it);
  }

  const canonical = allCategoriesForProductKey(productKey);
  const orderedCats = [
    ...canonical.filter((c) => byCategory.has(c)),
    ...[...byCategory.keys()].filter((c) => !canonical.includes(c)),
  ];

  const used = new Set(workbook.worksheets.map((w) => w.name));

  const summaryRows = [];
  let grandTotal = 0;

  for (const cat of orderedCats) {
    const rows = byCategory.get(cat) || [];
    if (!rows.length) continue;

    const ws = workbook.addWorksheet(sanitizeSheetName(cat, used));
    ws.columns = [
      { header: "S/N", key: "sn", width: 6 },
      { header: "Description", key: "description", width: 60 },
      { header: "Qty", key: "qty", width: 12 },
      { header: "Unit", key: "unit", width: 10 },
      { header: "Rate", key: "rate", width: 14 },
      { header: "Amount", key: "amount", width: 16 },
    ];
    ws.getRow(1).font = { bold: true };

    let subtotal = 0;
    rows.forEach((it, i) => {
      const qty = safeNum(it?.qty);
      const rate = safeNum(it?.rate);
      const amount = qty * rate;
      subtotal += amount;
      ws.addRow({
        sn: i + 1,
        description: String(it?.description || it?.takeoffLine || "").trim(),
        qty: round2(qty),
        unit: String(it?.unit || ""),
        rate: round2(rate),
        amount: round2(amount),
      });
    });

    const totalRow = ws.addRow({
      sn: "",
      description: "",
      qty: "",
      unit: "",
      rate: "SUBTOTAL",
      amount: round2(subtotal),
    });
    totalRow.font = { bold: true };

    summaryRows.push({ category: cat, count: rows.length, amount: subtotal });
    grandTotal += subtotal;
  }

  const summaryWs = workbook.addWorksheet(sanitizeSheetName("Summary", used));
  summaryWs.columns = [
    { header: "Category", key: "category", width: 24 },
    { header: "Items", key: "count", width: 10 },
    { header: "Amount", key: "amount", width: 18 },
  ];
  summaryWs.getRow(1).font = { bold: true };
  for (const r of summaryRows) {
    summaryWs.addRow({
      category: r.category,
      count: r.count,
      amount: round2(r.amount),
    });
  }
  const totalRow = summaryWs.addRow({
    category: "TOTAL",
    count: summaryRows.reduce((acc, r) => acc + r.count, 0),
    amount: round2(grandTotal),
  });
  totalRow.font = { bold: true };
}
