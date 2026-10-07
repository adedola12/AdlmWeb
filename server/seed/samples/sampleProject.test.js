import { test } from "node:test";
import assert from "node:assert/strict";
import { DESIGNS } from "./duplexModel.js";
import { buildSampleProject, itemIdentity, valueToDate } from "./sampleProject.js";
import { writeIfc, ifcGuid } from "./ifcWriter.js";
import { deriveLineRate } from "../../util/deriveBillRates.js";

const PRODUCTS = ["revit", "planswift"];

test("every sample line is priced from its own budget build-up", () => {
  for (const d of DESIGNS) {
    for (const pk of PRODUCTS) {
      const { project } = buildSampleProject(d, pk);
      for (const it of project.items) {
        const rows = project.budgetItems.filter((b) => b.billIdentity === it.code);
        assert.ok(rows.length > 0, `${d.key} ${it.description} has no budget`);
        assert.equal(it.rate, deriveLineRate(it.qty, rows).rate, it.description);
        assert.ok(rows.some((b) => b.componentKind === "Labour" || b.componentKind === "Plant"));
      }
      const codes = project.items.map((it) => it.code);
      assert.equal(new Set(codes).size, codes.length, `${pk} ${d.key} duplicate codes`);
    }
  }
});

test("contract sum follows lockContract arithmetic and base items match the bill", () => {
  const { project } = buildSampleProject(DESIGNS[0], "revit");
  const c = project.contract;
  const subtotal = c.measuredAtLock + c.provisionalAtLock + c.preliminaryAtLock;
  assert.ok(Math.abs(c.contractSum - (subtotal + c.contingencyAtLock + c.taxAtLock)) < 1e-6);
  assert.deepEqual(
    c.baseItems.map((b) => b.identity),
    project.items.map((it, i) => itemIdentity(it, i)),
  );
});

test("certificates chain: cumulative less previous, last one equals value to date", () => {
  for (const d of DESIGNS) {
    const { project } = buildSampleProject(d, "planswift");
    let prev = 0;
    for (const c of project.certificates) {
      assert.ok(Math.abs(c.lessPrevious - prev) < 1e-6, `${d.key} cert ${c.number}`);
      assert.ok(Math.abs(c.thisCertificate - (c.cumulativeValue - prev)) < 1e-6);
      prev += c.thisCertificate;
    }
    const last = project.certificates[project.certificates.length - 1];
    assert.ok(Math.abs(last.cumulativeValue - valueToDate(project).cumulativeValue) < 1e-6);
    assert.ok(last.cumulativeValue < project.contract.contractSum * 1.05);
  }
});

test("only the pile sample has a finalised account", () => {
  for (const d of DESIGNS) {
    const { project } = buildSampleProject(d, "revit");
    assert.equal(project.finalAccount.finalized, d.foundation === "pile");
    if (d.foundation === "pile") assert.ok(project.items.every((it) => it.completed));
  }
});

test("QUIV lines cite elements that exist in their discipline's IFC", () => {
  for (const d of DESIGNS) {
    const { project, model } = buildSampleProject(d, "revit");
    for (const disc of ["architectural", "structural"]) {
      const txt = writeIfc({ projectName: "t", buildingName: "t", siteName: "t", elements: model.elements, discipline: disc, seed: d.key });
      const tags = new Set([...txt.matchAll(/,'(\d{6})',?/g)].map((m) => Number(m[1])));
      for (const it of project.items.filter((i) => i.discipline === disc)) {
        assert.ok(it.elementIds.length > 0, `${it.description} cites no elements`);
        for (const id of it.elementIds) assert.ok(tags.has(id), `${d.key} ${disc} missing ${id} (${it.description})`);
        const share = it.elementQuantities.reduce((a, e) => a + e.qty, 0);
        assert.ok(Math.abs(share - it.qty) < 0.05 + it.qty * 0.001, `${it.description} split ${share} vs ${it.qty}`);
      }
      assert.equal(project.models[disc].validation.missingCount, 0);
    }
  }
});

test("HERON samples carry no model and no element links", () => {
  const { project } = buildSampleProject(DESIGNS[1], "planswift");
  assert.deepEqual(project.models, {});
  assert.ok(project.items.every((it) => !it.elementIds));
});

test("IFC output is plain ASCII with stable 22-character GlobalIds", () => {
  const { model } = buildSampleProject(DESIGNS[3], "revit");
  const a = writeIfc({ projectName: "Sample: x – y", buildingName: "b", siteName: "s", elements: model.elements, discipline: "structural", seed: "k" });
  const b = writeIfc({ projectName: "Sample: x – y", buildingName: "b", siteName: "s", elements: model.elements, discipline: "structural", seed: "k" });
  assert.equal(a, b);
  assert.ok(/^[\x0a\x20-\x7e]*$/.test(a));
  assert.match(a, /FILE_SCHEMA\(\('IFC4'\)\)/);
  assert.match(a, /IFCPILE\(/);
  assert.equal(ifcGuid("x").length, 22);
});

test("PM tasks link to real bill identities", () => {
  const { project } = buildSampleProject(DESIGNS[2], "revit");
  const ids = new Set(project.items.map((it, i) => itemIdentity(it, i)));
  const linked = project.projectManagement.tasks.flatMap((t) => t.linkedBoqIdentities).filter((x) => !x.startsWith("prelim::"));
  assert.equal(linked.length, project.items.length);
  for (const x of linked) assert.ok(ids.has(x));
});
