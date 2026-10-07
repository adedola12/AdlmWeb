// A bill line's carbon rate chosen by the work it measures (util/icmsWorkCarbon.js).
// What these defend: the unit must agree (kg converts to tonnes), what the line
// states picks the rate, what it does not state is assumed and said, and work
// in the wrong unit or far from the rate's size is left without carbon.

import test from "node:test";
import assert from "node:assert/strict";

import { matchWorkRate, openingArea, unitFactor, workTypeOf } from "./icmsWorkCarbon.js";

const C = (total) => ({ total, low: total, coverage: 1 });
const RATES = [
  { description: "Concrete (1:2:4) grade 20 in foundation or slab.", unit: "m3", carbon: C(298) },
  { description: "Concrete (1:2:4) grade 20 in column, wall or suspended slab.", unit: "m3", carbon: C(299) },
  { description: "Concrete (1:1:2) grade 30 in foundation or slab.", unit: "m3", carbon: C(507) },
  { description: "Concrete (1:4:8) grade 10 in foundation or slab.", unit: "m3", carbon: C(185) },
  { description: "Precast concrete grade 30 Material (1m3 Of Concrete)", unit: "m2", carbon: C(393) },
  { description: "Procure and place 7 to 12mm deformed bar reinforcement in slab", unit: "tonne", carbon: C(920) },
  { description: "Procure and place 12 to 18mm deformed bar reinforcement in slab", unit: "tonne", carbon: C(921) },
  { description: "225mm blockwall in cement and sand mortar (1:6)", unit: "m2", carbon: C(25.9) },
  { description: "150mm blockwall in cement and sand mortar (1:6)", unit: "m2", carbon: C(17.1) },
  { description: "Concrete filling in 225mm blockwall", unit: "m2", carbon: C(4.1) },
  { description: "Cement and sand (1:3) render to wall 12mm thick.", unit: "m2", carbon: C(4.18) },
  { description: "Super Seven asbestos roofing sheet laid on purlins", unit: "m2", carbon: C(20.9) },
  { description: "Supply and install natural anodised sliding window size 1800 x 1200mm", unit: "No", carbon: C(316) },
  { description: "Supply and install 44mm Timber flush door size 900 x 2100mm high.", unit: "No", carbon: C(108) },
];

const pick = (description, unit) => matchWorkRate({ description, unit }, RATES);

test("units: kg meets a rate per tonne, m2 never meets m3", () => {
  assert.equal(unitFactor("kg", "tonne"), 0.001);
  assert.equal(unitFactor("CU M", "m3"), 1);
  assert.equal(unitFactor("m2", "m3"), null);
});

test("reinforcement by weight takes the rate for its bar size, per tonne", () => {
  const t10 = pick("Beams – Reinforcement Links T10 [L:01 - GROUND FLOOR LVL.]", "kg");
  assert.match(t10.rate.description, /7 to 12mm/);
  assert.equal(t10.factor, 0.001);
  assert.equal(t10.assumed, null);
  assert.match(pick("Slab – Reinforcement Vertical Bar T16", "kg").rate.description, /12 to 18mm/);
});

test("concrete takes its stated mix or grade; unstated, 1:2:4 is assumed and said", () => {
  assert.match(pick("30MPa/19mm concrete in Slab", "CU M").rate.description, /1:1:2/);
  const slab = pick("Slab – Concrete [L:Multiple Levels | T:350 RC SLAB]", "m3");
  assert.match(slab.rate.description, /1:2:4/);
  assert.match(slab.assumed, /1:2:4 \(grade 20\) assumed/);
  assert.match(pick("Columns – Concrete", "m3").rate.description, /column/);
  assert.match(pick("Pile Cap – Blinding", "m3").rate.description, /1:4:8/);
});

test("concrete is never by the m2: a wall finish called concrete is not concrete work", () => {
  assert.notEqual(workTypeOf({ description: "Finishes – Walls – Concrete, Cast In Situ", unit: "m2" }), "concrete");
});

test("the operation wins over the element: wall rendering is render, not blockwork", () => {
  assert.match(pick("Blockwork – Wall Rendering", "m2").rate.description, /render/);
});

test("blockwork takes its thickness, never the concrete filling in it; 230 is the 225 block", () => {
  assert.match(pick("Blockwork – Wall Area [T:Generic - 150mm]", "m2").rate.description, /^150mm/);
  assert.match(pick("230mm Wall", "m2").rate.description, /^225mm blockwall/);
  assert.match(pick("Blockwork – Wall Area", "m2").assumed, /Block thickness not stated/);
});

test("a window of another size scales by its area; one far outside the rate is left alone", () => {
  const w = pick("Window 1200 x 1500mm", "Nr");
  assert.equal(Math.round(w.factor * 1000) / 1000, Math.round((1.8 / 2.16) * 1000) / 1000);
  assert.match(w.sized, /Scaled/);
  assert.equal(pick("Door Interior_Door_12548 : D11 (8.45×3.325)", "Nr"), null);
  assert.equal(openingArea("Window W1 (0.9×3)"), 0.9 * 3);
});

test("no work type, or no rate in its unit, means no carbon", () => {
  assert.equal(pick("Upstand", "m"), null);
  assert.equal(pick("Earth work support to faces of excavation", "m2"), null);
  assert.equal(pick("Aluminum steel burglar bars to windows", "kg"), null);
});
