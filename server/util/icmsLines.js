// server/util/icmsLines.js
//
// A project's bill as ICMS 3 lines: each line's Group and Sub-Group
// (util/icmsMap.js), its money, and its upfront carbon (A1-A5) from the RateGen
// rate behind it (services/rateCarbon.js). Then the totals by Group that the
// ICMS 3 cost and carbon tables report.
//
// Which rate's carbon a line carries, firmest first, and every line says which:
//   applied   the rate the plugin priced it with (appliedRateKey), same unit
//   same      a rate with the line's own description and unit
//   matched   the user's best rate for the wording, same unit (util/rateSuggestions.js),
//             only above a strict score: it is offered for checking, not asserted
//   none      no rate: the line has no carbon and lowers the report's coverage
//
// Pure: the caller passes the items and the carbon rates.

import { icmsCode, mapBill, groupTitle, ICMS_GROUPS } from "./icmsMap.js";
import { suggestRatesForLine, unitsAgree } from "./rateSuggestions.js";
import { matchWorkRate } from "./icmsWorkCarbon.js";
import { assessCarbon } from "./carbonEngine.js";

const fold = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export const CARBON_MATCH_MIN_SCORE = 0.6;

function carbonIndex(rates = []) {
  const withCarbon = rates.filter((r) => r?.carbon);
  const byDesc = new Map();
  for (const r of withCarbon) {
    const k = fold(r.description);
    if (!byDesc.has(k)) byDesc.set(k, []);
    byDesc.get(k).push(r);
  }
  // rateSuggestions prices nothing without money in it; carbon rates carry their net cost
  const forMatching = withCarbon.map((r) => ({ ...r, unitPrice: num(r.netCost) || 1 }));
  return { byDesc, forMatching, all: withCarbon };
}

function findRate(item, index, opts = {}) {
  const unit = item?.unit;
  const sameUnit = (list) => (list || []).find((r) => unitsAgree(unit, r.unit));
  const applied = String(item?.appliedRateKey || "").trim();
  if (applied) {
    const r = sameUnit(index.byDesc.get(fold(applied)));
    if (r) return { rate: r, source: "applied", score: 1 };
  }
  const same = sameUnit(index.byDesc.get(fold(item?.description)));
  if (same) return { rate: same, source: "same", score: 1 };
  // by the work the line measures (concrete m3, rebar kg -> tonne, 225 blockwork m2)
  const work = matchWorkRate(item, index.all);
  if (work) {
    const assumed = [work.assumed, work.sized].filter(Boolean).join(" ") || null;
    return { rate: work.rate, source: "work", score: work.score, factor: work.factor, workType: work.workType, assumed };
  }
  // SERVIQ: a Revit family that names its own size ("XHHW - 4×95 mm² + 1×50 mm²",
  // "Rectangular Duct Transition - 450x475") is weighed from the line itself
  if (opts.direct) {
    const desc = String(item?.description || "").replace(/\[[^\]]*\]/g, " ");
    const c = assessCarbon("", desc, String(item?.unit || ""), 1, desc);
    if (c && c.total > 0) {
      return {
        rate: { description: `${c.factor.label}, weighed from the line`, carbon: { total: c.total, low: c.totalLow, coverage: 1 } },
        source: "direct",
        score: 1,
        workType: c.factor.id,
        assumed: c.factor.massAssumed ? `Mass assumed: ${c.factor.massBasis}.` : null,
      };
    }
  }
  const [best] = suggestRatesForLine(item, index.forMatching, { limit: 1, minScore: CARBON_MATCH_MIN_SCORE });
  if (best) {
    const rate = index.forMatching.find((r) => fold(r.description) === fold(best.description) && unitsAgree(r.unit, best.unit));
    if (rate) return { rate, source: "matched", score: best.score };
  }
  return null;
}

/**
 * Every priced line of the bill as an ICMS line.
 * `overrides` = { [lineKey]: { group, subGroup } } the QS's own placements, which win.
 */
export function icmsLines(items = [], { productKey = "", carbonRates = [], overrides = {} } = {}) {
  const mapped = mapBill(items, { productKey });
  const index = carbonIndex(carbonRates);
  const out = [];
  items.forEach((item, i) => {
    const m = mapped[i];
    if (m.header) return;
    const qty = num(item?.qty);
    const rate = num(item?.rate);
    const amount = qty * rate;
    const description = String(item?.description || "").trim();
    if (!description && !amount) return; // an empty row carries nothing

    const key = String(item?.lineId || item?.sn || i);
    const own = overrides[key];
    const group = own?.group ?? m.group;
    const subGroup = own ? own.subGroup ?? null : m.subGroup;

    const found = qty > 0 ? findRate(item, index, { direct: /mep/i.test(String(productKey)) }) : null;
    const c = found?.rate.carbon;
    const f = found?.factor ?? 1; // the line's unit into the rate's (kg -> tonne)
    out.push({
      key,
      description,
      unit: String(item?.unit || ""),
      qty,
      rate,
      amount,
      group,
      subGroup,
      code: group ? icmsCode({ group, subGroup }) : null,
      basis: own ? "placed" : m.basis,
      why: own ? "Placed by the QS." : m.why,
      carbonPerUnit: c ? c.total * f : null,
      carbonKg: c ? c.total * qty * f : null,
      carbonLowKg: c ? c.low * qty * f : null,
      carbonSource: found ? found.source : "none",
      carbonRate: found ? found.rate.description : null,
      carbonWorkType: found?.workType || null,
      carbonAssumed: found?.assumed || null,
      carbonScore: found ? found.score : null,
      carbonCoverage: c ? c.coverage : null,
    });
  });
  return out;
}

/**
 * The ICMS 3 totals: per Group, cost and carbon (tCO2e), plus what is not placed
 * and how much of the money has a carbon figure behind it.
 */
export function icmsSummary(lines = []) {
  const groups = ICMS_GROUPS.map((g) => ({ code: g.code, title: groupTitle(g.code), icms: icmsCode({ group: g.code }), carbonReported: g.carbon, amount: 0, carbonKg: 0, carbonLowKg: 0, lines: 0 }));
  const byCode = new Map(groups.map((g) => [g.code, g]));
  let total = 0, unplaced = 0, unplacedLines = 0, withCarbon = 0;
  const bySource = { applied: 0, same: 0, work: 0, direct: 0, matched: 0, none: 0 };
  for (const l of lines) {
    total += l.amount;
    bySource[l.carbonSource] = (bySource[l.carbonSource] || 0) + l.amount;
    if (l.carbonKg != null) withCarbon += l.amount;
    const g = byCode.get(l.group);
    if (!g) { unplaced += l.amount; unplacedLines++; continue; }
    g.amount += l.amount;
    g.lines++;
    // Groups 10, 11 and 13 are "not used" for carbon in ICMS 3
    if (g.carbonReported && l.carbonKg != null) { g.carbonKg += l.carbonKg; g.carbonLowKg += l.carbonLowKg; }
  }
  const share = (v) => (total > 0 ? v / total : 0);
  return {
    groups,
    total,
    unplaced,
    unplacedLines,
    placedShare: share(total - unplaced),
    carbonKg: groups.reduce((s, g) => s + g.carbonKg, 0),
    carbonLowKg: groups.reduce((s, g) => s + g.carbonLowKg, 0),
    carbonShare: share(withCarbon),
    carbonBySource: Object.fromEntries(Object.entries(bySource).map(([k, v]) => [k, share(v)])),
  };
}
