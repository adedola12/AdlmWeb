import { test } from "node:test";
import assert from "node:assert/strict";
import { BANDS, bandForLine, buildProgramme } from "./powTemplate.js";

// The template exists to make a sample programme look like a real one. These
// pin the four things that distinguish a builder's programme from a generated
// queue of bars, all taken from the source: the trade triad, the one-day pour,
// the overlaps, and externals that start before the frame is finished.

const START = "2026-01-05";
const days = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
const build = (o = {}) => buildProgramme({ start: START, days: 300, floors: 3, ...o });

test("a programme is produced and stays inside its own span", () => {
  const tasks = build();
  assert.ok(tasks.length > 30, `only ${tasks.length} tasks`);
  for (const t of tasks) {
    assert.ok(t.startDate >= new Date(START), `${t.name} starts before the job`);
    assert.ok(days(START, t.endDate) <= 305, `${t.name} runs past the end`);
    assert.ok(t.endDate >= t.startDate, `${t.name} ends before it starts`);
  }
});

test("every concrete element is three trades, not one bar", () => {
  const tasks = build();
  const pileCap = tasks.filter((t) => /pile cap/i.test(t.name));
  const trades = pileCap.map((t) => t.trade).filter(Boolean);
  assert.ok(trades.includes("Formwork"), "no formwork to pile cap");
  assert.ok(trades.includes("Reinforcement"), "no reinforcement to pile cap");
  assert.ok(trades.includes("Concrete"), "no pour to pile cap");
});

test("a pour is one day, whatever the element is worth", () => {
  // Every concrete task in the source programme is 1 day: a pour is a pour.
  for (const t of build().filter((x) => x.trade === "Concrete")) {
    assert.equal(t.durationDays, 1, `${t.name} is ${t.durationDays} days`);
  }
});

test("reinforcement starts before the formwork is finished", () => {
  // The overlap is the tell-tale of a real programme. Strict finish-to-start
  // everywhere is how a generated one reads.
  const tasks = build();
  const fw = tasks.find((t) => t.trade === "Formwork" && /pile cap/i.test(t.name));
  const rf = tasks.find((t) => t.trade === "Reinforcement" && /pile cap/i.test(t.name));
  assert.ok(fw && rf, "pile cap trades missing");
  assert.ok(rf.startDate < fw.endDate, "reinforcement waits for formwork to finish");
  assert.ok(rf.startDate > fw.startDate, "reinforcement starts with formwork");
});

test("MEP first fix runs inside the slab reinforcement, not after it", () => {
  const tasks = build();
  const mep = tasks.find((t) => t.trade === "MEP");
  assert.ok(mep, "no MEP first fix in the frame");
  const slab = tasks.find(
    (t) => t.trade === "Reinforcement" && t.band === "superstructure" && t.endDate >= mep.startDate,
  );
  assert.ok(slab, "no slab reinforcement to sit inside");
  assert.ok(mep.startDate < slab.endDate, "MEP waits for the rebar to finish");
});

test("external works start while the frame is still going up", () => {
  const tasks = build();
  const ext = tasks.filter((t) => t.band === "external");
  const frame = tasks.filter((t) => t.band === "superstructure");
  assert.ok(ext.length && frame.length);
  const firstExt = Math.min(...ext.map((t) => t.startDate.getTime()));
  const lastFrame = Math.max(...frame.map((t) => t.endDate.getTime()));
  assert.ok(firstExt < lastFrame, "externals queue behind the frame");
});

test("blockwork trails the frame rather than keeping pace with it", () => {
  const tasks = build({ floors: 3 });
  const block = tasks.filter((t) => /blockwork/i.test(t.name));
  assert.ok(block.length, "no blockwork");
  const firstFrame = tasks.find((t) => t.band === "superstructure" && t.trade === "Formwork");
  assert.ok(block[0].startDate > firstFrame.startDate, "blockwork starts with the frame");
});

test("one repeat per floor, and a bungalow is not given six", () => {
  const three = build({ floors: 3 }).filter((t) => t.band === "superstructure");
  const one = build({ floors: 1 }).filter((t) => t.band === "superstructure");
  assert.ok(three.length > one.length, "floors change nothing");
});

test("it ends on a practical completion milestone", () => {
  const tasks = build();
  const ms = tasks.filter((t) => t.isMilestone);
  assert.equal(ms.length, 1);
  assert.match(ms[0].name, /practical completion/i);
  assert.equal(ms[0].durationDays, 0);
});

test("every band the template declares actually produces tasks", () => {
  const tasks = build();
  for (const b of BANDS) {
    assert.ok(
      tasks.some((t) => t.band === b.key),
      `band ${b.key} produced nothing`,
    );
  }
});

test("a bill line is placed in the band its words belong to", () => {
  assert.equal(bandForLine("Excavate for pile caps"), "substructure");
  assert.equal(bandForLine("Reinforced concrete column"), "superstructure");
  assert.equal(bandForLine("Plastering to walls"), "finishes");
  assert.equal(bandForLine("Interlocking paving to driveway"), "external");
  // Nothing recognisable lands in the frame rather than being dropped.
  assert.equal(bandForLine("Sundries"), "superstructure");
});

test("a short programme still produces a usable one", () => {
  // A bungalow measured over eight weeks must not collapse to zero-day bars.
  const tasks = buildProgramme({ start: START, days: 56, floors: 1 });
  assert.ok(tasks.length > 10);
  for (const t of tasks) {
    if (!t.isMilestone) assert.ok(t.durationDays >= 1, `${t.name} is ${t.durationDays} days`);
  }
});
