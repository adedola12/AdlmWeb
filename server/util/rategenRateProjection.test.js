// The exact shape POST /library/rate-items/resolve and GET
// /library/rate-items/search hand back for a matched rate.
//
// Two things are pinned here. First, that the build-up now survives the trip:
// the endpoint parsed a rate's material, labour and plant lines and then
// projected all of it away. Second — and this is the one that matters at
// launch — that every field a caller already reads is still there, spelled the
// same way and holding the same type, because a desktop plugin must not notice
// this change at all.
import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_RESOLVE_COMPOSITIONS,
  makeCompositionBudget,
  projectBestRate,
  projectRateCandidate,
} from "./rategenRateProjection.js";
import { buildRateComposition } from "./rategenUserRates.js";

// 7,000 material + 2,000 gang + 1,000 mixer hire = 10,000 net, 13,500 the rate.
const composition = buildRateComposition({
  netCost: 10000,
  overheadPercent: 10,
  profitPercent: 25,
  breakdown: [
    { refKind: "material", componentName: "Sandcrete block", quantity: 10, unit: "nr", unitPrice: 700, lineTotal: 7000 },
    { refKind: "labour", componentName: "Mason gang", quantity: 0.1, unit: "day", unitPrice: 20000, lineTotal: 2000 },
    { refKind: "plant", componentName: "Mixer hire", quantity: 0.5, unit: "hr", unitPrice: 2000, lineTotal: 1000 },
  ],
});

const poolEntry = {
  description: "Blockwork 225mm in cement mortar",
  unit: "m2",
  totalCost: 13500,
  netCost: 10000,
  sectionKey: "blockwork",
  sectionLabel: "Blockwork",
  source: "user-custom",
  rateId: "cr1",
  score: 0.8123456,
  composition,
};

/* ── nothing existing may change shape ─────────────────────────────────── */

const FIELDS_BEFORE = [
  "description",
  "unit",
  "totalCost",
  "netCost",
  "sectionKey",
  "sectionLabel",
  "source",
  "score",
];

test("a candidate still carries every field it carried before, unchanged", () => {
  const c = projectRateCandidate(poolEntry);

  for (const f of FIELDS_BEFORE) {
    assert.ok(f in c, `candidate lost "${f}"`);
  }
  assert.equal(c.description, "Blockwork 225mm in cement mortar");
  assert.equal(c.unit, "m2");
  assert.equal(c.totalCost, 13500);
  assert.equal(c.netCost, 10000);
  assert.equal(c.sectionKey, "blockwork");
  assert.equal(c.sectionLabel, "Blockwork");
  assert.equal(c.source, "user-custom");
  assert.equal(c.score, 0.8123); // still rounded to 4dp, as before
});

test("a best match still carries every field it carried before, unchanged", () => {
  const b = projectBestRate(poolEntry);

  for (const f of ["description", "unit", "totalCost", "sectionLabel", "source", "score"]) {
    assert.ok(f in b, `best lost "${f}"`);
  }
  assert.equal(b.totalCost, 13500);
  assert.equal(b.score, 0.8123);
});

/* ── what is new ───────────────────────────────────────────────────────── */

test("a candidate says how much of the rate is material, labour and plant", () => {
  const c = projectRateCandidate(poolEntry);

  assert.equal(c.materialCost, 7000);
  assert.equal(c.labourCost, 2000);
  assert.equal(c.plantCost, 1000);
  assert.equal(c.otherCost, 0);
  assert.equal(c.rateId, "cr1");
  // The plant is NOT folded into labour, which is the whole point.
  assert.notEqual(c.labourCost, 3000);
});

test("a candidate does not carry the build-up, only the best match does", () => {
  assert.ok(!("composition" in projectRateCandidate(poolEntry)));
  assert.equal(projectBestRate(poolEntry).composition.components.length, 3);
});

test("a rate with no build-up gives zero subtotals and a null composition", () => {
  const bare = { ...poolEntry, composition: null };

  const c = projectRateCandidate(bare);
  assert.equal(c.materialCost, 0);
  assert.equal(c.plantCost, 0);
  assert.equal(c.totalCost, 13500); // the headline is still the headline

  const b = projectBestRate(bare);
  assert.equal(b.composition, null);
  assert.ok(!("compositionOmitted" in b), "a missing build-up is not an omitted one");
});

test("no match at all is still null", () => {
  assert.equal(projectBestRate(null), null);
  assert.equal(projectBestRate(undefined), null);
});

/* ── the response-size cap ─────────────────────────────────────────────── */

test("a bulk resolve stops spending build-up after the cap, and says so", () => {
  const budget = makeCompositionBudget(2);
  const out = [];
  for (let i = 0; i < 4; i += 1) {
    out.push(projectBestRate(poolEntry, { includeComposition: budget.take(poolEntry) }));
  }

  assert.ok(out[0].composition, "the first is complete");
  assert.ok(out[1].composition);
  assert.equal(out[2].composition, null);
  assert.equal(out[2].compositionOmitted, true);
  assert.equal(out[3].compositionOmitted, true);

  assert.deepEqual(budget.stats, {
    compositionsReturned: 2,
    compositionsOmitted: 2,
    maxCompositions: 2,
  });
});

test("omitted and absent do not look the same to a caller", () => {
  // The distinction is the difference between "ask again for this one line"
  // and "this rate has no build-up to ask for".
  const omitted = projectBestRate(poolEntry, { includeComposition: false });
  const absent = projectBestRate({ ...poolEntry, composition: null });

  assert.equal(omitted.composition, null);
  assert.equal(absent.composition, null);
  assert.equal(omitted.compositionOmitted, true);
  assert.equal(absent.compositionOmitted, undefined);
});

test("rates with no build-up never starve the ones that have one", () => {
  const budget = makeCompositionBudget(1);
  const bare = { ...poolEntry, composition: null };

  // Fifty headline-only rates first; the one real build-up still gets through.
  for (let i = 0; i < 50; i += 1) assert.equal(budget.take(bare), true);
  assert.equal(budget.take(poolEntry), true);
  assert.equal(budget.take(poolEntry), false);
  assert.equal(budget.stats.compositionsReturned, 1);
});

test("picking one rate always gets its build-up", () => {
  // The single-line resolve a pick makes cannot hit the cap.
  const budget = makeCompositionBudget();
  assert.ok(MAX_RESOLVE_COMPOSITIONS >= 1);
  assert.equal(budget.take(poolEntry), true);
  assert.ok(projectBestRate(poolEntry, { includeComposition: true }).composition);
});

test("the cap keeps a worst-case bulk resolve inside the response limit", () => {
  // The resolve response serialises each best match twice (ratesByKey and
  // results[].best), so the cap is what stands between a 2000-line bill and
  // Lambda's 6 MB ceiling.
  const bytes = Buffer.byteLength(JSON.stringify(composition));
  const worstCase = bytes * MAX_RESOLVE_COMPOSITIONS * 2;
  assert.ok(
    worstCase < 2 * 1024 * 1024,
    `capped build-up payload would be ${(worstCase / 1048576).toFixed(2)} MB`,
  );
});
