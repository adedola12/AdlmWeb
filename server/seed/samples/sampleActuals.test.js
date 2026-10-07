// A sample project carries measured quantities, so the actuals half of the
// product can be seen without typing any in.
//
// WHY THIS IS SEEDED AND NOT SET UP BY HAND
//
// Samples refuse every non-GET (util/sampleProjects.js), so nobody — not even
// the owner — can record an actual on one. With every actual null, the actual
// columns, the planned-against-actual chart line, CPI on the PM dashboard, the
// over-budget tip and the measured-work figure in the final account all sat at
// their empty state or at exactly 1.00. Somebody opening a sample to learn what
// the product does could not see any of it.
//
// WHAT MUST NOT BREAK
//
// The contract figure is frozen and the re-measure sits BESIDE it. That is the
// whole feature: the difference between the two is a variation somebody has to
// agree. If seeding ever overwrites it.qty or it.rate — or contract.baseItems —
// the variation disappears and the contract sum drifts with nothing to show
// why. That is the first test here and the one that matters most.
import test from "node:test";
import assert from "node:assert/strict";

import { DESIGNS } from "./duplexModel.js";
import { buildSampleProject } from "./sampleProject.js";

/** Every sample, built once, the way sampleProject.test.js builds them. */
function samples() {
  assert.ok(DESIGNS?.length, "no sample designs found — the export has moved");
  return DESIGNS.map((d) => ({ key: d.key, project: buildSampleProject(d, "revit").project }));
}

const measured = (p) =>
  (p.items || []).filter((it) => it.actualQty !== null && it.actualQty !== undefined);
const repriced = (p) =>
  (p.items || []).filter((it) => it.actualRate !== null && it.actualRate !== undefined);

test("the contract figures are untouched by the re-measure", () => {
  for (const { key, project } of samples()) {
    const base = project.contract?.baseItems || [];
    assert.ok(base.length, `${key}: no contract.baseItems to compare against`);

    base.forEach((b, i) => {
      const it = project.items[i];
      assert.equal(
        it.qty,
        b.qty,
        `${key} line ${i}: the bill quantity moved. The contract figure must stay ` +
          "frozen and the measure sit beside it, or the variation it represents disappears.",
      );
      assert.equal(it.rate, b.rate, `${key} line ${i}: the contract rate moved.`);
    });
  }
});

test("a handful of lines are measured, not all of them and not none", () => {
  for (const { key, project } of samples()) {
    const m = measured(project);
    assert.ok(m.length >= 3, `${key}: only ${m.length} measured lines; the demo shows nothing`);
    assert.ok(
      m.length < project.items.length,
      `${key}: every line is measured, so there is no "not measured yet" case left to see`,
    );
  }
});

test("the spread includes an over, an under, an exact agreement and an omission", () => {
  for (const { key, project } of samples()) {
    const m = measured(project);
    const over = m.filter((it) => it.actualQty > it.qty);
    const under = m.filter((it) => it.actualQty > 0 && it.actualQty < it.qty);
    const same = m.filter((it) => it.actualQty === it.qty);
    const omitted = m.filter((it) => it.actualQty === 0);

    assert.ok(over.length, `${key}: nothing measured OVER its contract quantity`);
    assert.ok(under.length, `${key}: nothing measured UNDER its contract quantity`);
    // The agreement case is seeded deliberately: without one, every filled row
    // looks like a problem and the column reads as "changed" rather than
    // "measured".
    assert.ok(same.length, `${key}: nothing where the measure AGREES with the contract`);
    // And the omission, which is the one that teaches what a zero means.
    assert.ok(omitted.length, `${key}: nothing measured at zero — a full omission`);
  }
});

test("an omission is a zero, never a null", () => {
  // null means "not measured yet" and leaves the line at its contract figure.
  // Zero means "measured, and there is none of it". Collapsing the two would
  // turn every unmeasured line into a full omission.
  for (const { key, project } of samples()) {
    const omitted = measured(project).filter((it) => it.actualQty === 0);
    for (const it of omitted) {
      assert.strictEqual(it.actualQty, 0, `${key}: the omitted line is not a real zero`);
      assert.notStrictEqual(it.actualQty, null);
    }
  }
});

test("a re-priced line leaves its quantity alone", () => {
  // The two columns are independent on purpose: the measure can agree while the
  // price has moved.
  for (const { key, project } of samples()) {
    const r = repriced(project);
    assert.ok(r.length, `${key}: no line carries a measured RATE`);
    const qtyUntouched = r.some((it) => it.actualQty === null || it.actualQty === undefined);
    assert.ok(
      qtyUntouched,
      `${key}: every re-priced line also has a measured quantity, so the case where ` +
        "only the rate moved is never shown",
    );
  }
});

test("every actual carries the date it was recorded", () => {
  // Not decoration. sanitizeItems (routes/projects.js) promotes actualRate into
  // rate and CLEARS the actual fields when a rate is 0 and no recorded-at date
  // is present, so an actual seeded without one is eaten on the first save.
  for (const { key, project } of samples()) {
    for (const it of [...measured(project), ...repriced(project)]) {
      assert.ok(
        it.actualRecordedAt instanceof Date,
        `${key}: an actual with no actualRecordedAt would be silently dropped on save`,
      );
    }
  }
});

test("one line is revised after it was first measured", () => {
  // So the screen's "measured on the 1st, revised on the 3rd" provenance has
  // something to show. Only one: a whole bill revised on the same day says
  // nothing about anything.
  for (const { key, project } of samples()) {
    const revised = [...measured(project), ...repriced(project)].filter(
      (it) =>
        it.actualUpdatedAt instanceof Date &&
        it.actualRecordedAt instanceof Date &&
        it.actualUpdatedAt.getTime() - it.actualRecordedAt.getTime() > 1000,
    );
    assert.ok(revised.length >= 1, `${key}: no line shows a later revision`);
  }
});

test("the actual columns are switched on, or none of this is visible", () => {
  for (const { key, project } of samples()) {
    assert.equal(
      project.valuationSettings?.showActualColumns,
      true,
      `${key}: the columns are hidden, and a sample refuses every write, so nobody can show them`,
    );
  }
});

test("no certificate is issued for a negative amount", () => {
  // The omission reduces the value of work done. Because the actuals are seeded
  // BEFORE the certificate loop runs, the whole certified history is computed
  // from them and stays consistent — but if that order is ever reversed, a
  // certificate could go negative, and this is what would say so.
  for (const { key, project } of samples()) {
    for (const c of project.certificates || []) {
      const amount = Number(c.amount ?? c.netAmount ?? 0);
      assert.ok(
        Number.isFinite(amount) && amount >= 0,
        `${key}: certificate dated ${c.date} is ${amount}. Actuals must be applied before ` +
          "the certificates are built, not after.",
      );
    }
  }
});
