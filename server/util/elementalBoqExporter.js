// server/util/elementalBoqExporter.js
//
// Generates a Nigerian-format Bill of Quantities workbook from project items.
// Sheet structure (Cover, Preliminaries, Substructure, ..., General Summary)
// is data-driven via assets/boq/elemental-mapping.json. Lookups search each
// project item's description/takeoffLine/materialName/type for an AND-of-words
// match against any of the configured lookup groups.
//
// Phase 1 focuses on getting the structure + descriptions + section grouping
// right. Preambles, formula-linked summary cells, foundation-type variants
// (raft / pile), per-type / per-level expansion, and full styling are
// follow-ups — they can be layered in here without changing the route or UI.

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
const SUBTOTAL_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
const SUMMARY_TOTAL_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E7EF" } };

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

// Resolve `ref: "domain.buildingType.BillName"` into the referenced bill's
// elements. Used so the multi-storey mapping doesn't have to copy the
// bungalow Preliminaries / Superstructure block.
function resolveBill(mapping, bill, currentDomain, currentBuildingType) {
  if (!bill?.ref) return bill;
  const parts = String(bill.ref).split(".");
  let node = mapping.domains;
  for (const p of parts) {
    if (!node || typeof node !== "object") return bill;
    node = node[p];
  }
  if (!node) return bill;

  // Two ref shapes are supported:
  //   "quiv.bungalow.Preliminaries" -> resolves to a single bill object
  //   "mep.bungalow"                -> resolves to a whole variant config
  if (Array.isArray(node?.bills)) {
    // Whole-variant reference shouldn't be used at bill-level, but tolerate it.
    return bill;
  }
  return { ...node, name: bill.name };
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

// AND-of-words: every word must appear (substring match) in the item haystack.
function itemMatchesGroup(haystack, words) {
  if (!Array.isArray(words) || !words.length) return false;
  for (const w of words) {
    const needle = String(w || "").toLowerCase();
    if (!needle) continue;
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

// Returns { qty, matchedItems[] } summed across matching project items.
function aggregateForItem(boqItem, projectItems, matchedSet) {
  const lookups = Array.isArray(boqItem?.lookups) ? boqItem.lookups : [];
  const combineMode = String(boqItem?.lookupCombine || "first"); // "first" | "sum"

  let qty = 0;
  let foundAnyGroup = false;
  const ratesSeen = [];

  for (const group of lookups) {
    let groupQty = 0;
    let groupHits = 0;
    for (let i = 0; i < projectItems.length; i++) {
      const it = projectItems[i];
      const haystack = itemHaystack(it);
      if (!itemMatchesGroup(haystack, group)) continue;
      groupQty += safeNum(it?.qty);
      groupHits += 1;
      if (matchedSet) matchedSet.add(i);
      const r = safeNum(it?.rate);
      if (r > 0) ratesSeen.push(r);
    }
    if (groupHits > 0) {
      foundAnyGroup = true;
      qty += groupQty;
      if (combineMode !== "sum") break; // first matching group wins
    }
  }

  if (!foundAnyGroup) return { qty: 0, rate: 0, matched: false };

  const divisor = safeNum(boqItem?.qtyDivisor);
  if (divisor > 0) qty = qty / divisor;

  // Pick a rate: the most common non-zero rate among matched items, falling
  // back to the configured defaultRate, falling back to 0.
  let rate = 0;
  if (ratesSeen.length) {
    // Average non-zero rates — simple and predictable for phase 1.
    rate = ratesSeen.reduce((acc, r) => acc + r, 0) / ratesSeen.length;
  }
  if (!rate) rate = safeNum(boqItem?.defaultRate);

  return { qty, rate, matched: true };
}

/* =========================
   Excel writing
   ========================= */
function snLetter(i) {
  // 0 -> A, 1 -> B, ... 25 -> Z, 26 -> AA, ...
  let n = i;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

function applyMoneyFormat(cell) {
  cell.numFmt = "#,##0.00";
}

function writeBillSheet({
  workbook,
  bill,
  projectItems,
  matchedSet,
  totalsBag,
}) {
  const ws = workbook.addWorksheet(safeSheetName(bill.name, workbook));
  ws.columns = [
    { header: "S/N", key: "sn", width: 6 },
    { header: "Description", key: "description", width: 60 },
    { header: "Qty", key: "qty", width: 12 },
    { header: "Unit", key: "unit", width: 10 },
    { header: "Rate", key: "rate", width: 14 },
    { header: "Amount", key: "amount", width: 16 },
  ];

  // Header row
  const headerRow = ws.getRow(1);
  headerRow.values = ["S/N", "DESCRIPTION", "QTY", "UNIT", "RATE", "AMOUNT"];
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = HEADER_FILL;
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 22;

  // Bill title row
  const titleRow = ws.addRow([null, String(bill.name || "").toUpperCase(), null, null, null, null]);
  titleRow.font = { bold: true, size: 12 };
  ws.mergeCells(titleRow.number, 1, titleRow.number, 6);
  titleRow.alignment = { horizontal: "center" };

  let billTotal = 0;
  let snIndex = 0;

  const elements = Array.isArray(bill.elements) ? bill.elements : [];

  for (const element of elements) {
    // Element heading row
    const elRow = ws.addRow([
      null,
      String(element.heading || "").toUpperCase(),
      null,
      null,
      null,
      null,
    ]);
    elRow.font = { bold: true };
    elRow.fill = HEADING_FILL;
    ws.mergeCells(elRow.number, 1, elRow.number, 6);

    const items = Array.isArray(element.items) ? element.items : [];
    let elementTotal = 0;

    for (const item of items) {
      let qty = 0;
      let rate = 0;
      let amount = 0;
      let matched = true;

      if (Number.isFinite(Number(item?.fixedAmount))) {
        amount = safeNum(item.fixedAmount);
        // For fixed-sum prelim/contingency rows, qty/rate left blank
      } else if (Array.isArray(item?.lookups) && item.lookups.length) {
        const agg = aggregateForItem(item, projectItems, matchedSet);
        qty = round2(agg.qty);
        rate = round2(agg.rate);
        amount = round2(qty * rate);
        matched = agg.matched;
      } else {
        // Manual line (e.g. preliminaries) — leave qty/rate blank
        qty = 0;
        rate = 0;
        amount = 0;
      }

      const row = ws.addRow({
        sn: snLetter(snIndex++),
        description: String(item.description || ""),
        qty: qty || (item?.fixedAmount != null ? "" : qty || ""),
        unit: String(item.unit || ""),
        rate: rate || (item?.fixedAmount != null ? "" : ""),
        amount: amount || "",
      });
      applyMoneyFormat(row.getCell("qty"));
      applyMoneyFormat(row.getCell("rate"));
      applyMoneyFormat(row.getCell("amount"));

      if (!matched && Array.isArray(item?.lookups) && item.lookups.length) {
        // Soft visual cue when nothing in the takeoff matched — easy to spot.
        row.getCell("description").font = { italic: true, color: { argb: "FF94A3B8" } };
      }

      elementTotal += amount;
    }

    if (items.length) {
      const elTot = ws.addRow([
        null,
        `Subtotal — ${element.heading}`,
        null,
        null,
        null,
        round2(elementTotal),
      ]);
      elTot.font = { italic: true, bold: true };
      elTot.fill = SUBTOTAL_FILL;
      applyMoneyFormat(elTot.getCell(6));
    }

    billTotal += elementTotal;
    ws.addRow([]);
  }

  // Bill total
  const totalRow = ws.addRow([
    null,
    `TOTAL — ${String(bill.name).toUpperCase()}`,
    null,
    null,
    null,
    round2(billTotal),
  ]);
  totalRow.font = { bold: true };
  totalRow.fill = SUMMARY_TOTAL_FILL;
  applyMoneyFormat(totalRow.getCell(6));

  totalsBag.push({ name: bill.name, total: billTotal });

  return ws;
}

function writeCoverSheet(workbook, { projectName, variantTitle, buildingType }) {
  const ws = workbook.addWorksheet("Cover");
  ws.columns = [{ width: 24 }, { width: 60 }];

  ws.addRow([]);
  const titleRow = ws.addRow([null, variantTitle || "Bill of Quantities"]);
  titleRow.font = { bold: true, size: 18 };
  ws.addRow([]);
  ws.addRow(["Project", projectName || "Project"]);
  ws.addRow(["Building type", buildingType === "multistorey" ? "Multi-Storey" : "Bungalow"]);
  ws.addRow(["Generated", dayjs().format("YYYY-MM-DD HH:mm")]);
}

function writeUnmappedSheet(workbook, projectItems, matchedSet) {
  const unmatched = projectItems
    .map((it, i) => ({ it, i }))
    .filter(({ i }) => !matchedSet.has(i));
  if (!unmatched.length) return;

  const ws = workbook.addWorksheet("Unmapped");
  ws.columns = [
    { header: "S/N", key: "sn", width: 6 },
    { header: "Description", key: "description", width: 60 },
    { header: "Qty", key: "qty", width: 12 },
    { header: "Unit", key: "unit", width: 10 },
    { header: "Rate", key: "rate", width: 14 },
    { header: "Amount", key: "amount", width: 16 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = HEADER_FILL;
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };

  const note = ws.addRow([
    null,
    "Items below were not matched to any BoQ line in this template. " +
      "Update the BoQ mapping (assets/boq/elemental-mapping.json) to include them.",
  ]);
  note.font = { italic: true, color: { argb: "FF64748B" } };
  ws.mergeCells(note.number, 1, note.number, 6);

  unmatched.forEach(({ it }, idx) => {
    const qty = safeNum(it?.qty);
    const rate = safeNum(it?.rate);
    const amount = qty * rate;
    const row = ws.addRow({
      sn: snLetter(idx),
      description: String(it?.description || it?.takeoffLine || ""),
      qty: round2(qty),
      unit: String(it?.unit || ""),
      rate: round2(rate),
      amount: round2(amount),
    });
    applyMoneyFormat(row.getCell("qty"));
    applyMoneyFormat(row.getCell("rate"));
    applyMoneyFormat(row.getCell("amount"));
  });
}

function writeSummarySheet(workbook, totals) {
  const ws = workbook.addWorksheet("General Summary");
  ws.columns = [
    { header: "S/N", key: "sn", width: 6 },
    { header: "Bill", key: "bill", width: 36 },
    { header: "Amount", key: "amount", width: 18 },
  ];
  const header = ws.getRow(1);
  header.values = ["S/N", "BILL", "AMOUNT"];
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = HEADER_FILL;
  header.alignment = { vertical: "middle", horizontal: "center" };

  let subtotal = 0;
  totals.forEach((t, i) => {
    const row = ws.addRow({
      sn: snLetter(i),
      bill: t.name,
      amount: round2(t.total),
    });
    applyMoneyFormat(row.getCell("amount"));
    subtotal += t.total;
  });

  ws.addRow([]);

  const sub = ws.addRow({ sn: "", bill: "Sub-total", amount: round2(subtotal) });
  sub.font = { bold: true };
  sub.fill = SUMMARY_TOTAL_FILL;
  applyMoneyFormat(sub.getCell("amount"));

  const contingency = subtotal * 0.05;
  const cont = ws.addRow({
    sn: "",
    bill: "Allow for contingencies (5%)",
    amount: round2(contingency),
  });
  applyMoneyFormat(cont.getCell("amount"));

  const beforeVat = subtotal + contingency;
  const vat = beforeVat * 0.075;
  const vatRow = ws.addRow({
    sn: "",
    bill: "VAT (7.5%)",
    amount: round2(vat),
  });
  applyMoneyFormat(vatRow.getCell("amount"));

  const final = ws.addRow({
    sn: "",
    bill: "FINAL SUM",
    amount: round2(beforeVat + vat),
  });
  final.font = { bold: true, size: 12 };
  final.fill = SUMMARY_TOTAL_FILL;
  applyMoneyFormat(final.getCell("amount"));
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

/* =========================
   Public API
   ========================= */
export async function exportElementalBoQ({
  projectName = "Project",
  items = [],
  productKey = "",
  buildingType = "bungalow",
  mappingPath,
} = {}) {
  const mapping = loadMapping(mappingPath);
  const domain = domainForProductKey(productKey);
  const variant = resolveVariant(mapping, domain, normalizeBuildingType(buildingType));

  const workbook = new ExcelJS.Workbook();
  workbook.calcProperties.fullCalcOnLoad = true;

  writeCoverSheet(workbook, {
    projectName,
    variantTitle: variant.title,
    buildingType: normalizeBuildingType(buildingType),
  });

  const projectItems = Array.isArray(items) ? items : [];
  const matchedSet = new Set();
  const totals = [];

  for (const billRaw of variant.bills || []) {
    const bill = resolveBill(mapping, billRaw, domain, normalizeBuildingType(buildingType));
    writeBillSheet({
      workbook,
      bill,
      projectItems,
      matchedSet,
      totalsBag: totals,
    });
  }

  writeUnmappedSheet(workbook, projectItems, matchedSet);
  writeSummarySheet(workbook, totals);

  const buf = await workbook.xlsx.writeBuffer();
  const safeName = String(projectName || "Project")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  const variantSuffix =
    normalizeBuildingType(buildingType) === "multistorey" ? "Multi-Storey" : "Bungalow";

  return {
    buffer: Buffer.isBuffer(buf) ? buf : Buffer.from(buf),
    filename: `${safeName} - Elemental BOQ (${variantSuffix}).xlsx`,
  };
}
