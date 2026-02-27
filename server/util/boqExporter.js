// server/util/boqExporter.js
import ExcelJS from "exceljs";
import dayjs from "dayjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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

function updateContext(context, heading) {
  const h = normalizeHeading(heading);
  const low = h.toLowerCase();

  // hard reset on new bill
  if (low.includes("bill nr") || low.startsWith("bill")) return [h];

  // section headers like SUBSTRUCTURE / FRAMES
  const isUpper = h.length <= 40 && h === h.toUpperCase();
  if (isUpper) {
    const bill = context.find((x) => x.toLowerCase().includes("bill")) || "";
    const next = [];
    if (bill) next.push(bill);
    next.push(h);
    return next;
  }

  // numbered subsection like "1.5: EXCAVATING..."
  if (/^\d/.test(h) || h.includes(":")) {
    const bill = context.find((x) => x.toLowerCase().includes("bill")) || "";
    const sec = context.find((x) => x === x.toUpperCase()) || "";
    const next = [];
    if (bill) next.push(bill);
    if (sec) next.push(sec);
    next.push(h);
    return next;
  }

  // small subheading inside a section (e.g. Disposal)
  const keep = context.slice(0, 3);
  keep.push(h);
  return keep.slice(-4);
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

    // ignore totals
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

    if (dist > 20) continue; // very strict
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

  // candidate filtering:
  // - if takeoff is m2/m3 => restrict to area/volume group
  // - otherwise require unit compatibility (includes kg->tonnes)
  const disp = unitDisplayFromTakeoff(takeoff.unit);
  let candidates =
    disp === "m2" || disp === "m3"
      ? candidatesByTakeoffUnit(takeoff.unit, lines)
      : lines.filter((ln) => unitCompatible(takeoff.unit, ln.unit));

  if (!candidates.length) return null;

  const anchors = detectAnchorKeys(tTokens);

  // if takeoff says reinforcement, require reinforcement candidate
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
   Public API
   ========================= */
export async function exportBoqFromTemplate({
  templatePath,
  projectName = "Project",
  items = [],
  options = {},
}) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);

  // Ensure Excel recalculates formulas on open
  workbook.calcProperties.fullCalcOnLoad = true;

  const ws = findBoqWorksheet(workbook);

  // Build template index (with section paths)
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
        description: baseDesc, // used for matching
        rawDescription: rawDesc, // audit
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
      unitOverride: "", // only used for m2/m3 requirement
    };

    // enforce: if takeoff unit is m2/m3, override BOQ unit display to m2/m3
    const uo = unitDisplayFromTakeoff(takeoff.unit);
    if (!cur.unitOverride && (uo === "m2" || uo === "m3"))
      cur.unitOverride = uo;

    agg.set(row, cur);
    return cur;
  }

  for (const t of takeoffs) {
    // 1) Special: openings (doors/windows) by size
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

    // 2) Rule-based mapping
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

      // tie-break by score
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

    // 3) Fallback fuzzy
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

  // Write values into template: UNIT -> C (override), QTY -> D, RATE -> E
  for (const [row, v] of agg.entries()) {
    if (v.unitOverride === "m2" || v.unitOverride === "m3") {
      // ✅ your enforcement
      setTextCellPreserveFormulaRefs(ws, `C${row}`, v.unitOverride);
    }

    setNumberCellPreserveFormulaRefs(ws, `D${row}`, round2(v.qty));
    if (v.rate > 0)
      setNumberCellPreserveFormulaRefs(ws, `E${row}`, round2(v.rate));
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

  // Template index sheet (helps you build mapping JSON accurately)
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
