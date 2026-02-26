import ExcelJS from "exceljs";
import dayjs from "dayjs";

/* -------------------- text helpers -------------------- */

function cellToString(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "object") {
    // ExcelJS rich text
    if (Array.isArray(v.richText)) {
      return v.richText.map((x) => x.text || "").join("");
    }
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

function tokenize(s) {
  const t = normalizeText(s);
  if (!t) return [];
  return t
    .split(" ")
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => x.length >= 2)
    .filter((x) => !STOP.has(x))
    .filter((x) => !/^\d+$/.test(x));
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
  const raw = normalizeText(u);
  if (!raw) return "";

  // takeoff side common units
  if (raw === "m2" || raw === "m²" || raw === "sqm" || raw === "sq m")
    return "sq.m";
  if (raw === "m3" || raw === "m³" || raw === "cum" || raw === "cu m")
    return "cu.m";
  if (raw === "m" || raw === "lm" || raw === "lin m" || raw === "lin.m")
    return "lin.m";
  if (raw === "no" || raw === "nr" || raw === "nos" || raw === "number")
    return "nr.";
  if (raw === "ton" || raw === "tons" || raw === "t" || raw === "tonne")
    return "tonnes";

  // template side often uses these exact spellings:
  if (raw === "sq.m" || raw === "cu.m" || raw === "lin.m") return raw;
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

/* -------------------- template parsing -------------------- */

function isItemCode(v) {
  const s = normSpace(v);
  if (!s) return false;
  return /^[A-Z]{1,2}$/.test(s) || /^\d+(\.\d+)?$/.test(s);
}

/**
 * Your template has "ITEM / DESCRIPTION / UNIT / QTY / RATE / AMOUNT" at row 1.
 * Many lines are 2-row lines: code+partial desc (row X), then unit/qty/rate (row X+1).
 * We treat the row that has UNIT as the "detail row" where QTY+RATE should be written.
 */
function extractTemplateLines(ws) {
  const lines = [];

  ws.eachRow((row, rowNumber) => {
    if (rowNumber < 2) return;

    const unitCell = row.getCell(3);
    const unit = normSpace(cellToString(unitCell.value));
    if (!unit) return;

    const itemRaw = row.getCell(1).value;
    const descRaw = row.getCell(2).value;

    const prevRow = ws.getRow(rowNumber - 1);
    const prevItemRaw = prevRow?.getCell(1)?.value;
    const prevDescRaw = prevRow?.getCell(2)?.value;

    const item = isItemCode(cellToString(itemRaw))
      ? cellToString(itemRaw)
      : null;
    const prevItem = isItemCode(cellToString(prevItemRaw))
      ? cellToString(prevItemRaw)
      : null;

    const desc = normSpace(cellToString(descRaw));
    const prevDesc = normSpace(cellToString(prevDescRaw));

    const itemCode = item || prevItem || "";

    const fullDesc =
      !item && prevItem && prevDesc ? normSpace(`${prevDesc} ${desc}`) : desc;

    // ignore “carry / collection” type lines if they ever have units
    const ignore =
      /carried to summary|to collection|from page|collection/i.test(fullDesc);

    if (ignore) return;

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

function getCell(ws, addr) {
  return ws.getCell(addr);
}

function parseDirectRefFormula(formula) {
  // formula from ExcelJS is without leading "=" (e.g. "D8")
  const m = String(formula || "")
    .trim()
    .match(/^([A-Z]{1,3})(\d+)$/i);
  if (!m) return null;
  return { col: m[1].toUpperCase(), row: Number(m[2]) };
}

function setNumberCellPreserveFormulaRefs(ws, addr, value) {
  const cell = getCell(ws, addr);

  // If it's a simple direct reference (e.g. =D8), update the referenced cell instead
  if (cell?.value && typeof cell.value === "object" && cell.value.formula) {
    const ref = parseDirectRefFormula(cell.value.formula);
    if (ref) {
      ws.getCell(`${ref.col}${ref.row}`).value = safeNum(value);
      return { updated: `${ref.col}${ref.row}`, mode: "follow-ref" };
    }
  }

  // Otherwise overwrite the cell
  cell.value = safeNum(value);
  return { updated: addr, mode: "overwrite" };
}

/* -------------------- matching -------------------- */

function matchLine(takeoff, templateLines) {
  const tTokens = tokenize(takeoff.description);
  if (!tTokens.length) return null;

  let best = null;

  for (const ln of templateLines) {
    // unit must match strongly (prevents slab m3 matching a lin.m formwork line)
    const unitOk = sameUnit(takeoff.unit, ln.unit);
    if (!unitOk) continue;

    const score = jaccardScore(tTokens, ln.tokens);

    // small bonus if one contains the other as substring
    const a = normalizeText(takeoff.description);
    const b = normalizeText(ln.desc);
    const containsBonus = a.includes(b) || b.includes(a) ? 0.15 : 0;

    const finalScore = score + containsBonus;

    if (!best || finalScore > best.score) {
      best = { line: ln, score: finalScore };
    }
  }

  return best;
}

/* -------------------- public API -------------------- */

/**
 * Export BoQ using your formatted template.
 * - Clears all numeric QTY cells in the template (so old sample values don’t remain)
 * - Auto-matches takeoff items -> template rows (by unit + description similarity)
 * - Writes QTY (and RATE if provided) into template
 * - Adds a "Mapping" sheet for audit/debug
 */
export async function exportBoqFromTemplate({
  templatePath,
  projectName = "Project",
  items = [],
  options = {},
}) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);

  const ws = workbook.worksheets[0]; // your file is a single sheet: "MAIN BUILDING BOQ"

  const templateLines = extractTemplateLines(ws);

  // 1) Clear numeric QTY cells (Column D) for all template lines
  //    Keep formulas untouched (they’ll recompute from cleared drivers).
  for (const ln of templateLines) {
    const qtyCell = ws.getCell(`D${ln.row}`);
    const v = qtyCell.value;

    const isFormula =
      v && typeof v === "object" && typeof v.formula === "string";
    if (!isFormula && typeof v === "number") {
      qtyCell.value = 0;
    }
    if (!isFormula && (v == null || v === "")) {
      // keep blank
    }
  }

  // 2) Normalize takeoff items
  const takeoffs = (Array.isArray(items) ? items : [])
    .map((it, idx) => {
      const desc = String(
        it?.description || it?.name || it?.takeoffLine || "",
      ).trim();
      const unit = String(it?.unit || "").trim();
      const qty = safeNum(it?.qty);
      const rate = safeNum(it?.rate);
      return {
        idx,
        sn: it?.sn ?? idx + 1,
        description: desc,
        unit,
        qty,
        rate,
      };
    })
    .filter((x) => x.description && x.qty > 0);

  // 3) Match + aggregate by template row
  const agg = new Map(); // row -> { qty, rate, hits[] }
  const mappingRows = [];

  const THRESH = Number(options.matchThreshold ?? 0.28);

  for (const t of takeoffs) {
    const best = matchLine(t, templateLines);

    if (!best || best.score < THRESH) {
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
        score: best ? best.score : 0,
        action: "UNMATCHED",
      });
      continue;
    }

    const row = best.line.row;
    const cur = agg.get(row) || {
      qty: 0,
      rate: 0,
      template: best.line,
      hits: 0,
    };

    cur.qty += t.qty;

    // pick a reasonable rate:
    // - if template already has a rate and takeoff has none, leave template as-is later
    // - if takeoff has rate, we set/override
    if (t.rate > 0) {
      // if different rates come in, keep the latest non-zero
      cur.rate = t.rate;
    }

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
      score: best.score,
      action: "MATCHED",
    });
  }

  // 4) Write values into template
  for (const [row, v] of agg.entries()) {
    // Qty goes to D
    const qtyRes = setNumberCellPreserveFormulaRefs(
      ws,
      `D${row}`,
      round2(v.qty),
    );

    // Rate goes to E (only if we got a rate from takeoff)
    if (v.rate > 0) {
      setNumberCellPreserveFormulaRefs(ws, `E${row}`, round2(v.rate));
    }

    // (We do NOT touch Amount column F, it has formulas in your template)
    // You’ll get correct totals when opened in Excel.
    void qtyRes;
  }

  // 5) Add mapping audit sheet (very useful to refine matching)
  let mapWs = workbook.getWorksheet("Mapping");
  if (mapWs) {
    workbook.removeWorksheet(mapWs.id);
  }
  mapWs = workbook.addWorksheet("Mapping");

  mapWs.columns = [
    { header: "S/N", key: "sn", width: 8 },
    { header: "Takeoff Description", key: "takeoffDesc", width: 55 },
    { header: "Unit", key: "unit", width: 10 },
    { header: "Qty", key: "qty", width: 12 },
    { header: "Rate", key: "rate", width: 14 },
    { header: "Matched Row", key: "matchedRow", width: 12 },
    { header: "Template Item", key: "templateItem", width: 12 },
    { header: "Template Description", key: "templateDesc", width: 55 },
    { header: "Template Unit", key: "templateUnit", width: 12 },
    { header: "Score", key: "score", width: 10 },
    { header: "Action", key: "action", width: 12 },
  ];

  for (const r of mappingRows) {
    mapWs.addRow({
      ...r,
      qty: round2(r.qty),
      rate: round2(r.rate),
      score: round2(r.score),
    });
  }

  mapWs.getRow(1).font = { bold: true };

  // Optional metadata
  mapWs.addRow([]);
  mapWs.addRow(["Project", projectName]);
  mapWs.addRow(["Exported At", dayjs().format("YYYY-MM-DD HH:mm")]);
  mapWs.addRow(["Match Threshold", THRESH]);

  // 6) Return file buffer
  const buf = await workbook.xlsx.writeBuffer();

  const safeName = String(projectName || "Project")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

  return {
    buffer: Buffer.from(buf),
    filename: `${safeName} - Elemental BOQ.xlsx`,
  };
}
