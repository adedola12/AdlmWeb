import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCashflowForecast,
  monthLabel,
  monthsOf,
  shareInMonth,
  taskValue,
} from "./cashflowForecast.js";

// The forecast exists to answer one question: when does the job run out of
// money. These pin the three things that make that answer true — value spread
// across the months work happens in, materials paid BEFORE that work, and money
// arriving a month after it is certified.

const project = {
  preliminaryPercent: 0,
  contract: { retentionPercent: 10 },
  items: [
    { code: "BQ-1", qty: 10, rate: 100_000 }, // 1,000,000
    { code: "BQ-2", qty: 10, rate: 200_000 }, // 2,000,000
  ],
  budgetItems: [
    { componentKind: "material", billIdentity: "BQ-1", qty: 1, rate: 400_000 },
    { componentKind: "labour", billIdentity: "BQ-1", qty: 1, rate: 300_000 },
    { componentKind: "material", billIdentity: "BQ-2", qty: 1, rate: 900_000 },
    { componentKind: "labour", billIdentity: "BQ-2", qty: 1, rate: 600_000 },
  ],
  pm: {
    tasks: [
      {
        name: "A",
        startDate: "2026-03-01",
        endDate: "2026-03-31",
        linkedBoqIdentities: ["1::BQ-1::Excavate::::::m3"],
      },
      {
        name: "B",
        startDate: "2026-04-01",
        endDate: "2026-04-30",
        linkedBoqIdentities: ["2::BQ-2::Concrete::::::m3"],
      },
    ],
  },
};

const fc = (o) => buildCashflowForecast(project, { paymentLagDays: 30, leadDays: 14, ...o });

test("the months run first task start to last task finish", () => {
  const f = fc();
  assert.deepEqual(f.months.map((m) => m.label), ["Mar 2026", "Apr 2026", "May 2026"]);
});

test("there is no forecast without a programme, and it says so", () => {
  const f = buildCashflowForecast({ items: project.items, budgetItems: [] });
  assert.equal(f.hasProgramme, false);
  assert.deepEqual(f.months, []);
  assert.equal(f.lowPoint, null);
});

test("a task's value is spread across the months it runs through", () => {
  // Task A is worth 1,000,000 and runs entirely in March.
  const f = fc();
  assert.ok(Math.abs(f.rows.valueCertified[0] - 1_000_000) < 1);
  assert.ok(Math.abs(f.rows.valueCertified[1] - 2_000_000) < 1);
});

test("a task straddling two months splits between them", () => {
  const split = {
    ...project,
    pm: {
      tasks: [
        {
          startDate: "2026-03-16",
          endDate: "2026-04-15",
          linkedBoqIdentities: ["1::BQ-1::x::::::m3"],
        },
      ],
    },
  };
  const f = buildCashflowForecast(split, { paymentLagDays: 0, leadDays: 0 });
  assert.ok(f.rows.valueCertified[0] > 0, "nothing in March");
  assert.ok(f.rows.valueCertified[1] > 0, "nothing in April");
  const total = f.rows.valueCertified.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1_000_000) < 2, `split total was ${total}`);
});

test("retention is withheld and the rest is what gets paid", () => {
  const f = fc();
  // 10% of March's 1,000,000.
  assert.ok(Math.abs(f.rows.retention[0] - 100_000) < 1);
  assert.ok(Math.abs(f.rows.netCertified[0] - 900_000) < 1);
});

test("money arrives a month AFTER it is certified — the point of the exercise", () => {
  const f = fc();
  assert.equal(Math.round(f.rows.received[0]), 0, "March work paid in March");
  assert.ok(Math.abs(f.rows.received[1] - 900_000) < 1, "March money did not arrive in April");
});

test("no lag means paid in the month it is certified", () => {
  const f = fc({ paymentLagDays: 0 });
  assert.ok(Math.abs(f.rows.received[0] - 900_000) < 1);
});

test("no certified money is ever lost between the columns and the tail", () => {
  // The invariant that matters: everything certified is either shown arriving
  // in a column or declared as still owed at the end. Nothing evaporates.
  for (const lag of [0, 30, 60, 120]) {
    const f = fc({ paymentLagDays: lag });
    const certified = f.rows.netCertified.reduce((a, b) => a + b, 0);
    const landed = f.totals.received + f.totals.afterCompletion;
    assert.ok(Math.abs(certified - landed) < 1, `lag ${lag}: ${certified} vs ${landed}`);
  }
});

test("the table carries on past the programme so the last payment has a column", () => {
  const f = fc({ paymentLagDays: 30 });
  const last = f.months[f.months.length - 1];
  assert.equal(last.label, "May 2026");
  assert.ok(f.rows.received[f.months.length - 1] > 0, "April's money never arrives");
});

test("materials are paid BEFORE the work, by the lead time", () => {
  // Task B starts 1 April; with 14 days lead its material is bought in March.
  const f = fc({ leadDays: 14 });
  assert.ok(f.rows.materials[0] >= 900_000, "B's material did not land in March");
});

test("a longer lead pulls the buy earlier still", () => {
  const early = fc({ leadDays: 45 });
  // 45 days before 1 April is mid-February, which is before the programme —
  // that must be pulled into month one, not hidden.
  const total = early.rows.materials.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1_300_000) < 1, `materials totalled ${total}`);
});

test("labour is spread across the work, not paid up front", () => {
  const f = fc();
  assert.ok(Math.abs(f.rows.labour[0] - 300_000) < 1);
  assert.ok(Math.abs(f.rows.labour[1] - 600_000) < 1);
});

test("the cumulative line is the answer, and it dips before it recovers", () => {
  const f = fc();
  assert.equal(f.rows.cumulative.length, 3);
  assert.ok(f.lowPoint, "no low point");
  assert.ok(f.lowPoint.amount < 0, "the job never goes negative, which cannot be right here");
  assert.match(f.lowPoint.month, /2026/);
});

test("the cumulative line is a running total of the monthly net", () => {
  const f = fc();
  let run = 0;
  f.rows.net.forEach((v, i) => {
    run += v;
    assert.ok(Math.abs(f.rows.cumulative[i] - run) < 0.01, `month ${i} broke the running total`);
  });
});

test("a certificate already issued replaces the forecast for its month", () => {
  const withCert = {
    ...project,
    certificates: [{ issuedAt: "2026-03-20", thisCertificate: 250_000 }],
  };
  const f = buildCashflowForecast(withCert, { paymentLagDays: 30, leadDays: 14 });
  assert.ok(Math.abs(f.rows.valueCertified[0] - 250_000) < 1, "the forecast overrode the fact");
  assert.equal(f.months[0].actual, true, "March is not flagged as actual");
  assert.equal(f.months[1].actual, false, "April is wrongly flagged as actual");
});

test("preliminaries spread evenly across the job", () => {
  const f = fc({ prelimPercent: 10 });
  // 10% of 3,000,000 measured = 300,000 over three months.
  f.rows.prelims.forEach((v) => assert.ok(Math.abs(v - 100_000) < 1, `prelim month was ${v}`));
});

test("the assumptions are reported, so the sheet can state them", () => {
  const f = fc({ retentionPercent: 7.5, paymentLagDays: 45, leadDays: 21 });
  assert.deepEqual(f.assumptions, {
    retentionPercent: 7.5,
    paymentLagDays: 45,
    leadDays: 21,
    prelimPercent: 0,
  });
});

test("share of a month is a fraction and never exceeds the whole", () => {
  const m = new Date(Date.UTC(2026, 2, 1));
  assert.equal(shareInMonth("2026-03-01", "2026-03-31", m) > 0.9, true);
  assert.equal(shareInMonth("2026-01-01", "2026-01-31", m), 0);
  assert.ok(shareInMonth("2026-02-15", "2026-04-15", m) <= 1);
});

test("helpers cope with rubbish rather than throwing", () => {
  assert.equal(monthLabel(null), "");
  assert.deepEqual(monthsOf(null), []);
  assert.equal(shareInMonth(null, null, null), 0);
  assert.equal(taskValue(null, new Map()), 0);
});

// The practice's own forecasts are a "Project Cash Gantt Chart": the activity
// down the left with its total, months across, cost spread into the months it
// runs through. That answers which ACTIVITY drives a bad month, which a table of
// categories cannot.
test("the cash Gantt gives one row per activity, spread across its months", () => {
  const f = fc();
  assert.equal(f.activities.length, 2);
  const a = f.activities[0];
  assert.equal(a.name, "A");
  assert.ok(Math.abs(a.cost - 1_000_000) < 1);
  assert.equal(a.spread.length, f.months.length);
  assert.ok(Math.abs(a.spread[0] - 1_000_000) < 1, "A is not wholly in March");
  assert.equal(Math.round(a.spread[1]), 0);
});

test("an activity's spread adds back to its own cost", () => {
  for (const a of fc().activities) {
    const total = a.spread.reduce((x, y) => x + y, 0);
    assert.ok(Math.abs(total - a.cost) < 1, `${a.name}: ${total} vs ${a.cost}`);
  }
});

test("activities come in start order, and undated ones are left out", () => {
  const withUndated = {
    ...project,
    pm: { tasks: [...project.pm.tasks, { name: "Someday", linkedBoqIdentities: ["1::BQ-1::x::::::m3"] }] },
  };
  const f = buildCashflowForecast(withUndated, { paymentLagDays: 30, leadDays: 14 });
  assert.deepEqual(f.activities.map((a) => a.name), ["A", "B"]);
});
