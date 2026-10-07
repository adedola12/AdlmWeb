// A rate line can say plant — and a desktop sync cannot delete it.
//
// Rate Gen desktop rebuilds a custom rate's push from its own Material and
// Labour lists (Services/UserRatesCloudSync.cs, BuildCustomRatePayload), so a
// plant line authored on the website is simply absent from its next push and
// the rate would come back worth the plant amount less.
//
// It reads rateType as a plain C# string (CustomRateLinePayload.RateType) and
// never parses it to an enum, and PullUserEditsAsync only ever reads a rate
// override's breakdown componentName and quantity — so an unknown value like
// "plant" cannot fault it. That is the condition this change was made
// conditional on, and it holds. What it cannot do is send one back, which is
// what the guard below is for.

import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeCustomRate,
  preservePlantLines,
  buildRateComposition,
} from "./rategenUserRates.js";

const plantLine = {
  rateType: "plant",
  description: "Concrete mixer 10/7",
  quantity: 1,
  unit: "m3",
  unitPrice: 1000,
  totalCost: 1000,
};

const websiteRate = (over = {}) => ({
  customRateId: "cr-1",
  title: "Concrete 1:2:4",
  unit: "m3",
  overheadPercent: 10,
  profitPercent: 25,
  materials: [
    { rateType: "material", description: "Cement", quantity: 6.4, unit: "bags", unitPrice: 800, totalCost: 5120 },
    plantLine,
  ],
  labour: [
    { rateType: "labour", description: "Mason", quantity: 1, unit: "m3", unitPrice: 1000, totalCost: 1000 },
  ],
  ...over,
});

// What Rate Gen desktop pushes: its own two lists, and no plant.
const desktopPush = (over = {}) => ({
  customRateId: "cr-1",
  title: "Concrete 1:2:4",
  unit: "m3",
  overheadPercent: 10,
  profitPercent: 25,
  materials: [
    { rateType: "material", description: "Cement", quantity: 6.4, unit: "bags", unitPrice: 800, totalCost: 5120 },
  ],
  labour: [
    { rateType: "labour", description: "Mason", quantity: 1, unit: "m3", unitPrice: 1000, totalCost: 1000 },
  ],
  netCost: 6120,
  ...over,
});

// ── a rate line can say plant ───────────────────────────────────────────────

test("a plant line survives normalisation instead of collapsing to material", () => {
  const r = normalizeCustomRate(websiteRate());
  const plant = r.materials.find((l) => l.description === "Concrete mixer 10/7");
  assert.equal(plant.rateType, "plant");
});

test("a value the vocabulary does not know still falls to material, as before", () => {
  const r = normalizeCustomRate(
    websiteRate({
      materials: [{ rateType: "sublet", description: "Specialist", totalCost: 500 }],
      labour: [],
    }),
  );
  assert.equal(r.materials[0].rateType, "material");
});

test("material and labour lines are untouched, so no desktop push changes meaning", () => {
  const r = normalizeCustomRate(desktopPush());
  assert.equal(r.materials[0].rateType, "material");
  assert.equal(r.labour[0].rateType, "labour");
});

test("the plant class reaches the composition the plugins read", () => {
  const r = normalizeCustomRate(websiteRate());
  const comp = buildRateComposition(r);
  const mixer = comp.components.find((c) => /mixer/i.test(c.name));
  assert.equal(mixer.kind, "plant");
});

// ── the guard ───────────────────────────────────────────────────────────────

test("a desktop push cannot delete a plant line it never knew about", () => {
  const stored = normalizeCustomRate(websiteRate());
  const incoming = normalizeCustomRate(desktopPush());

  // Without the guard this is what would be saved: no plant at all.
  assert.equal(incoming.materials.some((l) => l.rateType === "plant"), false);

  const kept = preservePlantLines(incoming, stored, { clientSupportsPlant: false });
  const plant = kept.materials.find((l) => l.description === "Concrete mixer 10/7");
  assert.ok(plant, "the plant line is still there");
  assert.equal(plant.rateType, "plant");
});

test("…and the rate is still worth what it was worth", () => {
  const stored = normalizeCustomRate(websiteRate());
  const incoming = normalizeCustomRate(desktopPush());

  assert.equal(incoming.netCost, 6120, "the push is short by the ₦1,000 mixer");
  const kept = preservePlantLines(incoming, stored, {});
  assert.equal(kept.netCost, 7120, "the mixer is back in the net cost");
  assert.equal(kept.totalCost, Math.round(7120 * 1.35 * 100) / 100);
});

test("the preserved line is in the breakdown the plugins read, not just the array", () => {
  const kept = preservePlantLines(
    normalizeCustomRate(desktopPush()),
    normalizeCustomRate(websiteRate()),
    {},
  );
  const line = kept.breakdown.find((b) => /mixer/i.test(b.componentName));
  assert.ok(line);
  assert.equal(line.refKind, "plant");
});

test("a client that understands plant is authoritative, including a deletion", () => {
  const stored = normalizeCustomRate(websiteRate());
  const incoming = normalizeCustomRate(desktopPush());
  const kept = preservePlantLines(incoming, stored, { clientSupportsPlant: true });
  assert.equal(
    kept.materials.some((l) => l.rateType === "plant"),
    false,
    "the QS deleted the mixer on purpose, and it stays deleted",
  );
  assert.equal(kept.netCost, 6120);
});

test("a push that carries the plant line itself is left exactly alone", () => {
  const stored = normalizeCustomRate(websiteRate());
  const incoming = normalizeCustomRate(websiteRate());
  const kept = preservePlantLines(incoming, stored, {});
  assert.equal(
    kept.materials.filter((l) => /mixer/i.test(l.description)).length,
    1,
    "preserved once, never duplicated",
  );
  assert.equal(kept.netCost, incoming.netCost);
});

test("a rate that never had plant is not given any", () => {
  const stored = normalizeCustomRate(desktopPush());
  const incoming = normalizeCustomRate(desktopPush());
  const kept = preservePlantLines(incoming, stored, {});
  assert.equal(kept, incoming, "untouched — not even a rebuild");
});

test("a brand new rate has nothing to preserve", () => {
  const incoming = normalizeCustomRate(desktopPush());
  assert.equal(preservePlantLines(incoming, null, {}), incoming);
});

// ── Plant survives a desktop push ──
//
// The rate builder files a plant line ONLY in breakdown[] with refKind "plant"
// — it says so itself: "Plant has no master library of its own (deferred), so a
// plant line lives in the breakdown with refKind 'plant'." materials[] holds
// kind === "material" and labour[] holds kind === "labour", nothing else.
//
// preservePlantLines looked only at those two arrays, so it found no plant on
// any rate built on the website, returned the push untouched, and Rate Gen
// desktop — which cannot send plant back — silently dropped it.

const breakdownPlantRate = () => ({
  customRateId: "concrete-124",
  materials: [
    { description: "Cement", unit: "bag", quantity: 6.4, unitPrice: 800, totalCost: 5120, rateType: "material" },
  ],
  labour: [
    { description: "Mason", unit: "day", quantity: 1, unitPrice: 1000, totalCost: 1000, rateType: "labour" },
  ],
  breakdown: [
    { componentName: "Cement", unit: "bag", quantity: 6.4, unitPrice: 800, lineTotal: 5120, refKind: "material" },
    { componentName: "Mason", unit: "day", quantity: 1, unitPrice: 1000, lineTotal: 1000, refKind: "labour" },
    { componentName: "Concrete mixer 10/7", unit: "hr", quantity: 1, unitPrice: 1000, lineTotal: 1000, refKind: "plant" },
  ],
  netCost: 7120,
  overheadPercent: 10,
  profitPercent: 10,
  totalCost: 8544,
});

/** What the desktop sends back: material and labour only. */
const pushWithoutPlant = () => ({
  customRateId: "concrete-124",
  materials: breakdownPlantRate().materials,
  labour: breakdownPlantRate().labour,
  netCost: 6120,
  overheadPercent: 10,
  profitPercent: 10,
  totalCost: 7344,
});

test("a plant line filed in the BREAKDOWN is preserved", () => {
  const out = preservePlantLines(pushWithoutPlant(), breakdownPlantRate());
  assert.equal(out.netCost, 7120, "the mixer is still in the net");
  assert.equal(out.totalCost, 8544, "and in the total");
  assert.ok(
    (out.materials || []).some((l) => String(l.rateType) === "plant"),
    "the plant line is carried",
  );
  assert.equal((out.breakdown || []).length, 3, "and the breakdown is rebuilt whole");
});

test("without the fix the rate would be worth the plant less", () => {
  // The figures this exists to prevent: 8,544 -> 7,344 on one sync.
  const stripped = { ...breakdownPlantRate(), breakdown: [], materials: breakdownPlantRate().materials };
  const out = preservePlantLines(pushWithoutPlant(), stripped);
  assert.equal(out.netCost, 6120, "nothing to preserve, so the push stands");
});

test("a client that understands plant stays authoritative", () => {
  // Including a deliberate deletion — that is the whole point of the flag.
  const out = preservePlantLines(pushWithoutPlant(), breakdownPlantRate(), { clientSupportsPlant: true });
  assert.equal(out.netCost, 6120);
});

test("plant already in the push is not preserved TWICE", () => {
  const push = {
    ...pushWithoutPlant(),
    materials: [
      ...pushWithoutPlant().materials,
      { description: "Concrete mixer 10/7", unit: "hr", quantity: 1, unitPrice: 1000, totalCost: 1000, rateType: "plant" },
    ],
  };
  const out = preservePlantLines(push, breakdownPlantRate());
  const mixers = (out.materials || []).filter((l) =>
    String(l.description).startsWith("Concrete mixer"),
  );
  assert.equal(mixers.length, 1);
});

test("plant the push carries in its own BREAKDOWN is not duplicated either", () => {
  const push = {
    ...pushWithoutPlant(),
    breakdown: [
      { componentName: "Concrete mixer 10/7", unit: "hr", quantity: 1, unitPrice: 1000, lineTotal: 1000, refKind: "plant" },
    ],
  };
  const out = preservePlantLines(push, breakdownPlantRate());
  const mixers = [...(out.materials || []), ...(out.labour || [])].filter((l) =>
    String(l.description).startsWith("Concrete mixer"),
  );
  assert.equal(mixers.length, 0, "already present, so nothing added");
});
