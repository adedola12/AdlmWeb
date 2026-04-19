// server/util/elementalBoqExporter.js
//
// Generates a Nigerian-format Bill of Quantities workbook from project items.
//
// Phase-2 highlights vs. phase-1:
//   - All numeric cells use Excel formulas (Amount = Qty × Rate, To Collection = SUM,
//     General Summary references each bill sheet).
//   - No per-element subtotal rows. Each bill ends with a single "<Bill> to Main
//     Building Summary" total that the General Summary links to.
//   - Frame items are split by `level` when items carry per-floor metadata.
//   - Rates come from each item.rate as saved in the BoQ view — no hard-coded
//     defaults baked into the mapping.
//   - Foundation type variants: `pad` (default) | `raft` | `pile` for multi-storey
//     substructure. Either passed in or auto-detected from item names.
//   - Preliminaries renders the standard 22-item breakdown table (the items live
//     in the bungalow Preliminaries reference; multi-storey reuses it).

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
const TO_COLLECTION_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
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
  // PlanSwift and Revit Architecture both use the QUIV bills.
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

function detectFoundationType(items) {
  const pad = { pile: 0, raft: 0, pad: 0 };
  for (const it of items || []) {
    const h = itemHaystack(it);
    if (/\bpile\b/.test(h)) pad.pile += 1;
    if (/\braft\b/.test(h)) pad.raft += 1;
    if (/\b(pad|footing)\b/.test(h)) pad.pad += 1;
  }
  if (pad.pile && pad.pile >= pad.raft && pad.pile >= pad.pad) return "pile";
  if (pad.raft && pad.raft >= pad.pad) return "raft";
  return "pad";
}

// Resolve `ref: "domain.buildingType.BillName"` into the referenced bill.
// The bill is looked up by `name` inside the target variant's `bills` array.
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
    // Preserve the referencing bill's identity / overrides.
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
function itemHaystack(item) {
  return [
    item?.description,
    item?.takeoffLine,
    item?.materialName,
    item?.type,
    item?.code,
  ]
    .map((v) => String(v || "").toLowerCase())
    .join(" ");
}

function itemMatchesGroup(haystack, words) {
  if (!Array.isArray(words) || !words.length) return false;
  for (const w of words) {
    const needle = String(w || "").toLowerCase();
    if (!needle) continue;
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

// Returns matching project-item objects (with their original index for tracking).
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
      rateTotalWeighted += r * (q || 1);
      weightTotal += q || 1;
    }
  }
  if (divisor > 0) qty = qty / divisor;
  const rate = weightTotal > 0 ? rateTotalWeighted / weightTotal : 0;
  return { qty: round2(qty), rate: round2(rate) };
}

// Group matches by item.level so we can render one row per floor.
function groupMatchesByLevel(matches) {
  const map = new Map();
  for (const m of matches) {
    const level = String(m.item?.level || "").trim() || "Generally";
    if (!map.has(level)) map.set(level, []);
    map.get(level).push(m);
  }
  // Stable order: levels with numeric prefix first, then alpha; "Generally" last.
  const ordered = [...map.entries()].sort((a, b) => {
    if (a[0] === "Generally" && b[0] !== "Generally") return 1;
    if (b[0] === "Generally" && a[0] !== "Generally") return -1;
    return a[0].localeCompare(b[0], undefined, { numeric: true });
  });
  return ordered.map(([level, items]) => ({ level, matches: items }));
}

/* =========================
   Excel writing helpers
   ========================= */
function snLetter(i) {
  // 0 -> A, 1 -> B, ... 25 -> Z, 26 -> AA. Skip "I" to match Nigerian BoQ
  // convention (A B C D E F G H J K ...).
  const letters = "ABCDEFGHJKLMNOPQRSTUVWXYZ"; // 25 chars, no I
  if (i < letters.length) return letters[i];
  const first = letters[Math.floor(i / letters.length) - 1];
  const second = letters[i % letters.length];
  return first + second;
}

function applyMoneyFormat(cell) {
  cell.numFmt = '#,##0.00;[Red]-#,##0.00;""';
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
  titleRow.alignment = { horizontal: "left" };
}

function writeAmountFormulaRow(ws, { item: code, description, qty, unit, rate, isFixed }) {
  const r = ws.addRow([code, description, qty, unit, rate]);
  const amountCell = r.getCell(6);
  if (isFixed) {
    // Fixed-amount line (preliminaries / contingency style): the amount is the
    // configured value, no qty × rate formula.
    amountCell.value = round2(rate); // we pass the fixed amount as `rate` for consistency? Use a flag.
  } else {
    amountCell.value = { formula: `C${r.number}*E${r.number}` };
  }
  applyMoneyFormat(r.getCell(3));
  applyMoneyFormat(r.getCell(5));
  applyMoneyFormat(amountCell);
  return r;
}

function writeFixedAmountRow(ws, { item: code, description, unit, amount }) {
  const r = ws.addRow([code, description, "", unit, "", amount]);
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
    const row = ws.addRow([i + 1, desc, "", "", "", ""]);
    row.getCell(6).value = {
      formula: `IFERROR(SUM(C${row.number}:E${row.number}),0)`,
    };
    applyMoneyFormat(row.getCell(3));
    applyMoneyFormat(row.getCell(4));
    applyMoneyFormat(row.getCell(5));
    applyMoneyFormat(row.getCell(6));
  });

  const firstItemRow = 3; // header(1) + sub(2) + first item(3)
  const lastItemRow = firstItemRow + PRELIMINARIES_ITEMS.length - 1;

  ws.addRow([]);
  const totalRow = ws.addRow([null, "PRELIMINARIES — Grand Total to Summary", "", "", "", null]);
  totalRow.getCell(6).value = { formula: `SUM(F${firstItemRow}:F${lastItemRow})` };
  totalRow.font = { bold: true };
  totalRow.fill = SUMMARY_TOTAL_FILL;
  applyMoneyFormat(totalRow.getCell(6));

  return { sheet: ws, totalCellAddr: `Preliminaries!F${totalRow.number}` };
}

function writeStandardBill({ workbook, bill, projectItems, matchedSet }) {
  const ws = workbook.addWorksheet(safeSheetName(bill.name, workbook));
  ws.columns = [
    { header: "Item", key: "item", width: 6 },
    { header: "Description", key: "description", width: 60 },
    { header: "Qty", key: "qty", width: 12 },
    { header: "Unit", key: "unit", width: 10 },
    { header: "Rate", key: "rate", width: 14 },
    { header: "Amount", key: "amount", width: 16 },
  ];

  writeBillHeader(ws, bill.name);

  const elements = Array.isArray(bill.elements) ? bill.elements : [];
  const splitByLevel = !!bill.splitByLevel;
  const amountRowNumbers = [];
  let snIndex = 0;

  for (const element of elements) {
    // Heading row
    ws.addRow([]);
    const headRow = ws.addRow([null, String(element.heading || "").toUpperCase()]);
    headRow.font = { bold: true };
    headRow.fill = HEADING_FILL;
    ws.mergeCells(headRow.number, 2, headRow.number, 6);

    // Preamble row (italic, descriptive context — no amount)
    if (element.preamble) {
      const preRow = ws.addRow([null, String(element.preamble)]);
      preRow.font = { italic: true, color: { argb: "FF475569" } };
      preRow.alignment = { wrapText: true, vertical: "top" };
      ws.mergeCells(preRow.number, 2, preRow.number, 6);
    }

    const items = Array.isArray(element.items) ? element.items : [];

    for (const item of items) {
      // Sub-heading row showing the item description (matches reference layout
      // where each item has a small heading line above it).
      // Skipped here to keep the layout compact — the item row itself shows the
      // description.

      // Fixed-amount line (e.g. "Keeping excavations free of water — Item")
      if (Number.isFinite(Number(item?.fixedAmount))) {
        const r = writeFixedAmountRow(ws, {
          item: snLetter(snIndex++),
          description: item.description,
          unit: item.unit || "Item",
          amount: round2(item.fixedAmount),
        });
        amountRowNumbers.push(r.number);
        continue;
      }

      // Lookup-driven line
      const matches = findMatchingItems(item, projectItems, matchedSet);

      if (splitByLevel && matches.length) {
        // Floor-by-floor expansion: one sub-heading + one row per level.
        const groups = groupMatchesByLevel(matches);
        // Element-level item heading
        const head = ws.addRow([null, item.description]);
        head.font = { bold: true };
        ws.mergeCells(head.number, 2, head.number, 6);

        for (const { level, matches: levelMatches } of groups) {
          const agg = aggregateMatches(item, levelMatches);
          const r = ws.addRow([
            snLetter(snIndex++),
            level,
            agg.qty || "",
            item.unit || "",
            agg.rate || "",
          ]);
          r.getCell(6).value = { formula: `C${r.number}*E${r.number}` };
          applyMoneyFormat(r.getCell(3));
          applyMoneyFormat(r.getCell(5));
          applyMoneyFormat(r.getCell(6));
          amountRowNumbers.push(r.number);
        }
        continue;
      }

      // Non-split: single aggregated line
      const agg = aggregateMatches(item, matches);
      const r = ws.addRow([
        snLetter(snIndex++),
        item.description,
        agg.qty || "",
        item.unit || "",
        agg.rate || "",
      ]);
      r.getCell(6).value = { formula: `C${r.number}*E${r.number}` };
      applyMoneyFormat(r.getCell(3));
      applyMoneyFormat(r.getCell(5));
      applyMoneyFormat(r.getCell(6));
      amountRowNumbers.push(r.number);

      // Soft cue when nothing matched
      if (!matches.length) {
        r.getCell(2).font = { italic: true, color: { argb: "FF94A3B8" } };
      }
    }
  }

  // Bill total — formula linking every amount cell on this sheet.
  ws.addRow([]);
  const totalLabel = `${String(bill.name).toUpperCase()} — to Main Building Summary`;
  const totalRow = ws.addRow([null, totalLabel, "", "", null, null]);
  totalRow.font = { bold: true };
  totalRow.fill = SUMMARY_TOTAL_FILL;

  if (amountRowNumbers.length) {
    const sumExpr = amountRowNumbers.map((n) => `F${n}`).join("+");
    totalRow.getCell(6).value = { formula: sumExpr };
  } else {
    totalRow.getCell(6).value = 0;
  }
  applyMoneyFormat(totalRow.getCell(6));

  return {
    sheet: ws,
    totalCellAddr: `'${ws.name}'!F${totalRow.number}`,
  };
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
  if (buildingType === "multistorey") {
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
    const r = ws.addRow([
      snLetter(idx),
      String(it?.description || it?.takeoffLine || ""),
      round2(safeNum(it?.qty)) || "",
      String(it?.unit || ""),
      round2(safeNum(it?.rate)) || "",
    ]);
    r.getCell(6).value = { formula: `C${r.number}*E${r.number}` };
    applyMoneyFormat(r.getCell(3));
    applyMoneyFormat(r.getCell(5));
    applyMoneyFormat(r.getCell(6));
    amountRows.push(r.number);
  });

  if (amountRows.length) {
    ws.addRow([]);
    const tot = ws.addRow([null, "UNMAPPED — to Main Building Summary", "", "", null, null]);
    tot.font = { bold: true };
    tot.fill = SUMMARY_TOTAL_FILL;
    tot.getCell(6).value = { formula: amountRows.map((n) => `F${n}`).join("+") };
    applyMoneyFormat(tot.getCell(6));
    return { sheet: ws, totalCellAddr: `'${ws.name}'!F${tot.number}` };
  }
  return null;
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
    formula: billRowNumbers.map((n) => `C${n}`).join("+") || "0",
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
   Bill resolution (variants)
   ========================= */
function resolveBillVariant(bill, foundationType) {
  if (!bill?.variants) return bill;
  const chosen =
    bill.variants[foundationType] ||
    bill.variants.pad ||
    bill.variants[Object.keys(bill.variants)[0]];
  return {
    name: bill.name,
    kind: bill.kind,
    splitByLevel: bill.splitByLevel,
    elements: chosen?.elements || [],
  };
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
  mappingPath,
} = {}) {
  const mapping = loadMapping(mappingPath);
  const domain = domainForProductKey(productKey);
  const bt = normalizeBuildingType(buildingType);
  const variant = resolveVariant(mapping, domain, bt);

  const projectItems = Array.isArray(items) ? items : [];
  const ft =
    bt === "multistorey"
      ? normalizeFoundationType(foundationType || detectFoundationType(projectItems))
      : "pad";

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

  for (const billRaw of variant.bills || []) {
    const billResolved = resolveBill(mapping, billRaw);
    const bill = resolveBillVariant(billResolved, ft);

    if (bill.kind === "preliminaries") {
      const ref = writePreliminariesSheet(workbook, projectName);
      billRefs.push({ name: bill.name, totalCellAddr: ref.totalCellAddr });
      continue;
    }

    const ref = writeStandardBill({
      workbook,
      bill,
      projectItems,
      matchedSet,
    });
    billRefs.push({ name: bill.name, totalCellAddr: ref.totalCellAddr });
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
  const variantSuffix = bt === "multistorey" ? `Multi-Storey (${ft[0].toUpperCase() + ft.slice(1)})` : "Bungalow";

  return {
    buffer: Buffer.isBuffer(buf) ? buf : Buffer.from(buf),
    filename: `${safeName} - Elemental BOQ (${variantSuffix}).xlsx`,
  };
}
