// server/util/elementalBoqExporter.js
//
// Generates a Nigerian-format Bill of Quantities workbook from project items.
//
// Design notes:
//   - All numeric cells use Excel formulas (Amount = IFERROR(Qty × Rate, 0),
//     bill totals = SUM/+, General Summary references each bill sheet).
//   - Items with no matched takeoff qty AND no fixed amount are skipped.
//     Elements with no remaining items are skipped. Bills with no remaining
//     elements are not added to the workbook (so empty sheets never appear).
//   - Frame items are split by `level` when items carry per-floor metadata.
//   - Rates come from each item.rate as saved in the BoQ view — no hard-coded
//     defaults baked into the mapping.
//   - Foundation types (Pad / Strip / Raft / Pile) live as sub-items under
//     shared headings — a single project that mixes foundations renders all
//     relevant rows.
//   - Provisional Sums (passed in by the caller) get their own sheet and a
//     line in the General Summary.

import ExcelJS from "exceljs";
import dayjs from "dayjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_MAPPING_PATH = path.join(
  __dirname,
  "..",
  "assets",
  "boq",
  "elemental-mapping.json",
);

const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF091E39" } };
const HEADING_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5ECF5" } };
const SUMMARY_TOTAL_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E7EF" } };

const PRELIMINARIES_ITEMS = [
  "Setting Out",
  "Progress Photographs and Reports",
  "Foreman / Management supervision",
  "Other staff",
  "Insurances",
  "Site accommodation",
  "Office accommodation",
  "Site security",
  "Temporary fences",
  "Telephone",
  "Administration",
  "Material tests / Samples",
  "Removal of debris",
  "Water for the Works",
  "Power for the Works",
  "Notice board",
  "Temporary power/ lights",
  "Safety/ Health & Welfare",
  "Storage",
  "Small Plant/ Tools",
  "Plant Equipment/ scaffolding",
  "Additional Items (to be listed)",
];

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n) {
  return Math.round(safeNum(n) * 100) / 100;
}

function loadMapping(mappingPath) {
  const p = String(mappingPath || DEFAULT_MAPPING_PATH);
  if (!fs.existsSync(p)) {
    throw new Error(`Elemental BoQ mapping not found at ${p}`);
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function isMepProductKey(key) {
  return String(key || "").toLowerCase().replace(/[^a-z]/g, "").includes("mep");
}

function domainForProductKey(productKey) {
  return isMepProductKey(productKey) ? "mep" : "quiv";
}

function normalizeBuildingType(t) {
  const v = String(t || "").toLowerCase().replace(/[^a-z]/g, "");
  if (v === "multistorey" || v === "multistory" || v === "multi") return "multistorey";
  return "bungalow";
}

function normalizeFoundationType(t) {
  const v = String(t || "").toLowerCase().replace(/[^a-z]/g, "");
  if (v === "raft") return "raft";
  if (v === "pile") return "pile";
  return "pad";
}

// Resolve `ref: "domain.buildingType.BillName"` into the referenced bill.
function resolveBill(mapping, bill) {
  if (!bill?.ref) return bill;
  const parts = String(bill.ref).split(".");
  if (parts.length < 3) return bill;
  const [domain, buildingType, billName] = parts;
  const variant = mapping?.domains?.[domain]?.[buildingType];
  const bills = Array.isArray(variant?.bills) ? variant.bills : [];
  const target = bills.find((b) => b?.name === billName);
  if (!target) return bill;
  return {
    ...target,
    name: bill.name || target.name,
    kind: bill.kind || target.kind,
    splitByLevel:
      bill.splitByLevel != null ? bill.splitByLevel : target.splitByLevel,
  };
}

function resolveVariant(mapping, domain, buildingType) {
  const variant = mapping?.domains?.[domain]?.[buildingType];
  if (!variant) {
    throw new Error(
      `No elemental BoQ mapping for domain=${domain} buildingType=${buildingType}`,
    );
  }
  if (variant.ref) {
    const refParts = String(variant.ref).split(".");
    let node = mapping.domains;
    for (const p of refParts) node = node?.[p];
    if (node && Array.isArray(node.bills)) return { ...node, ref: undefined };
  }
  return variant;
}

/* =========================
   Item lookup
   ========================= */
// Normalize en-dash, em-dash, non-breaking spaces and double whitespace so
// keyword lookups work whether the source uses "Pad – Excavation" (em-dash)
// or "Pad - Excavation" (hyphen-minus).
function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function itemHaystack(item) {
  return [
    item?.description,
    item?.takeoffLine,
    item?.materialName,
    item?.type,
    item?.code,
  ]
    .map(normalizeText)
    .join(" ");
}

function itemMatchesGroup(haystack, words) {
  if (!Array.isArray(words) || !words.length) return false;
  for (const w of words) {
    const needle = normalizeText(w);
    if (!needle) continue;
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

function findMatchingItems(boqItem, projectItems, matchedSet) {
  const lookups = Array.isArray(boqItem?.lookups) ? boqItem.lookups : [];
  const combineMode = String(boqItem?.lookupCombine || "first");
  if (!lookups.length) return [];

  const matches = [];
  const seenIdx = new Set();

  for (const group of lookups) {
    const groupHits = [];
    for (let i = 0; i < projectItems.length; i++) {
      if (seenIdx.has(i)) continue;
      const it = projectItems[i];
      const haystack = itemHaystack(it);
      if (!itemMatchesGroup(haystack, group)) continue;
      groupHits.push({ idx: i, item: it });
    }
    if (groupHits.length) {
      for (const m of groupHits) {
        seenIdx.add(m.idx);
        if (matchedSet) matchedSet.add(m.idx);
        matches.push(m);
      }
      if (combineMode !== "sum") break;
    }
  }
  return matches;
}

function aggregateMatches(boqItem, matches) {
  const divisor = safeNum(boqItem?.qtyDivisor);
  let qty = 0;
  let rateTotalWeighted = 0;
  let weightTotal = 0;

  for (const { item } of matches) {
    const q = safeNum(item?.qty);
    const r = safeNum(item?.rate);
    qty += q;
    if (r > 0) {
      const w = q || 1;
      rateTotalWeighted += r * w;
      weightTotal += w;
    }
  }
  if (divisor > 0) qty = qty / divisor;
  const rate = weightTotal > 0 ? rateTotalWeighted / weightTotal : 0;
  return { qty: round2(qty), rate: round2(rate) };
}

function groupMatchesByLevel(matches) {
  const map = new Map();
  for (const m of matches) {
    const level = String(m.item?.level || "").trim() || "Generally";
    if (!map.has(level)) map.set(level, []);
    map.get(level).push(m);
  }
  const ordered = [...map.entries()].sort((a, b) => {
    if (a[0] === "Generally" && b[0] !== "Generally") return 1;
    if (b[0] === "Generally" && a[0] !== "Generally") return -1;
    return a[0].localeCompare(b[0], undefined, { numeric: true });
  });
  return ordered.map(([level, items]) => ({ level, matches: items }));
}

/* =========================
   Pre-compute: which items / elements / bills will actually render
   ========================= */
function planItem(boqItem, projectItems, matchedSet) {
  // Fixed-amount lines always render.
  if (Number.isFinite(Number(boqItem?.fixedAmount))) {
    return {
      kind: "fixed",
      description: boqItem.description,
      unit: boqItem.unit || "Item",
      amount: round2(boqItem.fixedAmount),
    };
  }

  const matches = findMatchingItems(boqItem, projectItems, matchedSet);
  if (!matches.length) return null;

  const agg = aggregateMatches(boqItem, matches);
  if (agg.qty <= 0) return null;

  return {
    kind: "lookup",
    description: boqItem.description,
    unit: boqItem.unit || "",
    qty: agg.qty,
    rate: agg.rate,
    matches,
    qtyDivisor: boqItem.qtyDivisor,
  };
}

function planLevelSplitItem(boqItem, projectItems, matchedSet) {
  const matches = findMatchingItems(boqItem, projectItems, matchedSet);
  if (!matches.length) return null;

  const groups = groupMatchesByLevel(matches);
  const levelRows = groups
    .map(({ level, matches: m }) => {
      const agg = aggregateMatches(boqItem, m);
      if (agg.qty <= 0) return null;
      return {
        level,
        qty: agg.qty,
        rate: agg.rate,
      };
    })
    .filter(Boolean);

  if (!levelRows.length) return null;
  return {
    kind: "leveled",
    description: boqItem.description,
    unit: boqItem.unit || "",
    levelRows,
  };
}

function planBill(bill, projectItems, matchedSet) {
  if (bill?.kind === "preliminaries") {
    return { kind: "preliminaries", name: bill.name };
  }
  const elements = Array.isArray(bill?.elements) ? bill.elements : [];
  const splitByLevel = !!bill?.splitByLevel;

  const renderedElements = [];
  for (const element of elements) {
    const items = Array.isArray(element?.items) ? element.items : [];
    const renderedItems = [];
    for (const item of items) {
      const planned = splitByLevel
        ? planLevelSplitItem(item, projectItems, matchedSet) ||
          planItem(item, projectItems, matchedSet)
        : planItem(item, projectItems, matchedSet);
      if (planned) renderedItems.push(planned);
    }
    if (renderedItems.length) {
      renderedElements.push({
        heading: element.heading || "",
        preamble: element.preamble || "",
        items: renderedItems,
      });
    }
  }
  if (!renderedElements.length) return null;
  return { kind: "standard", name: bill.name, elements: renderedElements };
}

/* =========================
   Excel writing helpers
   ========================= */
function snLetter(i) {
  // A B C D E F G H J K ... (skip "I" — Nigerian BoQ convention)
  const letters = "ABCDEFGHJKLMNOPQRSTUVWXYZ";
  if (i < letters.length) return letters[i];
  const first = letters[Math.floor(i / letters.length) - 1];
  const second = letters[i % letters.length];
  return first + second;
}

function applyMoneyFormat(cell) {
  cell.numFmt = '#,##0.00;[Red]-#,##0.00;-';
}

function safeSheetName(name, workbook) {
  let base =
    String(name || "Sheet")
      .trim()
      .replace(/[\[\]:*?\/\\]/g, "-")
      .slice(0, 31) || "Sheet";
  const used = new Set(workbook.worksheets.map((w) => w.name));
  if (!used.has(base)) return base;
  for (let i = 2; i < 100; i++) {
    const suffix = ` (${i})`;
    const candidate = base.slice(0, 31 - suffix.length) + suffix;
    if (!used.has(candidate)) return candidate;
  }
  return base;
}

function writeBillHeader(ws, billName) {
  const hdr = ws.getRow(1);
  hdr.values = ["Item", "Description", "Qty", "Unit", "Rate", "Amount"];
  hdr.font = { bold: true, color: { argb: "FFFFFFFF" } };
  hdr.fill = HEADER_FILL;
  hdr.alignment = { vertical: "middle", horizontal: "center" };
  hdr.height = 22;

  const titleRow = ws.addRow([null, String(billName || "").toUpperCase()]);
  titleRow.font = { bold: true, size: 12 };
  ws.mergeCells(titleRow.number, 2, titleRow.number, 6);
}

function writeAmountRow(ws, { code, description, qty, unit, rate, fixedAmount }) {
  if (fixedAmount != null) {
    // Fixed-amount line: no qty × rate formula, just the configured amount.
    const r = ws.addRow([code, description, null, unit || "Item", null, round2(fixedAmount)]);
    applyMoneyFormat(r.getCell(3));
    applyMoneyFormat(r.getCell(5));
    applyMoneyFormat(r.getCell(6));
    return r;
  }

  // Use null (truly empty) for missing qty/rate so Excel doesn't see them as
  // text cells (empty string would make the formula return #VALUE!). Wrap in
  // IFERROR so adding a rate later in Excel calculates without errors.
  const qtyVal = qty > 0 ? qty : null;
  const rateVal = rate > 0 ? rate : null;
  const r = ws.addRow([code, description, qtyVal, unit, rateVal]);
  r.getCell(6).value = { formula: `IFERROR(C${r.number}*E${r.number},0)` };
  applyMoneyFormat(r.getCell(3));
  applyMoneyFormat(r.getCell(5));
  applyMoneyFormat(r.getCell(6));
  return r;
}

/* =========================
   Bill writers
   ========================= */
function writePreliminariesSheet(workbook, projectName) {
  const ws = workbook.addWorksheet(safeSheetName("Preliminaries", workbook));
  ws.columns = [
    { header: "S/N", key: "sn", width: 6 },
    { header: "ELEMENT BREAKDOWN", key: "description", width: 50 },
    { header: "INITIAL", key: "initial", width: 14 },
    { header: "RUNNING", key: "running", width: 14 },
    { header: "COMPLETION", key: "completion", width: 14 },
    { header: "TOTAL SUM", key: "total", width: 16 },
  ];

  const titleRow = ws.getRow(1);
  titleRow.values = ["S/N", "ELEMENT BREAKDOWN", "INITIAL", "RUNNING", "COMPLETION", "TOTAL SUM"];
  titleRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  titleRow.fill = HEADER_FILL;
  titleRow.alignment = { horizontal: "center" };

  const sub = ws.addRow([null, `BREAKDOWN OF PRELIMINARIES — ${projectName || "Project"}`]);
  sub.font = { bold: true };
  ws.mergeCells(sub.number, 2, sub.number, 6);

  PRELIMINARIES_ITEMS.forEach((desc, i) => {
    const row = ws.addRow([i + 1, desc, null, null, null, null]);
    row.getCell(6).value = {
      formula: `IFERROR(SUM(C${row.number}:E${row.number}),0)`,
    };
    applyMoneyFormat(row.getCell(3));
    applyMoneyFormat(row.getCell(4));
    applyMoneyFormat(row.getCell(5));
    applyMoneyFormat(row.getCell(6));
  });

  const firstItemRow = 3;
  const lastItemRow = firstItemRow + PRELIMINARIES_ITEMS.length - 1;

  ws.addRow([]);
  const totalRow = ws.addRow([null, "PRELIMINARIES — Grand Total to Summary", null, null, null, null]);
  totalRow.getCell(6).value = { formula: `SUM(F${firstItemRow}:F${lastItemRow})` };
  totalRow.font = { bold: true };
  totalRow.fill = SUMMARY_TOTAL_FILL;
  applyMoneyFormat(totalRow.getCell(6));

  return { sheet: ws, totalCellAddr: `Preliminaries!F${totalRow.number}` };
}

function writeStandardBill({ workbook, plannedBill }) {
  const ws = workbook.addWorksheet(safeSheetName(plannedBill.name, workbook));
  ws.columns = [
    { header: "Item", key: "item", width: 6 },
    { header: "Description", key: "description", width: 60 },
    { header: "Qty", key: "qty", width: 12 },
    { header: "Unit", key: "unit", width: 10 },
    { header: "Rate", key: "rate", width: 14 },
    { header: "Amount", key: "amount", width: 16 },
  ];
  writeBillHeader(ws, plannedBill.name);

  const amountRowNumbers = [];
  let snIndex = 0;

  for (const element of plannedBill.elements) {
    ws.addRow([]);
    const headRow = ws.addRow([null, String(element.heading || "").toUpperCase()]);
    headRow.font = { bold: true };
    headRow.fill = HEADING_FILL;
    ws.mergeCells(headRow.number, 2, headRow.number, 6);

    if (element.preamble) {
      const preRow = ws.addRow([null, String(element.preamble)]);
      preRow.font = { italic: true, color: { argb: "FF475569" } };
      preRow.alignment = { wrapText: true, vertical: "top" };
      ws.mergeCells(preRow.number, 2, preRow.number, 6);
    }

    for (const item of element.items) {
      if (item.kind === "fixed") {
        const r = writeAmountRow(ws, {
          code: snLetter(snIndex++),
          description: item.description,
          unit: item.unit,
          fixedAmount: item.amount,
        });
        amountRowNumbers.push(r.number);
        continue;
      }

      if (item.kind === "leveled") {
        // Bold sub-heading row showing the item description, then one row per level.
        const head = ws.addRow([null, item.description]);
        head.font = { bold: true };
        ws.mergeCells(head.number, 2, head.number, 6);

        for (const lr of item.levelRows) {
          const r = writeAmountRow(ws, {
            code: snLetter(snIndex++),
            description: lr.level,
            unit: item.unit,
            qty: lr.qty,
            rate: lr.rate,
          });
          amountRowNumbers.push(r.number);
        }
        continue;
      }

      // kind === "lookup"
      const r = writeAmountRow(ws, {
        code: snLetter(snIndex++),
        description: item.description,
        unit: item.unit,
        qty: item.qty,
        rate: item.rate,
      });
      amountRowNumbers.push(r.number);
    }
  }

  ws.addRow([]);
  const totalLabel = `${String(plannedBill.name).toUpperCase()} — to Main Building Summary`;
  const totalRow = ws.addRow([null, totalLabel, null, null, null, null]);
  totalRow.font = { bold: true };
  totalRow.fill = SUMMARY_TOTAL_FILL;
  if (amountRowNumbers.length) {
    totalRow.getCell(6).value = {
      formula: amountRowNumbers.map((n) => `F${n}`).join("+"),
    };
  } else {
    totalRow.getCell(6).value = 0;
  }
  applyMoneyFormat(totalRow.getCell(6));

  return { sheet: ws, totalCellAddr: `'${ws.name}'!F${totalRow.number}` };
}

/* =========================
   Provisional Sums
   ========================= */
function writeProvisionalSumsSheet(workbook, sums) {
  const cleaned = (Array.isArray(sums) ? sums : [])
    .map((s) => ({
      description: String(s?.description || "").trim(),
      amount: safeNum(s?.amount),
    }))
    .filter((s) => s.description || s.amount > 0);

  if (!cleaned.length) return null;

  const ws = workbook.addWorksheet(safeSheetName("Provisional Sums", workbook));
  ws.columns = [
    { header: "Item", key: "item", width: 6 },
    { header: "Description", key: "description", width: 60 },
    { header: "Amount", key: "amount", width: 16 },
  ];
  const hdr = ws.getRow(1);
  hdr.font = { bold: true, color: { argb: "FFFFFFFF" } };
  hdr.fill = HEADER_FILL;
  hdr.alignment = { horizontal: "center" };

  const titleRow = ws.addRow([null, "PROVISIONAL SUMS", null]);
  titleRow.font = { bold: true, size: 12 };
  ws.mergeCells(titleRow.number, 2, titleRow.number, 3);

  const amountRows = [];
  cleaned.forEach((s, i) => {
    const r = ws.addRow([snLetter(i), s.description, round2(s.amount) || null]);
    applyMoneyFormat(r.getCell(3));
    amountRows.push(r.number);
  });

  ws.addRow([]);
  const totalRow = ws.addRow([null, "PROVISIONAL SUMS — to Main Building Summary", null]);
  totalRow.font = { bold: true };
  totalRow.fill = SUMMARY_TOTAL_FILL;
  totalRow.getCell(3).value = {
    formula: amountRows.length ? amountRows.map((n) => `C${n}`).join("+") : "0",
  };
  applyMoneyFormat(totalRow.getCell(3));

  return { sheet: ws, totalCellAddr: `'${ws.name}'!C${totalRow.number}` };
}

/* =========================
   Other sheets
   ========================= */
function writeCoverSheet(workbook, { projectName, variantTitle, buildingType, foundationType }) {
  const ws = workbook.addWorksheet("Cover");
  ws.columns = [{ width: 24 }, { width: 60 }];

  ws.addRow([]);
  const titleRow = ws.addRow([null, variantTitle || "Bills of Quantities"]);
  titleRow.font = { bold: true, size: 18 };
  ws.addRow([]);
  ws.addRow(["Project", projectName || "Project"]);
  ws.addRow(["Building type", buildingType === "multistorey" ? "Multi-Storey" : "Bungalow"]);
  if (buildingType === "multistorey" && foundationType) {
    ws.addRow(["Foundation type", foundationType[0].toUpperCase() + foundationType.slice(1)]);
  }
  ws.addRow(["Generated", dayjs().format("YYYY-MM-DD HH:mm")]);
}

function writeUnmappedSheet(workbook, projectItems, matchedSet) {
  const unmatched = projectItems
    .map((it, i) => ({ it, i }))
    .filter(({ i }) => !matchedSet.has(i));
  if (!unmatched.length) return null;

  const ws = workbook.addWorksheet(safeSheetName("Unmapped", workbook));
  ws.columns = [
    { header: "Item", key: "item", width: 6 },
    { header: "Description", key: "description", width: 60 },
    { header: "Qty", key: "qty", width: 12 },
    { header: "Unit", key: "unit", width: 10 },
    { header: "Rate", key: "rate", width: 14 },
    { header: "Amount", key: "amount", width: 16 },
  ];

  const hdr = ws.getRow(1);
  hdr.font = { bold: true, color: { argb: "FFFFFFFF" } };
  hdr.fill = HEADER_FILL;

  const note = ws.addRow([
    null,
    "Items below were not matched to any BoQ line in this template. Update the BoQ mapping (assets/boq/elemental-mapping.json) to include them.",
  ]);
  note.font = { italic: true, color: { argb: "FF64748B" } };
  ws.mergeCells(note.number, 1, note.number, 6);

  const amountRows = [];
  unmatched.forEach(({ it }, idx) => {
    const r = writeAmountRow(ws, {
      code: snLetter(idx),
      description: String(it?.description || it?.takeoffLine || ""),
      unit: String(it?.unit || ""),
      qty: round2(safeNum(it?.qty)),
      rate: round2(safeNum(it?.rate)),
    });
    amountRows.push(r.number);
  });

  if (!amountRows.length) return null;

  ws.addRow([]);
  const tot = ws.addRow([null, "UNMAPPED — to Main Building Summary", null, null, null, null]);
  tot.font = { bold: true };
  tot.fill = SUMMARY_TOTAL_FILL;
  tot.getCell(6).value = { formula: amountRows.map((n) => `F${n}`).join("+") };
  applyMoneyFormat(tot.getCell(6));
  return { sheet: ws, totalCellAddr: `'${ws.name}'!F${tot.number}` };
}

function writeSummarySheet(workbook, billRefs) {
  const ws = workbook.addWorksheet(safeSheetName("General Summary", workbook));
  ws.columns = [
    { header: "S/N", key: "sn", width: 6 },
    { header: "DESCRIPTION", key: "description", width: 40 },
    { header: "AMOUNT", key: "amount", width: 20 },
  ];
  const hdr = ws.getRow(1);
  hdr.font = { bold: true, color: { argb: "FFFFFFFF" } };
  hdr.fill = HEADER_FILL;
  hdr.alignment = { horizontal: "center" };

  ws.addRow([null, "General Cost of Construction", null]);
  ws.addRow([]);

  const billRowNumbers = [];
  billRefs.forEach((b, i) => {
    const r = ws.addRow([snLetter(i), String(b.name).toUpperCase(), null]);
    r.getCell(3).value = { formula: b.totalCellAddr };
    applyMoneyFormat(r.getCell(3));
    billRowNumbers.push(r.number);
  });

  ws.addRow([]);
  const sub = ws.addRow([null, "GRAND SUMMARY (Sub-total)", null]);
  sub.getCell(3).value = {
    formula: billRowNumbers.length ? billRowNumbers.map((n) => `C${n}`).join("+") : "0",
  };
  sub.font = { bold: true };
  sub.fill = SUMMARY_TOTAL_FILL;
  applyMoneyFormat(sub.getCell(3));

  const cont = ws.addRow([null, "Allow for Contingencies (5%)", null]);
  cont.getCell(3).value = { formula: `C${sub.number}*5%` };
  applyMoneyFormat(cont.getCell(3));

  const subPlusCont = ws.addRow([null, "Sub-total + Contingencies", null]);
  subPlusCont.getCell(3).value = { formula: `C${sub.number}+C${cont.number}` };
  subPlusCont.font = { bold: true };
  applyMoneyFormat(subPlusCont.getCell(3));

  const vat = ws.addRow([null, "VAT (7.5%)", null]);
  vat.getCell(3).value = { formula: `C${subPlusCont.number}*7.5%` };
  applyMoneyFormat(vat.getCell(3));

  const fin = ws.addRow([null, "FINAL SUM", null]);
  fin.getCell(3).value = { formula: `C${subPlusCont.number}+C${vat.number}` };
  fin.font = { bold: true, size: 12 };
  fin.fill = SUMMARY_TOTAL_FILL;
  applyMoneyFormat(fin.getCell(3));
}

/* =========================
   Public API
   ========================= */
export async function exportElementalBoQ({
  projectName = "Project",
  items = [],
  productKey = "",
  buildingType = "bungalow",
  foundationType,
  provisionalSums = [],
  mappingPath,
} = {}) {
  const mapping = loadMapping(mappingPath);
  const domain = domainForProductKey(productKey);
  const bt = normalizeBuildingType(buildingType);
  const variant = resolveVariant(mapping, domain, bt);

  const projectItems = Array.isArray(items) ? items : [];
  const ft = bt === "multistorey" ? normalizeFoundationType(foundationType) : "pad";

  const workbook = new ExcelJS.Workbook();
  workbook.calcProperties.fullCalcOnLoad = true;

  writeCoverSheet(workbook, {
    projectName,
    variantTitle: variant.title,
    buildingType: bt,
    foundationType: ft,
  });

  const matchedSet = new Set();
  const billRefs = [];

  // Plan first (so we know which bills/elements/items will actually render),
  // then write only the ones that have content.
  for (const billRaw of variant.bills || []) {
    const billResolved = resolveBill(mapping, billRaw);

    if (billResolved.kind === "preliminaries") {
      const ref = writePreliminariesSheet(workbook, projectName);
      billRefs.push({ name: billResolved.name, totalCellAddr: ref.totalCellAddr });
      continue;
    }

    const planned = planBill(billResolved, projectItems, matchedSet);
    if (!planned) continue; // skip empty bills entirely

    const ref = writeStandardBill({ workbook, plannedBill: planned });
    billRefs.push({ name: planned.name, totalCellAddr: ref.totalCellAddr });
  }

  const provRef = writeProvisionalSumsSheet(workbook, provisionalSums);
  if (provRef) {
    billRefs.push({ name: "Provisional Sums", totalCellAddr: provRef.totalCellAddr });
  }

  const unmappedRef = writeUnmappedSheet(workbook, projectItems, matchedSet);
  if (unmappedRef) {
    billRefs.push({ name: "Unmapped", totalCellAddr: unmappedRef.totalCellAddr });
  }

  writeSummarySheet(workbook, billRefs);

  const buf = await workbook.xlsx.writeBuffer();
  const safeName = String(projectName || "Project")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  const variantSuffix =
    bt === "multistorey"
      ? `Multi-Storey (${ft[0].toUpperCase() + ft.slice(1)})`
      : "Bungalow";

  return {
    buffer: Buffer.isBuffer(buf) ? buf : Buffer.from(buf),
    filename: `${safeName} - Elemental BOQ (${variantSuffix}).xlsx`,
  };
}
