// Excel Bill-of-Quantities importer for the admin-granted "BoQ Import"
// feature (Quiv). Parses a workbook into the exact shapes TakeoffProject
// stores — bill items[] (+ per-line planned vs actual columns) and optional
// budgetItems[] from Material / Labour schedule sheets — so an imported
// project rides the same budget/valuation/variation pipeline as a
// plugin-synced one.
//
// It understands two families of workbook:
//
// 1. The ADLM template (see buildBoqTemplateWorkbook): "BoQ" sheet with an
//    optional Category column and optional actual-vs-planned columns, plus a
//    "Material & Labour" sheet keyed by an explicit "Bill S/N" column.
//
// 2. Real-world QS bills (BESMM/NRM style), e.g.:
//      - MULTIPLE bill sheets (PRELIMINARY, MAIN BUILDING, EXTERNAL WORKS,
//        GATE HOUSE, SUBSTRUCTURE, …), each with a header row like
//        ITEM|S/N | DESCRIPTION(S) | QTY | UNIT | RATE | AMOUNT|TOTAL
//        somewhere below cover/title rows.
//      - ALL-CAPS section rows ("SUBSTRUCTURE", "FORMWORK") → categories.
//      - Mixed-case description-only rows ("Plain in-situ concrete; mix
//        1:4:8", "Foundations") → preamble context, kept on the item's
//        takeoffLine so related lines group together.
//      - Item letters (A, B, C…) that restart per page — ignored; codes are
//        derived from content so they stay stable across re-imports.
//      - "Item"/"Sum" rows with an amount but no qty (preliminaries) →
//        qty 1 at rate = amount.
//      - "Carried to Collection"/summary rows and hidden sheets → skipped.
//      - MATERIAL SCHEDULE / LABOUR SCHEDULE sheets where a row with a qty
//        but no rate is a bill-line group header and priced rows below it
//        are that line's components; linkage is left to the budget↔bill
//        title linker via takeoffLine.
//
// Bill lines carry a stable content-derived code ("BQ-xxxxxx") so budget
// rows link by billIdentity, procurement marks survive re-imports, and the
// derive/coverage engine can keep bill rates live from the build-up.

import ExcelJS from "exceljs";

// ── generic cell helpers ────────────────────────────────────────────────────

function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/,/g, "").replace(/%$/, "").replace(/^₦|^N(?=\d)/i, "").trim());
  return Number.isFinite(n) ? n : null;
}

// exceljs cell values may be strings, numbers, rich text, formula results,
// hyperlinks or dates — flatten them all to trimmed text.
function cellText(cell) {
  const v = cell?.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) {
      return v.richText.map((r) => r?.text || "").join("").trim();
    }
    if (v.result !== undefined && v.result !== null) return cellText({ value: v.result });
    if (v.text !== undefined) return String(v.text).trim();
    if (v.hyperlink && v.text === undefined) return String(v.hyperlink).trim();
  }
  return String(v).trim();
}

function cellNumber(cell) {
  const v = cell?.value;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v && typeof v === "object" && v.result !== undefined) {
    return num(v.result);
  }
  return num(cellText(cell));
}

function normHeader(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9%/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── header-role detection ───────────────────────────────────────────────────
// Order matters: "actual qty" must win over the bare "qty" matcher, so
// actual/percent roles are tested first.

function boqRoleFor(header) {
  const h = normHeader(header);
  if (!h) return null;
  if (/actual/.test(h) && /(qty|quantity)/.test(h)) return "actualQty";
  if (/actual/.test(h) && /rate/.test(h)) return "actualRate";
  if (/%|percent|progress|complete/.test(h)) return "percentComplete";
  if (/^(s ?\/? ?n|sn|item ?no|item|no|ref)$/.test(h)) return "sn";
  if (/categor/.test(h)) return "category";
  if (/trade|work ?section/.test(h)) return "trade";
  if (/desc/.test(h)) return "description";
  if (/^unit/.test(h)) return "unit";
  if (/(qty|quantity)/.test(h)) return "qty";
  if (/^rate/.test(h)) return "rate";
  if (/amount|total/.test(h)) return "amount";
  return null;
}

function scheduleRoleFor(header) {
  const h = normHeader(header);
  if (!h) return null;
  if (/(bill|boq).*(s ?\/? ?n|sn|ref|item|no)|^(bill|boq)$/.test(h)) return "billRef";
  if (/component|kind|type/.test(h)) return "componentKind";
  if (/desc/.test(h)) return "description";
  if (/^unit/.test(h)) return "unit";
  if (/overhead|^o ?\/? ?h/.test(h)) return "overheadPercent";
  if (/profit/.test(h)) return "profitPercent";
  if (/^(s ?\/? ?n|sn|item|no|ref)$/.test(h)) return "sn";
  if (/(qty|quantity)/.test(h)) return "qty";
  if (/^rate/.test(h)) return "rate";
  if (/amount|total/.test(h)) return "amount";
  return null;
}

// Find the header row (first row whose cells contain a "description"-ish
// header) and return { headerRowNumber, columns: { role -> colNumber } }.
function findHeader(sheet, roleFor, maxScan = 60) {
  const last = Math.min(sheet.rowCount || 0, maxScan);
  for (let r = 1; r <= last; r += 1) {
    const row = sheet.getRow(r);
    const columns = {};
    let hasDescription = false;
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const role = roleFor(cellText(cell));
      if (role && columns[role] === undefined) {
        columns[role] = col;
        if (role === "description") hasDescription = true;
      }
    });
    // A real bill/schedule header names Description AND at least one numeric
    // column — a lone "description" match on a cover page must not win.
    if (hasDescription && (columns.qty !== undefined || columns.rate !== undefined || columns.amount !== undefined)) {
      return { headerRowNumber: r, columns };
    }
  }
  return null;
}

// ── row classification helpers ──────────────────────────────────────────────

function squish(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function isSummaryText(s) {
  const t = String(s || "").trim();
  return (
    /^(grand\s+)?(sub\s*)?total\b|^summary\b|^collections?\b|^carried\s+(to|forward)\b|^brought\s+forward\b|^to\s+collection\b|^page\b|schedule$/i.test(t) ||
    // "Frame carried to summary", "BILL NR 2 … CARRIED TO GENERAL SUMMARY"
    /(carried|c\/?f)\s+(to\s+|forward\s+)?(general\s+)?(summary|collection)/i.test(t)
  );
}

// Section headers whose CONTENT is a roll-up, not measured work ("COLLECTION",
// "SUMMARY") — every row under them repeats amounts already counted on the
// bill pages, so the whole section is skipped to avoid double counting.
function isRollupSection(s) {
  return /^collections?\b|^summary\b|^general\s+summary\b/i.test(String(s || "").trim());
}

// "SUBSTRUCTURE CONT'D" → "SUBSTRUCTURE" so continuation headers merge into
// the original category instead of duplicating it.
function stripContd(s) {
  return String(s || "")
    .replace(/\s*\(?CONT'?D\.?\)?\s*$/i, "")
    .trim();
}

function isAllCapsText(s) {
  const t = String(s || "").trim();
  const letters = t.replace(/[^a-zA-Z]/g, "");
  return letters.length >= 3 && letters === letters.toUpperCase();
}

// "SUBSTRUCTURE (ALL PROVISIONAL)" → "Substructure (All Provisional)".
function titleCaseIfCaps(s) {
  const t = String(s || "").trim();
  if (!isAllCapsText(t)) return t;
  return t.toLowerCase().replace(/(^|[\s(\/&-])([a-z])/g, (m, pre, ch) => pre + ch.toUpperCase());
}

function hasCellStyle(cell) {
  const bold = cell?.font?.bold === true;
  const filled = cell?.fill?.type === "pattern" && cell?.fill?.pattern === "solid";
  return bold && filled;
}

function normalizeComponentKind(s, fallback = "Material") {
  const k = String(s || "").trim().toLowerCase();
  if (!k) return fallback;
  if (k.startsWith("lab")) return "Labour";
  if (k.startsWith("mat")) return "Material";
  if (k.startsWith("plant")) return "Plant";
  if (k.startsWith("equip")) return "Equipment";
  if (k.startsWith("consum")) return "Consumable";
  return fallback;
}

// Stable, content-derived bill code: survives row insertion/deletion across
// re-imports (sequential codes would shift and break procurement merges and
// valuation identity). djb2 over the line's identity, occurrence-suffixed for
// exact duplicates.
function contentHash(s) {
  let h = 5381;
  const str = String(s || "");
  for (let i = 0; i < str.length; i += 1) {
    h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

function importError(message) {
  const err = new Error(message);
  err.statusCode = 400;
  err.code = "BOQ_IMPORT_INVALID";
  return err;
}

// ── sheet classification ────────────────────────────────────────────────────

const SKIP_SHEET_RE = /cover|summary|milestone|read ?me|instruction|note/i;
const SCHEDULE_SHEET_RE = /material|labour|labor/i;

function classifySheets(workbook) {
  const bills = [];
  const schedules = [];
  for (const ws of workbook.worksheets || []) {
    if (ws.state && ws.state !== "visible") continue; // hidden/veryHidden
    const name = String(ws.name || "");
    if (SKIP_SHEET_RE.test(name)) continue;
    if (SCHEDULE_SHEET_RE.test(name)) {
      const header = findHeader(ws, scheduleRoleFor);
      if (header) schedules.push({ ws, header });
      continue;
    }
    const header = findHeader(ws, boqRoleFor);
    if (header) bills.push({ ws, header });
  }
  return { bills, schedules };
}

// ── bill-sheet parsing ──────────────────────────────────────────────────────

function parseBillSheet({ ws, header }, ctx) {
  const cols = header.columns;
  const sheetTitle = titleCaseIfCaps(String(ws.name || "").trim());
  let currentCategory = "";
  let preamble = [];
  let lastRowWasItem = false;
  let inRollupSection = false;
  let parsedRows = 0;

  const text = (row, role) => (cols[role] !== undefined ? squish(cellText(row.getCell(cols[role]))) : "");
  const number = (row, role) => (cols[role] !== undefined ? cellNumber(row.getCell(cols[role])) : null);

  for (let r = header.headerRowNumber + 1; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const description = text(row, "description");
    const unit = text(row, "unit");
    const qty = number(row, "qty");
    const rate = number(row, "rate");
    const amount = number(row, "amount");
    const categoryCell = text(row, "category");

    if (!description && !categoryCell && qty === null && rate === null && amount === null) continue;
    if (isSummaryText(description)) continue;
    if (!description) continue; // stray numbers with no description

    const hasNumbers = qty !== null || rate !== null || amount !== null;

    if (!hasNumbers && !unit && !categoryCell) {
      // Description-only row: a section header (category) when it shouts —
      // ALL CAPS, or bold+filled like the template's section rows — otherwise
      // measured-work preamble kept as grouping context for the items below.
      const isHeaderStyled = isAllCapsText(description) || hasCellStyle(row.getCell(cols.description));
      if (isHeaderStyled) {
        // "COLLECTION"/"SUMMARY" sections repeat page totals — skip the whole
        // section so bill values are never double counted.
        inRollupSection = isRollupSection(description);
        if (!inRollupSection) {
          currentCategory = ctx.registerCategory(stripContd(description), sheetTitle);
        }
        preamble = [];
      } else {
        if (lastRowWasItem) preamble = [];
        if (preamble.length < 3) preamble.push(description);
      }
      lastRowWasItem = false;
      continue;
    }

    if (inRollupSection) continue; // roll-up rows are repeats of page totals

    // Measured / priced bill line.
    let qtyV = qty;
    let rateV = rate;
    if (qtyV === null && rateV === null && amount !== null) {
      // Amount-only row. A genuine lump item (preliminaries "Item"/"Sum"
      // lines) carries a unit or an ITEM/S-N reference AND reads as a work
      // description; element totals / collection lines are ALL CAPS
      // ("FRAME", "FINISHES") or bare of unit+ref — skip those, they repeat
      // value already counted on the measured lines above.
      const snCell = text(row, "sn");
      if ((!unit && !snCell) || isAllCapsText(description)) continue;
      qtyV = 1;
      rateV = amount;
    } else if (qtyV === null && amount !== null) {
      // Rate present but no measure: lump line at qty 1.
      qtyV = 1;
      if (rateV === null) rateV = amount;
    } else if (qtyV !== null && rateV === null && amount !== null && qtyV > 0) {
      rateV = amount / qtyV;
    }
    const category = ctx.registerCategory(categoryCell, sheetTitle) || currentCategory || ctx.registerCategory(sheetTitle, "");

    const actualQty = number(row, "actualQty");
    const actualRate = number(row, "actualRate");
    const pctRaw = number(row, "percentComplete");
    let percentComplete = pctRaw === null ? 0 : pctRaw;
    if (percentComplete > 0 && percentComplete <= 1) percentComplete *= 100;
    percentComplete = Math.max(0, Math.min(100, percentComplete));

    const takeoffLine = preamble.join(" — ");
    const sn = ctx.nextSn();
    const codeBase = contentHash(
      [ws.name, category, takeoffLine, description, unit].join("|").toLowerCase(),
    );
    const item = {
      sn,
      code: "BQ-" + ctx.uniqueCode(codeBase),
      description,
      takeoffLine,
      unit,
      qty: qtyV ?? 0,
      rate: Math.round((rateV ?? 0) * 100) / 100,
      category,
      percentComplete,
      completed: percentComplete >= 100,
    };
    const trade = text(row, "trade");
    if (trade) item.trade = trade;
    if (actualQty !== null) item.actualQty = actualQty;
    if (actualRate !== null) item.actualRate = actualRate;
    ctx.items.push(item);
    parsedRows += 1;
    lastRowWasItem = true;
  }
  return parsedRows;
}

// ── schedule-sheet parsing (Material / Labour) ──────────────────────────────

function parseScheduleSheet({ ws, header }, ctx) {
  const cols = header.columns;
  const name = String(ws.name || "");
  const sheetKind = /labour|labor/i.test(name) ? "Labour" : "Material";
  // "MATERIAL SCHEDULE GATE HOUSE" → "Gate House" context tag.
  const sheetScope = titleCaseIfCaps(
    name.replace(/material|labour|labor|schedule/gi, "").replace(/\s+/g, " ").trim(),
  );
  const hasExplicitRef = cols.billRef !== undefined;

  let currentCategory = "";
  let currentGroup = "";
  let currentSub = "";
  let parsedRows = 0;

  const text = (row, role) => (cols[role] !== undefined ? squish(cellText(row.getCell(cols[role]))) : "");
  const number = (row, role) => (cols[role] !== undefined ? cellNumber(row.getCell(cols[role])) : null);

  for (let r = header.headerRowNumber + 1; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const description = text(row, "description");
    if (!description) continue;
    if (isSummaryText(description)) continue;

    const unit = text(row, "unit");
    const qty = number(row, "qty");
    const rate = number(row, "rate");
    const amount = number(row, "amount");
    const priced = rate !== null || amount !== null;

    if (!priced) {
      if (isAllCapsText(description) && qty === null) {
        // Section row ("FRAMES", "GROUND FLOOR") — context only.
        currentCategory = titleCaseIfCaps(stripContd(description));
        currentGroup = "";
        currentSub = "";
      } else if (qty !== null || unit) {
        // Bill-line group header ("COLUMNS | 10 | m3"): components below
        // belong to this bill line — the title linker resolves it.
        currentGroup = description;
        currentSub = "";
      } else {
        // Mixed-case subgroup ("Nails", "Concreting").
        currentSub = description;
      }
      continue;
    }

    // Priced component row.
    let qtyV = qty;
    let rateV = rate;
    if (qtyV === null && amount !== null) {
      qtyV = 1;
      if (rateV === null) rateV = amount;
    } else if (qtyV !== null && rateV === null && amount !== null && qtyV > 0) {
      rateV = amount / qtyV;
    }

    let billIdentity = "";
    let takeoffLine = "";
    if (hasExplicitRef) {
      // Template path: "Bill S/N" ties the row to the imported line with
      // that S/N (resolved to its stable code after bills are parsed).
      const refRaw = text(row, "billRef");
      const refNum = num(refRaw);
      if (refNum !== null && ctx.snToCode.has(String(Math.floor(refNum)))) {
        billIdentity = ctx.snToCode.get(String(Math.floor(refNum)));
      } else if (refRaw) {
        takeoffLine = refRaw;
      }
    } else {
      takeoffLine = currentGroup || currentSub || "";
    }

    const kindText = text(row, "componentKind");
    const componentKind = kindText
      ? normalizeComponentKind(kindText, sheetKind)
      : /labour|labor|workmanship/i.test(description)
        ? "Labour"
        : sheetKind;

    const category = [sheetScope, currentCategory].filter(Boolean).join(" · ");

    ctx.budgetItems.push({
      billIdentity,
      sn: ctx.budgetItems.length + 1,
      description,
      takeoffLine,
      componentKind,
      category,
      unit,
      qty: qtyV ?? 0,
      rate: rateV ?? 0,
      overheadPercent: number(row, "overheadPercent") ?? 0,
      profitPercent: number(row, "profitPercent") ?? 0,
    });
    parsedRows += 1;
  }
  return parsedRows;
}

// ── main entry ──────────────────────────────────────────────────────────────

/**
 * Parse an uploaded .xlsx buffer into project payload pieces.
 * Returns { items, budgetItems, categories, warnings }.
 * Throws a 400-coded error when no usable bill rows are found.
 */
export async function parseBoqWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw importError("Could not read the file. Upload an Excel .xlsx workbook.");
  }

  const { bills, schedules } = classifySheets(workbook);
  if (!bills.length && !schedules.length) {
    throw importError(
      "No bill sheets found. Each bill sheet needs a header row with Description plus Qty/Rate/Amount columns — download the import template to see the expected layout.",
    );
  }

  const warnings = [];
  const multiSheet = bills.length > 1;
  const categories = [];
  const seenCategories = new Map(); // lower → canonical
  const usedCodes = new Map(); // base hash → count
  let snCounter = 0;

  const ctx = {
    items: [],
    budgetItems: [],
    snToCode: new Map(),
    nextSn: () => ++snCounter,
    uniqueCode(base) {
      const n = (usedCodes.get(base) || 0) + 1;
      usedCodes.set(base, n);
      return n === 1 ? base : `${base}-${n}`;
    },
    registerCategory(raw, sheetTitle) {
      let c = titleCaseIfCaps(squish(raw));
      if (!c) return "";
      // With several bill sheets, scope the category by its sheet so "Gate
      // House · Substructure" and "Main Building · Substructure" stay apart.
      if (multiSheet && sheetTitle && c.toLowerCase() !== sheetTitle.toLowerCase()) {
        c = `${sheetTitle} · ${c}`;
      }
      const key = c.toLowerCase();
      if (!seenCategories.has(key)) {
        seenCategories.set(key, c);
        categories.push(c);
      }
      return seenCategories.get(key);
    },
  };

  for (const bill of bills) {
    const n = parseBillSheet(bill, ctx);
    if (!n) warnings.push(`Sheet "${bill.ws.name}": no bill lines found.`);
  }

  // Template compat: "Bill S/N" references resolve against imported sn order.
  for (const it of ctx.items) {
    ctx.snToCode.set(String(it.sn), it.code);
  }

  for (const sched of schedules) {
    const n = parseScheduleSheet(sched, ctx);
    if (!n) warnings.push(`Sheet "${sched.ws.name}": no schedule rows found.`);
  }

  if (!ctx.items.length) {
    throw importError(
      "No bill lines found in the workbook. Each line needs a Description; download the import template for the expected layout.",
    );
  }

  if (bills.length) {
    warnings.push(
      `Imported ${ctx.items.length} bill line(s) from ${bills.length} sheet(s)` +
        (ctx.budgetItems.length
          ? ` and ${ctx.budgetItems.length} material/labour row(s) from ${schedules.length} schedule sheet(s).`
          : "."),
    );
  }

  return { items: ctx.items, budgetItems: ctx.budgetItems, categories, warnings };
}

// ── Downloadable import template ────────────────────────────────────────────

const HEADER_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1D4ED8" },
};
const SECTION_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE2E8F0" },
};

function styleHeaderRow(row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: "middle" };
  });
}

/** Build the Excel template users fill in and upload. */
export function buildBoqTemplateWorkbook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ADLM Studio";

  const readme = wb.addWorksheet("Read Me");
  readme.columns = [{ width: 110 }];
  [
    "ADLM — Excel Bill of Quantities import template",
    "",
    "Sheet 'BoQ' (required)",
    "  • One row per bill line: S/N, Category, Description, Unit, Qty, Rate.",
    "  • Category: either fill the Category column, OR leave it empty and add a row with ONLY a",
    "    Description (no unit/qty/rate) — that row becomes a section header and names the category",
    "    for every line below it, until the next header row.",
    "  • Actual Qty / Actual Rate / % Complete are optional — use them to track actual (site) data",
    "    against the planned bill. % Complete accepts 0-100 (or a %-formatted cell).",
    "",
    "Sheet 'Material & Labour' (optional)",
    "  • The build-up behind each bill line. Bill S/N ties a row to the BoQ line with that S/N.",
    "  • Component: Material, Labour, Plant, Equipment or Consumable.",
    "  • Overhead % / Profit % are applied on top of the net build-up cost.",
    "  • When this sheet is present, bill rates are DERIVED live from the build-up (the budget",
    "    engine keeps them in sync). When absent, a budget is generated automatically from the",
    "    bill so the Budget tab is ready to price.",
    "",
    "Already have a finished bill? Upload it as-is — the importer also reads standard QS",
    "workbooks: multiple bill sheets (PRELIMINARIES, MAIN BUILDING, …) with ITEM/DESCRIPTION/",
    "QTY/UNIT/RATE/AMOUNT headers, ALL-CAPS section rows as categories, preliminaries priced as",
    "lump 'Item' amounts, and MATERIAL/LABOUR SCHEDULE sheets as the budget build-up.",
  ].forEach((line, i) => {
    const row = readme.getRow(i + 1);
    row.getCell(1).value = line;
    if (i === 0) row.getCell(1).font = { bold: true, size: 14 };
  });

  const boq = wb.addWorksheet("BoQ");
  boq.columns = [
    { header: "S/N", key: "sn", width: 8 },
    { header: "Category", key: "category", width: 22 },
    { header: "Description", key: "description", width: 55 },
    { header: "Unit", key: "unit", width: 8 },
    { header: "Qty", key: "qty", width: 12 },
    { header: "Rate", key: "rate", width: 14 },
    { header: "Actual Qty", key: "actualQty", width: 12 },
    { header: "Actual Rate", key: "actualRate", width: 14 },
    { header: "% Complete", key: "pct", width: 12 },
  ];
  styleHeaderRow(boq.getRow(1));
  const sectionRow = boq.addRow({ description: "Substructure" });
  sectionRow.eachCell({ includeEmpty: false }, (cell) => {
    cell.font = { bold: true };
    cell.fill = SECTION_FILL;
  });
  boq.addRow({
    sn: 1,
    description: "Excavate foundation trench not exceeding 1.5m deep",
    unit: "m3",
    qty: 120,
    rate: 2500,
    actualQty: 60,
    pct: 50,
  });
  boq.addRow({
    sn: 2,
    description: "Plain in-situ concrete grade 15 in blinding, 50mm thick",
    unit: "m2",
    qty: 85,
    rate: 4200,
  });
  boq.addRow({
    sn: 3,
    category: "Frame",
    description: "Reinforced in-situ concrete grade 25 in columns",
    unit: "m3",
    qty: 32,
    rate: 65000,
  });

  const ml = wb.addWorksheet("Material & Labour");
  ml.columns = [
    { header: "Bill S/N", key: "ref", width: 10 },
    { header: "Component", key: "kind", width: 14 },
    { header: "Description", key: "description", width: 45 },
    { header: "Unit", key: "unit", width: 8 },
    { header: "Qty", key: "qty", width: 12 },
    { header: "Rate", key: "rate", width: 14 },
    { header: "Overhead %", key: "oh", width: 12 },
    { header: "Profit %", key: "profit", width: 12 },
  ];
  styleHeaderRow(ml.getRow(1));
  ml.addRow({ ref: 2, kind: "Material", description: "Cement (50kg bags)", unit: "bags", qty: 30, rate: 9500, oh: 5, profit: 10 });
  ml.addRow({ ref: 2, kind: "Material", description: "Sharp sand", unit: "m3", qty: 6, rate: 18000, oh: 5, profit: 10 });
  ml.addRow({ ref: 2, kind: "Labour", description: "Concrete gang — blinding", unit: "m2", qty: 85, rate: 450, oh: 5, profit: 10 });

  return wb;
}
