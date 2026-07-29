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
   Work Breakdown Structure / milestone attribution
   ========================= */
// The stage a level belongs to. QUIV writes the Revit level name straight
// through, so the same storey arrives as "00 - GROUND FLOOR", "01 GROUND
// FLOOR" and "01 - GROUND FLOOR LVL." across projects; without folding those
// together a WBS would list one storey three times.
const STAGE_ORDER = [
  [/\b(substruct|sub-struct|foundation|ngl|oversite|site\s*clear)/i, "SUBSTRUCTURE"],
  [/\bbasement/i, "BASEMENT"],
  [/\bground\b/i, "GROUND FLOOR"],
  [/\b(first|1st)\b/i, "FIRST FLOOR"],
  [/\b(second|2nd)\b/i, "SECOND FLOOR"],
  [/\b(third|3rd)\b/i, "THIRD FLOOR"],
  [/\b(fourth|4th)\b/i, "FOURTH FLOOR"],
  [/\b(fifth|5th)\b/i, "FIFTH FLOOR"],
  [/\b(sixth|6th)\b/i, "SIXTH FLOOR"],
  [/\b(seventh|7th)\b/i, "SEVENTH FLOOR"],
  [/\b(eighth|8th)\b/i, "EIGHTH FLOOR"],
  [/\b(ninth|9th)\b/i, "NINTH FLOOR"],
  [/\b(tenth|10th)\b/i, "TENTH FLOOR"],
  [/\b(penthouse|pent)\b/i, "PENTHOUSE"],
  [/\b(roof|parapet)\b/i, "ROOF LEVEL"],
  [/\bceiling\b/i, "CEILING LEVEL"],
];

// Levels that deliberately mean "not one storey". These must not be invented
// into a floor — the money genuinely spans the building.
const GENERAL_STAGE = "GENERALLY (ALL FLOORS)";
const GENERAL_RE = /^(all\s*floors?|multiple(\s*levels?)?|multiple\s*\/|various|generally|n\/?a)?$/i;

function normalizeStage(level) {
  const raw = String(level || "").trim();
  // QUIV writes a placeholder like "< ALL / NO LEVEL >" when the takeoff was
  // not level-scoped; that is an absence of a level, not a storey called "all".
  if (!raw || GENERAL_RE.test(raw) || /^multiple\b/i.test(raw) || /no\s*level/i.test(raw)) {
    return GENERAL_STAGE;
  }
  for (const [re, stage] of STAGE_ORDER) {
    if (re.test(raw)) return stage;
  }
  // Not a storey we recognise. MEP takeoffs put the system here ("Cable",
  // "Lighting", "DB"), which is still a legitimate breakdown axis, so keep the
  // label rather than dumping it into GENERALLY.
  return raw.toUpperCase();
}

function stageRank(stage) {
  if (stage === GENERAL_STAGE) return 9999;
  const i = STAGE_ORDER.findIndex(([, s]) => s === stage);
  return i === -1 ? 5000 : i;
}

/**
 * How one bill row's money divides across stages.
 *
 * Most bill rows aggregate several takeoff items — only the multistorey Frame
 * bill splits by level — so a row rarely belongs to a single storey. Rather
 * than dropping those rows (which would make the WBS total disagree with the
 * bill) each row is apportioned across the stages its own matched items came
 * from, weighted by their value. The weights always sum to 1, so the WBS
 * reconciles to the bill exactly.
 *
 * @returns {Array<{stage: string, weight: number}>}
 */
function stageSplitFromMatches(matches) {
  const list = Array.isArray(matches) ? matches : [];
  if (!list.length) return [{ stage: GENERAL_STAGE, weight: 1 }];

  const byStage = new Map();
  let total = 0;
  for (const m of list) {
    const stage = normalizeStage(m?.item?.level);
    // Value is the honest weight; fall back to quantity, then to presence, so
    // an unrated or unmeasured line still lands somewhere.
    const w = safeNum(m?.item?.qty) * safeNum(m?.item?.rate) || safeNum(m?.item?.qty) || 1;
    byStage.set(stage, (byStage.get(stage) || 0) + w);
    total += w;
  }
  if (!(total > 0)) return [{ stage: GENERAL_STAGE, weight: 1 }];

  const out = [...byStage.entries()]
    .map(([stage, w]) => ({ stage, weight: w / total }))
    .sort((a, b) => stageRank(a.stage) - stageRank(b.stage) || a.stage.localeCompare(b.stage));

  // Force the weights to sum to exactly 1 after rounding, so the WBS grand
  // total cannot drift a naira from the bill it is built on.
  const rounded = out.map((s) => ({ stage: s.stage, weight: Math.round(s.weight * 1e6) / 1e6 }));
  const drift = 1 - rounded.reduce((a, s) => a + s.weight, 0);
  if (rounded.length) rounded[0].weight = Math.round((rounded[0].weight + drift) * 1e6) / 1e6;
  return rounded;
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
      // A fixed sum is not measured off any element, so it has no level.
      stageSplit: [{ stage: GENERAL_STAGE, weight: 1 }],
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
    stageSplit: stageSplitFromMatches(matches),
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
        stageSplit: stageSplitFromMatches(g.matches),
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
        // This bill already split by level, so the stage is known exactly and
        // needs no apportioning.
        stageSplit: [{ stage: normalizeStage(level), weight: 1 }],
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
  // Laid out as a PRICEABLE preliminaries bill, matching the format ADLM's QSs
  // issue: ITEM | DESCRIPTION | QTY | UNIT | RATE | AMOUNT, items lettered
  // A B C … H J K (no "I"), one blank row between each, unit "Item".
  //
  // The previous layout (S/N | PRELIMINARY ITEM | ALLOC % | AMOUNT | DONE |
  // DONE AMOUNT) exposed ADLM's internal percentage-allocation model. That is a
  // valuation view, not a bill — a contractor receiving it cannot price the
  // preliminaries, they are handed a pre-apportioned percentage. The allocation
  // still drives the AMOUNT column, so no information is lost; it is simply
  // presented as money against an item, which is what a bill is.
  ws.columns = [
    { header: "ITEM", key: "item", width: 8 },
    { header: "DESCRIPTION", key: "description", width: 60 },
    { header: "QTY", key: "qty", width: 10 },
    { header: "UNIT", key: "unit", width: 10 },
    { header: "RATE", key: "rate", width: 16 },
    { header: "AMOUNT", key: "amount", width: 18 },
  ];

  const titleRow = ws.getRow(1);
  titleRow.values = ["ITEM", "DESCRIPTION", "QTY", "UNIT", "RATE", "AMOUNT"];
  titleRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  titleRow.fill = HEADER_FILL;
  titleRow.alignment = { horizontal: "center" };

  ws.addRow([]);
  const billHeadRow = ws.addRow([null, "BILL NR. 1 - PRELIMINARIES"]);
  billHeadRow.font = { bold: true, size: 12 };
  billHeadRow.alignment = { horizontal: "center" };
  ws.mergeCells(billHeadRow.number, 2, billHeadRow.number, 6);

  ws.addRow([]);
  const sub = ws.addRow([
    null,
    "Allow for the provision of the following preliminary items" +
      (preliminaryPercent
        ? ` (${safeNum(preliminaryPercent).toFixed(1)}% of measured work and provisional sums)`
        : ""),
  ]);
  sub.font = { italic: true };
  sub.alignment = { wrapText: true };
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
    // Blank line between items, as in a hand-written bill.
    ws.addRow([]);
    const alloc = safeNum(p?.allocation);
    const amount = pool > 0 ? (pool * alloc) / allocBase : 0;
    const done = Boolean(p?.completed);
    const row = ws.addRow([
      snLetter(i),
      String(p?.name || ""),
      null,
      "Item",
      null,
      round2(amount),
    ]);
    row.getCell(1).alignment = { horizontal: "center" };
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
    applyMoneyFormat(row.getCell(6));
    amountRowNumbers.push(row.number);
    if (done) doneAmountRowNumbers.push(row.number);
  });

  ws.addRow([]);
  // Carried-to-summary line, worded and placed as the QSs' bills do.
  const poolRow = ws.addRow([
    null,
    "PRELIMINARIES CARRIED TO GENERAL SUMMARY",
    null,
    null,
    "₦",
    null,
  ]);
  poolRow.font = { bold: true };
  poolRow.fill = SUMMARY_TOTAL_FILL;
  poolRow.getCell(5).alignment = { horizontal: "right" };
  // Items are on alternating rows now, so a SUM range would swallow the blank
  // spacer rows. Harmless for a sum, but an explicit list keeps the formula
  // readable and survives anyone inserting a row in the gaps.
  poolRow.getCell(6).value = {
    formula: amountRowNumbers.length
      ? amountRowNumbers.map((n) => `F${n}`).join("+")
      : "0",
  };
  applyMoneyFormat(poolRow.getCell(6));

  // Valuation figures sit BELOW the carried-to-summary line and are labelled as
  // such, so the bill above reads as a clean priceable document while the
  // progress information a QS needs is still in the workbook.
  ws.addRow([]);
  const noteRow = ws.addRow([
    null,
    "For valuation only — not part of the bill above",
  ]);
  noteRow.font = { italic: true, color: { argb: "FF6B7280" } };
  ws.mergeCells(noteRow.number, 2, noteRow.number, 6);

  const doneRow = ws.addRow([
    null,
    "Preliminaries — done to date",
    null,
    null,
    null,
    null,
  ]);
  doneRow.font = { bold: true, color: { argb: "FF065F46" } };
  doneRow.getCell(6).value = {
    formula: doneAmountRowNumbers.length
      ? doneAmountRowNumbers.map((n) => `F${n}`).join("+")
      : "0",
  };
  applyMoneyFormat(doneRow.getCell(6));

  const outRow = ws.addRow([
    null,
    "Preliminaries — outstanding",
    null,
    null,
    null,
    null,
  ]);
  outRow.font = { bold: true, color: { argb: "FF1E40AF" } };
  outRow.getCell(6).value = {
    formula: `F${poolRow.number}-F${doneRow.number}`,
  };
  applyMoneyFormat(outRow.getCell(6));

  return {
    sheet: ws,
    // AMOUNT moved from column D to F with the layout change; the General
    // Summary reads these addresses, so they move with it.
    totalCellAddr: `Preliminaries!F${poolRow.number}`,
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
function writeCoverSheet(workbook, {
  projectName,
  variantTitle,
  buildingType,
  foundationType,
  clientName,
}) {
  const ws = workbook.addWorksheet("Cover");
  // One wide centred column band, as on a real BoQ title page. The previous
  // cover was a four-row key/value block (Project / Building type / Foundation
  // type / Generated) — useful as metadata, but not a page anyone could put in
  // front of a client without retyping it.
  ws.columns = [{ width: 4 }, ...Array.from({ length: 5 }, () => ({ width: 18 }))];

  const centred = (text, opts = {}) => {
    const row = ws.addRow([null, text]);
    ws.mergeCells(row.number, 2, row.number, 6);
    row.getCell(2).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    row.getCell(2).font = {
      bold: opts.bold !== false,
      size: opts.size || 12,
      italic: !!opts.italic,
      color: opts.color ? { argb: opts.color } : undefined,
    };
    if (opts.height) row.height = opts.height;
    return row;
  };
  const gap = (n = 1) => {
    for (let i = 0; i < n; i += 1) ws.addRow([]);
  };

  gap(6);
  // Project title. Falls back to the project name when no client is recorded —
  // "Proposed Development for <client>" is how the QSs word it.
  centred(
    clientName
      ? `Proposed Development for ${clientName}`
      : String(projectName || "Project"),
    { size: 16, height: 24 },
  );

  gap(2);
  centred("COMPLETE BILL OF QUANTITIES", { size: 18, height: 26 });

  gap(3);
  centred("MAIN CONTRACT", { size: 13 });
  centred("BILLS OF QUANTITIES", { size: 13 });

  gap(2);
  centred("Confidential", { size: 11, bold: false, italic: true, color: "FF6B7280" });

  gap(2);
  // "NOVEMBER, 2025" — month and year, uppercase, as on the QSs' covers.
  centred(dayjs().format("MMMM, YYYY").toUpperCase(), { size: 12 });

  // Preparation detail kept, but demoted to the foot of the page where it does
  // not intrude on the title block.
  gap(6);
  const meta = [
    ["Project", projectName || "Project"],
    ["Basis", variantTitle || "Bills of Quantities"],
    ["Building type", buildingType === "multistorey" ? "Multi-Storey" : "Bungalow"],
    ...(buildingType === "multistorey" && foundationType
      ? [["Foundation type", foundationType[0].toUpperCase() + foundationType.slice(1)]]
      : []),
    ["Prepared", dayjs().format("D MMMM YYYY, HH:mm")],
  ];
  for (const [k, v] of meta) {
    const row = ws.addRow([null, k, v]);
    row.getCell(2).font = { size: 9, color: { argb: "FF6B7280" } };
    row.getCell(3).font = { size: 9, color: { argb: "FF6B7280" } };
    ws.mergeCells(row.number, 3, row.number, 6);
  }
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
  // Every priced row on this sheet, tagged with the work section it sits under
  // and how its money divides across construction stages. The WBS/milestone
  // sheet is built from this, so it references the very rows written here
  // rather than recomputing totals that could drift from the bill.
  const wbsRows = [];
  const noteRow = (rowNumber, activity, stageSplit) => {
    wbsRows.push({
      rowNumber,
      activity: String(activity || "").toUpperCase(),
      stageSplit:
        Array.isArray(stageSplit) && stageSplit.length
          ? stageSplit
          : [{ stage: GENERAL_STAGE, weight: 1 }],
    });
  };

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
          noteRow(r.number, element.heading, item.stageSplit);
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
            noteRow(r.number, element.heading, lr.stageSplit);
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
            noteRow(r.number, element.heading, er.stageSplit);
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
        noteRow(r.number, element.heading, item.stageSplit);
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
  // Named after the sheet, not "TRADE BoQ" — this path serves elemental
  // exports and every building sheet too, so the hardcoded label was wrong on
  // all of them.
  const grand = ws.addRow([
    null,
    `${sheetName.toUpperCase()} — GRAND TOTAL TO SUMMARY`,
    null,
    null,
    null,
    null,
  ]);
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
    grandRowNumber: grand.number,
    wbsRows,
    subtotalRefs: billSubtotalRows.map((b) => ({
      name: b.name,
      cellAddr: `'${ws.name}'!F${b.rowNumber}`,
    })),
  };
}

/**
 * The milestone / work-breakdown sheet that pairs with a bill sheet.
 *
 * ADLM's QSs issue one of these beside every bill ("BLOCK B" → "BLOCK B
 * MILESTONE"): the same money re-cut by construction stage instead of by
 * element, so it can be used to value work as the building goes up and to
 * agree a payment schedule. Column C is live formulas pointing back at the
 * bill's own Amount cells, exactly as they build it by hand — reprice the bill
 * and the milestone schedule follows.
 */
function writeWbsSheet(workbook, { billSheetName, sheetName, projectName, wbsRows, billGrandRow }) {
  const rows = Array.isArray(wbsRows) ? wbsRows : [];
  if (!rows.length) return null;

  // stage -> activity -> [{rowNumber, weight}]
  const stages = new Map();
  for (const r of rows) {
    for (const { stage, weight } of r.stageSplit) {
      if (!(weight > 0)) continue;
      if (!stages.has(stage)) stages.set(stage, new Map());
      const acts = stages.get(stage);
      const key = r.activity || "GENERAL";
      if (!acts.has(key)) acts.set(key, []);
      acts.get(key).push({ rowNumber: r.rowNumber, weight });
    }
  }
  if (!stages.size) return null;

  const ordered = [...stages.entries()].sort(
    (a, b) => stageRank(a[0]) - stageRank(b[0]) || a[0].localeCompare(b[0]),
  );

  const ws = workbook.addWorksheet(safeSheetName(sheetName, workbook));
  ws.columns = [
    { header: "S/N", key: "sn", width: 6 },
    { header: "WORK ITEM", key: "item", width: 62 },
    { header: "BOQ BRKDOWN", key: "amount", width: 20 },
  ];

  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = HEADER_FILL;
  head.height = 20;

  const siteRow = ws.addRow([null, `SITE : ${String(projectName || "").toUpperCase()}`]);
  siteRow.font = { bold: true };
  const titleRow = ws.addRow([null, "WORK BREAKDOWN STRUCTURE", "BOQ BRKDOWN"]);
  titleRow.font = { bold: true };
  titleRow.fill = HEADING_FILL;

  const basisRow = ws.addRow([
    null,
    "Stages are taken from the level each item was measured on. A bill item spanning " +
      "more than one level is apportioned across them by value, so this schedule totals " +
      "the same as the bill.",
  ]);
  basisRow.font = { italic: true, size: 9, color: { argb: "FF475569" } };
  basisRow.alignment = { wrapText: true, vertical: "top" };
  ws.mergeCells(basisRow.number, 2, basisRow.number, 3);

  const stageSubtotalRows = [];

  ordered.forEach(([stage, acts], stageIdx) => {
    ws.addRow([]);
    const stageRow = ws.addRow([snLetter(stageIdx), stage]);
    stageRow.font = { bold: true };
    stageRow.fill = HEADING_FILL;

    const activityRows = [];
    let n = 0;
    for (const [activity, refs] of acts) {
      const r = ws.addRow([++n, activity]);
      // One term per contributing bill row. A whole row reads as a plain
      // reference; an apportioned one carries its share, so the arithmetic is
      // visible to whoever checks the schedule.
      r.getCell(3).value = {
        formula: refs
          .map(({ rowNumber, weight }) =>
            weight >= 0.999999
              ? `'${billSheetName}'!F${rowNumber}`
              : // Full precision. The weights were normalised to sum to exactly
                // 1 at six decimals; rounding them again here would lose real
                // money out of the schedule.
                `'${billSheetName}'!F${rowNumber}*${Number(weight.toFixed(6))}`,
          )
          .join("+"),
      };
      applyMoneyFormat(r.getCell(3));
      activityRows.push(r.number);
    }

    const sub = ws.addRow([null, `${stage} — TOTAL`]);
    sub.font = { bold: true };
    sub.fill = SUMMARY_TOTAL_FILL;
    sub.getCell(3).value = {
      formula: activityRows.length ? `SUM(C${activityRows[0]}:C${activityRows.at(-1)})` : "0",
    };
    applyMoneyFormat(sub.getCell(3));
    stageSubtotalRows.push(sub.number);
  });

  ws.addRow([]);
  // NOT "carried to General Summary" — this schedule re-cuts money the bill
  // has already carried there. Labelling it as a carry-forward would invite
  // whoever assembles the summary to add the contract sum twice.
  const grand = ws.addRow([null, `TOTAL — SAME MONEY AS BILL "${billSheetName}"`]);
  grand.font = { bold: true, size: 12 };
  grand.fill = SUMMARY_TOTAL_FILL;
  grand.getCell(3).value = {
    formula: stageSubtotalRows.length ? stageSubtotalRows.map((n) => `C${n}`).join("+") : "0",
  };
  applyMoneyFormat(grand.getCell(3));

  // A visible tie-back to the bill. If this ever prints anything but zero the
  // apportioning has lost money, and whoever is pricing needs to see that
  // rather than trust a total that silently disagrees with the bill.
  if (billGrandRow) {
    const check = ws.addRow([null, "Difference from bill total (must be nil)"]);
    check.font = { italic: true, size: 9, color: { argb: "FF475569" } };
    check.getCell(3).value = {
      formula: `C${grand.number}-'${billSheetName}'!F${billGrandRow}`,
    };
    applyMoneyFormat(check.getCell(3));
  }

  return { sheet: ws, totalCellAddr: `'${ws.name}'!C${grand.number}` };
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
// Material & Labour build-up sheet — one block per bill line with formula-
// linked Amount = Qty×Rate, Net = SUM(...), Overhead/Profit %, and a derived
// Bill rate = Net×(1+(O/H+Profit)/100)/billQty. Grouped by billIdentity (=bill
// code) so it lines up with the rest of the workbook.
function writeBudgetBreakdownSheet(workbook, items, budgetItems) {
  const budget = Array.isArray(budgetItems) ? budgetItems : [];
  if (!budget.length) return null;
  const byCode = new Map();
  for (const b of budget) {
    const code = String(b?.billIdentity || "").trim().toLowerCase();
    if (!code) continue;
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(b);
  }
  if (!byCode.size) return null;

  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const kindRankX = (l) => {
    const s = String(l?.componentKind || "").toLowerCase();
    return s === "material" ? 0 : s === "labour" || s === "labor" ? 1 : 2;
  };
  const kindLabelX = (k) => {
    const s = String(k || "").toLowerCase();
    if (s === "labour" || s === "labor") return "Labour";
    return s ? s[0].toUpperCase() + s.slice(1) : "Material";
  };

  const ws = workbook.addWorksheet(safeSheetName("Material & Labour", workbook));
  ws.columns = [
    { width: 48 },
    { width: 10 },
    { width: 8 },
    { width: 12 },
    { width: 14 },
    { width: 16 },
  ];
  ws.addRow(["Bill item / Resource", "Type", "Unit", "Qty", "Rate", "Amount"]).font = {
    bold: true,
  };

  for (const it of Array.isArray(items) ? items : []) {
    const code = String(it?.code || "").trim().toLowerCase();
    const blk = code ? byCode.get(code) : null;
    if (!blk || !blk.length) continue;
    const lines = [...blk].sort((a, b) => kindRankX(a) - kindRankX(b));

    const headerRow = ws.addRow([
      String(it?.description || it?.takeoffLine || "").trim(),
      "",
      "",
      num(it?.qty),
      "",
      "",
    ]);
    headerRow.font = { bold: true };
    const headerNum = headerRow.number;
    const firstRow = headerNum + 1;

    for (const l of lines) {
      const row = ws.addRow([
        "    " + String(l.materialName || l.description || "").trim(),
        kindLabelX(l.componentKind),
        l.unit || "",
        num(l.qty),
        num(l.rate),
        null,
      ]);
      row.getCell(6).value = { formula: `D${row.number}*E${row.number}` };
    }
    const lastRow = ws.lastRow.number;

    const netRow = ws.addRow(["Net build-up", "", "", "", "", null]);
    netRow.getCell(6).value = { formula: `SUM(F${firstRow}:F${lastRow})` };
    const oh = blk.reduce((a, l) => Math.max(a, num(l.overheadPercent)), 0);
    const pr = blk.reduce((a, l) => Math.max(a, num(l.profitPercent)), 0);
    const ohRow = ws.addRow(["Overhead %", "", "", "", "", oh]);
    const prRow = ws.addRow(["Profit %", "", "", "", "", pr]);
    const rateRow = ws.addRow(["Bill rate (Material + Labour + O&P)", "", "", "", "", null]);
    rateRow.getCell(6).value = {
      formula: `IF(D${headerNum}=0,F${netRow.number}*(1+(F${ohRow.number}+F${prRow.number})/100),F${netRow.number}*(1+(F${ohRow.number}+F${prRow.number})/100)/D${headerNum})`,
    };
    ws.addRow([]);
  }
  return ws;
}

export async function exportElementalBoQ({
  projectName = "Project",
  items = [],
  budgetItems = [],
  productKey = "",
  buildingType = "bungalow",
  foundationType,
  provisionalSums = [],
  variations = [],
  preliminaryItems = [],
  preliminaryPercent = 0,
  // Optional. When supplied the cover reads "Proposed Development for <client>",
  // matching how ADLM's QSs title a bill; otherwise it falls back to the
  // project name.
  clientName = "",
  // Multi-building job: [{ name, items }] — one entry per building or
  // structure (Main Building, Warehouse, Gatehouse, Perimeter Fence, External
  // Works). Each gets ONE sheet named after it with the elemental bills as
  // sections inside, and one line in the General Summary. This is how ADLM's
  // QSs lay a job out; the previous shape put each ELEMENT on its own sheet
  // with no building identity anywhere in the workbook. Omit for a normal
  // single-structure project.
  parts = [],
  // Pair each bill sheet with a milestone / work-breakdown sheet, the way
  // ADLM's QSs issue them ("BLOCK B" beside "BLOCK B MILESTONE").
  includeWbs = true,
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
    clientName,
  });

  const matchedSet = new Set();
  const billRefs = [];

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

  {
    // ONE SHEET PER BUILDING, with the bills as sections inside it — the
    // layout ADLM's QSs issue (FIRS has Main Building / Warehouse / Gatehouse /
    // Perimeter Fence / External Works, each a sheet, all rolling into one
    // General Summary; Ogbomogo has MAIN BUILDING and EXTERNAL WORKS the same
    // way).
    //
    // Elemental and trade share this path. They only ever differed in WHICH
    // mapping supplies the sections — elements or work sections — and that is
    // already decided by resolveMappingPath, so the two branches that used to
    // exist here were the same code twice. Trade previously wrote a single
    // "Trade BoQ" sheet, which meant a multi-building job silently collapsed
    // every structure into one sheet with no way to tell them apart.
    //
    // A project with no explicit parts is a single structure, so it gets one
    // sheet under its own heading rather than a tab per element. That is a
    // deliberate change to single-project exports too: putting Substructure
    // and Superstructure on separate tabs was never the format their bills use.
    const buildings = Array.isArray(parts) && parts.length
      ? parts
      : [{ name: "MAIN BUILDING", items: projectItems }];

    // planBill reports matches as indices into the array it was GIVEN, so a
    // building's indices are local to that building. writeUnmappedSheet below
    // works in project-level indices, so translate through the item's identity
    // — without this, "Other items" would list the wrong lines (or claim
    // matched ones were unmatched) on any multi-building job.
    const projectIndexOf = new Map();
    projectItems.forEach((it, i) => {
      if (!projectIndexOf.has(it)) projectIndexOf.set(it, i);
    });

    // Preliminaries are a job-level bill, written once regardless of how many
    // buildings the job contains.
    for (const billRaw of variant.bills || []) {
      if (resolveBill(mapping, billRaw).kind !== "preliminaries") continue;
      const ref = writePreliminariesSheet(workbook, projectName, prelimOpts);
      billRefs.push({ name: resolveBill(mapping, billRaw).name, totalCellAddr: ref.totalCellAddr });
      break;
    }

    for (const building of buildings) {
      const buildingItems = Array.isArray(building?.items) ? building.items : [];
      if (!buildingItems.length) continue;

      // Each building is matched against the mapping independently, with its
      // OWN matchedSet — an item consumed by the Warehouse must not be
      // unavailable to the Gatehouse.
      const buildingMatched = new Set();
      const plannedForBuilding = [];
      for (const billRaw of variant.bills || []) {
        const billResolved = resolveBill(mapping, billRaw);
        if (billResolved.kind === "preliminaries") continue;
        const planned = planBill(billResolved, buildingItems, buildingMatched);
        if (planned) plannedForBuilding.push(planned);
      }
      if (!plannedForBuilding.length) continue;

      const sheet = writeCombinedTradeSheet({
        workbook,
        plannedBills: plannedForBuilding,
        sheetName: String(building?.name || "Building"),
      });
      if (!sheet) continue;

      // One General Summary line per BUILDING, referencing that sheet's grand
      // total — so the summary reads Main Building / Warehouse / Gatehouse,
      // not Substructure / Superstructure.
      billRefs.push({
        name: String(building?.name || "Building").toUpperCase(),
        totalCellAddr: sheet.totalCellAddr,
      });

      // The milestone sheet is the SAME money re-cut by stage, so it is
      // written beside its bill but deliberately kept out of billRefs — adding
      // it to the General Summary would double the contract sum.
      if (includeWbs) {
        writeWbsSheet(workbook, {
          billSheetName: sheet.sheet.name,
          sheetName: `${String(building?.name || "Building")} MILESTONE`,
          projectName: clientName || projectName,
          wbsRows: sheet.wbsRows,
          billGrandRow: sheet.grandRowNumber,
        });
      }
      for (const localIdx of buildingMatched) {
        const projIdx = projectIndexOf.get(buildingItems[localIdx]);
        if (projIdx !== undefined) matchedSet.add(projIdx);
      }
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

  // Material & Labour build-up (after the summary so it reads as an appendix).
  writeBudgetBreakdownSheet(workbook, projectItems, budgetItems);

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
