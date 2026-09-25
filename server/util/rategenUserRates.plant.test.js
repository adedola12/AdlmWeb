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
