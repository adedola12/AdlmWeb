// The catalog defaults against the Sep 2026 practice consensus: build-up formulas
// mined from ~580 real Nigerian QS bills, one vote per template lineage, firm or
// unit-rate sheet. Ranges are the consensus inter-quartile ranges, so a default
// drifting out of what practising QSs actually order fails here.
//
// QUIV holds the same values (Infrastructure/MaterialConstants) and the evidence
// for each change; the key names are the contract between the two.

import test from "node:test";
import assert from "node:assert/strict";

import { resolveConstants, MC, constantDef } from "./materialConstants.js";
import { deriveMaterials } from "./mlSchedule.js";

const K = resolveConstants();
const def = (key) => constantDef(key).def;
const item = (over = {}) => ({ code: "c", description: "", takeoffLine: "", unit: "m3", qty: 1, rate: 0, ...over });
const mat = (rows, name) => rows.find((r) => r.name === name);

const MIXES = [
  // mix,              cement bags/m3, sand t/m3,      granite t/m3
  ["1:2:4", [6.0, 6.78], [0.584, 0.667], [1.168, 1.333]],
  ["1:3:6", [4.24, 4.47], [0.532, 0.687], [1.131, 1.375]],
  ["1:4:8", [2.89, 4.06], [0.583, 0.756], [1.2, 1.512]],
];

test("every nominal mix sits inside the practice range", () => {
  for (const [mix, cement, sand, granite] of MIXES) {
    const rows = deriveMaterials(item({ description: `Concrete (${mix}) in bases`, qty: 1 }), "concrete", K);
    assert.ok(mat(rows, "Cement").qty >= cement[0] && mat(rows, "Cement").qty <= cement[1], `${mix} cement ${mat(rows, "Cement").qty}`);
    assert.ok(mat(rows, "Sharp sand").qty >= sand[0] && mat(rows, "Sharp sand").qty <= sand[1], `${mix} sand ${mat(rows, "Sharp sand").qty}`);
    assert.ok(mat(rows, "Granite").qty >= granite[0] && mat(rows, "Granite").qty <= granite[1], `${mix} granite ${mat(rows, "Granite").qty}`);
  }
});

test("blinding is a lean mix with granite, not 0.9 bags of cement", () => {
  const rows = deriveMaterials(item({ description: "50mm thick blinding under bases", qty: 1 }), "blinding", K);
  const cement = mat(rows, "Cement").qty;
  assert.ok(cement >= 3.14 && cement <= 4.96, `blinding cement ${cement}`);
  const granite = mat(rows, "Granite");
  assert.ok(granite, "blinding must order granite");
  assert.ok(granite.qty >= 1.2 && granite.qty <= 1.512, `blinding granite ${granite.qty}`);
});

test("blockwork mortar matches practice", () => {
  const rows = deriveMaterials(item({ description: "225mm blockwork in walls", unit: "m2", qty: 1 }), "blockwork", K);
  assert.ok(mat(rows, "Cement").qty >= 0.187 && mat(rows, "Cement").qty <= 0.212);
  assert.ok(mat(rows, "Sharp sand").qty >= 0.0455 && mat(rows, "Sharp sand").qty <= 0.0817);
  assert.ok(mat(rows, "Blocks").qty >= 10 && mat(rows, "Blocks").qty <= 10.75);
});

test("formwork carries nails and bracing per m2", () => {
  const rows = deriveMaterials(item({ description: "Sawn formwork to sides of beams", unit: "m2", qty: 100 }), "formwork", K);
  assert.ok(Math.abs(mat(rows, "Nails").qty / 100 - 0.02) < 0.001, `nails ${mat(rows, "Nails").qty / 100}/m2`);
  const bracePerM2 = mat(rows, "Bracing timber").qty / 100;
  assert.ok(bracePerM2 >= 0.505 * 3.6 && bracePerM2 <= 0.722 * 3.7, `bracing ${bracePerM2} m/m2`);
});

test("fill is priced in tonnes, not tipper trips", () => {
  // 0.285 was the reference schedule's =m3/3.51 (3.51 m3 trips per m3) read as tonnes.
  const rows = deriveMaterials(item({ description: "Hardcore filling in layers", qty: 1 }), "fill", K);
  assert.ok(mat(rows, "Hardcore").qty >= 1.4 && mat(rows, "Hardcore").qty <= 2.0, `fill ${mat(rows, "Hardcore").qty} t/m3`);
});

test("sheet goods net off laps and use the rolls practice prices", () => {
  assert.ok(Math.abs(1 / def(MC.DpmAreaPerRoll) - 1.1 / 50) < 0.001);
  assert.ok(Math.abs(1 / def(MC.MeshAreaPerRoll) - 1.05 / 48) < 0.001);
});

test("tiles carry cutting waste and a kilo of white cement", () => {
  const rows = deriveMaterials(item({ description: "600x600 floor tiles", unit: "m2", qty: 1 }), "tiling", K);
  assert.equal(mat(rows, "Floor tiles").qty, 1.1);
  assert.ok(Math.abs(mat(rows, "White cement").qty * def(MC.CementBagWeightKg) - 1.0) < 0.01);
});

test("rebar is ordered with waste and keeps its binding wire", () => {
  const rows = deriveMaterials(item({ description: "High yield bars", unit: "ton", qty: 10 }), "rebar", K);
  assert.equal(mat(rows, "Reinforcement steel").qty, 10.5);
  assert.equal(mat(rows, "Binding wire").qty, 100); // 10,000 kg x 0.01
});

test("a firm override still wins over the calibrated default", () => {
  const own = resolveConstants({ [MC.BlockSandTonsPerSqm]: 0.07 });
  const rows = deriveMaterials(item({ description: "225mm blockwork", unit: "m2", qty: 100 }), "blockwork", own);
  assert.equal(mat(rows, "Sharp sand").qty, 7);
});
