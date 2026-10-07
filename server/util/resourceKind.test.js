import test from "node:test";
import assert from "node:assert/strict";

import {
  KIND,
  canonicalKind,
  classifyResourceKind,
  kindLabel,
  isLabourKind,
  isPlantKind,
  kindRank,
} from "./resourceKind.js";

test("an explicit kind always beats the name", () => {
  // The whole safety of this module rests on this: 203 of the 204 breakdown
  // lines in the production master catalogue carry an explicit refKind, so the
  // name rules below are never consulted for them.
  assert.equal(classifyResourceKind("Concrete mixer", "material"), KIND.MATERIAL);
  assert.equal(classifyResourceKind("Cement", "plant"), KIND.PLANT);
  assert.equal(classifyResourceKind("Mason", "material"), KIND.MATERIAL);
});

test("every spelling of a kind seen on the wire normalises", () => {
  for (const s of ["material", "Material", " MATERIAL ", "materials", "mat", "0"]) {
    assert.equal(canonicalKind(s), KIND.MATERIAL, s);
  }
  for (const s of ["labour", "Labour", "labor", "lab", "1"]) {
    assert.equal(canonicalKind(s), KIND.LABOUR, s);
  }
  assert.equal(canonicalKind("plant"), KIND.PLANT);
  assert.equal(canonicalKind("Plant"), KIND.PLANT);
  assert.equal(canonicalKind("equipment"), KIND.EQUIPMENT);
  assert.equal(canonicalKind("consumable"), KIND.CONSUMABLE);
});

test("a kind we do not know is not guessed at", () => {
  assert.equal(canonicalKind(""), "");
  assert.equal(canonicalKind(null), "");
  assert.equal(canonicalKind("sublet"), "");
});

test("plant is the machine, labour is the man who drives it", () => {
  // The owner's rule. archicadCosting used to test plant first and called the
  // drivers plant.
  assert.equal(classifyResourceKind("Concrete mixer 10/7"), KIND.PLANT);
  assert.equal(classifyResourceKind("Mixer operator"), KIND.LABOUR);
  assert.equal(classifyResourceKind("Tipper Driver (per day)"), KIND.LABOUR);
  assert.equal(classifyResourceKind("10 ton tipper"), KIND.PLANT);
  assert.equal(classifyResourceKind("Crane"), KIND.PLANT);
  assert.equal(classifyResourceKind("Crane operator"), KIND.LABOUR);
  assert.equal(classifyResourceKind("Operator (Heavy plant operator)"), KIND.LABOUR);
});

test("word boundaries — the substring bugs that mispriced real rows", () => {
  // archicadCosting matched by substring, so every one of these was wrong.
  assert.equal(classifyResourceKind("Blocks (130 wall for toilet)"), KIND.MATERIAL); // "oil"
  assert.equal(classifyResourceKind("Cutting Subsoil"), KIND.MATERIAL); // "oil"
  assert.equal(classifyResourceKind("Spread surplus soil"), KIND.MATERIAL); // "oil"
  assert.equal(classifyResourceKind("Concrete Masonry Units"), KIND.MATERIAL); // "mason"
  assert.equal(classifyResourceKind("Finishes – Walls – masonry(1)"), KIND.MATERIAL);
  assert.equal(
    classifyResourceKind("Walls; thickness 150 - 450mm in planter or balustrade wall"),
    KIND.MATERIAL, // "plant" inside "planter"
  );
  // …but the real thing still classifies.
  assert.equal(classifyResourceKind("Mould oil for 6 uses"), KIND.CONSUMABLE);
  assert.equal(classifyResourceKind("Masons"), KIND.LABOUR);
  assert.equal(classifyResourceKind("Plant hire"), KIND.PLANT);
});

test("plurals and trade names rategenUserRates used to miss", () => {
  assert.equal(classifyResourceKind("Masons"), KIND.LABOUR);
  assert.equal(classifyResourceKind("Carpenters"), KIND.LABOUR);
  assert.equal(classifyResourceKind("Steel Fixers"), KIND.LABOUR);
  assert.equal(classifyResourceKind("Steelfixer hours"), KIND.LABOUR);
  assert.equal(classifyResourceKind("Banksman (Semi skilled)"), KIND.LABOUR);
  assert.equal(classifyResourceKind("General labourers [AI]"), KIND.LABOUR);
  assert.equal(classifyResourceKind("Nails 3\""), KIND.CONSUMABLE);
  assert.equal(classifyResourceKind("Binding wire"), KIND.CONSUMABLE);
  assert.equal(classifyResourceKind("Compressor"), KIND.PLANT);
  assert.equal(classifyResourceKind("D8 Bulldozer"), KIND.PLANT);
  assert.equal(classifyResourceKind("Bucket capacity of payloader"), KIND.PLANT);
});

test("anything physical and priced is material", () => {
  assert.equal(classifyResourceKind("Cement"), KIND.MATERIAL);
  assert.equal(classifyResourceKind("Sharp sand"), KIND.MATERIAL);
  assert.equal(classifyResourceKind("Granite 3/4\""), KIND.MATERIAL);
  assert.equal(classifyResourceKind(""), KIND.MATERIAL);
  assert.equal(classifyResourceKind(null), KIND.MATERIAL);
});

test("kindLabel gives the spelling budgetItems stores", () => {
  // componentKind is part of every budget merge key, so these spellings are
  // load-bearing: change one and the QS's price and procurement edits orphan.
  assert.equal(kindLabel("material"), "Material");
  assert.equal(kindLabel("labour"), "Labour");
  assert.equal(kindLabel("labor"), "Labour");
  assert.equal(kindLabel("plant"), "Plant");
  assert.equal(kindLabel("consumable"), "Consumable");
  assert.equal(kindLabel("equipment"), "Equipment");
});

test("kindLabel hands back a word it does not know, rather than remapping it", () => {
  assert.equal(kindLabel("sublet"), "Sublet");
  assert.equal(kindLabel(""), "Material");
  assert.equal(kindLabel("", "Other"), "Other");
});

test("the kind predicates never guess from a name", () => {
  assert.equal(isLabourKind("Labour"), true);
  assert.equal(isLabourKind("labor"), true);
  assert.equal(isLabourKind("Mason"), false); // a NAME, not a kind
  assert.equal(isPlantKind("Plant"), true);
  assert.equal(isPlantKind("Equipment"), true); // both go on the Plant schedule
  assert.equal(isPlantKind("Material"), false);
});

test("kindRank orders a budget view materials → labour → plant → rest", () => {
  const order = ["Consumable", "Plant", "Material", "Labour", "sublet"]
    .map((k) => ({ k, r: kindRank(k) }))
    .sort((a, b) => a.r - b.r)
    .map((x) => x.k);
  assert.deepEqual(order, ["Material", "Labour", "Plant", "Consumable", "sublet"]);
});
