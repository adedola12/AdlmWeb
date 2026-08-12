// Material & Labour schedule engine tests.
//
// The numbers asserted here are the ones a Nigerian QS would write by hand, so
// a regression shows up as "that's not how you order cement", not as a diff.
// Reference points come from a real priced material & labour schedule (DOPEMU
// warehouse, Block A) which prices 1:2:4 at ~6 bags/m³.

import test from "node:test";
import assert from "node:assert/strict";

import { resolveConstants, MC, clampConstant } from "./materialConstants.js";
import {
  classifyWork,
  deriveMaterials,
  labourRateFor,
  generateMlSchedule,
  normalizeUnit,
  mepDiscipline,
  isGeneratedRow,
  measureBasis,
  parseGirthMetres,
} from "./mlSchedule.js";

const K = resolveConstants();

const item = (over = {}) => ({
  code: "BQ-test",
  description: "",
  takeoffLine: "",
  unit: "m3",
  qty: 1,
  rate: 0,
  ...over,
});

const mat = (rows, name) => rows.find((r) => r.name === name);

// ── unit normalisation ──────────────────────────────────────────────────────

test("normalizeUnit folds the spellings real bills use", () => {
  for (const u of ["m3", "M³", "CU.M", "cum", "cubic metre"]) {
    assert.equal(normalizeUnit(u), "m3", u);
  }
  for (const u of ["m2", "M²", "SQ.M", "sqm"]) assert.equal(normalizeUnit(u), "m2", u);
  for (const u of ["Lin.m", "LM", "m"]) assert.equal(normalizeUnit(u), "m", u);
  for (const u of ["Tonne", "tonnes", "MT", "T"]) assert.equal(normalizeUnit(u), "ton", u);
  for (const u of ["Nr", "No.", "each"]) assert.equal(normalizeUnit(u), "nr", u);
});

// ── concrete ────────────────────────────────────────────────────────────────

test("1:2:4 concrete comes out at the ~6 bags/m3 a QS schedule uses", () => {
  const it = item({ description: "Reinforced in-situ concrete (1:2:4) in columns", qty: 1 });
  assert.equal(classifyWork(it), "concrete");
  const rows = deriveMaterials(it, "concrete", K);
  const cement = mat(rows, "Cement");
  // (1/7) × 1.54 dry × 1.05 waste × 1440 kg/m³ ÷ 50 kg/bag = 6.65
  assert.ok(cement.qty > 6 && cement.qty < 7, `cement ${cement.qty} bags/m3`);
  assert.equal(cement.unit, "bags");
  const sand = mat(rows, "Sharp sand");
  const granite = mat(rows, "Granite");
  assert.ok(sand.qty > 0.6 && sand.qty < 0.85, `sand ${sand.qty} t/m3`);
  // Granite is the sand multiplier — the reference schedule runs 2:1.
  assert.equal(granite.qty, Math.round(sand.qty * 2 * 100) / 100);
});

test("a leaner mix orders less cement, and the ratio in the text is honoured", () => {
  const lean = deriveMaterials(
    item({ description: "Plain concrete (1:4:8) in blinding", qty: 10 }),
    "concrete",
    K,
  );
  const rich = deriveMaterials(
    item({ description: "Concrete (1:2:4) in bases", qty: 10 }),
    "concrete",
    K,
  );
  assert.ok(mat(lean, "Cement").qty < mat(rich, "Cement").qty);
});

test("blinding with an explicit mix is treated as concrete, without one as blinding", () => {
  assert.equal(classifyWork(item({ description: "Blinding (1:4:8) under bases" })), "concrete");
  assert.equal(classifyWork(item({ description: "50mm thick blinding" })), "blinding");
});

test("concrete quantities scale linearly with the measured volume", () => {
  const one = deriveMaterials(item({ description: "Concrete 1:2:4 in slab", qty: 1 }), "concrete", K);
  const hundred = deriveMaterials(
    item({ description: "Concrete 1:2:4 in slab", qty: 100 }),
    "concrete",
    K,
  );
  assert.ok(Math.abs(mat(hundred, "Cement").qty - mat(one, "Cement").qty * 100) < 1);
});

// ── other measured work ─────────────────────────────────────────────────────

test("blockwork orders blocks, cement and sand per m2", () => {
  const it = item({ description: "225mm sandcrete blockwork in walls", unit: "m2", qty: 100 });
  assert.equal(classifyWork(it), "blockwork");
  const rows = deriveMaterials(it, "blockwork", K);
  assert.equal(mat(rows, "Blocks").qty, 1030); // 100 × 1.03 waste × 10/m²
  assert.equal(mat(rows, "Cement").qty, 22);
  assert.ok(mat(rows, "Sharp sand").qty > 0);
});

test("rebar carries binding wire at 1% of the steel weight", () => {
  const rows = deriveMaterials(
    item({ description: "High tensile reinforcement bars", unit: "Tonne", qty: 9.15 }),
    "rebar",
    K,
  );
  assert.equal(mat(rows, "Reinforcement steel").qty, 9.15);
  assert.equal(mat(rows, "Reinforcement steel").unit, "tons");
  assert.equal(mat(rows, "Binding wire").qty, 91.5); // 9,150 kg × 0.01
});

test("finishes are classified before the structural branch they mention", () => {
  // "Blockwork – Wall Rendering" is rendering, not blockwork.
  assert.equal(
    classifyWork(item({ description: "Wall rendering", takeoffLine: "Blockwork", unit: "m2" })),
    "render",
  );
  assert.equal(classifyWork(item({ description: "Floor tiling to bedrooms", unit: "m2" })), "tiling");
  assert.equal(classifyWork(item({ description: "Cement/sand screed to floor", unit: "m2" })), "screed");
  assert.equal(classifyWork(item({ description: "POP ceiling to living area", unit: "m2" })), "pop-ceiling");
});

test("wall tiling costs more labour than floor tiling", () => {
  const wall = labourRateFor(item({ description: "Wall tiling", unit: "m2" }), "tiling", K);
  const floor = labourRateFor(item({ description: "Floor tiling", unit: "m2" }), "tiling", K);
  assert.ok(wall > floor);
});

test("excavation and disposal are labour-only — no material is bought", () => {
  const it = item({ description: "Excavate foundation trench", unit: "m3", qty: 274 });
  assert.equal(classifyWork(it), "labour-only");
  assert.equal(deriveMaterials(it, "labour-only", K).length, 0);
  assert.ok(labourRateFor(it, "labour-only", K) > 0);
});

// ── MEP classification ──────────────────────────────────────────────────────

test("services lines are routed to the right discipline", () => {
  const cases = [
    ["3 x 1c x 150mm2 11KV XLPE underground copper cable", "electrical"],
    ["150mm diameter UPVC pipe to receive underground cables", "electrical"],
    ["Supply and install 300mm girth galvanised steel cable rack", "electrical"],
    ["100mm dia. uPVC soil pipe", "plumbing"],
    ["Water closet with low level cistern", "plumbing"],
    ["Supply and install 2.5HP split unit air conditioner", "mechanical"],
    ["Galvanised steel ductwork", "mechanical"],
    ["Fire alarm control panel", "fire"],
    ["Sprinkler head, pendant type", "fire"],
  ];
  for (const [description, expected] of cases) {
    assert.equal(mepDiscipline(item({ description })), expected, description);
  }
});

test("a bill sheet named Elect makes its lines electrical", () => {
  // Sheet-derived categories are how imported MEP bills carry their discipline.
  assert.equal(mepDiscipline(item({ description: "25mm dia.", category: "Elect" })), "electrical");
});

test("ordinary builder's work is not mistaken for services", () => {
  for (const d of [
    "Reinforced concrete in columns",
    "225mm blockwork in walls",
    "Excavate trench for foundations",
    // "earthwork" contains "earth": an unbounded earthing pattern classified
    // this as electrical and gave an excavation line a services build-up.
    "Earthwork support to sides of excavation",
    "Return, fill and ram selected excavated material",
    "Emulsion paint to walls",
  ]) {
    assert.equal(mepDiscipline(item({ description: d })), null, d);
  }
  assert.equal(
    classifyWork(item({ description: "Earthwork support to trench", unit: "m2", qty: 10 })),
    "labour-only",
  );
});

// ── the generator, end to end ───────────────────────────────────────────────

const CODE = "BQ-abc";

test("a priced bill line keeps its rate: the build-up reconciles back to it", () => {
  const rate = 200000; // a 1:2:4 m³ at real 2026 Lagos material prices
  const items = [
    item({ code: CODE, description: "Concrete (1:2:4) in bases", unit: "m3", qty: 109, rate }),
  ];
  const priceFor = (name) => ({ Cement: 11200, "Sharp sand": 18500, Granite: 31200 })[name] || 0;
  const { budgetItems, covered } = generateMlSchedule(items, [], K, { priceFor });
  assert.equal(covered, 1);

  const net = budgetItems.reduce((a, b) => a + b.qty * b.rate, 0);
  assert.ok(net > 0 && net < rate * 109, "the build-up should cost less than it sells for");
  const markup = budgetItems[0].overheadPercent + budgetItems[0].profitPercent;
  const derivedRate = (net * (1 + markup / 100)) / 109;
  // This is the invariant that protects the client's bill total.
  assert.ok(Math.abs(derivedRate - rate) < 1, `derived ${derivedRate} vs billed ${rate}`);
});

test("an unpriced bill line is priced from cost using the markup constants", () => {
  const items = [item({ code: CODE, description: "Concrete (1:2:4) in bases", unit: "m3", qty: 10, rate: 0 })];
  const { budgetItems } = generateMlSchedule(items, [], K, { priceFor: () => 10000 });
  const row = budgetItems[0];
  assert.equal(row.overheadPercent, K.get(MC.MarkupOverheadPercent));
  assert.equal(row.profitPercent, K.get(MC.MarkupProfitPercent));
});

test("a line that costs more than it was billed at keeps the bill rate, not the cost", () => {
  // An older bill priced at older material prices. Inflating the client's bill
  // to today's cost is the one thing the schedule must never do quietly.
  const items = [item({ code: CODE, description: "Concrete (1:2:4) in bases", unit: "m3", qty: 10, rate: 100 })];
  const { warnings, budgetItems } = generateMlSchedule(items, [], K, { priceFor: () => 50000 });

  // Quantities survive — they are the deliverable.
  assert.ok(budgetItems.some((b) => b.materialName === "Cement" && b.qty > 0));
  // Rates come off, so deriveBillRatesFromBudget sees net 0 and leaves the bill.
  assert.equal(budgetItems.reduce((a, b) => a + b.qty * b.rate, 0), 0);
  // The cost is not lost — it is written onto the row.
  assert.match(budgetItems[0].notes, /Indicative cost/);
  assert.match(warnings.join(" "), /cost more at today's prices/);
});

test("narrow-width work billed by the metre is measured by its girth", () => {
  // BESMM bills thin work linearly: "Edges of suspended slab not exceeding
  // 200mm — 90 m" is 18 m² of formwork. Missing this drops the whole
  // narrow-width family (edges, reveals, skirtings, risers, treads).
  const it = item({
    description: "Edges of suspended slab not exceeding 200mm",
    takeoffLine: "Sawn formwork to sides and/or soffit of frame members as described in:",
    unit: "m",
    qty: 90,
  });
  assert.equal(measureBasis(it, K).unit, "m2");
  assert.equal(measureBasis(it, K).qty, 18);
  assert.equal(classifyWork(it, K), "formwork");
  const rows = deriveMaterials(it, "formwork", K);
  assert.ok(mat(rows, "Formwork board").qty > 0);
});

test("the girth is the width, not the bed thickness", () => {
  // "12mm thick screeded backing … in risers 150mm high" — 150mm is the girth.
  assert.equal(
    parseGirthMetres("12mm thick screeded backing to receive vitrified tiles in risers 150mm high"),
    0.15,
  );
  assert.equal(parseGirthMetres("Reveals < 300mm thick internally"), 0.3);
  assert.equal(parseGirthMetres("not exceeding 300mm girth"), 0.3);
  assert.equal(parseGirthMetres("Regular shaped; rectangular"), 0);
});

test("labour on a narrow-width item is scaled to the metre it is billed in", () => {
  const it = item({
    code: CODE,
    description: "Edges of slab not exceeding 200mm",
    takeoffLine: "Sawn formwork as described in:",
    unit: "m",
    qty: 100,
    rate: 0,
  });
  const { budgetItems } = generateMlSchedule([it], [], K, { priceFor: () => 0 });
  const labour = budgetItems.find((b) => b.componentKind === "Labour");
  assert.equal(labour.qty, 100); // still the bill quantity
  assert.equal(labour.unit, "m");
  // ₦1,200/m² of formwork × 0.2 m girth = ₦240/m.
  assert.equal(labour.rate, K.get(MC.LabourFormworkPerM2) * 0.2);
});

test("a genuinely linear item is not converted to an area", () => {
  const cable = item({ description: "4C. 70mm PVC/SWA/PVC copper cable", unit: "m", qty: 32 });
  assert.equal(measureBasis(cable, K).unit, "m");
  assert.equal(measureBasis(cable, K).factor, 1);
});

test("reinforcement stated only by diameter under its preamble is still rebar", () => {
  const it = item({
    description: "10 - 25 diameter",
    takeoffLine: "Reinforcement; high yield steel bars to BS4449 as described in:",
    unit: "t",
    qty: 12,
  });
  assert.equal(classifyWork(it, K), "rebar");
});

test("blockwork stated only as a wall thickness is still blockwork", () => {
  assert.equal(classifyWork(item({ description: "225mm thick wall", unit: "m2", qty: 40 }), K), "blockwork");
});

test("every generated line gets both a Material and a Labour row", () => {
  const items = [
    item({ code: "BQ-a", description: "Concrete (1:2:4) in slab", unit: "m3", qty: 20, rate: 100000 }),
    item({ code: "BQ-b", description: "225mm blockwork in walls", unit: "m2", qty: 300, rate: 8000 }),
    item({ code: "BQ-c", description: "12mm cement render to walls", unit: "m2", qty: 500, rate: 3000 }),
  ];
  const { budgetItems } = generateMlSchedule(items, [], K, { priceFor: () => 5000 });
  for (const code of ["BQ-a", "BQ-b", "BQ-c"]) {
    const rows = budgetItems.filter((b) => b.billIdentity === code);
    assert.ok(rows.some((r) => r.componentKind === "Material"), `${code} material`);
    assert.ok(rows.some((r) => r.componentKind === "Labour"), `${code} labour`);
  }
});

test("a real build-up from the workbook's own schedule is never overwritten", () => {
  const items = [item({ code: CODE, description: "Concrete (1:2:4) in bases", unit: "m3", qty: 10, rate: 5000 })];
  const existing = [
    { billIdentity: CODE, sn: 1, description: "Dangote cement", componentKind: "Material", qty: 60, rate: 11200 },
  ];
  const { budgetItems, covered } = generateMlSchedule(items, existing, K, { priceFor: () => 1 });
  assert.equal(covered, 0);
  assert.deepEqual(budgetItems, existing);
});

test("re-running keeps the QS's prices and procurement marks on generated rows", () => {
  const items = [item({ code: CODE, description: "Concrete (1:2:4) in bases", unit: "m3", qty: 10, rate: 90000 })];
  const first = generateMlSchedule(items, [], K, { priceFor: () => 0 }).budgetItems;

  const cement = first.find((b) => b.materialName === "Cement");
  cement.rate = 11200; // the QS priced it
  cement.procured = true;
  cement.supplier = "Dangote";

  const second = generateMlSchedule(items, first, K, { priceFor: () => 0 }).budgetItems;
  const again = second.find((b) => b.materialName === "Cement");
  assert.equal(again.rate, 11200);
  assert.equal(again.procured, true);
  assert.equal(again.supplier, "Dangote");
  // …and it did not duplicate the row.
  assert.equal(second.filter((b) => b.materialName === "Cement").length, 1);
});

test("re-running is stable: same input, same rows", () => {
  const items = [item({ code: CODE, description: "225mm blockwork", unit: "m2", qty: 100, rate: 9000 })];
  const a = generateMlSchedule(items, [], K, { priceFor: () => 500 }).budgetItems;
  const b = generateMlSchedule(items, a, K, { priceFor: () => 500 }).budgetItems;
  assert.equal(a.length, b.length);
  assert.deepEqual(
    a.map((r) => [r.sn, r.materialName, r.qty]),
    b.map((r) => [r.sn, r.materialName, r.qty]),
  );
});

test("generated rows are recognisable so coverage never double-fills them", () => {
  const items = [item({ code: CODE, description: "Concrete 1:2:4 in slab", unit: "m3", qty: 5, rate: 90000 })];
  const { budgetItems } = generateMlSchedule(items, [], K, { priceFor: () => 100 });
  assert.ok(budgetItems.every(isGeneratedRow));
  assert.ok(!isGeneratedRow({ sn: 12, rateSource: "" }));
});

test("an MEP line is split into equipment, installation and accessories", () => {
  const items = [
    item({
      code: CODE,
      description: "4C. 70mm PVC/SWA/PVC Copper Cable",
      category: "Elect",
      unit: "m",
      qty: 32,
      rate: 58050,
    }),
  ];
  const { budgetItems } = generateMlSchedule(items, [], K, {});
  const kinds = budgetItems.map((b) => b.componentKind);
  assert.ok(kinds.includes("Material"));
  assert.ok(kinds.includes("Labour"));
  assert.ok(kinds.includes("Consumable"));
  // The verb is stripped — a schedule lists resources, not instructions.
  assert.ok(!/^supply/i.test(budgetItems[0].materialName));
  // And the bill rate survives.
  const net = budgetItems.reduce((a, b) => a + b.qty * b.rate, 0);
  const markup = budgetItems[0].overheadPercent + budgetItems[0].profitPercent;
  assert.ok(Math.abs((net * (1 + markup / 100)) / 32 - 58050) < 1);
});

test("an unpriced MEP line still gets rows for the QS to price", () => {
  const items = [
    item({ code: CODE, description: "Fire alarm control panel", unit: "Nr", qty: 1, rate: 0 }),
  ];
  const { budgetItems } = generateMlSchedule(items, [], K, {});
  assert.ok(budgetItems.length >= 2);
  assert.ok(budgetItems.some((b) => b.componentKind === "Labour"));
});

// ── constants guard rails ───────────────────────────────────────────────────

test("out-of-range and unknown constants are rejected, not applied", () => {
  assert.equal(clampConstant("Not.A.Key", 5), null);
  assert.equal(clampConstant(MC.BlocksPerSqm, "abc"), null);
  assert.equal(clampConstant(MC.BlocksPerSqm, 99999), 1000); // clamped to max
});

test("editing a constant changes the schedule it produces", () => {
  const tweaked = resolveConstants({ [MC.BlocksPerSqm]: 12.5 });
  const rows = deriveMaterials(
    item({ description: "Blockwork in walls", unit: "m2", qty: 100 }),
    "blockwork",
    tweaked,
  );
  assert.equal(mat(rows, "Blocks").qty, 1287.5); // 100 × 1.03 × 12.5
});
