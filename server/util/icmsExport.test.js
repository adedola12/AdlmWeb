// The ICMS 3 report (util/icmsExport.js). What these defend: the report's total
// is the bill's own contract total (measured + provisional + preliminaries +
// contingency + VAT, as services/pmCompute.js computes it); each part lands in
// its ICMS Group; taxes carry no carbon; the QS's placements win; what a project
// does not state is shown as assumed; and bad details are refused.

import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";

import { buildIcmsReport, exportIcmsWorkbook, icmsDetailsFromBody, icmsJson } from "./icmsExport.js";

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.01, `${msg ?? ""} ${a} != ${b}`);
const RATES = [{ description: "Concrete (1:2:4) grade 20 in foundation or slab.", unit: "m3", netCost: 1, carbon: { total: 300, low: 215, coverage: 1 } }];

const PROJECT = {
  name: "Two-storey house",
  items: [
    { lineId: "a", description: "Strip – Concrete in Footing", unit: "m3", qty: 10, rate: 100000 }, // 1,000,000
    { lineId: "b", description: "Plumbing Fixtures – WC suite", unit: "nr", qty: 4, rate: 125000 }, // 500,000
    { lineId: "c", description: "Upstand", unit: "m", qty: 10, rate: 50000 }, // 500,000, not placed
  ],
  provisionalSums: [{ lineId: "p1", description: "Allow a provisional sum for landscaping", amount: 200000 }],
  preliminaryItems: [
    { lineId: "x", name: "Site staff and management", allocation: 60 },
    { lineId: "y", name: "Insurances", allocation: 40 },
  ],
  contract: { preliminaryPercent: 10, contingencyPercent: 5, taxPercent: 7.5 },
};

test("the total is the contract total, each part in its Group", () => {
  const r = buildIcmsReport(PROJECT, { productKey: "revit", carbonRates: RATES });
  const measured = 2_000_000, provisional = 200_000;
  const prelim = (measured + provisional) * 0.1;
  const subtotal = measured + provisional + prelim;
  const contingency = subtotal * 0.05;
  const vat = (subtotal + contingency) * 0.075;
  near(r.totals.total, subtotal + contingency + vat);
  near(r.summary.total, r.totals.total);
  const g = (c) => r.summary.groups.find((x) => x.code === c);
  near(g("02").amount, 1_000_000);
  near(g("05").amount, 500_000);
  near(g("07").amount, 200_000); // the landscaping provisional sum
  near(g("08").amount, prelim);
  near(g("09").amount, contingency);
  near(g("10").amount, vat);
  near(r.summary.unplaced, 500_000);
});

test("preliminaries split by allocation, at Sub-Group where the name says", () => {
  const r = buildIcmsReport(PROJECT, { productKey: "revit" });
  const staff = r.lines.find((l) => l.key === "pre:x");
  const ins = r.lines.find((l) => l.key === "pre:y");
  near(staff.amount, 220_000 * 0.6);
  assert.equal(staff.subGroup, "08.010");
  assert.equal(ins.subGroup, "08.110");
  assert.equal(r.lines.find((l) => l.key === "tax:vat").subGroup, "10.020");
  assert.equal(r.lines.find((l) => l.key === "risk:contingency").subGroup, "09.020");
});

test("carbon: the concrete line carries its rate's carbon; tax carries none", () => {
  const r = buildIcmsReport(PROJECT, { productKey: "revit", carbonRates: RATES });
  near(r.summary.groups.find((x) => x.code === "02").carbonKg, 3000);
  assert.equal(r.summary.groups.find((x) => x.code === "10").carbonKg, 0);
  near(r.summary.carbonKg, 3000);
});

test("the QS's own placement wins, for bill lines and provisional sums", () => {
  const p = { ...PROJECT, icms: { overrides: [{ key: "c", group: "02", subGroup: "02.020" }, { key: "ps:p1", group: "07", subGroup: "07.050" }] } };
  const r = buildIcmsReport(p, { productKey: "revit" });
  assert.equal(r.summary.unplaced, 0);
  assert.equal(r.lines.find((l) => l.key === "c").basis, "placed");
  assert.equal(r.lines.find((l) => l.key === "ps:p1").subGroup, "07.050");
});

test("attributes a project does not state are assumed, and cost per m2 needs a floor area", () => {
  const r = buildIcmsReport(PROJECT, { productKey: "revit" });
  assert.equal(r.attributes.currency.value, "NGN");
  assert.equal(r.attributes.currency.stated, false);
  assert.equal(r.perM2, null);
  const withArea = buildIcmsReport({ ...PROJECT, icms: { gfaIpms2: 200, currency: "NGN" } }, { productKey: "revit" });
  assert.equal(withArea.attributes.currency.stated, true);
  near(withArea.perM2.cost, withArea.summary.total / 200);
  assert.match(withArea.perM2.basis, /IPMS 2/);
});

test("details are checked: codes, ISO formats, dates, areas, and Sub-Groups in their Group", () => {
  assert.deepEqual(icmsDetailsFromBody({ currency: "ngn", country: "ng", gfaIpms2: "250" }).details, { currency: "NGN", country: "NG", gfaIpms2: 250 });
  assert.match(icmsDetailsFromBody({ projectType: "99" }).error, /project type/);
  assert.match(icmsDetailsFromBody({ currency: "NAIRA" }).error, /ISO 4217/);
  assert.match(icmsDetailsFromBody({ baseDate: "3 Oct" }).error, /YYYY-MM-DD/);
  assert.match(icmsDetailsFromBody({ gfaIpms1: -5 }).error, /positive/);
  assert.match(icmsDetailsFromBody({ overrides: [{ key: "a", group: "02", subGroup: "03.030" }] }).error, /not in Group/);
  assert.match(icmsDetailsFromBody({ overrides: [{ key: "a", group: "14" }] }).error, /Unknown ICMS Group/);
});

test("the workbook opens with its five sheets and the totals in them", async () => {
  const r = buildIcmsReport(PROJECT, { productKey: "revit", carbonRates: RATES });
  const out = await exportIcmsWorkbook(r);
  assert.match(out.filename, /_ICMS3\.xlsx$/);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(out.buffer);
  assert.deepEqual(wb.worksheets.map((w) => w.name), ["ICMS 3 report", "Cost by Group (G-2)", "Carbon by Group (H-1, H-2)", "Lines", "Not placed"]);
  const cost = wb.getWorksheet("Cost by Group (G-2)");
  let total = null;
  cost.eachRow((row) => { if (row.getCell(2).value === "Total Construction Costs") total = row.getCell(3).value; });
  near(total, r.summary.total);
});

test("the JSON carries full ICMS codes, cost and carbon by Group", () => {
  const j = icmsJson(buildIcmsReport(PROJECT, { productKey: "revit", carbonRates: RATES }));
  assert.equal(j.construction.code, "01.2");
  const sub = j.construction.groups.find((g) => g.code === "01.2.02");
  assert.equal(sub.carbonKgCO2e, 3000);
  assert.equal(j.construction.groups.find((g) => g.code === "01.2.10").carbonKgCO2e, null); // "not used"
  assert.ok(j.lines.some((l) => l.code === "01.2.02.020"));
});
