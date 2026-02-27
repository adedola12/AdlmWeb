// server/util/boqExporter.js
import ExcelJS from "exceljs";
import dayjs from "dayjs";

/* -------------------- text helpers -------------------- */

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

/* -------------------- phrase expansions (VERY IMPORTANT) -------------------- */
/**
 * These expansions make short takeoff labels match long BOQ sentences.
 * Add more as your takeoff naming grows.
 */
const PHRASE_EXPANSIONS = [
  { re: /\bdpm\b/gi, to: "damp proof membrane" },
  { re: /\bdpc\b/gi, to: "damp proof course" },
  { re: /\bbrc\b/gi, to: "reinforcement mesh" },
  { re: /\boversite\b/gi, to: "oversite ground floor slab" },
  { re: /\bstrip\b/gi, to: "strip foundation trench" },
  { re: /\bfooting\b/gi, to: "foundation footing" },
  { re: /\bcompact(?:ing)?\b/gi, to: "leveling compacting" },
  { re: /\bdispose\b/gi, to: "disposal" },
];

function expandPhrases(s) {
  let out = String(s || "");
  for (const x of PHRASE_EXPANSIONS) out = out.replace(x.re, x.to);
  return out;
}

/* -------------------- tokenization -------------------- */

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

/* -------------------- unit helpers -------------------- */

function normalizeUnit(u) {
  const raw = normalizeText(u).replace("²", "2").replace("³", "3");
  if (!raw) return "";

  if (raw === "m2" || raw === "sqm" || raw === "sq m" || raw === "sq.m")
    return "sq.m";
  if (raw === "m3" || raw === "cum" || raw === "cu m" || raw === "cu.m")
    return "cu.m";
  if (raw === "m" || raw === "lm" || raw === "lin m" || raw === "lin.m")
    return "lin.m";
  if (
    raw === "no" ||
    raw === "nr" ||
    raw === "nos" ||
    raw === "number" ||
    raw === "nr."
  )
    return "nr.";
  if (
    raw === "ton" ||
    raw === "tons" ||
    raw === "t" ||
    raw === "tonne" ||
    raw === "tonnes"
  )
    return "tonnes";

  // keep template literals like "item", "sum"
  if (raw === "item" || raw === "sum") return raw;

  return raw;
}

function sameUnit(a, b) {
  const A = normalizeUnit(a);
  const B = normalizeUnit(b);
  return A && B && A === B;
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n) {
  return Math.round(safeNum(n) * 100) / 100;
}

/* -------------------- template detection -------------------- */

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

/* -------------------- template parsing -------------------- */

function isItemCode(v) {
  const s = normSpace(v);
  if (!s) return false;
  return /^[A-Z]{1,2}$/.test(s) || /^\d+(\.\d+)?$/.test(s);
}

/**
 * Key fix:
 * Build each "line description" using multiple context rows above the UNIT row,
 * skipping up to 2 blank spacer rows (your template uses lots of them).
 */
function buildDescWithContext(
  ws,
  rowNumber,
  { maxBack = 14, maxBlank = 2 } = {},
) {
  const parts = [];
  let blanks = 0;

  for (let r = rowNumber; r >= 2 && r >= rowNumber - maxBack; r--) {
    const a = normSpace(cellToString(ws.getRow(r).getCell(1).value));
    const b = normSpace(cellToString(ws.getRow(r).getCell(2).value));
    const c = normSpace(cellToString(ws.getRow(r).getCell(3).value));
    const d = normSpace(cellToString(ws.getRow(r).getCell(4).value));
    const e = normSpace(cellToString(ws.getRow(r).getCell(5).value));
    const f = normSpace(cellToString(ws.getRow(r).getCell(6).value));

    // stop if we reach a previous detail row (unit row), but not the starting row
    if (r !== rowNumber && c) break;

    const rowIsEmpty = !(a || b || c || d || e || f);
    if (rowIsEmpty) {
      blanks += 1;
      if (blanks > maxBlank) break;
      continue;
    }
    blanks = 0;

    if (b) parts.push(b);
  }

  return normSpace(expandPhrases(parts.reverse().join(" ")));
}

function extractTemplateLines(ws) {
  const lines = [];

  ws.eachRow((row, rowNumber) => {
    if (rowNumber < 2) return;

    const unit = normSpace(cellToString(row.getCell(3).value));
    if (!unit) return;

    const itemRaw = cellToString(row.getCell(1).value);
    const prevItemRaw = cellToString(ws.getRow(rowNumber - 1).getCell(1).value);

    const item = isItemCode(itemRaw) ? itemRaw : null;
    const prevItem = isItemCode(prevItemRaw) ? prevItemRaw : null;

    const itemCode = item || prevItem || "";
    const fullDesc = buildDescWithContext(ws, rowNumber);

    // ignore summary/collection totals
    if (/carried to summary|to collection|from page|collection/i.test(fullDesc))
      return;

    lines.push({
      row: rowNumber,
      itemCode,
      desc: fullDesc,
      unit,
      tokens: tokenize(fullDesc),
    });
  });

  return lines;
}

/* -------------------- writing helpers -------------------- */

function parseDirectRefFormula(formula) {
  const m = String(formula || "")
    .trim()
    .match(/^([A-Z]{1,3})(\d+)$/i);
  if (!m) return null;
  return { col: m[1].toUpperCase(), row: Number(m[2]) };
}

function setNumberCellPreserveFormulaRefs(ws, addr, value) {
  const cell = ws.getCell(addr);

  // If it's a simple direct reference (e.g. =D8), update the referenced cell instead
  if (cell?.value && typeof cell.value === "object" && cell.value.formula) {
    const ref = parseDirectRefFormula(cell.value.formula);
    if (ref) {
      ws.getCell(`${ref.col}${ref.row}`).value = safeNum(value);
      return;
    }
  }

  cell.value = safeNum(value);
}

/* -------------------- matching (anchors + scoring) -------------------- */

const ANCHOR_GROUPS = [
  { name: "hardcore", keys: new Set(["hardcore"]) },
  { name: "laterite", keys: new Set(["laterite"]) },
  { name: "membrane", keys: new Set(["membrane", "damp"]) },
  { name: "formwork", keys: new Set(["formwork", "soffit", "edges"]) },
  { name: "excavation", keys: new Set(["excavation", "excavate", "trench"]) },
  { name: "blockwork", keys: new Set(["blockwork", "block", "brick"]) },
  // reinforcement is “hard” because your BOQ reinforcement is in Tonnes
  { name: "reinforcement", keys: new Set(["reinforcement"]) },
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

function matchLine(takeoff, templateLines, { threshold = 0.12 } = {}) {
  const desc = expandPhrases(takeoff.description || "");
  const tTokens = tokenize(desc);

  if (!tTokens.length) return null;

  // filter by unit first
  let candidates = templateLines.filter((ln) =>
    sameUnit(takeoff.unit, ln.unit),
  );
  if (!candidates.length) return null;

  const anchors = detectAnchorKeys(tTokens);

  // If takeoff says "reinforcement" but no candidate contains reinforcement tokens, DO NOT guess.
  const hasReinf = anchors.has("reinforcement");
  if (hasReinf) {
    const reinfCands = candidates.filter((ln) =>
      ln.tokens.includes("reinforcement"),
    );
    if (!reinfCands.length) return null;
    candidates = reinfCands;
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

    // substring bonus (helps when one is a shorter phrase)
    const a = normalizeText(desc);
    const b = normalizeText(ln.desc);
    const containsBonus = a.includes(b) || b.includes(a) ? 0.15 : 0;

    // anchor bonus (reward specific material keywords)
    const overlapAnchors = (() => {
      const A = new Set(tTokens);
      const B = new Set(ln.tokens);
      let n = 0;
      for (const k of anchors) if (A.has(k) && B.has(k)) n += 1;
      return n;
    })();

    const final = base + containsBonus + overlapAnchors * 0.08;

    if (!best || final > best.score) best = { line: ln, score: final };
  }

  if (!best || best.score < threshold) return null;
  return best;
}

/* -------------------- public API -------------------- */

export async function exportBoqFromTemplate({
  templatePath,
  projectName = "Project",
  items = [],
  options = {},
}) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);

  // ensure Excel recalculates formulas when opened
  workbook.calcProperties.fullCalcOnLoad = true;

  const ws = findBoqWorksheet(workbook);
  const templateLines = extractTemplateLines(ws);

  // Clear all QTY cells on lines we consider “writeable”
  // (keeps formulas in Amount column intact)
  for (const ln of templateLines) {
    const qtyCell = ws.getCell(`D${ln.row}`);
    const v = qtyCell.value;
    const isFormula =
      v && typeof v === "object" && typeof v.formula === "string";
    if (!isFormula) qtyCell.value = 0;
  }

  const takeoffs = (Array.isArray(items) ? items : [])
    .map((it, idx) => ({
      idx,
      sn: it?.sn ?? idx + 1,
      description: String(
        it?.description || it?.name || it?.takeoffLine || "",
      ).trim(),
      unit: String(it?.unit || "").trim(),
      qty: safeNum(it?.qty),
      rate: safeNum(it?.rate),
    }))
    .filter((x) => x.description && x.qty > 0);

  const agg = new Map(); // row -> { qty, rate, hits }
  const mappingRows = [];

  const THRESH = Number(options.matchThreshold ?? 0.12);

  for (const t of takeoffs) {
    const best = matchLine(t, templateLines, { threshold: THRESH });

    if (!best) {
      mappingRows.push({
        sn: t.sn,
        takeoffDesc: t.description,
        unit: t.unit,
        qty: t.qty,
        rate: t.rate,
        matchedRow: "",
        templateItem: "",
        templateDesc: "",
        templateUnit: "",
        score: 0,
        action: "UNMATCHED",
      });
      continue;
    }

    const row = best.line.row;
    const cur = agg.get(row) || {
      qty: 0,
      rate: 0,
      hits: 0,
      template: best.line,
    };
    cur.qty += t.qty;
    if (t.rate > 0) cur.rate = t.rate;
    cur.hits += 1;
    agg.set(row, cur);

    mappingRows.push({
      sn: t.sn,
      takeoffDesc: t.description,
      unit: t.unit,
      qty: t.qty,
      rate: t.rate,
      matchedRow: row,
      templateItem: best.line.itemCode,
      templateDesc: best.line.desc,
      templateUnit: best.line.unit,
      score: round2(best.score),
      action: "MATCHED",
    });
  }

  // Write values into template: QTY -> D, RATE -> E (Amount F stays formula)
  for (const [row, v] of agg.entries()) {
    setNumberCellPreserveFormulaRefs(ws, `D${row}`, round2(v.qty));
    if (v.rate > 0)
      setNumberCellPreserveFormulaRefs(ws, `E${row}`, round2(v.rate));
  }

  // Mapping sheet (audit)
  const existing = workbook.getWorksheet("Mapping");
  if (existing) workbook.removeWorksheet(existing.id);

  const mapWs = workbook.addWorksheet("Mapping");
  mapWs.columns = [
    { header: "S/N", key: "sn", width: 8 },
    { header: "Takeoff Description", key: "takeoffDesc", width: 50 },
    { header: "Unit", key: "unit", width: 10 },
    { header: "Qty", key: "qty", width: 12 },
    { header: "Rate", key: "rate", width: 12 },
    { header: "Matched Row", key: "matchedRow", width: 12 },
    { header: "Template Item", key: "templateItem", width: 12 },
    { header: "Template Description", key: "templateDesc", width: 60 },
    { header: "Template Unit", key: "templateUnit", width: 12 },
    { header: "Score", key: "score", width: 10 },
    { header: "Action", key: "action", width: 12 },
  ];

  for (const r of mappingRows) {
    mapWs.addRow({
      ...r,
      qty: round2(r.qty),
      rate: round2(r.rate),
    });
  }

  mapWs.getRow(1).font = { bold: true };
  mapWs.addRow([]);
  mapWs.addRow(["Project", projectName]);
  mapWs.addRow(["Exported At", dayjs().format("YYYY-MM-DD HH:mm")]);
  mapWs.addRow(["Match Threshold", THRESH]);

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
