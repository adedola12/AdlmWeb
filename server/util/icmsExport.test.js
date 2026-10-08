// The ICMS 3 report (util/icmsExport.js). What these defend: the report's total
// is the bill's own contract total (measured + provisional + preliminaries +
// contingency + VAT, as services/pmCompute.js computes it); each part lands in
// its ICMS Group; taxes carry no carbon; the QS's placements win; what a project
// does not state is shown as assumed; and bad details are refused.

import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import Ajv04 from "ajv-draft-04";
import { readFileSync } from "node:fs";

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

test("the ICMS details form's save is accepted whole, and its areas give cost and carbon per m2", () => {
  // What client/src/features/icms/icmsDetails.js icmsBodyFrom() sends: every
  // field, blanks as "" and an empty area as null. A blank must clear (and so
  // fall back to the stated assumption), not be refused.
  const body = {
    projectType: "01", country: "", currency: "ngn", baseDate: "2026-10-01", projectStatus: "Tender",
    priceBasis: "", location: "Ikoyi, Lagos", gfaIpms1: 240, gfaIpms2: 200, carbonBoundary: "",
  };
  const { details, error } = icmsDetailsFromBody(body);
  assert.equal(error, undefined);
  assert.equal(details.currency, "NGN");
  assert.equal(details.country, "");
  const r = buildIcmsReport({ ...PROJECT, icms: details }, { productKey: "revit", carbonRates: RATES });
  assert.equal(r.attributes.country.stated, false); // blank -> assumed NG
  assert.equal(r.attributes.projectStatus.value, "Tender");
  assert.equal(r.perM2.area, 200);
  near(r.perM2.cost, r.summary.total / 200);
  near(r.perM2.carbonKg, r.summary.carbonKg / 200);
  assert.ok(r.perM2.carbonKg > 0);
  // Cleared areas take per m2 away again.
  const cleared = icmsDetailsFromBody({ ...body, gfaIpms1: null, gfaIpms2: null }).details;
  assert.equal(buildIcmsReport({ ...PROJECT, icms: cleared }, { productKey: "revit" }).perM2, null);
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

/* ---------------- the JSON is a RICS Data Standard 3.3.3 document ---------------- */
// assets/icms/rds-3.3.3.schema.json is RICS's own JSON schema, verbatim from
// https://github.com/RICS-Data-Standard/RDS/blob/main/JSON/rics-3.3.3.json (MIT).
// It is draft-04 and generated from XSD, whose patterns escape ":" (a unicode-mode
// JS RegExp refuses that), so the validator un-escapes it; nothing else is relaxed.
const RDS = JSON.parse(readFileSync(new URL("../assets/icms/rds-3.3.3.schema.json", import.meta.url), "utf8"));
let rdsValidate;
const validRds = (doc) => {
  if (!rdsValidate) {
    const regExp = (src, flags) => new RegExp(src.split("\\:").join(":"), flags);
    regExp.code = "xsdRegExp";
    rdsValidate = new Ajv04({ strict: false, allErrors: true, code: { regExp } }).compile(RDS);
  }
  const ok = rdsValidate(doc);
  return ok ? null : rdsValidate.errors.slice(0, 5).map((e) => `${e.instancePath} ${e.message} ${JSON.stringify(e.params)}`).join("\n");
};
// RDS's enums are open (any string passes), so the known vocabulary is pinned separately
const known = (name) => RDS.definitions[`rics:Known${name}`].enum;
const rdsProject = (j) => j["rics:DataTransfer"]["rics:CostedProjects"][0];

test("RDS: the JSON validates against RICS's own schema, for buildings and other project types", () => {
  const full = { ...PROJECT, clientName: "Mr A", icms: { gfaIpms1: 230, gfaIpms2: 200, location: "Lekki, Lagos", baseDate: "2026-09-01" } };
  for (const projectType of ["01", "04", "19"]) {
    const j = icmsJson(buildIcmsReport({ ...full, icms: { ...full.icms, projectType } }, { productKey: "revit", carbonRates: RATES }));
    assert.equal(validRds(j), null, `project type ${projectType}`);
  }
  // and the check is real: a stray field fails it
  const bad = icmsJson(buildIcmsReport(full, { productKey: "revit" }));
  bad["rics:DataTransfer"].notRds = 1;
  assert.notEqual(validRds(bad), null);
});

test("RDS: project attributes sit where the standard puts them", () => {
  const p = { ...PROJECT, clientName: "Mr A", icms: { gfaIpms1: 230, gfaIpms2: 200, location: "Lekki, Lagos", baseDate: "2026-09-01", currency: "NGN", country: "NG" } };
  const j = icmsJson(buildIcmsReport(p, { productKey: "revit", carbonRates: RATES }), { reportDate: "2026-10-04" });
  const dt = j["rics:DataTransfer"];
  assert.deepEqual(dt["rics:Currency"], [{ "@iso4217Code": "NGN", "@isPrimaryCurrency": true }]);
  const cp = rdsProject(j);
  assert.equal(cp["@mainProjectType"], "buildings");
  assert.ok(known("ProjectDescriptionEnum").includes(cp["@mainProjectType"]));
  assert.equal(cp["@costReportStatus"], "pre-constructionForecast"); // an Estimate
  assert.equal(cp["@projectStatus"], undefined);
  assert.deepEqual(cp["rics:CostBaseDate"], { "rics:Date": "2026-09-01" });
  assert.deepEqual(cp["rics:MetaData"], { "rics:ReportDate": { "rics:Date": "2026-10-04" } });
  assert.deepEqual(cp["rics:Client"], [{ "@name": "Mr A" }]);
  assert.equal(cp["rics:Location"]["xal:AddressDetails"][0]["xal:Country"]["xal:CountryNameCode"].$, "NG");
  assert.deepEqual(cp["rics:Location"]["xal:AddressDetails"][0]["xal:AddressLines"]["xal:AddressLine"], ["Lekki, Lagos"]);
  const ce = cp["rics:CarbonEmissions"];
  assert.equal(ce["@boundary"], "Up front carbon (EN 15978 stages A1-A5)");
  assert.ok(known("CarbonReportingBoundaryEnum").includes(ce["@boundary"]));
  assert.deepEqual(ce["rics:MaterialQuantitySources"], ["billsOfQuantities(BoQ)"]);
  assert.ok(known("MaterialQuantitySourceEnum").includes(ce["rics:MaterialQuantitySources"][0]));
  const b = cp["rics:Buildings"][0];
  assert.deepEqual(b["rics:Quantities"], {
    "rics:ExternalFloorAreaAsIpms1": { "@unitOfMeasurement": "MTK", $: 230 },
    "rics:InternalFloorAreaAsIpms2": { "@unitOfMeasurement": "MTK", $: 200 },
  });
  // a final account is reported as actual, complete
  const fin = rdsProject(icmsJson(buildIcmsReport({ ...p, finalAccount: { finalized: true } }, { productKey: "revit" })));
  assert.equal(fin["@costReportStatus"], "actualCostsAnd/OrCarbonEmissionsOfConstructionPost-completion");
  assert.equal(fin["@projectStatus"], "complete");
});

test("RDS: cost and carbon by ICMS Group and Sub-Group, coded as the standard codes them", () => {
  const r = buildIcmsReport(PROJECT, { productKey: "revit", carbonRates: RATES });
  const b = rdsProject(icmsJson(r))["rics:Buildings"][0];
  const codes = known("CostEmissionCodeEnum"), groups = known("CostEmissionGroupEnum");
  for (const c of [...b["rics:Costs"], ...b["rics:Emissions"]]) {
    assert.equal(c["@category"], "constructionCosts");
    assert.ok(codes.includes(c["@code"]), c["@code"]);
    assert.ok(groups.includes(c["@group"]), c["@group"]);
    if (c["@subcode"] !== undefined) assert.match(c["@subcode"], /^\d{3}$/);
  }
  const found = b["rics:Costs"].find((c) => c["@code"] === "01.2.02" && c["@subcode"] === "020");
  assert.equal(found["@group"], "substructure");
  near(found["rics:Total"].$, 1_000_000);
  assert.equal(found["rics:Total"]["@iso4217Code"], "NGN");
  // the Totals add up once to the placed cost: nothing counted at two levels
  near(b["rics:Costs"].reduce((s, c) => s + c["rics:Total"].$, 0), r.summary.total - r.summary.unplaced);
  // carbon: the concrete in kgCO2e, with its low end; tax "not used"; no zero where nothing was counted
  const e = b["rics:Emissions"].find((x) => x["@code"] === "01.2.02");
  assert.deepEqual(e["rics:Forecast"].map((f) => [f["@item"], f["@unitOfMeasurement"], f["rics:Decimal"].$]), [["carbonDioxideEquivalent", "KGM", 3000], ["carbonDioxideEquivalent", "KGM", 2150]]);
  assert.equal(e["rics:Forecast"][1]["@isMinimum"], true);
  assert.equal(b["rics:Emissions"].find((x) => x["@code"] === "01.2.10")["@isNotApplicable"], true);
  assert.equal(b["rics:Emissions"].some((x) => x["@code"] === "01.2.08"), false); // preliminaries carry no carbon figure
});

test("RDS: the ADLM detail is kept apart under rics:OtherData.adlm", () => {
  const adlm = rdsProject(icmsJson(buildIcmsReport(PROJECT, { productKey: "revit", carbonRates: RATES })))["rics:OtherData"].adlm;
  assert.equal(adlm.construction.code, "01.2");
  assert.equal(adlm.construction.groups.find((g) => g.code === "01.2.02").carbonKgCO2e, 3000);
  assert.equal(adlm.construction.groups.find((g) => g.code === "01.2.10").carbonKgCO2e, null); // "not used"
  near(adlm.construction.unplacedCost, 500_000);
  assert.ok(adlm.lines.some((l) => l.code === "01.2.02.020"));
  assert.ok(adlm.assumed.includes("currency"));
});
