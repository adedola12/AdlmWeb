// A rate the user states to Ada: windows and doors by their area, any line by
// a figure. Pure, so every rule is pinned here without a database.
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SPLIT,
  USER_RATE_SOURCE,
  normaliseSplit,
  splitAmounts,
  cleanRate,
  parseOpeningSize,
  isAggregateLine,
  categoryOf,
  rateForArea,
  buildAreaProposal,
  groupBySize,
  selectLines,
  buildSetRatesProposal,
  resolveUserRate,
  isUserRateLine,
  buildUserRateRows,
  setUserRateOnItem,
} from "./priceByArea.js";
import { isRateGenRow } from "./rateToBudget.js";
import { deriveLineRate, isRateApplied } from "./deriveBillRates.js";

// ── reading a size ──────────────────────────────────────────────────────────

test("reads QUIV's window and door sizes in mm, with × or x, spaces and decimals", () => {
  assert.deepEqual(parseOpeningSize("Window W1 (1200×1500)"), {
    widthMm: 1200,
    heightMm: 1500,
    areaM2: 1.8,
    sizeLabel: "1200×1500",
  });
  assert.equal(parseOpeningSize("Door D1 (900x2100)").areaM2, 1.89);
  assert.equal(parseOpeningSize("Door D1 ( 900 X 2100 )").areaM2, 1.89);
  assert.equal(parseOpeningSize("Window Sliding (1200 × 1200)").areaM2, 1.44);
  assert.equal(parseOpeningSize("Window W3 (600.5×600)").widthMm, 600.5);
  assert.equal(parseOpeningSize("Window W4 (1200mm x 1500mm)").areaM2, 1.8);
  assert.equal(parseOpeningSize("Window W5 (1,200×1,500)").areaM2, 1.8);
});

test("values under 20 are metres", () => {
  const s = parseOpeningSize("Door D2 (0.9 x 2.1)");
  assert.equal(s.widthMm, 900);
  assert.equal(s.heightMm, 2100);
  assert.equal(s.areaM2, 1.89);
  assert.equal(parseOpeningSize("Window (1,2 x 1,5)").areaM2, 1.8);
});

test("takes the last bracketed size, so a name with brackets still reads", () => {
  assert.equal(parseOpeningSize("Window W1 (Casement) (1200×1500)").areaM2, 1.8);
});

test("no size, or a total line, reads as nothing", () => {
  assert.equal(parseOpeningSize("Window W1"), null);
  assert.equal(parseOpeningSize("Window W1 (Casement)"), null);
  assert.equal(parseOpeningSize(""), null);
  assert.equal(parseOpeningSize("Windows – Total Area (12×3)"), null);
  assert.ok(isAggregateLine("Windows – Total Area"));
  assert.ok(isAggregateLine("Doors - Total Perimeter"));
  assert.ok(!isAggregateLine("Window W1 (1200×1500)"));
});

test("a line's category comes from its first word", () => {
  assert.equal(categoryOf("Window W1 (1200×1500)"), "windows");
  assert.equal(categoryOf("Windows – Total Area"), "windows");
  assert.equal(categoryOf("Door D1 (900x2100)"), "doors");
  assert.equal(categoryOf("Ironmongery to door"), "");
  assert.equal(categoryOf("Blockwork"), "");
});

// ── the split ───────────────────────────────────────────────────────────────

test("the split defaults to 60 / 20 / 20", () => {
  assert.deepEqual(normaliseSplit(undefined), { ok: true, split: { ...DEFAULT_SPLIT } });
  assert.deepEqual(normaliseSplit({}).split, { material: 60, labour: 20, overheadProfit: 20 });
});

test("material and labour given, the rest is overhead and profit", () => {
  assert.deepEqual(normaliseSplit({ material: 70, labour: 25 }).split, {
    material: 70,
    labour: 25,
    overheadProfit: 5,
  });
  assert.deepEqual(normaliseSplit({ material: 70, labour: 30 }).split.overheadProfit, 0);
});

test("a split that does not add to 100, is negative, or is half given is refused", () => {
  assert.equal(normaliseSplit({ material: 60, labour: 20, overheadProfit: 30 }).ok, false);
  assert.match(normaliseSplit({ material: 60, labour: 20, overheadProfit: 30 }).error, /100/);
  assert.equal(normaliseSplit({ material: 80, labour: 30 }).ok, false);
  assert.equal(normaliseSplit({ material: -10, labour: 50, overheadProfit: 60 }).ok, false);
  assert.equal(normaliseSplit({ material: 70 }).ok, false);
  assert.equal(normaliseSplit({ material: 0, labour: 0, overheadProfit: 100 }).ok, false);
  assert.equal(normaliseSplit("60/20/20").ok, false);
});

test("the split's amounts always add back to the rate", () => {
  assert.deepEqual(splitAmounts(158400), { material: 95040, labour: 31680, overheadProfit: 31680 });
  const odd = splitAmounts(1001, { material: 33.33, labour: 33.33, overheadProfit: 33.34 });
  assert.equal(Math.round((odd.material + odd.labour + odd.overheadProfit) * 100) / 100, 1001);
});

test("a stated rate is a positive number of naira", () => {
  assert.equal(cleanRate(88000), 88000);
  assert.equal(cleanRate("88,000"), 88000);
  assert.equal(cleanRate("₦9 500"), 9500);
  assert.equal(cleanRate(0), null);
  assert.equal(cleanRate(-5), null);
  assert.equal(cleanRate("abc"), null);
  assert.equal(cleanRate(5e9), null);
});

test("a line's rate is the rate per m² × its area, to the naira", () => {
  assert.equal(rateForArea(88000, 1.8), 158400);
  assert.equal(rateForArea(88000, 1.89), 166320);
  assert.equal(rateForArea(88000, 0.3601), 31689);
});

// ── the area proposal ───────────────────────────────────────────────────────

const BILL = [
  { sn: 1, code: "W1", description: "Window W1 (1200×1500)", unit: "nr", qty: 4, rate: 0 },
  { sn: 2, code: "W2", description: "Window W2 (600x600)", unit: "nr", qty: 2, rate: 30000 },
  { sn: 3, code: "W3", description: "Window W3 (1200 × 1500)", unit: "nr", qty: 1, rate: 0 },
  { sn: 4, code: "WT", description: "Windows – Total Area", unit: "m2", qty: 8.64, rate: 0 },
  { sn: 5, code: "WP", description: "Windows – Total Perimeter", unit: "m", qty: 40, rate: 0 },
  { sn: 6, code: "W4", description: "Window W4", unit: "nr", qty: 1, rate: 0 },
  { sn: 7, code: "D1", description: "Door D1 (900x2100)", unit: "nr", qty: 3, rate: 0 },
  { sn: 8, code: "", description: "Window W9 (900x900)", unit: "nr", qty: 1, rate: 0 },
  { sn: 9, code: "W0", description: "Window W0 (900x900)", unit: "nr", qty: 0, rate: 0 },
  { sn: 14, code: "B14", description: "225mm sandcrete blockwork in walls", unit: "m2", qty: 120, rate: 0 },
  { sn: 15, code: "B15", description: "150mm sandcrete blockwork in partitions", unit: "m2", qty: 40, rate: 0 },
  { sn: 16, code: "C16", description: "Concrete blockwork infill", unit: "m3", qty: 3, rate: 0 },
];

test("every window priced by its size, totals and partitions skipped", () => {
  const p = buildAreaProposal(BILL, { category: "windows", ratePerM2: 88000 });
  assert.equal(p.ok, true);
  assert.deepEqual(
    p.lines.map((l) => [l.code, l.areaM2, l.userRate, l.amount]),
    [
      ["W1", 1.8, 158400, 633600],
      ["W2", 0.36, 31680, 63360],
      ["W3", 1.8, 158400, 158400],
    ],
  );
  assert.deepEqual(p.skipped, { aggregate: 2, noSize: 1, noCode: 1, noQty: 1 });
  assert.equal(p.totalToAdd, 633600 + 63360 + 158400);
  assert.equal(p.repricedCount, 1); // W2 had a rate
  assert.deepEqual(p.lines[0].split, { material: 60, labour: 20, overheadProfit: 20 });
  assert.deepEqual(p.lines[0].splitAmounts, { material: 95040, labour: 31680, overheadProfit: 31680 });
  assert.equal(p.lines[0].ratePerM2, 88000);
  assert.equal(p.lines[1].currentRate, 30000);
});

test("lines of one size are grouped, largest first", () => {
  const p = buildAreaProposal(BILL, { category: "windows", ratePerM2: 88000 });
  assert.deepEqual(
    p.groups.map((g) => [g.sizeLabel, g.areaM2, g.rate, g.count, g.qty, g.amount, g.codes]),
    [
      ["1200×1500", 1.8, 158400, 2, 5, 792000, ["W1", "W3"]],
      ["600×600", 0.36, 31680, 1, 2, 63360, ["W2"]],
    ],
  );
  assert.deepEqual(groupBySize([]), []);
});

test("doors are their own category, with the user's split", () => {
  const p = buildAreaProposal(BILL, {
    category: "doors",
    ratePerM2: 65000,
    split: { material: 70, labour: 15 },
  });
  assert.deepEqual(p.lines.map((l) => [l.code, l.userRate]), [["D1", 122850]]);
  assert.deepEqual(p.split, { material: 70, labour: 15, overheadProfit: 15 });
});

test("a bad category, rate or split is refused, not guessed", () => {
  assert.equal(buildAreaProposal(BILL, { category: "roofs", ratePerM2: 1 }).ok, false);
  assert.equal(buildAreaProposal(BILL, { category: "windows", ratePerM2: 0 }).ok, false);
  assert.equal(
    buildAreaProposal(BILL, { category: "windows", ratePerM2: 88000, split: { material: 90, labour: 20 } }).ok,
    false,
  );
});

// ── naming lines ────────────────────────────────────────────────────────────

test("lines are named by description words, codes or line numbers", () => {
  assert.deepEqual(selectLines(BILL, { text: "blockwork" }).map((i) => i.code), ["B14", "B15", "C16"]);
  assert.deepEqual(selectLines(BILL, { text: "225mm blockwork" }).map((i) => i.code), ["B14"]);
  assert.deepEqual(selectLines(BILL, { text: "block" }).map((i) => i.code), ["B14", "B15", "C16"]);
  assert.deepEqual(selectLines(BILL, { sn: [14] }).map((i) => i.code), ["B14"]);
  assert.deepEqual(selectLines(BILL, { sn: 14 }).map((i) => i.code), ["B14"]);
  assert.deepEqual(selectLines(BILL, { code: ["b15", "W1"] }).map((i) => i.code), ["W1", "B15"]);
  assert.deepEqual(selectLines(BILL, {}), []);
  assert.deepEqual(selectLines(BILL, { text: "lock" }), []); // not inside a word
});

test("a stated rate goes only on lines in the unit the user said", () => {
  const p = buildSetRatesProposal(BILL, { match: { text: "blockwork" }, rate: 9500, unit: "m2" });
  assert.equal(p.ok, true);
  assert.deepEqual(p.lines.map((l) => [l.code, l.userRate, l.amount, l.rateUnit]), [
    ["B14", 9500, 1140000, "m2"],
    ["B15", 9500, 380000, "m2"],
  ]);
  assert.deepEqual(p.skipped.wrongUnit, [{ code: "C16", unit: "m3" }]);
  assert.equal(p.matchedCount, 3);
  assert.deepEqual(p.lines[0].splitAmounts, { material: 5700, labour: 1900, overheadProfit: 1900 });
});

test("'rate line 14 at 2,000' — by line number, no unit", () => {
  const p = buildSetRatesProposal(BILL, { match: { sn: [14] }, rate: "2,000" });
  assert.deepEqual(p.lines.map((l) => [l.code, l.userRate, l.amount]), [["B14", 2000, 240000]]);
  assert.equal(p.lines[0].rateUnit, undefined);
});

test("set rates refuses a nonsense rate, and a unit no line uses prices nothing", () => {
  assert.equal(buildSetRatesProposal(BILL, { match: { sn: [14] }, rate: 0 }).ok, false);
  const p = buildSetRatesProposal(BILL, { match: { sn: [14] }, rate: 5, unit: "zzz" });
  assert.deepEqual(p.lines, []);
  assert.deepEqual(p.skipped.wrongUnit, [{ code: "B14", unit: "m2" }]);
});

// ── applying ────────────────────────────────────────────────────────────────

test("an Apply line re-works the rate from the bill line's own size", () => {
  const w1 = BILL[0];
  assert.deepEqual(resolveUserRate(w1, { code: "W1", ratePerM2: 88000 }), {
    ok: true,
    rate: 158400,
    split: { material: 60, labour: 20, overheadProfit: 20 },
    areaM2: 1.8,
  });
  // A size the client claims is ignored: the server reads the line.
  assert.equal(resolveUserRate(w1, { code: "W1", ratePerM2: 88000, areaM2: 99 }).rate, 158400);
  assert.equal(resolveUserRate(BILL[5], { code: "W4", ratePerM2: 88000 }).ok, false);
  assert.equal(resolveUserRate(BILL[8], { code: "W0", ratePerM2: 88000 }).ok, false); // no qty
});

test("an Apply line with a stated rate checks the unit again", () => {
  assert.equal(resolveUserRate(BILL[9], { userRate: 9500, unit: "m2" }).rate, 9500);
  assert.equal(resolveUserRate(BILL[11], { userRate: 9500, unit: "m2" }).ok, false);
  assert.match(resolveUserRate(BILL[11], { userRate: 9500, unit: "m2" }).reason, /m3/);
  assert.equal(resolveUserRate(BILL[9], { userRate: -1 }).ok, false);
  assert.equal(resolveUserRate(BILL[9], { userRate: 1, split: { material: 1, labour: 1, overheadProfit: 1 } }).ok, false);
  assert.ok(isUserRateLine({ userRate: 1 }));
  assert.ok(isUserRateLine({ ratePerM2: 1 }));
  assert.ok(!isUserRateLine({ rateId: "r1" }));
});

test("budget rows: one Material and one Labour row, O&P carried as overhead %", () => {
  const item = { code: "W1", description: "Window W1 (1200×1500)", unit: "nr", qty: 4 };
  const rows = buildUserRateRows(item, 158400, DEFAULT_SPLIT);
  assert.deepEqual(
    rows.map((r) => [r.componentKind, r.qty, r.rate, r.billIdentity, r.rateSource]),
    [
      ["Material", 4, 95040, "W1", USER_RATE_SOURCE],
      ["Labour", 4, 31680, "W1", USER_RATE_SOURCE],
    ],
  );
  // 20 on 80 is 25% on net.
  assert.equal(rows[0].overheadPercent, 25);
  assert.equal(rows[0].profitPercent, 0);
  // In the Rate Gen band, so a re-apply or a later pick replaces them.
  assert.ok(rows.every(isRateGenRow));
  // And the build-up derives back to exactly the stated rate.
  assert.equal(deriveLineRate(item.qty, rows).rate, 158400);
});

test("budget rows reproduce awkward rates to the kobo, and a 0 share writes no row", () => {
  const item = { code: "X", description: "x", unit: "m2", qty: 7 };
  const split = { material: 33.33, labour: 33.33, overheadProfit: 33.34 };
  const rows = buildUserRateRows(item, 1001, split);
  assert.equal(deriveLineRate(item.qty, rows).rate, 1001);
  const matOnly = buildUserRateRows(item, 1000, { material: 70, labour: 0, overheadProfit: 30 });
  assert.deepEqual(matOnly.map((r) => r.componentKind), ["Material"]);
  assert.deepEqual(buildUserRateRows({ code: "X", qty: 0 }, 1000), []);
});

test("the bill line takes the rate and the lock; applying twice changes nothing", () => {
  const item = { code: "W1", qty: 4, rate: 0, rateLockedAt: null };
  const t1 = new Date("2026-10-03T07:00:00Z");
  assert.equal(setUserRateOnItem(item, 158400, DEFAULT_SPLIT, t1), true);
  assert.equal(item.rate, 158400);
  assert.equal(item.rateLockedAt, t1);
  assert.ok(isRateApplied(item));
  assert.equal(item.netUnitCost, 126720);
  assert.equal(item.overheadPercent, 25);
  assert.equal(item.profitPercent, 0);

  const t2 = new Date("2026-10-03T08:00:00Z");
  assert.equal(setUserRateOnItem(item, 158400, DEFAULT_SPLIT, t2), false);
  assert.equal(item.rateLockedAt, t1); // the lock keeps its first time

  assert.equal(setUserRateOnItem(item, 160000, DEFAULT_SPLIT, t2), true);
  assert.equal(item.rateLockedAt, t2);
});
