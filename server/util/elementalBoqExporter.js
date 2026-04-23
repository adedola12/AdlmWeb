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

const TRADE_MAPPING_PATH = path.join(
  __dirname,
  "..",
  "assets",
  "boq",
  "trade-mapping.json",
);

function resolveMappingPath(format, explicit) {
  if (explicit) return explicit;
  const f = String(format || "").toLowerCase();
  if (f === "trade" || f === "work-section" || f === "worksection") {
    return TRADE_MAPPING_PATH;
  }
  return DEFAULT_MAPPING_PATH;
}

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

// Group matched items by a stable key (normalized description) so each
// distinct size/type renders as its own row. Items with the same key get
// their qty summed and rate weighted-averaged.
function groupMatchesByDescription(matches) {
  const groups = new Map();
  for (const m of matches) {
    const rawDesc = String(
      m.item?.description ||
        m.item?.takeoffLine ||
        m.item?.materialName ||
        m.item?.type ||
        "",
    ).trim();
    const unit = String(m.item?.unit || "").trim();
    const key = normalizeText(`${rawDesc}|${unit}`);
    if (!groups.has(key)) {
      groups.set(key, {
        description: rawDesc || "(unnamed)",
        unit,
        matches: [],
      });
    }
    groups.get(key).matches.push(m);
  }
  return [...groups.values()];
}

function planExpandedItem(boqItem, projectItems, matchedSet) {
  const matches = findMatchingItems(boqItem, projectItems, matchedSet);
  if (!matches.length) return null;

  const groups = groupMatchesByDescription(matches);
  const rows = groups
    .map((g) => {
      const agg = aggregateMatches(boqItem, g.matches);
      if (agg.qty <= 0) return null;
      return {
        description: g.description,
        unit: g.unit || boqItem.unit || "",
        qty: agg.qty,
        rate: agg.rate,
      };
    })
    .filter(Boolean);

  if (!rows.length) return null;

  return {
    kind: "expanded",
    description: boqItem.description,
    unit: boqItem.unit || "",
    rows,
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
      let planned;
      if (item?.expandMatches) {
        planned =
          planExpandedItem(item, projectItems, matchedSet) ||
          planItem(item, projectItems, matchedSet);
      } else if (splitByLevel) {
        planned =
          planLevelSplitItem(item, projectItems, matchedSet) ||
          planItem(item, projectItems, matchedSet);
      } else {
        planned = planItem(item, projectItems, matchedSet);
      }
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
function writePreliminariesSheet(workbook, projectName, opts = {}) {
  const {
    preliminaryItems = [],
    preliminaryPool = 0, // total preliminary amount (pool)
    preliminaryPercent = 0,
  } = opts;

  const ws = workbook.addWorksheet(safeSheetName("Preliminaries", workbook));
  ws.columns = [
    { header: "S/N", key: "sn", width: 6 },
    { header: "PRELIMINARY ITEM", key: "description", width: 48 },
    { header: "ALLOC %", key: "alloc", width: 10 },
    { header: "AMOUNT", key: "amount", width: 14 },
    { header: "DONE", key: "done", width: 8 },
    { header: "DONE AMOUNT", key: "doneAmount", width: 16 },
  ];

  const titleRow = ws.getRow(1);
  titleRow.values = ["S/N", "PRELIMINARY ITEM", "ALLOC %", "AMOUNT", "DONE", "DONE AMOUNT"];
  titleRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  titleRow.fill = HEADER_FILL;
  titleRow.alignment = { horizontal: "center" };

  const sub = ws.addRow([
    null,
    `BREAKDOWN OF PRELIMINARIES — ${projectName || "Project"}` +
      (preliminaryPercent ? ` · ${safeNum(preliminaryPercent).toFixed(1)}% of measured + PC` : ""),
  ]);
  sub.font = { bold: true };
  ws.mergeCells(sub.number, 2, sub.number, 6);

  // Use the project's actual items if present, otherwise fall back to the
  // BESMM4 checklist with an even allocation so the sheet still has content.
  const rowsToRender = Array.isArray(preliminaryItems) && preliminaryItems.length
    ? preliminaryItems
    : PRELIMINARIES_ITEMS.map((name) => ({
        name,
        allocation: Number((100 / PRELIMINARIES_ITEMS.length).toFixed(2)),
        completed: false,
      }));

  const totalAlloc = rowsToRender.reduce(
    (acc, p) => acc + safeNum(p?.allocation),
    0,
  );
  const allocBase = totalAlloc > 0 ? totalAlloc : 100;
  const pool = safeNum(preliminaryPool);

  const amountRowNumbers = [];
  const doneAmountRowNumbers = [];
  rowsToRender.forEach((p, i) => {
    const alloc = safeNum(p?.allocation);
    const amount = pool > 0 ? (pool * alloc) / allocBase : 0;
    const done = Boolean(p?.completed);
    const row = ws.addRow([
      i + 1,
      String(p?.name || ""),
      alloc,
      round2(amount),
      done ? "✓" : "",
      done ? round2(amount) : 0,
    ]);
    applyMoneyFormat(row.getCell(4));
    applyMoneyFormat(row.getCell(6));
    if (done) {
      row.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFD1FAE5" },
      };
    }
    amountRowNumbers.push(row.number);
    doneAmountRowNumbers.push(row.number);
  });

  ws.addRow([]);
  // Pool total
  const poolRow = ws.addRow([
    null,
    "PRELIMINARIES — Pool (to Main Building Summary)",
    null,
    null,
    null,
    null,
  ]);
  poolRow.font = { bold: true };
  poolRow.fill = SUMMARY_TOTAL_FILL;
  poolRow.getCell(4).value = {
    formula: amountRowNumbers.length
      ? `SUM(D${amountRowNumbers[0]}:D${amountRowNumbers[amountRowNumbers.length - 1]})`
      : "0",
  };
  applyMoneyFormat(poolRow.getCell(4));

  // Done total
  const doneRow = ws.addRow([
    null,
    "Preliminaries — Done to date",
    null,
    null,
    null,
    null,
  ]);
  doneRow.font = { bold: true, color: { argb: "FF065F46" } };
  doneRow.getCell(6).value = {
    formula: doneAmountRowNumbers.length
      ? `SUM(F${doneAmountRowNumbers[0]}:F${doneAmountRowNumbers[doneAmountRowNumbers.length - 1]})`
      : "0",
  };
  applyMoneyFormat(doneRow.getCell(6));

  // Outstanding total
  const outRow = ws.addRow([
    null,
    "Preliminaries — Outstanding",
    null,
    null,
    null,
    null,
  ]);
  outRow.font = { bold: true, color: { argb: "FF1E40AF" } };
  outRow.getCell(6).value = {
    formula: `D${poolRow.number}-F${doneRow.number}`,
  };
  applyMoneyFormat(outRow.getCell(6));

  return {
    sheet: ws,
    totalCellAddr: `Preliminaries!D${poolRow.number}`,
    doneCellAddr: `Preliminaries!F${doneRow.number}`,
    outstandingCellAddr: `Preliminaries!F${outRow.number}`,
  };
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

      if (item.kind === "expanded") {
        // Bold sub-heading for the template line, then one row per distinct
        // matched size/type (e.g. each diffuser size, each duct size).
        const head = ws.addRow([null, item.description]);
        head.font = { bold: true };
        ws.mergeCells(head.number, 2, head.number, 6);

        for (const er of item.rows) {
          const r = writeAmountRow(ws, {
            code: snLetter(snIndex++),
            description: er.description,
            unit: er.unit || item.unit,
            qty: er.qty,
            rate: er.rate,
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
   Variations (instruction-driven)
   ========================= */
function writeVariationsSheet(workbook, variations) {
  const cleaned = (Array.isArray(variations) ? variations : [])
    .map((v) => ({
      description: String(v?.description || "").trim(),
      qty: safeNum(v?.qty),
      unit: String(v?.unit || "").trim(),
      rate: safeNum(v?.rate),
      reference: String(v?.reference || "").trim(),
      issuedAt: v?.issuedAt ? new Date(v.issuedAt) : null,
    }))
    .filter((v) => v.description || v.qty > 0 || v.rate > 0);

  if (!cleaned.length) return null;

  const ws = workbook.addWorksheet(safeSheetName("Variations", workbook));
  ws.columns = [
    { header: "Item", key: "item", width: 6 },
    { header: "Reference", key: "reference", width: 18 },
    { header: "Description", key: "description", width: 50 },
    { header: "Qty", key: "qty", width: 12 },
    { header: "Unit", key: "unit", width: 10 },
    { header: "Rate", key: "rate", width: 14 },
    { header: "Amount", key: "amount", width: 16 },
    { header: "Issued", key: "issuedAt", width: 14 },
  ];
  const hdr = ws.getRow(1);
  hdr.font = { bold: true, color: { argb: "FFFFFFFF" } };
  hdr.fill = HEADER_FILL;
  hdr.alignment = { horizontal: "center" };

  const titleRow = ws.addRow([null, "VARIATIONS — Site Instructions / Change Orders"]);
  titleRow.font = { bold: true, size: 12 };
  ws.mergeCells(titleRow.number, 2, titleRow.number, 8);

  const preamble = ws.addRow([
    null,
    "Variations logged against the project — separate from measured work variance captured on individual BoQ items.",
  ]);
  preamble.font = { italic: true, color: { argb: "FF475569" } };
  ws.mergeCells(preamble.number, 2, preamble.number, 8);

  const amountRows = [];
  cleaned.forEach((v, i) => {
    const row = ws.addRow([
      snLetter(i),
      v.reference || null,
      v.description,
      v.qty > 0 ? v.qty : null,
      v.unit || null,
      v.rate > 0 ? v.rate : null,
      null,
      v.issuedAt ? dayjs(v.issuedAt).format("YYYY-MM-DD") : null,
    ]);
    row.getCell(7).value = {
      formula: `IFERROR(D${row.number}*F${row.number},0)`,
    };
    applyMoneyFormat(row.getCell(4));
    applyMoneyFormat(row.getCell(6));
    applyMoneyFormat(row.getCell(7));
    amountRows.push(row.number);
  });

  ws.addRow([]);
  const totalRow = ws.addRow([
    null,
    null,
    "VARIATIONS — to Main Building Summary",
    null,
    null,
    null,
    null,
    null,
  ]);
  totalRow.font = { bold: true };
  totalRow.fill = SUMMARY_TOTAL_FILL;
  totalRow.getCell(7).value = {
    formula: amountRows.length ? amountRows.map((n) => `G${n}`).join("+") : "0",
  };
  applyMoneyFormat(totalRow.getCell(7));

  return { sheet: ws, totalCellAddr: `'${ws.name}'!G${totalRow.number}` };
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

  // "Total Finish Area" rollups are true double-counts of the individual wall
  // finishes so we still drop them. Model-Item lines, on the other hand, now
  // have a home in the Trade-format Decoration bill (and should be visible in
  // the Elemental Other-items sheet as well).
  const isBulkTotalLine = (it) => {
    const h = normalizeText(
      [it?.description, it?.takeoffLine, it?.materialName, it?.type]
        .map((v) => String(v || ""))
        .join(" "),
    );
    return h.includes("total finish area");
  };

  const usable = unmatched.filter(({ it }) => !isBulkTotalLine(it));
  if (!usable.length) return null;

  // Group the unmatched items by their UI category so users can see they ARE
  // categorized — they just didn't match a specific elemental BoQ line.
  const byCategory = new Map();
  for (const u of usable) {
    const cat = String(u.it?.category || "").trim() || "Uncategorized";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(u);
  }

  const ws = workbook.addWorksheet(safeSheetName("Other items", workbook));
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
  hdr.alignment = { horizontal: "center" };

  const note = ws.addRow([
    null,
    "Additional items grouped by their UI category. These are priced and added to the project total — they simply did not match a specific line in this elemental template.",
  ]);
  note.font = { italic: true, color: { argb: "FF64748B" } };
  note.alignment = { wrapText: true, vertical: "top" };
  ws.mergeCells(note.number, 1, note.number, 6);

  const amountRows = [];
  const subtotalByCat = new Map();

  // Stable ordering: match the canonical category order used elsewhere.
  const orderedCats = [...byCategory.keys()].sort((a, b) => {
    const preferred = ["Substructure", "Frames", "Frame", "Superstructure", "Staircase", "Landscaping", "HVAC", "Plumbing", "Electrical"];
    const ai = preferred.indexOf(a);
    const bi = preferred.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  for (const cat of orderedCats) {
    ws.addRow([]);
    const head = ws.addRow([null, String(cat).toUpperCase()]);
    head.font = { bold: true };
    head.fill = HEADING_FILL;
    ws.mergeCells(head.number, 2, head.number, 6);

    const catRows = byCategory.get(cat) || [];
    const catAmountRows = [];
    catRows.forEach(({ it }, idx) => {
      const r = writeAmountRow(ws, {
        code: snLetter(idx),
        description: String(it?.description || it?.takeoffLine || ""),
        unit: String(it?.unit || ""),
        qty: round2(safeNum(it?.qty)),
        rate: round2(safeNum(it?.rate)),
      });
      amountRows.push(r.number);
      catAmountRows.push(r.number);
    });

    const sub = ws.addRow([
      null,
      `Subtotal — ${cat}`,
      null,
      null,
      null,
      null,
    ]);
    sub.font = { bold: true };
    sub.fill = SUMMARY_TOTAL_FILL;
    sub.getCell(6).value = {
      formula: catAmountRows.length
        ? catAmountRows.map((n) => `F${n}`).join("+")
        : "0",
    };
    applyMoneyFormat(sub.getCell(6));
    subtotalByCat.set(cat, sub.number);
  }

  if (!amountRows.length) return null;

  ws.addRow([]);
  const tot = ws.addRow([null, "OTHER ITEMS — to Main Building Summary", null, null, null, null]);
  tot.font = { bold: true };
  tot.fill = SUMMARY_TOTAL_FILL;
  tot.getCell(6).value = { formula: amountRows.map((n) => `F${n}`).join("+") };
  applyMoneyFormat(tot.getCell(6));
  return { sheet: ws, totalCellAddr: `'${ws.name}'!F${tot.number}` };
}

/* =========================
   Combined Trade-Format sheet writer
   =========================
   Trade BoQ convention: after Cover + Preliminaries, all measured work lives
   on a SINGLE worksheet with each trade (Concrete, Formwork, Reinforcement,
   Masonry, Finishes, etc.) rendered as a bold section with its own subtotal.
   The Prelim, Provisional Sums, Variations and "Other items" sheets remain
   separate and are referenced in the General Summary. */
function writeCombinedTradeSheet({ workbook, plannedBills, sheetName = "Trade BoQ" }) {
  const billsWithContent = plannedBills.filter(
    (pb) => pb && pb.kind === "standard" && Array.isArray(pb.elements) && pb.elements.length,
  );
  if (!billsWithContent.length) return null;

  const ws = workbook.addWorksheet(safeSheetName(sheetName, workbook));
  ws.columns = [
    { header: "Item", key: "item", width: 6 },
    { header: "Description", key: "description", width: 60 },
    { header: "Qty", key: "qty", width: 12 },
    { header: "Unit", key: "unit", width: 10 },
    { header: "Rate", key: "rate", width: 14 },
    { header: "Amount", key: "amount", width: 16 },
  ];
  writeBillHeader(ws, sheetName);

  const allAmountRows = [];
  const billSubtotalRows = [];

  for (const plannedBill of billsWithContent) {
    // Bill (trade) banner — bold navy header row.
    ws.addRow([]);
    const bannerRow = ws.addRow([null, String(plannedBill.name || "").toUpperCase()]);
    bannerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
    bannerRow.fill = HEADER_FILL;
    bannerRow.alignment = { vertical: "middle" };
    bannerRow.height = 20;
    ws.mergeCells(bannerRow.number, 2, bannerRow.number, 6);

    const billAmountRows = [];
    let snIndex = 0;

    for (const element of plannedBill.elements) {
      // Element heading.
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
          billAmountRows.push(r.number);
          allAmountRows.push(r.number);
          continue;
        }

        if (item.kind === "leveled") {
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
            billAmountRows.push(r.number);
            allAmountRows.push(r.number);
          }
          continue;
        }

        if (item.kind === "expanded") {
          const head = ws.addRow([null, item.description]);
          head.font = { bold: true };
          ws.mergeCells(head.number, 2, head.number, 6);

          for (const er of item.rows) {
            const r = writeAmountRow(ws, {
              code: snLetter(snIndex++),
              description: er.description,
              unit: er.unit || item.unit,
              qty: er.qty,
              rate: er.rate,
            });
            billAmountRows.push(r.number);
            allAmountRows.push(r.number);
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
        billAmountRows.push(r.number);
        allAmountRows.push(r.number);
      }
    }

    ws.addRow([]);
    const sub = ws.addRow([
      null,
      `${String(plannedBill.name).toUpperCase()} — Subtotal`,
      null,
      null,
      null,
      null,
    ]);
    sub.font = { bold: true };
    sub.fill = SUMMARY_TOTAL_FILL;
    sub.getCell(6).value = {
      formula: billAmountRows.length
        ? billAmountRows.map((n) => `F${n}`).join("+")
        : "0",
    };
    applyMoneyFormat(sub.getCell(6));
    billSubtotalRows.push({ name: plannedBill.name, rowNumber: sub.number });
  }

  // Grand total row for the whole combined sheet.
  ws.addRow([]);
  const grand = ws.addRow([null, "TRADE BoQ — Grand Total to Summary", null, null, null, null]);
  grand.font = { bold: true, size: 12 };
  grand.fill = SUMMARY_TOTAL_FILL;
  grand.getCell(6).value = {
    formula: billSubtotalRows.length
      ? billSubtotalRows.map((b) => `F${b.rowNumber}`).join("+")
      : "0",
  };
  applyMoneyFormat(grand.getCell(6));

  return {
    sheet: ws,
    totalCellAddr: `'${ws.name}'!F${grand.number}`,
    subtotalRefs: billSubtotalRows.map((b) => ({
      name: b.name,
      cellAddr: `'${ws.name}'!F${b.rowNumber}`,
    })),
  };
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
  variations = [],
  preliminaryItems = [],
  preliminaryPercent = 0,
  mappingPath,
  format = "elemental", // "elemental" | "trade"
} = {}) {
  const resolvedPath = resolveMappingPath(format, mappingPath);
  const mapping = loadMapping(resolvedPath);
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
  const isTrade =
    String(format || "elemental").toLowerCase() === "trade";

  // Pre-compute the preliminary pool (measured total + provisional) × %
  // so the Preliminaries sheet can render allocations with real numbers.
  const measuredTotal = projectItems.reduce(
    (acc, it) => acc + safeNum(it?.qty) * safeNum(it?.rate),
    0,
  );
  const provisionalTotal = (provisionalSums || []).reduce(
    (acc, s) => acc + safeNum(s?.amount),
    0,
  );
  const preliminaryPool =
    ((measuredTotal + provisionalTotal) * safeNum(preliminaryPercent)) / 100;
  const prelimOpts = { preliminaryItems, preliminaryPool, preliminaryPercent };

  if (isTrade) {
    // Trade format: Preliminaries gets its own sheet (per convention), then
    // every other planned bill is rendered as a section on a single sheet.
    const plannedStandardBills = [];
    for (const billRaw of variant.bills || []) {
      const billResolved = resolveBill(mapping, billRaw);
      if (billResolved.kind === "preliminaries") {
        const ref = writePreliminariesSheet(workbook, projectName, prelimOpts);
        billRefs.push({ name: billResolved.name, totalCellAddr: ref.totalCellAddr });
        continue;
      }
      const planned = planBill(billResolved, projectItems, matchedSet);
      if (planned) plannedStandardBills.push(planned);
    }

    const combined = writeCombinedTradeSheet({
      workbook,
      plannedBills: plannedStandardBills,
      sheetName: "Trade BoQ",
    });
    if (combined) {
      // In the General Summary, surface one line per trade referencing the
      // trade's subtotal cell — keeps the same breakdown the contractor expects
      // without cluttering the workbook with separate tabs.
      for (const sub of combined.subtotalRefs) {
        billRefs.push({ name: sub.name, totalCellAddr: sub.cellAddr });
      }
    }
  } else {
    // Elemental format: one sheet per bill, as before.
    for (const billRaw of variant.bills || []) {
      const billResolved = resolveBill(mapping, billRaw);

      if (billResolved.kind === "preliminaries") {
        const ref = writePreliminariesSheet(workbook, projectName, prelimOpts);
        billRefs.push({ name: billResolved.name, totalCellAddr: ref.totalCellAddr });
        continue;
      }

      const planned = planBill(billResolved, projectItems, matchedSet);
      if (!planned) continue;

      const ref = writeStandardBill({ workbook, plannedBill: planned });
      billRefs.push({ name: planned.name, totalCellAddr: ref.totalCellAddr });
    }
  }

  const provRef = writeProvisionalSumsSheet(workbook, provisionalSums);
  if (provRef) {
    billRefs.push({ name: "Provisional Sums", totalCellAddr: provRef.totalCellAddr });
  }

  const varRef = writeVariationsSheet(workbook, variations);
  if (varRef) {
    billRefs.push({ name: "Variations", totalCellAddr: varRef.totalCellAddr });
  }

  const unmappedRef = writeUnmappedSheet(workbook, projectItems, matchedSet);
  if (unmappedRef) {
    billRefs.push({ name: "Other items", totalCellAddr: unmappedRef.totalCellAddr });
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

  const formatLabel =
    String(format || "elemental").toLowerCase() === "trade"
      ? "Trade"
      : "Elemental";

  return {
    buffer: Buffer.isBuffer(buf) ? buf : Buffer.from(buf),
    filename: `${safeName} - ${formatLabel} BOQ (${variantSuffix}).xlsx`,
  };
}
