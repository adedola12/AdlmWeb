// The period summary behind "what moved in September" — on the reports and in
// Ada's project_report tool. Every heading filters a stored date; these pin
// which date, and that the day boundaries are Lagos days.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseReportRange,
  buildPeriodSummary,
  inRange,
  watToday,
  periodIsQuiet,
} from "./reportPeriod.js";

test("watToday reads the Lagos calendar day, not the UTC one", () => {
  // 23:30 UTC on the 30th is 00:30 on the 1st in Lagos.
  assert.equal(watToday(new Date("2026-09-30T23:30:00Z")), "2026-10-01");
  assert.equal(watToday(new Date("2026-09-30T22:30:00Z")), "2026-09-30");
});

test("parseReportRange builds Lagos midnight-to-midnight boundaries", () => {
  const r = parseReportRange("2026-09-01", "2026-09-30");
  assert.equal(r.from.toISOString(), "2026-08-31T23:00:00.000Z");
  assert.equal(r.to.toISOString(), "2026-09-30T22:59:59.999Z");
  assert.equal(r.fromDay, "2026-09-01");
  assert.equal(r.toDay, "2026-09-30");
});

test("parseReportRange: a missing end means today; nothing means no range", () => {
  const now = new Date("2026-10-03T08:00:00Z");
  const r = parseReportRange("2026-09-01", "", { now });
  assert.equal(r.toDay, "2026-10-03");
  const none = parseReportRange("", "");
  assert.equal(none.from, null);
  assert.equal(none.to, null);
});

test("parseReportRange refuses nonsense rather than guessing", () => {
  assert.ok(parseReportRange("last month", "").error);
  assert.ok(parseReportRange("2026-02-31", "2026-03-05").error, "Feb 31 is not a date");
  assert.ok(parseReportRange("2026-09-30", "2026-09-01").error, "reversed range");
  assert.ok(parseReportRange("2010-01-01", "2026-01-01").error, "over five years");
  // A full timestamp is cut to its date.
  assert.equal(parseReportRange("2026-09-01T10:00:00Z", "2026-09-02").fromDay, "2026-09-01");
});

test("inRange: open ends are open, bad dates are out", () => {
  const { from, to } = parseReportRange("2026-09-01", "2026-09-30");
  assert.equal(inRange("2026-09-15T10:00:00Z", from, to), true);
  // 00:30 WAT on 1 Oct is 23:30 UTC on 30 Sept — outside a September report.
  assert.equal(inRange("2026-09-30T23:30:00Z", from, to), false);
  // 00:30 WAT on 1 Sept is 23:30 UTC on 31 Aug — inside it.
  assert.equal(inRange("2026-08-31T23:30:00Z", from, to), true);
  assert.equal(inRange(null, from, to), false);
  assert.equal(inRange("2020-01-01", null, null), true);
});

const project = () => ({
  name: "Lekki duplex",
  items: [
    { code: "A1", description: "Excavate", qty: 10, rate: 1000, completed: true, completedAt: "2026-09-10T09:00:00Z" },
    { code: "A2", description: "Concrete", qty: 5, rate: 50000, actualQty: 6, actualRate: 52000, actualRecordedAt: "2026-09-12T09:00:00Z" },
    { code: "A3", description: "Blockwork", qty: 100, rate: 2000, completed: true, completedAt: "2026-08-10T09:00:00Z" },
  ],
  valuationEvents: [
    { itemKey: "A1", amount: 10000, markedAt: "2026-09-10T09:00:00Z" },
    { itemKey: "A2", amount: 125000, markedAt: "2026-09-11T09:00:00Z" },
    { itemKey: "A2", amount: -25000, markedAt: "2026-09-20T09:00:00Z" },
    { itemKey: "A3", amount: 200000, markedAt: "2026-08-10T09:00:00Z" },
  ],
  certificates: [
    { number: 1, date: "2026-08-28T09:00:00Z", thisCertificate: 200000, netPayable: 180000, status: "paid" },
    { number: 2, date: "2026-09-28T09:00:00Z", thisCertificate: 110000, netPayable: 99000, status: "approved" },
    { number: 3, date: "2026-09-29T09:00:00Z", thisCertificate: 5000, netPayable: 4500, status: "draft" },
  ],
  variations: [
    { description: "Extra slab", qty: 2, rate: 30000, issuedAt: "2026-09-05T09:00:00Z", status: "approved", decidedAt: "2026-09-06T09:00:00Z" },
    { description: "Old one", qty: 1, rate: 1000, issuedAt: "2026-07-05T09:00:00Z", status: "rejected", decidedAt: "2026-09-07T09:00:00Z" },
  ],
  budgetItems: [
    { materialName: "Cement", qty: 100, rate: 9500, procured: true, procuredAt: "2026-09-02T09:00:00Z" },
    { materialName: "Sand", qty: 10, rate: 20000, procured: true, procuredAt: "2026-10-02T09:00:00Z" },
  ],
  projectManagement: {
    tasks: [
      { name: "Dig", actualEndDate: "2026-09-10T09:00:00Z", percentComplete: 100 },
      { name: "Pour", endDate: "2026-09-25T09:00:00Z", percentComplete: 40 },
      { name: "Summary", isSummary: true, endDate: "2026-09-25T09:00:00Z", percentComplete: 0 },
    ],
    risks: [{ title: "Rain", createdAt: "2026-09-03T09:00:00Z" }],
    issues: [{ title: "Late steel", openedAt: "2026-08-03T09:00:00Z", resolvedAt: "2026-09-04T09:00:00Z" }],
  },
});

test("buildPeriodSummary reads each heading by its own stored date", () => {
  const { from, to } = parseReportRange("2026-09-01", "2026-09-30");
  const activity = [
    { createdAt: "2026-09-02T10:00:00Z", summary: "Locked the contract", category: "contract", actorName: "Ade" },
    { createdAt: "2026-10-02T10:00:00Z", summary: "Outside", category: "pm" },
  ];
  const s = buildPeriodSummary(project(), { from, to, activity });

  assert.equal(s.progress.events, 3);
  assert.equal(s.progress.valued, 135000);
  assert.equal(s.progress.reversed, -25000);
  assert.equal(s.progress.net, 110000);
  assert.equal(s.progress.linesMoved, 2);
  assert.equal(s.progress.completedLines, 1);
  assert.equal(s.progress.completedValue, 10000);

  assert.equal(s.actuals.lines, 1);
  assert.equal(s.actuals.planned, 250000);
  assert.equal(s.actuals.actual, 312000);
  assert.equal(s.actuals.variance, 62000);

  // Draft certificates are listed but never counted as certified.
  assert.equal(s.certificates.list.length, 2);
  assert.equal(s.certificates.certified, 110000);
  assert.equal(s.certificates.paid, 0);

  assert.equal(s.variations.raised, 1);
  assert.equal(s.variations.raisedValue, 60000);
  assert.equal(s.variations.approved, 1);
  assert.equal(s.variations.rejected, 1);

  assert.equal(s.procurement.lines, 1);
  assert.equal(s.procurement.value, 950000);

  assert.equal(s.programme.finished, 1);
  assert.equal(s.programme.dueNotDone, 1, "summary tasks are structure, not work");
  assert.deepEqual(s.programme.dueNotDoneNames, ["Pour"]);
  assert.equal(s.programme.risksRaised, 1);
  assert.equal(s.programme.issuesOpened, 0);
  assert.equal(s.programme.issuesResolved, 1);

  assert.equal(s.activity.total, 1);
  assert.deepEqual(s.activity.byCategory, { contract: 1 });
  assert.equal(s.quiet, false);
});

test("buildPeriodSummary masks money for a viewer who cannot see rates", () => {
  const { from, to } = parseReportRange("2026-09-01", "2026-09-30");
  const s = buildPeriodSummary(project(), { from, to, canSeeMoney: false });
  assert.equal(s.moneyMasked, true);
  assert.equal(s.progress.valued, 0);
  assert.equal(s.certificates.certified, 0);
  assert.equal(s.procurement.value, 0);
  // Counts are not money and still show.
  assert.equal(s.progress.events, 3);
});

test("a window with nothing in it is quiet, and an empty project does not throw", () => {
  const { from, to } = parseReportRange("2025-01-01", "2025-01-31");
  const s = buildPeriodSummary(project(), { from, to });
  assert.equal(s.quiet, true);
  assert.equal(periodIsQuiet(buildPeriodSummary({}, { from, to })), true);
});
