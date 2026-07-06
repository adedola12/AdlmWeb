// Regression tests for the ArchiCAD costing engine (ported from QUIV Revit).
// Run: node server/scripts/test-archicad-costing.mjs
import assert from "node:assert/strict";
import {
  parseComposition,
  normalizeComposition,
  enforceCeiling,
  residualLabourUnit,
  deriveLabour,
  costLine,
  applyMarginToLine,
  matchLabourLibrary,
  expectedTotal,
} from "../services/archicadCosting.js";

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

// ---- Shape 1: finalized rate with breakdown[] -----------------------------
// Components sum to 103500 net; 10% OH + 25% profit ⇒ expected total 139725.
// The stated headline (189000) is deliberately overstated to exercise the
// guardrail clamp, mirroring the Revit validator behaviour.
const finalizedRate = {
  _id: "rate1",
  description: "Concrete 1:2:4 in foundations",
  unit: "m3",
  overheadPercent: 10,
  profitPercent: 25,
  totalCost: 189000,
  breakdown: [
    { refKind: "material", componentName: "Cement", quantity: 7, unit: "bags", unitPrice: 9000, lineTotal: 63000 },
    { refKind: "material", componentName: "Sharp sand", quantity: 0.5, unit: "ton", unitPrice: 18000, lineTotal: 9000 },
    { refKind: "material", componentName: "Granite", quantity: 0.9, unit: "ton", unitPrice: 25000, lineTotal: 22500 },
    { refKind: "labour", componentName: "Mason", quantity: 1, unit: "No/Day", unitPrice: 9000, lineTotal: 9000 },
  ],
};
const NET = 103500;
const EXPECTED_TOTAL = NET * 1.35; // 139725

test("parses finalized-rate shape with breakdown[]", () => {
  const comp = normalizeComposition(parseComposition(finalizedRate));
  assert.equal(comp.components.length, 4);
  assert.equal(comp.overheadPercent, 10);
  assert.equal(comp.profitPercent, 25);
  assert.ok(Math.abs(comp.netCost - NET) < 1e-6, `netCost = ${comp.netCost}`);
});

test("labour from composition (precedence 1) with gang provenance", () => {
  const comp = normalizeComposition(parseComposition(finalizedRate));
  const labour = deriveLabour({ comp, description: "Concrete 1:2:4", unit: "m3", labourLibrary: [] });
  assert.equal(labour.method, "rate-breakdown");
  assert.equal(labour.labourUnitRate, 9000);
  assert.equal(labour.gangComposition.length, 1);
  assert.equal(labour.gangComposition[0].name, "Mason");
});

// ---- Residual labour regression (from the Revit test suite) ---------------
// headline 200, 10% OH + 25% profit, material 100 ⇒ trueNet 148.148… ⇒ labour 48.148…
test("residual labour regression: 200 headline, 35% markup, 100 material", () => {
  const rate = {
    description: "Test residual",
    unit: "m2",
    totalCost: 200,
    overheadPercent: 10,
    profitPercent: 25,
    breakdown: [
      { refKind: "material", componentName: "Blocks", quantity: 1, unit: "m2", unitPrice: 100, lineTotal: 100 },
    ],
  };
  const comp = normalizeComposition(parseComposition(rate));
  const residual = residualLabourUnit(comp);
  assert.ok(Math.abs(residual - 48.148148) < 0.001, `residual = ${residual}`);
  const labour = deriveLabour({ comp, description: "Blockwork", unit: "m2", labourLibrary: [] });
  assert.equal(labour.method, "residual");
  assert.ok(Math.abs(labour.labourUnitRate - 48.148148) < 0.001);
});

// ---- Guardrail -------------------------------------------------------------
test("guardrail clamps overstated headline DOWN to build-up total", () => {
  const comp = normalizeComposition(parseComposition(finalizedRate));
  const exp = expectedTotal(comp);
  assert.ok(Math.abs(exp - EXPECTED_TOTAL) < 0.01, `expectedTotal = ${exp}`);
  const clamped = enforceCeiling(comp, 250000); // grossly overstated
  assert.ok(Math.abs(clamped - EXPECTED_TOTAL) < 0.01, `clamped = ${clamped}`);
  const fine = enforceCeiling(comp, EXPECTED_TOTAL + 0.5); // within max(1.0, 0.5%)
  assert.equal(fine, EXPECTED_TOTAL + 0.5);
});

// ---- Shape 2: compute item (admin recipe) ----------------------------------
test("parses compute-item shape (qtyPerUnit × factor, poPercent folded)", () => {
  const computeItem = {
    _id: "ci1",
    section: "concrete",
    name: "Concrete 1:2:4",
    unit: "m3",
    poPercent: 35,
    lines: [
      { kind: "material", description: "Cement", unit: "bags", qtyPerUnit: 7, factor: 1, unitPriceAtBuild: 9000 },
      { kind: "labour", description: "Mason gang", unit: "No/Day", qtyPerUnit: 0.5, factor: 2, unitPriceAtBuild: 9000 },
    ],
  };
  const comp = normalizeComposition(parseComposition(computeItem));
  assert.equal(comp.components.length, 2);
  const labourComp = comp.components.find((c) => String(c.kind).toLowerCase() === "labour");
  assert.ok(Math.abs(labourComp.quantity - 1.0) < 1e-9, "qty = qtyPerUnit × factor");
  assert.ok(
    comp.overheadPercent + comp.profitPercent >= 35 - 1e-9,
    "poPercent folded into markup",
  );
});

// ---- Shape 3: custom rate ---------------------------------------------------
test("parses custom-rate shape (materials[] + labour[])", () => {
  const custom = {
    _id: "cu1",
    description: "Custom blockwork",
    unit: "m2",
    netCost: 5000,
    overheadPercent: 10,
    profitPercent: 15,
    totalCost: 6250,
    materials: [{ rateType: "material", componentName: "Blocks", quantity: 10, unit: "nr", unitPrice: 400 }],
    labour: [{ rateType: "labour", componentName: "Mason", quantity: 0.2, unit: "No/Day", unitPrice: 5000 }],
  };
  const comp = normalizeComposition(parseComposition(custom));
  assert.equal(comp.components.length, 2);
});

// ---- Labour library fallback -----------------------------------------------
test("labour library fallback is unit-safe with token coverage >= 0.6", () => {
  const library = [
    { _id: "lab1", name: "Blockwork laying labour", unit: "m2", price: 1500 },
    { _id: "lab2", name: "Concrete casting labour", unit: "m3", price: 4000 },
  ];
  const hit = matchLabourLibrary("Blockwork laying", "m2", library);
  assert.ok(hit, "expected a match");
  assert.equal(hit.entry.price, 1500);
  assert.ok(hit.coverage >= 0.6);
  // wrong unit must NOT match even with token overlap
  const miss = matchLabourLibrary("Blockwork laying", "m3", [library[0]]);
  assert.equal(miss, null);
});

// ---- Full line costing + margin edit ----------------------------------------
test("costLine produces contract amounts; margin edit reprices", () => {
  const rawLine = {
    itemRef: "1.1",
    category: "substructure",
    categoryTitle: "Substructure",
    description: "Concrete 1:2:4 in foundations",
    unit: "m3",
    quantity: 10,
    quivType: "padFooting",
    elementGuids: ["g1"],
    elementQuantities: [{ guid: "g1", qty: 10 }],
  };
  // match = shape produced by selectBestRate: { cand, score, unit }
  const match = {
    cand: {
      id: "rate1",
      source: "rategen",
      section: "concrete",
      description: finalizedRate.description,
      groupKey: "rate1",
      composition: parseComposition(finalizedRate),
    },
    score: 2.0,
    unit: { compatible: true, factor: 1 },
  };
  const line = costLine(rawLine, match, []);
  // headline 189000 is overstated ⇒ clamped to 139725
  assert.ok(Math.abs(line.unitRate - EXPECTED_TOTAL) < 0.01, `unitRate = ${line.unitRate}`);
  assert.ok(Math.abs(line.totalAmount - EXPECTED_TOTAL * 10) < 0.1);
  assert.equal(line.labourAmount, 90000); // 9000 × 10
  assert.equal(line.materialAmount, 945000); // (63000+9000+22500) × 10
  // marginAmount = total − netUnit×(1+OH%)×qty = 1397250 − 1138500 = 258750
  assert.ok(Math.abs(line.marginAmount - 258750) < 1, `margin = ${line.marginAmount}`);
  assert.equal(line.rateProvenance.rateSource, "rategen");
  assert.equal(line.labourProvenance.method, "rate-breakdown");
  // margin edit: 10% ⇒ unitRate = 103500×1.1×1.10 = 125235
  const edited = applyMarginToLine(line, 10);
  assert.ok(Math.abs(edited.unitRate - 125235) < 1, `unitRate = ${edited.unitRate}`);
  assert.ok(Math.abs(edited.totalAmount - 1252350) < 10);
});

console.log(`\n${passed} test group(s) passed${process.exitCode ? " (with failures)" : ""}`);
