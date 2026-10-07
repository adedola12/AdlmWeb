// server/routes/projects.exposure.test.js
//
// QUIV tells external walls from internal ones (a room on one side only, or the
// wall's ADLM_Exposure parameter) and sends, on each bill and budget line, which
// side it is on and the finish named in the model. Both must survive a save:
// the bill, the budget and Ada read them back.
import test from "node:test";
import assert from "node:assert/strict";
import { __test } from "./projects.js";

const { normalizeExposure, sanitizeItems } = __test;

test("exposure keeps only external or internal", () => {
  assert.equal(normalizeExposure("external"), "external");
  assert.equal(normalizeExposure(" Internal "), "internal");
  assert.equal(normalizeExposure("outside"), "");
  assert.equal(normalizeExposure(undefined), "");
});

test("a saved line keeps its side and its finish name", () => {
  const [wall, paint, beam] = sanitizeItems([
    { description: "Blockwork – Wall Area – External – 225mm [L:Ground | T:230 WALL]", qty: 100, unit: "m2", exposure: "external" },
    { description: "Finishes – Walls – Internal – Silk Emulsion", qty: 170, unit: "m2", exposure: "internal", finishName: "Silk Emulsion" },
    { description: "Beams – Concrete", qty: 4, unit: "m3" },
  ]);
  assert.equal(wall.exposure, "external");
  assert.equal(wall.finishName, "");
  assert.equal(paint.exposure, "internal");
  assert.equal(paint.finishName, "Silk Emulsion");
  // Lines from before the split, and from other modules, carry neither.
  assert.equal(beam.exposure, "");
  assert.equal(beam.finishName, "");
});
