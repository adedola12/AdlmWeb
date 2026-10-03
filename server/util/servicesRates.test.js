// RateGen's building-services rates and their carbon (util/servicesRates.js,
// the services factors in assets/carbon/carbonFactors.json, and the SERVIQ work
// types in util/icmsWorkCarbon.js). What these defend: every services rate
// carries carbon from its own quantities though it has no price yet, a SERVIQ
// line reaches the right rate at the nearest size, and a Revit family that
// names its own size is weighed from the line.

import test from "node:test";
import assert from "node:assert/strict";

import { assessCarbon } from "./carbonEngine.js";
import { buildCarbonRates } from "./carbonRates.js";
import { matchWorkRate } from "./icmsWorkCarbon.js";
import { SERVICES_RATES, SERVICES_TRADES, servicesPriceList } from "./servicesRates.js";

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-3, `${msg ?? ""} ${a} != ${b}`);
const carbon = buildCarbonRates(SERVICES_RATES, [], SERVICES_TRADES);
const rates = SERVICES_RATES.map((r, i) => ({ ...r, carbon: carbon[i] }));
const pick = (description, unit) => matchWorkRate({ description, unit }, rates);

test("every services rate is unpriced and still carries carbon", () => {
  assert.ok(SERVICES_RATES.length >= 50);
  for (const [i, r] of SERVICES_RATES.entries()) {
    assert.equal(r.netCost, 0, r.description);
    assert.equal(r.status, "draft");
    assert.ok(carbon[i]?.total > 0, `${r.description} has no carbon`);
  }
});

test("the price list names every material and trade, unpriced", () => {
  const list = servicesPriceList();
  for (const t of SERVICES_TRADES) assert.ok(list.some((x) => x.kind === "labour" && x.name === t), t);
  assert.ok(list.every((x) => x.unitPrice === null));
});

test("cable is weighed from its cores; ducts and trays from their size", () => {
  const cable = assessCarbon("", "XHHW - 4×95 mm² + 1×50 mm²", "m", 1);
  near(cable.kg, (430 * 8.96) / 1000 * 1.5);
  const duct = assessCarbon("", "M_Rectangular Duct Transition - Angle - 45 Degree - 450x475-", "EA", 1);
  near(duct.kg, 2 * (0.45 + 0.475) * 0.0006 * 7850 * 1.15 * 0.6);
  const tray = assessCarbon("", "Ladder Cable Tray - 300 mmx75 mm", "m", 1);
  near(tray.kg, (0.3 + 2 * 0.075) * 0.0015 * 7850 * 1.15);
});

test("an LED luminaire carries its EPD figure per item, not per kg", () => {
  const c = assessCarbon("", "Lighting Fixtures – 18W LED panel 600x600", "nr", 2);
  near(c.a13, 2 * 43.1);
});

test("equipment takes its rating as named; Nr, No and EA all count each", () => {
  near(assessCarbon("", "Mechanical Equipment – 1.5HP split air conditioner", "nr", 1).kg, 40);
  near(assessCarbon("", "Plumbing Equipment – 50 litre water heater", "nr", 1).kg, 24);
  near(assessCarbon("", "Fire Protection – 9kg fire extinguisher", "nr", 1).kg, 5.5);
  near(assessCarbon("", "DB - 100 A - M_Lighting and Appliance Panelboard", "EA", 1).kg, 8);
});

test("Revit's duct type 'Mitered Elbows / Taps' is ductwork, not a brass tap", () => {
  assert.equal(assessCarbon("", "Mitered Elbows / Taps - Mitered Elbows / Taps - 300", "m", 1).factor.id, "duct");
});

test("SERVIQ lines reach their rate, at the nearest size", () => {
  assert.match(pick("Pipes – 25mm PPR cold water branches", "m").rate.description, /25mm PPR/);
  const soil = pick("Pipes – 100mm uPVC soil and stacks", "m");
  assert.match(soil.rate.description, /110mm uPVC/);
  assert.match(soil.assumed, /No 100 rate: the 110 rate used/);
  assert.match(pick("Mechanical Equipment – 1.5HP split air conditioner", "nr").rate.description, /1\.5HP/);
  assert.match(pick("Electrical Equipment – 12-way distribution board", "nr").rate.description, /12-way/);
  assert.match(pick("Plumbing Fixtures – WC suite", "nr").rate.description, /WC suite/);
});

test("an AC point is not a power point; a switch is not a luminaire; a transformer is not a DB", () => {
  assert.match(pick("Power Points – AC point, 4mm² radial", "nr").rate.description, /^AC point/);
  assert.match(pick("Power Points – 13A twin socket, 2.5mm² radial", "nr").rate.description, /^Power point/);
  assert.equal(pick("Switch - Single Pole", "EA"), null);
  assert.equal(pick("DB - 15 kVA - M_Dry Type Transformer", "EA"), null);
});
