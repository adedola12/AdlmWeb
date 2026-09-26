// Revit MEP, CIVIQ and ArchiCAD samples: the same invariants the QUIV / HERON
// samples hold (sampleProject.test.js), plus each product's own shape.

import { test } from "node:test";
import assert from "node:assert/strict";
import { DESIGNS } from "./duplexModel.js";
import { assembleSampleProject, duplexScheme, itemIdentity, valueToDate } from "./sampleProject.js";
import { mepScheme } from "./mepSample.js";
import { ROAD_DESIGNS, roadScheme } from "./roadSample.js";
import { archicadVersionDoc, archicadGuid } from "./archicadSample.js";
import { writeIfc } from "./ifcWriter.js";
import { deriveLineRate } from "../../util/deriveBillRates.js";
import { MEP_CATEGORIES, MEP_TRADES, QUIV_TRADES } from "../../util/boqCategory.js";
import { CATEGORIES } from "../../services/archicadCosting.js";

const CASES = [
  ...DESIGNS.map((d) => ["mep", d, () => mepScheme(d)]),
  ...ROAD_DESIGNS.map((d) => ["civil3d", d, () => roadScheme(d)]),
  ...DESIGNS.map((d) => ["archicad", d, () => duplexScheme(d, "archicad")]),
];

test("every line is priced from its own build-up, with unique codes", () => {
  for (const [pk, d, make] of CASES) {
    const { project } = assembleSampleProject(make(), pk);
    assert.ok(project.items.length > 10, `${pk} ${d.key} has too few lines`);
    for (const it of project.items) {
      const rows = project.budgetItems.filter((b) => b.billIdentity === it.code);
      assert.ok(rows.length > 0, `${pk} ${d.key} ${it.description} has no budget`);
      assert.equal(it.rate, deriveLineRate(it.qty, rows).rate, it.description);
      assert.ok(it.qty > 0 && it.rate > 0, `${pk} ${d.key} ${it.description}`);
    }
    const codes = project.items.map((it) => it.code);
    assert.equal(new Set(codes).size, codes.length, `${pk} ${d.key} duplicate codes`);
  }
});

test("certificates chain and the last one equals value to date", () => {
  for (const [pk, d, make] of CASES) {
    const { project } = assembleSampleProject(make(), pk);
    let prev = 0;
    for (const c of project.certificates) {
      assert.ok(Math.abs(c.lessPrevious - prev) < 1e-6, `${pk} ${d.key} cert ${c.number}`);
      prev += c.thisCertificate;
    }
    const last = project.certificates[project.certificates.length - 1];
    assert.ok(Math.abs(last.cumulativeValue - valueToDate(project).cumulativeValue) < 1e-6);
    assert.ok(last.cumulativeValue <= project.contract.contractSum * 1.05, `${pk} ${d.key} over-valued`);
    const ids = new Set(project.items.map((it, i) => itemIdentity(it, i)));
    for (const t of project.projectManagement.tasks) {
      for (const x of t.linkedBoqIdentities) if (!x.startsWith("prelim::")) assert.ok(ids.has(x));
    }
    // Exactly one sample per product reaches its final account.
    assert.equal(project.finalAccount.finalized, d.order === 4, `${pk} ${d.key} final account`);
  }
});

test("MEP lines use the MEP categories and trades and cite MEP model elements", () => {
  for (const d of DESIGNS) {
    const scheme = mepScheme(d);
    const { project } = assembleSampleProject(scheme, "mep");
    const txt = writeIfc({ projectName: "t", buildingName: "t", siteName: "t", elements: scheme.model.elements, discipline: "mep", seed: d.key });
    const tags = new Set([...txt.matchAll(/,'(\d{6})',?/g)].map((m) => Number(m[1])));
    for (const it of project.items) {
      assert.ok(MEP_CATEGORIES.includes(it.category), it.description);
      assert.ok(MEP_TRADES.includes(it.trade), it.description);
      assert.equal(it.discipline, "mep");
      for (const id of it.elementIds) assert.ok(tags.has(id), `${d.key} missing ${id}`);
    }
    assert.ok(project.models.mep && !project.models.architectural);
    const wcs = scheme.model.elements.filter((e) => e.service === "wc").length;
    assert.ok(wcs >= 2, `${d.key} has ${wcs} WCs`);
  }
});

test("CIVIQ roads are measured per chainage band, in the building trades the web knows", () => {
  for (const d of ROAD_DESIGNS) {
    const scheme = roadScheme(d);
    const { project } = assembleSampleProject(scheme, "civil3d");
    for (const it of project.items) {
      assert.match(it.level, /^Ch \d\+\d{3} to \d\+\d{3}$/);
      assert.ok(QUIV_TRADES.includes(it.trade), it.description);
    }
    const perKm = (project.contract.contractSum / d.length) * 1000;
    assert.ok(perKm > 80e6 && perKm < 1.5e9, `${d.key} costs N${(perKm / 1e6).toFixed(0)}m per km`);
    const txt = writeIfc({ projectName: "t", buildingName: "t", siteName: "t", elements: scheme.model.elements, discipline: "structural", seed: d.key, storeyLevels: scheme.storeyLevels });
    assert.match(txt, /IFCBUILDINGSTOREY\([^)]*'Road'/);
  }
});

test("ArchiCAD samples: elemental lines, no finishes, and a version the BoQ page can read", () => {
  for (const d of DESIGNS) {
    const scheme = duplexScheme(d, "archicad");
    const { project } = assembleSampleProject(scheme, "archicad");
    const titles = CATEGORIES.map((c) => c.title);
    for (const it of project.items) {
      assert.ok(titles.includes(it.category), it.description);
      assert.match(it.code, /^\d\.\d+$/);
      assert.ok(!it.elementIds, "ArchiCAD items carry no numeric element ids");
    }
    assert.ok(!project.items.some((it) => /Painting|Finishes/.test(it.description)));
    const v = archicadVersionDoc(scheme, project);
    assert.equal(v.lines.length, project.items.length);
    const measured = project.items.reduce((a, it) => a + it.qty * it.rate, 0);
    assert.ok(Math.abs(v.totals.grandTotal - measured) < 1 + measured * 1e-6, `${d.key} version total`);
    assert.ok(v.totals.floorArea > 50, `${d.key} floor area ${v.totals.floorArea}`);
    for (const l of v.lines) {
      assert.equal(l.elementGuids.length, l.elementQuantities.length);
      for (const g of l.elementGuids) assert.match(g, /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/);
    }
    assert.equal(archicadGuid(1), archicadGuid(1));
  }
});
