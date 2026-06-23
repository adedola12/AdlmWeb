// Tests for the services build-up engine. Run: node --test
import test from "node:test";
import assert from "node:assert/strict";
import {
  computeBundles,
  computeConnectors,
  computeServiceBuildup,
  SERVICE_TYPE_DEFAULTS,
} from "./serviceCompute.js";

test("computeBundles: ceil(qty / standardLength)", () => {
  assert.equal(computeBundles(50, 6), 9);
  assert.equal(computeBundles(12, 6), 2);
  assert.equal(computeBundles(13, 6), 3);
  assert.equal(computeBundles(6, 6), 1);
  assert.equal(computeBundles(0, 6), 0);
  // No standard length → continuous (no bundling).
  assert.equal(computeBundles(10, 0), 10);
});

test("computeConnectors: per-type rule", () => {
  assert.equal(computeConnectors(9), 8); // perBreak default = sticks - 1
  assert.equal(computeConnectors(1), 0);
  assert.equal(computeConnectors(0), 0);
  assert.equal(computeConnectors(9, "perStick"), 9);
  assert.equal(computeConnectors(5, "none"), 0);
  assert.equal(computeConnectors(9, "perBreak", 2), 16); // 2 connectors per joint
});

test("pipe run: sticks, connectors, net, rate (no O&P)", () => {
  const r = computeServiceBuildup({
    measure: "length",
    qty: 50,
    constants: { standardLength: 6, connectorRule: "perBreak" },
    rates: { materialRate: 10, labourRate: 4, connectorRate: 15 },
  });
  assert.equal(r.sticks, 9);
  assert.equal(r.connectors, 8);
  // material 9×(6×10)=540, connectors 8×15=120, labour 50×4=200 → 860
  assert.equal(r.net, 860);
  assert.equal(r.rate, 17.2); // 860 / 50
});

test("pipe run: overhead + profit applied to derived rate", () => {
  const r = computeServiceBuildup({
    measure: "length",
    qty: 50,
    constants: { standardLength: 6, connectorRule: "perBreak" },
    rates: { materialRate: 10, labourRate: 4, connectorRate: 15 },
    overheadPercent: 10,
    profitPercent: 10,
  });
  assert.equal(r.net, 860);
  assert.equal(r.rate, 20.64); // 860 × 1.2 / 50
});

test("cable: single drum, no connectors", () => {
  const r = computeServiceBuildup({
    measure: "length",
    qty: 100,
    constants: { standardLength: 100, connectorRule: "none" },
    rates: { materialRate: 5, labourRate: 2 },
  });
  assert.equal(r.sticks, 1);
  assert.equal(r.connectors, 0);
  assert.equal(r.net, 700); // material 1×500 + labour 100×2
  assert.equal(r.rate, 7);
});

test("count-based fixture", () => {
  const r = computeServiceBuildup({
    measure: "count",
    qty: 5,
    rates: { materialRate: 100, labourRate: 50 },
  });
  assert.equal(r.net, 750); // 5×100 + 5×50
  assert.equal(r.rate, 150);
});

test("fitting uplift (% on material) — mix-of-both #2", () => {
  const r = computeServiceBuildup({
    measure: "length",
    qty: 6,
    constants: { standardLength: 6, fittingUpliftPercent: 10 },
    rates: { materialRate: 10 },
  });
  // material 1×60 = 60; uplift 10% of 60 = 6; net 66; rate 66/6 = 11
  assert.equal(r.net, 66);
  assert.equal(r.rate, 11);
});

test("discrete fittings — mix-of-both #1", () => {
  const r = computeServiceBuildup({
    measure: "length",
    qty: 6,
    constants: { standardLength: 6, connectorRule: "none" },
    rates: { materialRate: 10, labourRate: 0 },
    fittings: [{ name: "Elbow", count: 2, materialRate: 5, labourRate: 3 }],
  });
  // material 1×60=60 + elbow material 2×5=10; labour elbow 2×3=6 → 76
  assert.equal(r.net, 76);
  const hasElbow = r.lines.some((l) => l.description === "Elbow");
  assert.ok(hasElbow);
});

test("SERVICE_TYPE_DEFAULTS exposes editable per-type seeds", () => {
  assert.equal(SERVICE_TYPE_DEFAULTS.pipe.standardLength, 6);
  assert.equal(SERVICE_TYPE_DEFAULTS.fixture.measure, "count");
});
