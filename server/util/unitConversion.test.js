import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalUnit, conversionFactor, guessDimensions, unitKind } from "./unitConversion.js";

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("reads the spellings bills use", () => {
  assert.equal(canonicalUnit("Sq.m"), "m2");
  assert.equal(canonicalUnit("Cu.m"), "m3");
  assert.equal(canonicalUnit("Lin.m"), "m");
  assert.equal(canonicalUnit("Nos."), "nr");
  assert.equal(canonicalUnit("tonnes"), "t");
  assert.equal(canonicalUnit("sq ft"), "ft2");
  assert.equal(canonicalUnit("furlong"), "");
  assert.equal(unitKind("mm"), "length");
});

test("within one kind, the factor is arithmetic", () => {
  close(conversionFactor("m", "mm").factor, 1000);
  close(conversionFactor("mm", "m").factor, 0.001);
  close(conversionFactor("ft", "m").factor, 0.3048);
  close(conversionFactor("m2", "ft2").factor, 1 / 0.09290304);
  close(conversionFactor("kg", "tonne").factor, 0.001);
  close(conversionFactor("litre", "m3").factor, 0.001);
  assert.equal(conversionFactor("m3", "Cu.m").factor, 1);
});

test("a 230mm wall: 1 m2 is 0.23 m3", () => {
  const c = conversionFactor("m2", "m3", { thickness: 0.23 });
  assert.equal(c.ok, true);
  close(c.factor, 0.23);
  assert.equal(c.note, "at 230 mm thick");
  // and back
  close(conversionFactor("m3", "m2", { thickness: 0.23 }).factor, 1 / 0.23);
});

test("length to area and volume need the section", () => {
  close(conversionFactor("m", "m2", { width: 0.3 }).factor, 0.3);
  const lintel = conversionFactor("m", "m3", { width: 0.23, depth: 0.45 });
  close(lintel.factor, 0.23 * 0.45);
  assert.equal(lintel.note, "at 230 mm x 450 mm");
});

test("rebar: metres to kg and tonnes by weight per metre", () => {
  close(conversionFactor("m", "kg", { kgPerM: 0.888 }).factor, 0.888);
  close(conversionFactor("m", "t", { kgPerM: 0.888 }).factor, 0.000888);
  close(conversionFactor("kg", "m", { kgPerM: 0.888 }).factor, 1 / 0.888);
});

test("count needs the quantity per item", () => {
  // A door, 1.89 m2 each, priced from an m2 rate.
  close(conversionFactor("nr", "m2", { perItem: 1.89 }).factor, 1.89);
  // A line in m2 priced from a per-panel rate, 2.88 m2 per panel.
  close(conversionFactor("m2", "nr", { perItem: 2.88 }).factor, 1 / 2.88);
});

test("it asks for exactly the missing dimension", () => {
  const c = conversionFactor("m2", "m3");
  assert.equal(c.ok, false);
  assert.equal(c.code, "UNIT_NEEDS_DIMENSION");
  assert.deepEqual(c.needs, ["thickness"]);
  assert.match(c.message, /thickness/);
});

test("a figure typed in the wrong unit is refused, not used", () => {
  // 230 metres thick is "230mm" typed into a box in metres.
  assert.equal(conversionFactor("m2", "m3", { thickness: 230 }).ok, false);
  assert.equal(conversionFactor("m2", "m3", { thickness: -0.2 }).ok, false);
});

test("kinds with nothing between them are refused", () => {
  const c = conversionFactor("m3", "kg");
  assert.equal(c.ok, false);
  assert.equal(c.code, "UNIT_NOT_CONVERTIBLE");
  assert.equal(conversionFactor("m2", "furlong").code, "UNIT_UNKNOWN");
});

test("dimensions are read off real descriptions", () => {
  assert.deepEqual(
    guessDimensions("Blockwork - Lintel Concrete [L:01 NATURAL GROUND LEVEL | T:Generic - 230mm]"),
    { thickness: 0.23, width: 0.23 },
  );
  assert.deepEqual(guessDimensions("Beam 230 x 450mm"), { width: 0.23, depth: 0.45 });
  assert.equal(guessDimensions("Y12 high yield bars").kgPerM, 0.889);
  assert.equal(guessDimensions("16mm dia mild steel").kgPerM, 1.58);
  assert.equal(guessDimensions("16mm dia mild steel").thickness, undefined);
  assert.deepEqual(guessDimensions("Excavate to reduce level"), {});
});
