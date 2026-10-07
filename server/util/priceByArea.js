// A rate the QS STATES, put on bill lines: "windows are ₦88,000 per m²",
// "set blockwork to 9,500 per m2", "rate line 14 at 2,000".
//
// WHAT THIS IS FOR
//
// The owner's words (3 Oct 2026): inside an open project the user tells Ada
// the cost of windows per square metre and Ada prices every window from its
// size, split 60% Material, 20% Labour and the rest overhead and profit unless
// the user says otherwise. The same for doors, and any line can be given a
// rate just by asking.
//
// ADA STILL NEVER WRITES A PRICE
//
// Everything here is pure and builds a PROPOSAL: which lines, what size, what
// rate, what it adds. The chat shows it on the same confirm card as a Rate Gen
// proposal and nothing changes until the user presses Apply. For a by-area
// line the card sends back the RATE PER M² the user stated, never the line's
// figure: the server re-reads the size from the bill line itself and works the
// line's rate out here again, so the rate on the bill always follows the bill.
//
// QUIV's window and door lines read
//
//   "Window {Name} ({W}×{H})"   "Door {Name} ({W}x{H})"
//
// with W and H in millimetres. Its summary lines ("Windows – Total Area",
// "Doors – Total Perimeter") carry no single size and are never priced.
//
// Pure: no DB, no mongoose.

import { unitsAgree } from "./rateSuggestions.js";
import { rateGenSn } from "./rateToBudget.js";

/** The split when the user does not give one: 60 / 20 / 20. */
export const DEFAULT_SPLIT = Object.freeze({ material: 60, labour: 20, overheadProfit: 20 });

/** Budget rows written for a stated rate. Lives in the Rate Gen sn band, so a
 *  later Rate Gen pick (or a re-apply) replaces them, and nothing the QS typed. */
export const USER_RATE_SOURCE = "user-rate";

/** The most a stated rate may be. A typo guard, not a policy: ₦1bn per unit. */
export const MAX_USER_RATE = 1_000_000_000;

export const CATEGORIES = Object.freeze(["windows", "doors"]);

const str = (v) => String(v ?? "").trim();
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round = (v, dp = 2) => {
  const f = 10 ** dp;
  return Math.round(num(v) * f) / f;
};

// ── the split ───────────────────────────────────────────────────────────────

/**
 * The user's split, checked. Percentages of the line's rate.
 *
 *   undefined / {}                       → 60 / 20 / 20
 *   { material: 70, labour: 30 }         → 70 / 30 / 0 (the rest is O&P)
 *   { material: 50, labour: 25, overheadProfit: 25 }
 *
 * Material and labour are both needed when either is given, since "70%
 * material" alone does not say how the other 30 divides. The three must come
 * to 100, every share is 0 or more, and material + labour must be above 0 (a
 * line that is all overhead has no cost to put in the Budget).
 *
 * @returns {{ok: true, split: {material, labour, overheadProfit}} | {ok: false, error: string}}
 */
export function normaliseSplit(raw) {
  if (raw == null || (typeof raw === "object" && !Object.keys(raw).length)) {
    return { ok: true, split: { ...DEFAULT_SPLIT } };
  }
  if (typeof raw !== "object") return { ok: false, error: "The split must be percentages of material, labour and overhead/profit." };
  const has = (k) => raw[k] != null && raw[k] !== "";
  const read = (k) => Number(raw[k]);

  if (!has("material") || !has("labour")) {
    return {
      ok: false,
      error: "Give both the material and the labour percentage (the rest is overhead and profit).",
    };
  }
  const material = read("material");
  const labour = read("labour");
  const overheadProfit = has("overheadProfit") ? read("overheadProfit") : 100 - material - labour;
  for (const [name, v] of [["material", material], ["labour", labour], ["overhead and profit", overheadProfit]]) {
    if (!Number.isFinite(v) || v < 0 || v > 100) {
      return { ok: false, error: `The ${name} share must be between 0 and 100 per cent.` };
    }
  }
  if (Math.abs(material + labour + overheadProfit - 100) > 0.01) {
    return {
      ok: false,
      error: `Material, labour and overhead/profit must add up to 100 per cent; they add up to ${round(material + labour + overheadProfit)}.`,
    };
  }
  if (material + labour <= 0) {
    return { ok: false, error: "Material and labour cannot both be 0 per cent." };
  }
  return { ok: true, split: { material: round(material, 4), labour: round(labour, 4), overheadProfit: round(overheadProfit, 4) } };
}

/**
 * One unit's rate divided by the split, in naira. Material and labour are
 * rounded to the kobo and overhead/profit takes the remainder, so the three
 * always add back to the rate exactly.
 */
export function splitAmounts(rate, split = DEFAULT_SPLIT) {
  const r = num(rate);
  const material = round((r * num(split.material)) / 100);
  const labour = round((r * num(split.labour)) / 100);
  return { material, labour, overheadProfit: round(r - material - labour) };
}

/** A stated rate, checked: a positive number of naira, at most MAX_USER_RATE. */
export function cleanRate(raw) {
  const n = typeof raw === "string" ? Number(raw.replace(/[₦,\s]/g, "")) : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n > MAX_USER_RATE) return null;
  return round(n);
}

// ── reading a size ──────────────────────────────────────────────────────────

// "1,200" is twelve hundred; "1,5" is one and a half. A comma followed by
// exactly three digits is a thousands separator, any other comma a decimal.
function readNumber(raw) {
  let s = str(raw);
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  else s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const NUM = String.raw`(\d+(?:[.,]\d+)*)`;
// "(1200×1500)", "(1200 x 1500)", "(1.2 X 1.5)", "(1200mm x 1500mm)", "(1200*1500)"
const SIZE_RE = new RegExp(
  String.raw`\(\s*${NUM}\s*(?:mm|m)?\s*[x×X*]\s*${NUM}\s*(?:mm|m)?\s*\)`,
  "g",
);

/** A summary line QUIV writes under the openings: never one opening's size. */
export function isAggregateLine(description) {
  return /\btotal\s+(area|perimeter|count|number|length|qty|quantity)\b/i.test(str(description));
}

/** Which opening category a bill line describes, from its first word. */
export function categoryOf(description) {
  const d = str(description).toLowerCase();
  if (/^windows?\b/.test(d)) return "windows";
  if (/^doors?\b/.test(d)) return "doors";
  return "";
}

/**
 * The size an opening's bill line carries, in millimetres, and its area.
 *
 * The LAST bracketed W×H on the line is taken, so a name with brackets of its
 * own ("Window W1 (Casement) (1200×1500)") still reads. Values under 20 are
 * metres (no window is 20 mm wide) and are converted.
 *
 * @returns {{widthMm, heightMm, areaM2, sizeLabel} | null}
 */
export function parseOpeningSize(description) {
  const d = str(description);
  if (!d || isAggregateLine(d)) return null;
  let last = null;
  for (const m of d.matchAll(SIZE_RE)) last = m;
  if (!last) return null;
  let w = readNumber(last[1]);
  let h = readNumber(last[2]);
  if (!(w > 0) || !(h > 0)) return null;
  // Metres: both below 20. A mixed pair ("1.2 x 1500") is read as written,
  // each by its own size, rather than guessed at.
  if (w < 20) w *= 1000;
  if (h < 20) h *= 1000;
  w = round(w, 1);
  h = round(h, 1);
  const areaM2 = round((w * h) / 1e6, 4);
  if (!(areaM2 > 0)) return null;
  return { widthMm: w, heightMm: h, areaM2, sizeLabel: `${fmtMm(w)}×${fmtMm(h)}` };
}

function fmtMm(v) {
  return Number.isInteger(v) ? String(v) : String(round(v, 1));
}

/** A line's rate from its area: the stated rate per m² × the area, to the naira. */
export function rateForArea(ratePerM2, areaM2) {
  return Math.round(num(ratePerM2) * num(areaM2));
}

// ── proposals ───────────────────────────────────────────────────────────────

function lineText(item) {
  return str(item?.description || item?.takeoffLine || item?.materialName);
}

function proposalLine(item, rate, split, extra = {}) {
  const qty = num(item?.qty);
  return {
    code: str(item?.code),
    sn: num(item?.sn),
    description: lineText(item).slice(0, 200),
    qty,
    unit: str(item?.unit),
    currentRate: num(item?.rate),
    userRate: rate,
    amount: round(qty * rate),
    split: { ...split },
    splitAmounts: splitAmounts(rate, split),
    ...extra,
  };
}

/**
 * Every window (or door) on a bill, priced from its size at a stated rate per m².
 *
 * Lines already priced are included: the user said "every window". The card
 * shows the rate each one has now so they can untick the ones to keep.
 *
 * @param {Array} items  the bill
 * @param {{category: "windows"|"doors", ratePerM2: number, split?: object}} opts
 * @returns {{ok: false, error: string} | {ok: true, category, ratePerM2, split,
 *   lines: Array, groups: Array, totalToAdd: number, repricedCount: number,
 *   skipped: {aggregate: number, noSize: number, noCode: number, noQty: number}}}
 */
export function buildAreaProposal(items, { category, ratePerM2, split } = {}) {
  const cat = str(category).toLowerCase();
  if (!CATEGORIES.includes(cat)) return { ok: false, error: "The category must be windows or doors." };
  const rate = cleanRate(ratePerM2);
  if (!rate) return { ok: false, error: "The rate per m² must be a positive amount in naira." };
  const s = normaliseSplit(split);
  if (!s.ok) return s;

  const lines = [];
  const skipped = { aggregate: 0, noSize: 0, noCode: 0, noQty: 0 };
  const seen = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    const text = lineText(item);
    if (categoryOf(text) !== cat) continue;
    if (isAggregateLine(text)) {
      skipped.aggregate += 1;
      continue;
    }
    const size = parseOpeningSize(text);
    if (!size) {
      skipped.noSize += 1;
      continue;
    }
    const code = str(item?.code);
    if (!code) {
      skipped.noCode += 1;
      continue;
    }
    if (seen.has(code.toLowerCase())) continue;
    seen.add(code.toLowerCase());
    if (!(num(item?.qty) > 0)) {
      skipped.noQty += 1;
      continue;
    }
    const lineRate = rateForArea(rate, size.areaM2);
    if (!(lineRate > 0)) {
      skipped.noSize += 1;
      continue;
    }
    lines.push(
      proposalLine(item, lineRate, s.split, {
        ratePerM2: rate,
        widthMm: size.widthMm,
        heightMm: size.heightMm,
        areaM2: size.areaM2,
        sizeLabel: size.sizeLabel,
      }),
    );
  }

  return {
    ok: true,
    category: cat,
    ratePerM2: rate,
    split: s.split,
    lines,
    groups: groupBySize(lines),
    totalToAdd: round(lines.reduce((a, l) => a + l.amount, 0)),
    repricedCount: lines.filter((l) => l.currentRate > 0).length,
    skipped,
  };
}

/** The lines of one size together: what the card and Ada summarise. */
export function groupBySize(lines) {
  const by = new Map();
  for (const l of Array.isArray(lines) ? lines : []) {
    const key = str(l?.sizeLabel);
    if (!key) continue;
    if (!by.has(key)) {
      by.set(key, { sizeLabel: key, areaM2: num(l.areaM2), rate: num(l.userRate), count: 0, qty: 0, amount: 0, codes: [] });
    }
    const g = by.get(key);
    g.count += 1;
    g.qty = round(g.qty + num(l.qty), 3);
    g.amount = round(g.amount + num(l.amount));
    g.codes.push(str(l.code));
  }
  return [...by.values()].sort((a, b) => b.areaM2 - a.areaM2 || a.sizeLabel.localeCompare(b.sizeLabel));
}

/**
 * Which bill lines a "set X to N" names.
 *
 * `match` is any of:
 *   text  — every word must appear in the description ("blockwork 225")
 *   code  — a bill code, or several
 *   sn    — line numbers as the bill shows them ("line 14"), or several
 * A line that answers any given selector is in. Codes and line numbers are
 * exact; each text word must START a word of the description ("block" finds
 * "blockwork"), case-insensitively.
 */
export function selectLines(items, match = {}) {
  const list = Array.isArray(items) ? items : [];
  const many = (v) => (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]);
  const codes = new Set(many(match?.code).map((c) => str(c).toLowerCase()).filter(Boolean));
  const sns = new Set(many(match?.sn).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0));
  const words = str(match?.text)
    .toLowerCase()
    .split(/[^a-z0-9.]+/i)
    .filter((w) => w.length > 0);

  if (!codes.size && !sns.size && !words.length) return [];
  return list.filter((item) => {
    if (codes.size && codes.has(str(item?.code).toLowerCase())) return true;
    if (sns.size && sns.has(num(item?.sn))) return true;
    if (words.length) {
      const hay = ` ${lineText(item).toLowerCase().replace(/[^a-z0-9.]+/g, " ")} `;
      if (words.every((w) => hay.includes(` ${w}`))) return true;
    }
    return false;
  });
}

/**
 * A stated rate on the lines a message names.
 *
 * When the user gave a unit ("per m2"), a line in another unit is NOT priced:
 * ₦9,500 a square metre on a line measured in cubic metres is wrong by a
 * thickness, and looks right. Those are counted so Ada can say so.
 *
 * @param {Array} items
 * @param {{match: object, rate: number, unit?: string, split?: object}} opts
 */
export function buildSetRatesProposal(items, { match, rate, unit, split } = {}) {
  const r = cleanRate(rate);
  if (!r) return { ok: false, error: "The rate must be a positive amount in naira." };
  const s = normaliseSplit(split);
  if (!s.ok) return s;
  const wantUnit = str(unit);

  const found = selectLines(items, match);
  const lines = [];
  const skipped = { wrongUnit: [], noCode: 0, noQty: 0 };
  const seen = new Set();
  for (const item of found) {
    const code = str(item?.code);
    if (!code) {
      skipped.noCode += 1;
      continue;
    }
    if (seen.has(code.toLowerCase())) continue;
    seen.add(code.toLowerCase());
    if (wantUnit && !unitsAgree(item?.unit, wantUnit)) {
      skipped.wrongUnit.push({ code, unit: str(item?.unit) });
      continue;
    }
    if (!(num(item?.qty) > 0)) {
      skipped.noQty += 1;
      continue;
    }
    // rateUnit: the unit the user said, sent back with Apply so the server
    // makes the same unit check again.
    lines.push(proposalLine(item, r, s.split, wantUnit ? { rateUnit: wantUnit } : {}));
  }
  return {
    ok: true,
    rate: r,
    unit: wantUnit,
    split: s.split,
    matchedCount: found.length,
    lines,
    totalToAdd: round(lines.reduce((a, l) => a + l.amount, 0)),
    repricedCount: lines.filter((l) => l.currentRate > 0).length,
    skipped,
  };
}

// ── applying ────────────────────────────────────────────────────────────────

/**
 * The rate one line of an Apply puts on its bill line, re-worked on the server
 * from what the user stated:
 *
 *   { code, ratePerM2, split? }  → the line's own size × ratePerM2
 *   { code, userRate, unit?, split? } → that rate, if the units agree
 *
 * @returns {{ok: true, rate: number, split: object, areaM2?: number} | {ok: false, reason: string}}
 */
export function resolveUserRate(item, line) {
  const s = normaliseSplit(line?.split);
  if (!s.ok) return { ok: false, reason: s.error };
  if (!(num(item?.qty) > 0)) {
    return { ok: false, reason: "This line has no quantity, so a rate has nothing to multiply." };
  }
  if (line?.ratePerM2 != null) {
    const perM2 = cleanRate(line.ratePerM2);
    if (!perM2) return { ok: false, reason: "The rate per m² must be a positive amount in naira." };
    const size = parseOpeningSize(lineText(item));
    if (!size) return { ok: false, reason: "No width × height on this line, so it cannot be priced by area." };
    const rate = rateForArea(perM2, size.areaM2);
    if (!(rate > 0)) return { ok: false, reason: "This opening is too small to price by area." };
    return { ok: true, rate, split: s.split, areaM2: size.areaM2 };
  }
  const rate = cleanRate(line?.userRate);
  if (!rate) return { ok: false, reason: "The rate must be a positive amount in naira." };
  const unit = str(line?.unit);
  if (unit && !unitsAgree(item?.unit, unit)) {
    return { ok: false, reason: `This line is measured in ${str(item?.unit) || "no unit"}, not ${unit}.` };
  }
  return { ok: true, rate, split: s.split };
}

/** True when an Apply line carries a stated rate rather than a library rate id. */
export function isUserRateLine(line) {
  return Boolean(line) && (line.userRate != null || line.ratePerM2 != null);
}

/**
 * The Budget rows a stated rate writes for one bill line: ONE Material row and
 * ONE Labour row at the bill quantity, priced by the split, with the
 * overhead/profit share carried as the rows' overhead % (on their net, which
 * is how deriveBillRates reads it back). Profit is left at 0: the user gave
 * one figure for the two and splitting it would invent a number.
 *
 * A share of 0 writes no row for it (70/0/30 is material only).
 *
 * The percentage is stored to the fewest places (4 to 12) that reproduce the
 * rate to the kobo, the same rule rateToBudget follows, so even the derived
 * figure agrees with the locked one.
 */
export function buildUserRateRows(item, rate, split = DEFAULT_SPLIT) {
  const code = str(item?.code);
  const qty = round(num(item?.qty), 3);
  const r = num(rate);
  if (!code || !(qty > 0) || !(r > 0)) return [];
  const per = splitAmounts(r, split);
  const unit = str(item?.unit);
  const rows = [];
  if (per.material > 0) rows.push({ kind: "Material", name: "Material", rate: per.material });
  if (per.labour > 0) rows.push({ kind: "Labour", name: "Labour", rate: per.labour });
  if (!rows.length) return [];

  const net = rows.reduce((a, x) => a + qty * x.rate, 0);
  const markup = Math.max(0, ((r * qty) / net - 1) * 100);
  const wanted = round(r);
  let oh = markup;
  for (let dp = 4; dp <= 12; dp += 1) {
    const o = round(markup, dp);
    if (round((net * (1 + o / 100)) / qty) === wanted) {
      oh = o;
      break;
    }
  }

  const takeoffLine = lineText(item);
  return rows.map((x, i) => ({
    billIdentity: code,
    sn: rateGenSn(code, i),
    description: x.name,
    materialName: x.name,
    takeoffLine,
    componentKind: x.kind,
    category: str(item?.category),
    trade: str(item?.trade),
    unit,
    qty,
    rate: x.rate,
    netUnitCost: x.rate,
    budgetRate: x.rate,
    overheadPercent: oh,
    profitPercent: 0,
    rateSource: USER_RATE_SOURCE,
    procured: false,
    procuredAt: null,
    procuredPercent: 0,
    targetDate: null,
    supplier: "",
    notes: `${num(split.material)}% material, ${num(split.labour)}% labour, ${num(split.overheadProfit)}% overhead and profit of a stated rate of ${wanted}.`,
    elementIds: [],
    elementQuantities: [],
  }));
}

/**
 * Put a stated rate on a bill line IN MEMORY: the rate, its lock (so a plugin
 * re-save and the budget heal both keep it; see util/cloudRateLocks.js), and
 * the net / O&P the split implies. The lock's time is kept when the rate is
 * already the same, so applying twice changes nothing.
 *
 * @returns {boolean} whether anything on the line changed
 */
export function setUserRateOnItem(item, rate, split = DEFAULT_SPLIT, now = new Date()) {
  const r = round(rate);
  const per = splitAmounts(r, split);
  const net = round(per.material + per.labour);
  const ohPct = net > 0 ? round((per.overheadProfit / net) * 100, 6) : 0;
  const sameRate = num(item.rate) === r;
  const locked = item.rateLockedAt != null && item.rateLockedAt !== "" && !Number.isNaN(new Date(item.rateLockedAt).getTime());
  const changed =
    !sameRate ||
    !locked ||
    num(item.netUnitCost) !== net ||
    num(item.overheadPercent) !== ohPct ||
    num(item.profitPercent) !== 0;
  item.rate = r;
  if (!sameRate || !locked) item.rateLockedAt = now;
  item.netUnitCost = net;
  item.overheadPercent = ohPct;
  item.profitPercent = 0;
  return changed;
}
