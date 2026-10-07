// Overhead and profit defaults per trade: a default fills a MISSING figure and
// never rewrites a stored one. Worked figures throughout.

import test from "node:test";
import assert from "node:assert/strict";

import {
  BUILTIN_MARGINS,
  cleanMarginRows,
  marginMap,
  resolveMargins,
} from "./tradeMargins.js";
import {
  mergeRatesWithUserData,
  normalizeCustomRate,
  normalizeCustomRateFor,
  normalizeRateOverride,
  normalizeRateOverrideFor,
} from "./rategenUserRates.js";
import { tradeMarginsView } from "./tradeMarginsView.js";

const lib = (over = {}) => ({
  tradeMargins: [
    { sectionKey: "blockwork", overheadPercent: 10, profitPercent: 20 },
    { sectionKey: "mep", overheadPercent: 12, profitPercent: 15 },
    // profit only: overhead stays on the built-in figure
    { sectionKey: "finishes", overheadPercent: null, profitPercent: 18 },
  ],
  customRates: [],
  rateOverrides: [],
  ...over,
});

// ── resolution order ─────────────────────────────────────────────────────

test("with no trade table, the built-in pairs are the old hard-coded ones", () => {
  assert.deepEqual(BUILTIN_MARGINS.master, { overheadPercent: 10, profitPercent: 25 });
  assert.deepEqual(BUILTIN_MARGINS.custom, { overheadPercent: 10, profitPercent: 10 });
  const m = resolveMargins({ scope: "custom", sectionKey: "blockwork" });
  assert.equal(m.overheadPercent, 10);
  assert.equal(m.profitPercent, 10);
  assert.equal(m.overheadSource, "default");
});

test("a given figure beats the stored one, which beats the trade default", () => {
  const yourTrades = [{ sectionKey: "blockwork", overheadPercent: 10, profitPercent: 20 }];
  const given = resolveMargins({
    scope: "custom",
    sectionKey: "blockwork",
    given: { overheadPercent: 7, profitPercent: 9 },
    stored: { overheadPercent: 11, profitPercent: 12 },
    yourTrades,
  });
  assert.deepEqual([given.overheadPercent, given.profitPercent], [7, 9]);
  assert.equal(given.overheadSource, "rate");

  const stored = resolveMargins({
    scope: "custom",
    sectionKey: "blockwork",
    stored: { overheadPercent: 11, profitPercent: 12 },
    yourTrades,
  });
  assert.deepEqual([stored.overheadPercent, stored.profitPercent], [11, 12]);
  assert.equal(stored.profitSource, "stored");

  const trade = resolveMargins({ scope: "custom", sectionKey: "blockwork", yourTrades });
  assert.deepEqual([trade.overheadPercent, trade.profitPercent], [10, 20]);
  assert.equal(trade.profitSource, "your-trade");
});

test("each half resolves on its own", () => {
  const m = resolveMargins({ scope: "custom", sectionKey: "finishes", yourTrades: lib().tradeMargins });
  assert.equal(m.overheadPercent, 10); // built-in
  assert.equal(m.overheadSource, "default");
  assert.equal(m.profitPercent, 18); // trade
  assert.equal(m.profitSource, "your-trade");
});

test("a zero percentage is a real figure, not a missing one", () => {
  const m = resolveMargins({
    scope: "custom",
    sectionKey: "blockwork",
    given: { overheadPercent: 0, profitPercent: 0 },
    yourTrades: lib().tradeMargins,
  });
  assert.deepEqual([m.overheadPercent, m.profitPercent], [0, 0]);
});

test("the customer's table never reaches a master rate, and ADLM's never reaches a custom one", () => {
  const adlm = [{ sectionKey: "mep", overheadPercent: 15, profitPercent: 20 }];
  const master = resolveMargins({ scope: "master", sectionKey: "mep", yourTrades: lib().tradeMargins, adlmTrades: adlm });
  assert.deepEqual([master.overheadPercent, master.profitPercent], [15, 20]);
  const custom = resolveMargins({ scope: "custom", sectionKey: "carbon", adlmTrades: adlm });
  assert.deepEqual([custom.overheadPercent, custom.profitPercent], [10, 10]);
});

test("'painting' files under the paint trade", () => {
  const m = marginMap([{ sectionKey: "Painting", overheadPercent: 8, profitPercent: 12 }]);
  assert.deepEqual(m.get("paint"), { overheadPercent: 8, profitPercent: 12 });
});

// ── worked rate: a new custom rate in Electrical (MEP) ──────────────────────

test("a new MEP custom rate with blank boxes is priced at the trade's 12/15", () => {
  // net ₦10,000 → overhead ₦1,200, profit ₦1,500, total ₦12,700
  const r = normalizeCustomRateFor(lib(), {
    customRateId: "cr-new",
    sectionKey: "mep",
    title: "Socket outlet, twin 13A",
    unit: "nr",
    netCost: 10000,
  });
  assert.equal(r.overheadPercent, 12);
  assert.equal(r.profitPercent, 15);
  assert.equal(r.overheadValue, 1200);
  assert.equal(r.profitValue, 1500);
  assert.equal(r.totalCost, 12700);
});

test("with no trade default set, a new custom rate is exactly what it was before (10/10)", () => {
  const raw = { customRateId: "cr-x", sectionKey: "carbon", title: "x", unit: "nr", netCost: 10000 };
  const before = normalizeCustomRate(raw);
  const after = normalizeCustomRateFor(lib(), raw);
  assert.equal(after.totalCost, before.totalCost);
  assert.equal(after.totalCost, 12000);
});

// ── THE RULE: no stored rate moves ─────────────────────────────────────────

test("re-saving a stored custom rate that omits its percentages keeps the stored ones", () => {
  // Stored at 10/10 before the customer set Blockwork to 10/20.
  const stored = normalizeCustomRate({
    customRateId: "cr-1",
    sectionKey: "blockwork",
    title: "225mm sandcrete wall",
    unit: "m2",
    netCost: 8000,
    overheadPercent: 10,
    profitPercent: 10,
  });
  assert.equal(stored.totalCost, 9600);

  const l = lib({ customRates: [stored] });
  const resaved = normalizeCustomRateFor(l, {
    customRateId: "cr-1",
    sectionKey: "blockwork",
    title: "225mm sandcrete wall",
    unit: "m2",
    netCost: 8000,
  });
  assert.equal(resaved.profitPercent, 10, "not the new 20% trade default");
  assert.equal(resaved.totalCost, 9600, "the total does not move");
});

test("a desktop push carries its own percentages, and they are kept exactly", () => {
  const push = {
    customRateId: "cr-2",
    sectionKey: "blockwork",
    title: "Blockwork",
    unit: "m2",
    netCost: 5000,
    overheadPercent: 10,
    profitPercent: 25,
  };
  assert.deepEqual(normalizeCustomRateFor(lib(), push), normalizeCustomRate(push));
});

test("an override that omits its percentages keeps the stored override's", () => {
  const stored = normalizeRateOverride({
    rateId: "r-9",
    sectionKey: "mep",
    description: "Conduit 20mm",
    unit: "m",
    netCost: 1000,
    overheadPercent: 10,
    profitPercent: 25,
  });
  const l = lib({ rateOverrides: [stored] });
  const again = normalizeRateOverrideFor(l, {
    rateId: "r-9",
    sectionKey: "mep",
    description: "Conduit 20mm",
    unit: "m",
    netCost: 1000,
  });
  assert.equal(again.totalCost, 1350);
});

test("a NEW override in a trade with a default gets it; with none, the old 10/25", () => {
  const withTrade = normalizeRateOverrideFor(lib(), {
    rateId: "r-new",
    sectionKey: "mep",
    description: "Cable tray",
    unit: "m",
    netCost: 2000,
  });
  assert.equal(withTrade.totalCost, 2000 * 1.27); // 12 + 15

  const without = normalizeRateOverrideFor(lib(), {
    rateId: "r-new2",
    sectionKey: "carbon",
    description: "x",
    unit: "m",
    netCost: 2000,
  });
  assert.equal(without.totalCost, 2700); // 10 + 25, as before
});

test("release-day snapshot: setting trade defaults moves no total on the read path", () => {
  const master = [
    { _id: "m1", sectionKey: "blockwork", description: "Blockwork 225", unit: "m2", netCost: 8000, overheadPercent: 10, profitPercent: 25, totalCost: 10800, breakdown: [] },
    { _id: "m2", sectionKey: "mep", description: "Conduit", unit: "m", netCost: 1000, overheadPercent: 10, profitPercent: 25, totalCost: 1350, breakdown: [] },
  ];
  const customs = [
    normalizeCustomRate({ customRateId: "c1", sectionKey: "mep", title: "Socket", unit: "nr", netCost: 10000 }),
  ];
  const overrides = [
    normalizeRateOverride({ rateId: "m1", sectionKey: "blockwork", description: "Blockwork 225", unit: "m2", netCost: 9000, overheadPercent: 10, profitPercent: 25 }),
  ];
  const totals = (rows) => rows.map((r) => [r.id, r.totalCost]);
  const before = totals(mergeRatesWithUserData(master, overrides, customs));
  // The customer now sets defaults. The read path does not consult them.
  const l = lib({ customRates: customs, rateOverrides: overrides });
  const after = totals(mergeRatesWithUserData(master, l.rateOverrides, l.customRates));
  assert.deepEqual(after, before);
});

// ── saving a table ───────────────────────────────────────────────────────

test("a table is validated; a blank row is how a trade goes back to the default", () => {
  const keys = new Set(["blockwork", "mep"]);
  const ok = cleanMarginRows(
    [
      { sectionKey: "blockwork", overheadPercent: "10", profitPercent: "20" },
      { sectionKey: "mep", overheadPercent: "", profitPercent: "" },
    ],
    keys,
  );
  assert.equal(ok.problem, null);
  assert.deepEqual(ok.rows, [{ sectionKey: "blockwork", overheadPercent: 10, profitPercent: 20 }]);

  assert.match(cleanMarginRows([{ sectionKey: "mep", overheadPercent: -1 }], keys).problem, /less than 0/);
  assert.match(cleanMarginRows([{ sectionKey: "mep", profitPercent: "ten" }], keys).problem, /number/);
  assert.match(cleanMarginRows([{ sectionKey: "roofing", profitPercent: 5 }], keys).problem, /not a trade/);
  assert.match(
    cleanMarginRows([{ sectionKey: "mep", profitPercent: 5 }, { sectionKey: "mep", profitPercent: 6 }], keys).problem,
    /twice/,
  );
});

test("the table view lists every trade with what a new rate would get", () => {
  const v = tradeMarginsView(lib().tradeMargins, [{ sectionKey: "mep", overheadPercent: 15, profitPercent: 20 }]);
  const mep = v.trades.find((t) => t.sectionKey === "mep");
  assert.deepEqual(mep.yours, { overheadPercent: 12, profitPercent: 15 });
  assert.deepEqual(mep.adlm, { overheadPercent: 15, profitPercent: 20 });
  assert.equal(mep.custom.profitPercent, 15);
  assert.equal(mep.master.profitPercent, 20);
  const roofing = v.trades.find((t) => t.sectionKey === "roofing");
  assert.equal(roofing.custom.profitPercent, 10);
  assert.equal(roofing.master.profitPercent, 25);
  assert.equal(v.trades.length, 10);
});
