// server/util/certificateExporter.lines.test.js
//
// THE TABLE THE OWNER ASKED FOR: on the 4 June certificate the line shows 60%
// and what that 60% was worth; on the 5 July one it shows the balance.
//
// The exported certificate had a figures block and a history of previous
// certificates, and no statement anywhere of WHICH WORK the money was for. A
// client receiving it could see that 60,000 was due and had nothing to check it
// against.
//
// It reads the certificate's OWN stored lines. That matters more than it looks:
// a table rebuilt from today's project would print July's percentages on June's
// certificate, which is exactly the contradiction the snapshot exists to end.
//
// These tests load the generated workbook back and read the cells, rather than
// asserting on the code that wrote them — a test that only checks addRow was
// called proves the call, not the document.
import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { exportCertificate } from "./certificateExporter.js";

/** June's certificate, with the snapshot issueCertificate now stores. */
const juneCert = () => ({
  number: 1,
  date: new Date("2026-06-04T00:00:00Z"),
  status: "issued",
  valueToDate: 60_000,
  lessPrevious: 0,
  thisCertificate: 60_000,
  retentionPercent: 0,
  lines: [
    {
      itemKey: "12::a1::concrete",
      sn: 12,
      description: "Concrete 1:2:4 in foundation",
      unit: "m3",
      qty: 100,
      rate: 1000,
      fromActuals: false,
      percentComplete: 60,
      earned: 60_000,
      earnedThisPeriod: 60_000,
    },
  ],
});

/** July's, certifying the balance. */
const julyCert = () => ({
  ...juneCert(),
  number: 2,
  date: new Date("2026-07-05T00:00:00Z"),
  valueToDate: 100_000,
  lessPrevious: 60_000,
  thisCertificate: 40_000,
  lines: [
    {
      ...juneCert().lines[0],
      percentComplete: 100,
      earned: 100_000,
      earnedThisPeriod: 40_000,
    },
  ],
});

/** Generate the workbook and read the first sheet back as rows of cell values. */
async function sheetOf(args) {
  const out = await exportCertificate(args);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(out.buffer);
  const ws = wb.worksheets[0];
  const rows = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const vals = [];
    row.eachCell({ includeEmpty: true }, (c) => vals.push(c.value));
    rows.push(vals);
  });
  return { ws, rows, text: rows.map((r) => r.map((v) => (v == null ? "" : String(v))).join("\t")).join("\n") };
}

/** The row index (0-based) of the line table's header, or -1. */
const tableAt = (rows) =>
  rows.findIndex((r) => String(r[0] || "") === "S/N" && String(r[1] || "") === "Description");

/* ── the table is there, and says what was certified ───────────────────── */

test("June's certificate carries a table of what it covers", async () => {
  const { text, rows } = await sheetOf({ certificate: juneCert(), projectName: "Ikoyi Duplex" });
  assert.match(text, /What this certificate covers/);
  const i = tableAt(rows);
  assert.ok(i > 0, "the line table header is present");
  const line = rows[i + 1];
  assert.equal(line[0], 12, "the bill S/N");
  assert.equal(line[1], "Concrete 1:2:4 in foundation");
  assert.equal(line[2], "60.0%", "and the progress it was certified at");
  assert.equal(line[5], 60_000, "worth 60,000 this period");
});

test("JULY'S PRINTS THE BALANCE, NOT THE WHOLE LINE AGAIN", async () => {
  const { rows } = await sheetOf({ certificate: julyCert() });
  const line = rows[tableAt(rows) + 1];
  assert.equal(line[2], "100.0%", "cumulatively complete");
  assert.equal(line[5], 40_000, "but 40,000 is what this certificate pays");
});

test("the period total is the sum of the lines", async () => {
  const cert = julyCert();
  cert.lines.push({
    itemKey: "13::a2::block",
    sn: 13,
    description: "Blockwork 225mm",
    unit: "m2",
    qty: 200,
    rate: 2500,
    fromActuals: false,
    percentComplete: 50,
    earned: 250_000,
    earnedThisPeriod: 250_000,
  });
  cert.thisCertificate = 290_000;
  const { rows } = await sheetOf({ certificate: cert });
  const tot = rows.find((r) => String(r[1] || "") === "Total earned this period");
  assert.ok(tot, "a total row is present");
  assert.equal(tot[5], 290_000);
});

/* ── a re-measured rate is marked, because it is not the contract rate ─── */

test("a measured rate carries a note saying so", async () => {
  const cert = juneCert();
  cert.lines[0] = { ...cert.lines[0], rate: 1200, fromActuals: true, earned: 72_000, earnedThisPeriod: 72_000 };
  cert.thisCertificate = 72_000;
  const { ws, rows } = await sheetOf({ certificate: cert });
  const rowNumber = tableAt(rows) + 2; // 0-based index -> 1-based row, +1 for the line
  const cell = ws.getRow(rowNumber).getCell(5);
  assert.equal(cell.value, 1200);
  assert.ok(cell.note, "the rate cell is annotated");
  assert.match(String(cell.note.texts ? cell.note.texts.map((t) => t.text).join("") : cell.note), /measured/i);
});

test("a contract rate carries no note, so the mark means something", async () => {
  const { ws, rows } = await sheetOf({ certificate: juneCert() });
  const cell = ws.getRow(tableAt(rows) + 2).getCell(5);
  assert.equal(cell.note, undefined);
});

/* ── when the parts do not sum to the whole, it says so ────────────────── */

test("a difference against the certificate total is explained, not left to be noticed", async () => {
  // Variations, provisional sums and preliminaries are in the certificate but are
  // not bill lines, so the table legitimately under-sums. A reader adding up the
  // column must not be left thinking the certificate is wrong.
  const cert = juneCert();
  cert.thisCertificate = 85_000; // 60,000 of bill + 25,000 of variation
  const { text } = await sheetOf({ certificate: cert });
  assert.match(text, /These lines account for 60000\.00 of this certificate's 85000\.00/);
  assert.match(text, /variations, provisional sums or preliminaries/);
});

test("no such note when the lines do sum to the certificate", async () => {
  const { text } = await sheetOf({ certificate: juneCert() });
  assert.doesNotMatch(text, /These lines account for/);
});

/* ── a certificate issued before snapshots existed ─────────────────────── */

test("A PRE-SNAPSHOT CERTIFICATE GETS NO TABLE, rather than one invented from today", async () => {
  // This is the important one. Every certificate issued before this change has no
  // lines. Rebuilding a table from the current project would print today's
  // percentages under last year's certificate number and read as authoritative.
  const old = juneCert();
  delete old.lines;
  const { text, rows } = await sheetOf({ certificate: old });
  assert.doesNotMatch(text, /What this certificate covers/);
  assert.equal(tableAt(rows), -1);
});

test("an empty lines array is treated the same way", async () => {
  const { text } = await sheetOf({ certificate: { ...juneCert(), lines: [] } });
  assert.doesNotMatch(text, /What this certificate covers/);
});

test("the rest of the certificate still exports with no lines", async () => {
  // The table is an addition. A legacy certificate must export exactly as before.
  const old = juneCert();
  delete old.lines;
  const { text } = await sheetOf({ certificate: old, projectName: "Ikoyi Duplex", clientName: "Y.S. Associates Ltd" });
  assert.match(text, /Ikoyi Duplex/);
  assert.match(text, /Y\.S\. Associates Ltd/);
  assert.match(text, /Interim Payment Certificate No\. 01/);
});

/* ── a recovery ────────────────────────────────────────────────────────── */

test("a negative period figure prints as a negative, not as nothing", async () => {
  const cert = julyCert();
  cert.lines = [{ ...cert.lines[0], percentComplete: 40, earned: 40_000, earnedThisPeriod: -20_000 }];
  cert.thisCertificate = -20_000;
  const { rows } = await sheetOf({ certificate: cert });
  assert.equal(rows[tableAt(rows) + 1][5], -20_000);
});
