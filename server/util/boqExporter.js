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

/* -------------------- template detection -------------------- */

function looksLikeBoqHeaderRow(ws) {
  const r1 = ws.getRow(1);
  const a = normalizeText(cellToString(r1.getCell(1).value));
  const b = normalizeText(cellToString(r1.getCell(2).value));
  const c = normalizeText(cellToString(r1.getCell(3).value));
  const d = normalizeText(cellToString(r1.getCell(4).value));
  const e = normalizeText(cellToString(r1.getCell(5).value));
  const f = normalizeText(cellToString(r1.getCell(6).value));

  // Your template header is typically:
  // ITEM | DESCRIPTION | UNIT | QTY | RATE | AMOUNT
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
  // Prefer sheet name containing BOQ
  const byName = workbook.worksheets.find((w) =>
    String(w.name || "")
      .toLowerCase()
      .includes("boq"),
  );
  if (byName) return byName;

  // Else find by header row signature
  const byHeader = workbook.worksheets.find(looksLikeBoqHeaderRow);
  return byHeader || workbook.worksheets[0];
}

/* -------------------- template parsing -------------------- */

function isItemCode(v) {
  const s = normSpace(v);
  if (!s) return false;
  return /^[A-Z]{1,2}$/.test(s) || /^\d+(\.\d+)?$/.test(s);
}

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

/* -------------------- matching -------------------- */

function matchLine(takeoff, templateLines) {
  const tTokens = tokenize(takeoff.description);
  if (!tTokens.length) return null;

  let best = null;

  for (const ln of templateLines) {
    if (!sameUnit(takeoff.unit, ln.unit)) continue;

    const score = jaccardScore(tTokens, ln.tokens);

    const a = normalizeText(takeoff.description);
    const b = normalizeText(ln.desc);
    const containsBonus = a.includes(b) || b.includes(a) ? 0.15 : 0;

    const finalScore = score + containsBonus;

    if (!best || finalScore > best.score)
      best = { line: ln, score: finalScore };
  }

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

  // Clear numeric QTY cells (Column D) for all template lines
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

  const agg = new Map();
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
      score: best.score,
      action: "MATCHED",
    });
  }

  // Write values into template: QTY -> D, RATE -> E (Amount F stays formula)
  for (const [row, v] of agg.entries()) {
    setNumberCellPreserveFormulaRefs(ws, `D${row}`, round2(v.qty));
    if (v.rate > 0)
      setNumberCellPreserveFormulaRefs(ws, `E${row}`, round2(v.rate));
  }

  // Mapping sheet
  const existing = workbook.getWorksheet("Mapping");
  if (existing) workbook.removeWorksheet(existing.id);

  const mapWs = workbook.addWorksheet("Mapping");
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
