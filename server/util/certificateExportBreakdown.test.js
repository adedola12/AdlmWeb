// server/util/certificateExportBreakdown.test.js
//
// A CERTIFICATE WORKBOOK MUST NOT CONTRADICT ITSELF.
//
// exportCertificate prints row A, "Gross value of work done to date
// (cumulative)", from the certificate's own STORED cumulativeValue, and an
// optional "Cumulative value breakdown" block beneath it from whatever
// `breakdown` it is handed. The route rebuilt that breakdown with
// computeValueToDate, which reads the project as it stands TODAY.
//
// So exporting June's certificate after a July valuation produced one page whose
// top half said 60,000 and whose bottom half said 100,000 — a document that goes
// to a client.
//
// cumulativeValue is exactly measured + variations + provisional +
// preliminaryDone, so the four parts either add up to the certificate's own total
// or they are describing a different day. The route now prints them only in the
// first case. These tests pin the rule and the arithmetic it rests on; the route's
// own decision is one line reading the same comparison.
import { test } from "node:test";
import assert from "node:assert/strict";
import { __test } from "../routes/projects.js";

const { computeValueToDate } = __test;

const project = (pct) => ({
  productKey: "revit",
  contract: {},
  items: [
    { code: "BQ-1", description: "Mass concrete", unit: "m3", qty: 100, rate: 1000, percentComplete: pct },
  ],
  variations: [],
  provisionalSums: [],
  preliminaryItems: [],
});

/** The route's test, verbatim in intent: does this breakdown explain this certificate? */
const explains = (rollup, cert) =>
  Math.abs(rollup.cumulativeValue - cert.cumulativeValue) < 0.001;

test("the four parts of a breakdown always add to the cumulative value", () => {
  // The whole rule depends on this identity. If computeValueToDate ever returns a
  // cumulativeValue that is not the sum of the four fields the workbook prints,
  // the comparison silently stops meaning anything.
  const r = computeValueToDate(project(60));
  const parts = r.measured + r.variationsAmount + r.provisionalAmount + r.preliminaryDone;
  assert.ok(
    Math.abs(parts - r.cumulativeValue) < 0.001,
    `the printed parts (${parts}) must equal cumulativeValue (${r.cumulativeValue})`,
  );
});

test("a breakdown taken on the same state DOES explain the certificate", () => {
  // The ordinary case: export the latest certificate, nothing has moved since.
  const atIssue = computeValueToDate(project(60));
  const cert = { number: 1, cumulativeValue: atIssue.cumulativeValue };
  assert.equal(explains(computeValueToDate(project(60)), cert), true);
});

test("a breakdown taken AFTER the line moved does NOT explain it", () => {
  // The bug, stated as a test. IPC 1 was issued at 60%; the line is now at 100%.
  const cert = { number: 1, cumulativeValue: computeValueToDate(project(60)).cumulativeValue };
  const today = computeValueToDate(project(100));
  assert.equal(cert.cumulativeValue, 60_000);
  assert.equal(today.measured, 100_000);
  assert.equal(
    explains(today, cert),
    false,
    "so the breakdown is withheld and row A stands alone, rather than being contradicted",
  );
});

test("it is the CERTIFICATE being exported that decides, not the newest one", () => {
  // Exporting IPC 2 after IPC 1, with nothing moved since IPC 2: IPC 2 gets its
  // breakdown and IPC 1 does not. Both on the same project, same request shape.
  const ipc1 = { number: 1, cumulativeValue: 60_000 };
  const ipc2 = { number: 2, cumulativeValue: 100_000 };
  const today = computeValueToDate(project(100));
  assert.equal(explains(today, ipc1), false, "the older one is withheld");
  assert.equal(explains(today, ipc2), true, "the current one is printed");
});

test("the exporter omits the block entirely when handed null", async () => {
  // Not merely a blank heading: a workbook with an empty 'Cumulative value
  // breakdown' table would read as a breakdown of zero.
  const { exportCertificate } = await import("./certificateExporter.js");
  const cert = {
    number: 1,
    date: new Date("2026-06-04T00:00:00.000Z"),
    cumulativeValue: 60_000,
    lessPrevious: 0,
    thisCertificate: 60_000,
    retentionPct: 5,
    retentionAmount: 3000,
    vatPct: 7.5,
    whtPct: 2.5,
    netPayable: 57_000,
    status: "approved",
  };
  const withOut = await exportCertificate({
    projectName: "Ikoyi Complex",
    certificate: cert,
    previousCerts: [],
    breakdown: null,
  });
  const withIn = await exportCertificate({
    projectName: "Ikoyi Complex",
    certificate: cert,
    previousCerts: [],
    breakdown: { measured: 60_000, variations: 0, provisional: 0, preliminaryDone: 0 },
  });
  // Both are real workbooks; the one without the block is smaller.
  const a = Buffer.isBuffer(withOut.buffer) ? withOut.buffer : Buffer.from(withOut.buffer);
  const b = Buffer.isBuffer(withIn.buffer) ? withIn.buffer : Buffer.from(withIn.buffer);
  assert.equal(a[0], 0x50, "a valid xlsx starts with PK");
  assert.equal(b[0], 0x50);
  assert.ok(a.length < b.length, "omitting the breakdown omits rows, it does not blank them");
});
