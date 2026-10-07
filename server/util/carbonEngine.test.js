// Upfront carbon (RICS A1-A5) as IStructE (2020) calculates it, from the
// factors in assets/carbon/carbonFactors.json. These are the desktop RateGen's
// own CarbonEngineTests, figure for figure: the cloud must show what the
// desktop shows.

import test from "node:test";
import assert from "node:assert/strict";

import { assessCarbon } from "./carbonEngine.js";

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg ?? ""} ${a} != ${b}`);

test("a bag of cement is 50 kg at the published factor", () => {
  const c = assessCarbon("Cement Based Products", "Cement (50kg bag)", "Bag", 1);
  near(c.kg, 50);
  near(c.a13, 50 * 0.83); // CIDB 2021, cement (commonly used)
  near(c.a4, 50 * 0.032); // national, 300 km by road
  near(c.a5w, 50 * 0.053 * (0.83 + 0.032 + 0.005 + 0.013)); // A5w = WF x (A1-A3 + A4 + C2 + C3-C4)
});

test("diesel is site energy per litre burnt", () => {
  const c = assessCarbon("Fuels", "Diesel", "Litre", 304);
  near(c.a5a, 304 * 2.66155);
  assert.equal(c.a13, 0);
  near(c.total, c.a5a);
});

test("a 225 hollow block uses its stated, assumed mass", () => {
  const c = assessCarbon("Cement Based Products", '225 x 225 x 450mm (9 x 9 x 18") Hollow blocks', "No.", 10);
  near(c.kg, 275);
  assert.equal(c.factor.massAssumed, true);
});

test("cement carries a Nigerian low end", () => {
  const c = assessCarbon("Cement Based Products", "Cement (50kg bag)", "Bag", 1);
  assert.ok(c.totalLow < c.total);
  near(c.totalLow - c.total, 50 * (0.57 - 0.83) * (1 + c.factor.wf));
});

test("a tile takes its thickness from the build-up line", () => {
  const c = assessCarbon("Finishes - Ceramic floor tiles", "Ceramic floor tiles", "m2", 1, "600 x 600 x 10mm vitrified floor tiles");
  near(c.kg, 20); // 0.010 m x 2,000 kg/m3
});

test("paint in litres per square metre is weighed", () => {
  const c = assessCarbon("", "Emulsion paint", "Lit/m2", 2, "Emulsion paint");
  near(c.kg, 2.6); // 2 litres x 1.3 kg/l
});

test("aluminium sheet mass comes from its thickness", () => {
  const c = assessCarbon("Longspan Aluminium Roofing Sheet", "0.55mm (24SWG) sheet, Stucco mill", "m2", 1);
  near(c.kg, (0.55 / 1000) * 2700);
  near(c.a13, c.kg * 13.0); // IStructE 2020, worldwide consumption
});

test("reinforcement is per tonne at the scrap-EAF factor", () => {
  const c = assessCarbon("High Tensile Steel Bar Reinforcement", '1/2" diameter (93 pieces) - 12mm diameter.', "Tonne", 1);
  near(c.a13, 1000 * 0.821); // CARES EPD 0060, scrap-based EAF
});

for (const [category, name, unit] of [
  ["MEP - Electrical - Luminaires (installed)", "LED ceiling fitting, 1 x 12W", "No."],
  ["AMERON PAINTS - Thinners", "Amercoat 12", "1 Litre"],
  ["Cement Based Products", "Loading and unloading cement", "Bag"],
]) {
  test(`no factor means no figure: ${name}`, () => {
    assert.equal(assessCarbon(category, name, unit, 1), null);
  });
}
