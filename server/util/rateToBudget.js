// A picked Rate Gen rate, written into a bill line's Budget.
//
// THE OWNER'S RULE (23 Sep 2026), and the whole design in one line:
//
//   "Budget item quantity is ALWAYS from the Bill quantity, with the Material
//    Constants library still the source of how much of each material a unit of
//    work needs; from Rate Gen come the PRICES and the classification."
//
// So a rate never says how much cement a cubic metre needs. It says what
// cement COSTS, and which part of its build-up is labour and which is plant.
// The rows written here are therefore:
//
//   * one Material row per material the Material Constants library derives for
//     the work — quantity from the BILL, price from the RATE where the rate
//     names that material, else from the master price list;
//   * ONE Labour row carrying the item's whole labour cost;
//   * ONE Plant row carrying the item's whole plant cost.
//
// The gang behind that one Labour row — three masons, two labourers, a mixer
// and its operator — is project resources, not Budget. It must not be written
// into budgetItems: deriveBillRatesFromBudget sums EVERY row under a
// billIdentity, so gang rows there would double-count labour and raise the
// bill on a plain GET. See util/projectResources.js.
//
// THE PICK MUST STICK. deriveBillRatesFromBudget re-derives every bill rate
// from its build-up on save AND on read, so a Budget that does not reproduce
// the picked rate silently reverts it. Reproduction is by back-solved O&P, the
// same trick mlSchedule uses: the rows cost what they cost, and the gap up to
// the rate the QS picked IS the overhead and profit. Nothing is scaled and no
// price is faked.
//
// When the build-up costs MORE than the rate sells for — an old rate against
// today's prices — the back-solve would need a negative markup, and
// deriveBillRates' groupMarkup clamps percentages at 0, so the rate would not
// reproduce and the bill would RISE on a GET. That case gets one explicit,
// named reconciliation row instead, so the arithmetic closes and the QS can
// see exactly what it is.
//
// Pure (no DB / mongoose).

import { deriveMaterials, classifyWork, measureBasis, labourRateFor } from "./mlSchedule.js";
import { MC } from "./materialConstants.js";
import { classifyResourceKind, kindLabel, KIND } from "./resourceKind.js";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round(v, dp = 2) {
  const f = 10 ** dp;
  return Math.round(num(v) * f) / f;
}

/**
 * Rows written because the QS picked a Rate Gen rate.
 *
 * Its own `sn` band and `rateSource`, so a re-pick can replace exactly these
 * and nothing else. 700,000,000–799,999,999 was empty across all 19,272
 * budget rows in production on 23 Sep 2026; mlSchedule owns 800,000,000+ and
 * budgetCoverage owns 900,000,000+.
 */
export const RATEGEN_SOURCE = "rategen-rate";
const SN_BASE = 700000000;
const SN_CEILING = 800000000;
const MAX_ROWS = 64;

/** A row this module wrote on a previous pick — replaceable, unlike a real one. */
export function isRateGenRow(b) {
  const sn = num(b?.sn);
  return b?.rateSource === RATEGEN_SOURCE || (sn >= SN_BASE && sn < SN_CEILING);
}

// Deterministic per (bill code, index) so a re-pick lands on the same sn and
// the QS's procurement marks merge back on, exactly as mlSchedule does it.
function rateGenSn(code, index) {
  let h = 0;
  const s = String(code || "");
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) % 1000000;
  return SN_BASE + h * MAX_ROWS + Math.min(index, MAX_ROWS - 1);
}

// ── reading the rate ────────────────────────────────────────────────────────

function componentsOf(rate) {
  const comp = rate?.composition;
  if (comp && Array.isArray(comp.components) && comp.components.length) {
    return comp.components.map((c) => ({
      name: String(c?.name || "").trim(),
      kind: classifyResourceKind(c?.name, c?.kind),
      quantity: num(c?.quantity),
      unit: String(c?.unit || "").trim(),
      unitPrice: num(c?.unitPrice),
      totalCost: num(c?.totalCost) || num(c?.quantity) * num(c?.unitPrice),
    }));
  }
  const bd = Array.isArray(rate?.breakdown) ? rate.breakdown : [];
  if (!bd.length) return [];
  return bd.map((l) => {
    const name = String(l?.componentName || l?.refName || l?.description || "").trim();
    const quantity = num(l?.quantity);
    const unitPrice = num(l?.unitPrice);
    return {
      name,
      kind: classifyResourceKind(name, l?.refKind ?? l?.rateType),
      quantity,
      unit: String(l?.unit || "").trim(),
      unitPrice,
      totalCost: num(l?.totalPrice ?? l?.lineTotal ?? l?.totalCost) || quantity * unitPrice,
    };
  });
}

/**
 * What one unit of the rate costs, split by resource class.
 *
 * Everything that is not labour or plant is material: a consumable is bought
 * and delivered like a material, and an unknown class has to land somewhere it
 * will be seen rather than be dropped from the money.
 */
export function splitRateByKind(rate) {
  const components = componentsOf(rate);
  const out = { material: 0, labour: 0, plant: 0, components };
  for (const c of components) {
    if (c.kind === KIND.LABOUR) out.labour += c.totalCost;
    else if (c.kind === KIND.PLANT || c.kind === KIND.EQUIPMENT) out.plant += c.totalCost;
    else out.material += c.totalCost;
  }
  const componentsNet = out.material + out.labour + out.plant;
  const declaredNet = num(rate?.netCost) || num(rate?.composition?.netCost);
  out.net = declaredNet > 0 ? declaredNet : componentsNet;
  // A rate whose headline net exceeds the lines it itemises carries cost no
  // line explains. It is real money, so it stays with the materials rather
  // than vanishing — the same place the rate composition card puts it.
  out.unexplained = Math.max(0, out.net - componentsNet);
  out.material += out.unexplained;
  return out;
}

/** The price the RATE puts on a named material, per that material's own unit. */
function ratePriceIndex(components) {
  const byName = new Map();
  for (const c of components) {
    if (c.kind === KIND.LABOUR || c.kind === KIND.PLANT || c.kind === KIND.EQUIPMENT) continue;
    if (!c.name || c.unitPrice <= 0) continue;
    const key = c.name.toLowerCase().replace(/\s+/g, " ").trim();
    if (!byName.has(key)) byName.set(key, c.unitPrice);
  }
  return byName;
}

function lookupRatePrice(index, name) {
  const key = String(name || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!key) return 0;
  if (index.has(key)) return index.get(key);
  // "Cement" against "Cement (Dangote 42.5R)" — the rate names the brand, the
  // constants name the material.
  for (const [k, v] of index) {
    if (k.includes(key) || key.includes(k)) return v;
  }
  return 0;
}

// ── writing the rows ────────────────────────────────────────────────────────

/**
 * Build the Budget rows for one bill item priced from one Rate Gen rate.
 *
 * @param {object}   item      the bill line (code, description, unit, qty)
 * @param {object}   rate      the picked rate — needs a build-up (composition
 *                             or breakdown) and netCost / overhead% / profit%
 * @param {object}   K         resolved Material Constants
 * @param {object}   [opts]
 * @param {(name:string,unit:string)=>number} [opts.priceFor]  master price list
 * @param {number}   [opts.unitCost]  the rate per BILL unit, already converted
 *                                    by the caller when the units differ
 * @returns {{rows: object[], warnings: string[], reproducesRate: boolean}|null}
 *          null when the rate carries no build-up to classify — the caller
 *          should fall back to the constants generator.
 */
export function buildRateBudgetRows(item, rate, K, opts = {}) {
  const code = String(item?.code || "").trim();
  const billQty = num(item?.qty);
  if (!code || billQty <= 0) return null;

  const split = splitRateByKind(rate);
  if (!split.components.length) return null;

  const priceFor = typeof opts.priceFor === "function" ? opts.priceFor : () => 0;
  const billUnit = String(item?.unit || "").trim();

  // The rate per BILL unit. The caller converts when the rate's unit differs
  // from the item's, because only it knows the conversion it showed the QS.
  const unitCost =
    num(opts.unitCost) > 0 ? num(opts.unitCost) : num(rate?.totalCost);
  if (unitCost <= 0) return null;

  const overheadPercent = num(rate?.overheadPercent);
  const profitPercent = num(rate?.profitPercent);
  // Net per bill unit, back out of the headline so a converted rate stays
  // self-consistent: the split's own net is per the RATE's unit.
  const markup = 1 + (overheadPercent + profitPercent) / 100;
  const netPerBillUnit = markup > 0 ? unitCost / markup : unitCost;
  // How the rate's own net divides — as proportions, so a unit conversion
  // carries the split with it.
  const rateNet = split.net > 0 ? split.net : 1;
  const labourShare = split.labour / rateNet;
  const plantShare = split.plant / rateNet;

  const rows = [];
  const warnings = [];

  // ── Material rows: quantity from the BILL and the constants, price from the
  //    RATE. This is the owner's rule, and the reason a rate cannot dictate
  //    how much cement a cubic metre needs.
  const kind = classifyWork(item, K);
  const priceIndex = ratePriceIndex(split.components);
  const materials = kind === "unknown" ? [] : deriveMaterials(item, kind, K);

  for (const m of materials) {
    const fromRate = lookupRatePrice(priceIndex, m.name);
    rows.push({
      kind: kindLabel(KIND.MATERIAL),
      name: m.name,
      qty: m.qty,
      unit: m.unit,
      rate: fromRate > 0 ? fromRate : priceFor(m.name, m.unit),
    });
  }

  // When the constants know nothing about this work, the rate's own material
  // lines are all there is. They are per one unit of the rate, so they scale
  // on the bill quantity — the quantity is still the bill's.
  if (!rows.length) {
    for (const c of split.components) {
      if (c.kind === KIND.LABOUR || c.kind === KIND.PLANT || c.kind === KIND.EQUIPMENT) continue;
      if (c.totalCost <= 0 && c.quantity <= 0) continue;
      rows.push({
        kind: kindLabel(c.kind === KIND.CONSUMABLE ? KIND.CONSUMABLE : KIND.MATERIAL),
        name: c.name || "Material",
        qty: round(c.quantity * billQty, 3),
        unit: c.unit,
        rate: c.unitPrice,
      });
    }
    if (split.unexplained > 0) {
      rows.push({
        kind: kindLabel(KIND.MATERIAL),
        name: "Sundries and allowances",
        qty: billQty,
        unit: billUnit,
        rate: round(split.unexplained),
        notes: "The part of this rate's net cost that its build-up does not itemise.",
      });
    }
  }

  // ── ONE Labour row, and ONE Plant row. The owner's rule again: "in the
  //    Budget a line carrying the total labour cost alone, and the total plant
  //    cost alone."
  const labourPerUnit = netPerBillUnit * labourShare;
  const plantPerUnit = netPerBillUnit * plantShare;

  // A rate that itemises no labour at all still took labour to do. Fall back
  // to the constants so the Labour row is never simply absent — the same
  // figure the schedule generator would have used.
  let labourRate = labourPerUnit;
  if (labourRate <= 0 && kind !== "unknown") {
    const basis = measureBasis(item, K);
    labourRate = labourRateFor(item, kind, K) * basis.factor;
    if (labourRate > 0) {
      warnings.push(
        "This rate itemises no labour, so the Budget carries the Material Constants labour rate for this work.",
      );
    }
  }
  if (labourRate > 0 || !rows.length) {
    rows.push({
      kind: kindLabel(KIND.LABOUR),
      name: "Labour",
      qty: billQty,
      unit: billUnit,
      rate: labourRate,
    });
  }

  if (plantPerUnit > 0) {
    rows.push({
      kind: kindLabel(KIND.PLANT),
      name: "Plant",
      qty: billQty,
      unit: billUnit,
      rate: plantPerUnit,
    });
  }

  // ── make the pick stick ───────────────────────────────────────────────────
  //
  // Round to what will actually be STORED before reconciling anything. The
  // rows are persisted at 3dp of quantity and 2dp of rate, and
  // deriveBillRatesFromBudget re-derives the bill rate from those stored
  // figures — so reconciling against unrounded ones leaves a kobo on the table
  // and the picked rate comes back a kobo out.
  for (const r of rows) {
    r.qty = round(r.qty, 3);
    r.rate = round(r.rate);
  }

  const billAmount = unitCost * billQty;
  let net = rows.reduce((a, r) => a + num(r.qty) * num(r.rate), 0);
  let oh = overheadPercent;
  let pr = profitPercent;
  let reproducesRate = true;

  if (net > 0 && billAmount > 0) {
    const markupPct = (billAmount / net - 1) * 100;
    if (markupPct >= 0) {
      // Report it the way the Budget tab does: overhead to its constant first,
      // then whatever is left is profit.
      oh = round(Math.min(markupPct, K.get(MC.MarkupOverheadPercent)), 4);
      pr = round(markupPct - oh, 4);
    } else {
      // The build-up costs more than the rate sells for. groupMarkup clamps a
      // percentage at 0, so a negative markup cannot be carried there without
      // the rate failing to reproduce and the bill rising on a GET. One named
      // row absorbs the difference instead, and the QS is told.
      const target = billAmount / (1 + (overheadPercent + profitPercent) / 100);
      const adjustment = round(target - net);
      rows.push({
        kind: kindLabel(KIND.MATERIAL),
        name: "Rate reconciliation",
        qty: 1,
        unit: "Sum",
        rate: adjustment,
        notes:
          "This rate prices the work below what its build-up costs at today's prices. " +
          "This line holds the difference so the bill rate stays exactly as picked.",
      });
      oh = overheadPercent;
      pr = profitPercent;
      net += adjustment;
      warnings.push(
        `${code}: the build-up costs more than the picked rate. The bill rate is unchanged and the difference is on a "Rate reconciliation" line.`,
      );
    }
  } else {
    reproducesRate = false;
  }

  const takeoffLine = String(item?.description || item?.takeoffLine || "").trim();
  const out = rows.slice(0, MAX_ROWS).map((r, i) => ({
    billIdentity: code,
    sn: rateGenSn(code, i),
    description: r.name,
    materialName: r.name,
    takeoffLine,
    componentKind: r.kind,
    category: String(item?.category || "").trim(),
    trade: String(item?.trade || "").trim(),
    unit: r.unit || "",
    qty: round(r.qty, 3),
    rate: round(r.rate),
    overheadPercent: oh,
    profitPercent: pr,
    rateSource: RATEGEN_SOURCE,
    procured: false,
    procuredAt: null,
    procuredPercent: 0,
    targetDate: null,
    supplier: "",
    notes: r.notes || "",
    elementIds: [],
    elementQuantities: [],
  }));

  return { rows: out, warnings, reproducesRate };
}

/**
 * Replace a bill line's rate-written Budget rows with a fresh set.
 *
 * ONLY rows this module wrote for THIS bill code are removed. A row the QS
 * typed, a row a plugin sent, a row the schedule generator made and a row for
 * any other bill line all survive untouched — which is the whole point of the
 * `rateSource` stamp and the sn band.
 *
 * Pricing and procurement marks the QS set on a previous pick's row are
 * carried across, on the same sn|name|unit|kind key the schedule generator
 * uses, so re-picking a rate never wipes their work.
 */
export function applyRateRows(budgetItems, code, rows) {
  const billCode = String(code || "").trim().toLowerCase();
  const existing = Array.isArray(budgetItems) ? budgetItems : [];
  if (!billCode) return existing.slice();

  const mine = (b) =>
    String(b?.billIdentity || "").trim().toLowerCase() === billCode && isRateGenRow(b);

  const editKey = (b) =>
    [b?.sn, b?.materialName || b?.description, b?.unit, b?.componentKind]
      .map((v) => String(v == null ? "" : v).trim().toLowerCase())
      .join("|");

  const priorEdits = new Map();
  for (const b of existing) if (mine(b)) priorEdits.set(editKey(b), b);

  const kept = existing.filter((b) => !mine(b));

  const merged = (Array.isArray(rows) ? rows : []).map((row) => {
    const prior = priorEdits.get(editKey(row));
    if (!prior) return row;
    return {
      ...row,
      procured: Boolean(prior.procured),
      procuredAt: prior.procuredAt ?? null,
      procuredPercent: num(prior.procuredPercent),
      targetDate: prior.targetDate ?? null,
      supplier: prior.supplier || "",
      notes: row.notes || prior.notes || "",
    };
  });

  return kept.concat(merged);
}
