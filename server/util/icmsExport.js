// server/util/icmsExport.js
//
// A project's cost and upfront carbon as an ICMS 3 report (International Cost
// Management Standard, 3rd edition, 2021): Buildings, Construction Costs and
// Construction Carbon Emissions, Level 3 Groups with Level 4 Sub-Groups where
// the bill says enough.
//
// The money is the bill's own, the same chain the contract total uses
// (services/pmCompute.js): measured lines and provisional sums, preliminaries as
// a percentage of them, contingency on that subtotal, VAT on subtotal plus
// contingency. ICMS places them:
//   measured lines, provisional sums  -> their Group (util/icmsMap.js)
//   preliminaries                     -> 08, split by the project's preliminary items
//   contingency                       -> 09.020 Construction contingencies
//   VAT                               -> 10.020 Taxes paid by the Client on the contract payments
// Carbon is per bill line from the RateGen rate behind it (util/icmsLines.js);
// Groups 10, 11 and 13 carry none (ICMS 3 "not used"), and preliminaries,
// contingency and tax add none here.
//
// Pure: the route loads the project and the carbon rates. Pinned by icmsExport.test.js.

import ExcelJS from "exceljs";
import { icmsLines, icmsSummary } from "./icmsLines.js";
import { mapLine, icmsCode, groupTitle, subGroupTitle, ICMS_EDITION, ICMS_PROJECT_TYPES, ICMS_GROUPS } from "./icmsMap.js";
import { carbonMethod } from "./carbonEngine.js";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r2 = (v) => Math.round(v * 100) / 100;

/** The ICMS 3 project attributes (ICMS 3 Table 4), with what a project does not say defaulted and marked. */
export function icmsAttributes(project = {}) {
  const a = project.icms || {};
  const said = (v) => v !== undefined && v !== null && String(v).trim() !== "";
  const pick = (v, def) => (said(v) ? { value: v, stated: true } : { value: def, stated: false });
  return {
    projectName: pick(project.name, "Project"),
    client: pick(project.clientName || project.contract?.clientName, ""),
    projectType: pick(a.projectType, "01"), // Buildings
    country: pick(a.country, "NG"), // ISO 3166
    currency: pick(a.currency, "NGN"), // ISO 4217
    baseDate: pick(a.baseDate, new Date().toISOString().slice(0, 10)),
    priceBasis: pick(a.priceBasis, "Current prices at the base date"),
    projectStatus: pick(a.projectStatus, projectStatusOf(project)),
    location: pick(a.location, ""),
    gfaIpms1: pick(num(a.gfaIpms1) > 0 ? num(a.gfaIpms1) : null, null), // gross external area, m2
    gfaIpms2: pick(num(a.gfaIpms2) > 0 ? num(a.gfaIpms2) : null, null), // gross internal area, m2
    carbonBoundary: pick(a.carbonBoundary, "Up front carbon (A1-A5)"),
    quantitySource: pick(a.quantitySource, "Bills of quantities (BoQ)"),
    emissionFactorSources: pick(a.emissionFactorSources, "RateGen carbon factors: CIDB Malaysia (2021), IStructE (2020), ICE v3.0, manufacturer EPDs, CIBSE TM65"),
  };
}

/**
 * The ICMS details a QS saves, checked: only the standard's codes, ISO country and
 * currency, a real date, positive areas, and placements whose Sub-Group belongs to
 * their Group. Returns { details } or { error }.
 */
export function icmsDetailsFromBody(body = {}) {
  const s = (v, max = 200) => String(v ?? "").trim().slice(0, max);
  const out = {};
  if (body.projectType !== undefined) {
    const t = s(body.projectType, 10).padStart(2, "0");
    if (!ICMS_PROJECT_TYPES.some((p) => p.code === t)) return { error: `Unknown ICMS project type "${body.projectType}".` };
    out.projectType = t;
  }
  if (body.country !== undefined) {
    const c = s(body.country, 20).toUpperCase(); // checked whole: "NIG" is not "NI"
    if (c && !/^[A-Z]{2}$/.test(c)) return { error: "Country must be a two-letter ISO 3166 code, e.g. NG." };
    out.country = c;
  }
  if (body.currency !== undefined) {
    const c = s(body.currency, 20).toUpperCase(); // checked whole: "NAIRA" is not "NAI"
    if (c && !/^[A-Z]{3}$/.test(c)) return { error: "Currency must be a three-letter ISO 4217 code, e.g. NGN." };
    out.currency = c;
  }
  if (body.baseDate !== undefined) {
    const d = s(body.baseDate, 40);
    if (d && (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d)))) return { error: "Base date must be a date, YYYY-MM-DD." };
    out.baseDate = d;
  }
  for (const k of ["priceBasis", "projectStatus", "location", "carbonBoundary"]) if (body[k] !== undefined) out[k] = s(body[k]);
  for (const k of ["gfaIpms1", "gfaIpms2"]) {
    if (body[k] === undefined) continue;
    if (body[k] === null || body[k] === "") { out[k] = null; continue; }
    const v = Number(body[k]);
    if (!(v > 0) || v > 10_000_000) return { error: `${k === "gfaIpms1" ? "Gross external" : "Gross internal"} area must be a positive number of m2.` };
    out[k] = v;
  }
  if (body.overrides !== undefined) {
    if (!Array.isArray(body.overrides)) return { error: "overrides must be a list." };
    const groups = new Set(ICMS_GROUPS.map((g) => g.code));
    const list = [];
    for (const o of body.overrides.slice(0, 20000)) {
      const key = s(o?.key, 120);
      const group = o?.group == null || o.group === "" ? null : s(o.group, 2);
      const subGroup = o?.subGroup == null || o.subGroup === "" ? null : s(o.subGroup, 6);
      if (!key) continue;
      if (group && !groups.has(group)) return { error: `Unknown ICMS Group "${group}".` };
      if (subGroup && (!group || !subGroup.startsWith(`${group}.`) || !subGroupTitle(subGroup))) return { error: `Sub-Group "${subGroup}" is not in Group "${group}".` };
      list.push({ key, group, subGroup });
    }
    out.overrides = list;
  }
  return { details: out };
}

function projectStatusOf(p) {
  if (p?.finalAccount?.finalized) return "Final account";
  if (p?.contract?.lockedAt || p?.contract?.locked) return "Contract awarded";
  if (p?.contract?.tenderedAt) return "Tender";
  return "Estimate";
}

// The Sub-Group a preliminary item belongs to, where its name says (Appendix B, 08).
const PRELIM_SUB = [
  [/staff|manage|supervis|site agent|foreman|engineer|watchm/i, "08.010"],
  [/access road|storage|traffic|diversion/i, "08.020"],
  [/hoarding|fenc|security|guard/i, "08.030"],
  [/plant|crane|hoist|equipment/i, "08.040"],
  [/scaffold/i, "08.050"],
  [/temporary|water|power|electric|office|toilet|accommodation|welfare|setting out|clean/i, "08.060"],
  [/phone|telephone|internet|broadband|software|computer|ict/i, "08.070"],
  [/submission|report|as-built|drawing|record/i, "08.080"],
  [/quality|inspect|sample/i, "08.090"],
  [/health|safety|environment|ppe|first aid/i, "08.100"],
  [/insurance|bond|guarantee|warrant/i, "08.110"],
  [/statutory|permit|fee|levy|approval/i, "08.120"],
  [/test|commission/i, "08.130"],
];

/**
 * The whole report.
 * @param {object} project      the project document (items, provisionalSums, preliminaryItems, contract, icms)
 * @param {object} opts         { productKey, carbonRates } carbonRates from services/rateCarbon.js carbonForUser().rates
 */
export function buildIcmsReport(project = {}, { productKey = "", carbonRates = [] } = {}) {
  const overrides = Object.fromEntries((project.icms?.overrides || []).map((o) => [String(o.key), { group: o.group, subGroup: o.subGroup || null }]));
  const lines = icmsLines(project.items || [], { productKey, carbonRates, overrides });

  // provisional sums: placed by their own words, like a bill line
  for (const [i, ps] of (project.provisionalSums || []).entries()) {
    const amount = num(ps.amount);
    if (!(amount > 0)) continue;
    const key = `ps:${ps.lineId || i}`;
    const own = overrides[key];
    const m = own || mapLine({ description: ps.description }, { productKey });
    lines.push({
      key,
      kind: ps.kind === "pc" ? "PC sum" : "Provisional sum",
      description: String(ps.description || "Provisional sum"),
      unit: "item", qty: 1, rate: amount, amount,
      group: m.group, subGroup: m.subGroup ?? null,
      code: m.group ? icmsCode({ group: m.group, subGroup: m.subGroup }) : null,
      basis: own ? "placed" : m.basis, why: own ? "Placed by the QS." : m.why,
      carbonPerUnit: null, carbonKg: null, carbonLowKg: null, carbonSource: "none",
    });
  }

  const measured = lines.filter((l) => !l.kind).reduce((s, l) => s + l.amount, 0);
  const provisional = lines.filter((l) => l.kind).reduce((s, l) => s + l.amount, 0);
  const c = project.contract || {};
  const prelimPct = num(c.preliminaryPercent);
  const contPct = num(c.contingencyPercent);
  const taxPct = num(c.taxPercent);
  const prelimPool = ((measured + provisional) * prelimPct) / 100;
  const subtotal = measured + provisional + prelimPool;
  const contingency = (subtotal * contPct) / 100;
  const tax = ((subtotal + contingency) * taxPct) / 100;

  // preliminaries: the pool split by each item's allocation, or one line when there are none
  const items = (project.preliminaryItems || []).filter((p) => num(p.allocation) > 0);
  const allocTotal = items.reduce((s, p) => s + num(p.allocation), 0);
  if (prelimPool > 0) {
    if (items.length && allocTotal > 0) {
      for (const [i, p] of items.entries()) {
        const sub = PRELIM_SUB.find(([re]) => re.test(p.name || ""))?.[1] || null;
        lines.push(extra(`pre:${p.lineId || i}`, "Preliminaries", p.name || "Preliminary item", (prelimPool * num(p.allocation)) / allocTotal, "08", sub,
          `${r2(num(p.allocation))}% of the preliminaries (${prelimPct}% of measured work and provisional sums).`));
      }
    } else {
      lines.push(extra("pre:all", "Preliminaries", "Preliminaries", prelimPool, "08", null, `${prelimPct}% of measured work and provisional sums.`));
    }
  }
  if (contingency > 0) lines.push(extra("risk:contingency", "Risk allowance", "Contingency", contingency, "09", "09.020", `${contPct}% of the subtotal.`));
  if (tax > 0) lines.push(extra("tax:vat", "Tax", "Value added tax", tax, "10", "10.020", `${taxPct}% of the subtotal and contingency.`));

  const summary = icmsSummary(lines);
  const attributes = icmsAttributes(project);
  const gfa = attributes.gfaIpms2.value || attributes.gfaIpms1.value || null;
  return {
    edition: ICMS_EDITION,
    method: carbonMethod(),
    attributes,
    lines,
    summary,
    totals: { measured: r2(measured), provisional: r2(provisional), preliminaries: r2(prelimPool), contingency: r2(contingency), tax: r2(tax), total: r2(subtotal + contingency + tax) },
    perM2: gfa ? { basis: attributes.gfaIpms2.value ? "IPMS 2 (gross internal)" : "IPMS 1 (gross external)", area: gfa, cost: r2(summary.total / gfa), carbonKg: r2(summary.carbonKg / gfa) } : null,
  };
}

function extra(key, kind, description, amount, group, subGroup, why) {
  return {
    key, kind, description, unit: "item", qty: 1, rate: r2(amount), amount,
    group, subGroup, code: icmsCode({ group, subGroup }), basis: "contract", why,
    carbonPerUnit: null, carbonKg: null, carbonLowKg: null, carbonSource: "none",
  };
}

/* --------------------------- RICS Data Standard --------------------------- */
//
// The JSON export is a RICS Data Standard (RDS) 3.3.3 data transfer: RICS's own
// MIT-licensed schema for ICMS 3 cost and carbon data, published at
// https://github.com/RICS-Data-Standard/RDS (JSON/rics-3.3.3.json, kept verbatim
// in assets/icms/rds-3.3.3.schema.json and validated against in the tests).
// The schema is generated from RICS's XSD, so attributes are "@name", text is "$"
// and every element is namespaced "rics:" or "xal:".
//
// Placement: rics:DataTransfer > rics:CostedProjects[0] > rics:Buildings[0] (or
// the element for the ICMS project type) > rics:Costs and rics:Emissions, one
// entry per ICMS Group and Sub-Group the bill reaches, @code at Level 3
// ("01.2.02") and @subcode the Level 4 part ("020"). What RDS has no field for
// (lines, cost per m2, which attributes were assumed, carbon coverage, cost not
// yet placed) is kept under rics:OtherData.adlm on the costed project, the
// schema's own extension point.

export const RDS_VERSION = "3.3.3";

// ICMS 3 Level 3 Group -> RDS KnownCostEmissionGroupEnum. Group 12 is "Production
// and loose furniture, fittings and equipment" in ICMS 3; RDS 3.3.3 has only this
// one value for it.
const RDS_GROUP = {
  "01": "demolitionSitePreparationAndFormation",
  "02": "substructure",
  "03": "structure",
  "04": "architecturalWorks-NonStructuralWorks",
  "05": "servicesAndEquipment",
  "06": "surfaceAndUndergroundDrainage",
  "07": "externalAndAncillaryWorks",
  "08": "preliminariesConstructors-SiteOverheads-GeneralRequirements",
  "09": "riskAllowances",
  "10": "taxesAndLevies",
  "11": "workAndUtilitiesOffsite",
  "12": "postCompletionLooseFurnitureFittingsAndEquipment",
  "13": "constructionRelatedConsultantsAndSupervision",
};

// ICMS 3 Level 1 project type -> RDS @mainProjectType, and the ProjectType element holding its costs.
const RDS_PROJECT = {
  "01": ["buildings", "rics:Buildings"],
  "02": ["roadsRunwaysAndMotorway", "rics:RoadsRunwaysAndMotorways"],
  "03": ["railways", "rics:Railways"],
  "04": ["bridges", "rics:Bridges"],
  "05": ["tunnels", "rics:Tunnels"],
  "06": ["wasteWaterTreatmentWorks", "rics:WasteWaterTreatmentWorks"],
  "07": ["waterTreatmentWorks", "rics:WaterTreatmentWorks"],
  "08": ["pipelines", "rics:Pipelines"],
  "09": ["wellsAndBoreholes", "rics:WellsAndBoreholes"],
  "10": ["power-generatingPlants", "rics:Power-generatingPlants"],
  "11": ["chemicalPlants", "rics:ChemicalPlants"],
  "12": ["refineries", "rics:Refineries"],
  "13": ["damsAndReservoirs", "rics:DamsAndReservoirs"],
  "14": ["minesAndQuarries", "rics:MinesAndQuarries"],
  "15": ["offshoreStructures", "rics:OffshoreStructures"],
  "16": ["nearshoreWorks", "rics:NearshoreWorks"],
  "17": ["ports", "rics:Ports"],
  "18": ["waterwayWorks", "rics:WaterwayWorks"],
  "19": ["landFormationAndReclamation", "rics:LandFormationAndReclamations"],
};

// Our project status -> RDS @costReportStatus and @projectStatus (both closed enums).
// An Estimate says nothing certain about the design phase, so it sets no @projectStatus.
const RDS_STATUS = {
  Estimate: { costReportStatus: "pre-constructionForecast" },
  Tender: { costReportStatus: "atTender", projectStatus: "designPhase" },
  "Contract awarded": { costReportStatus: "duringConstruction", projectStatus: "constructionAndCommissioningPhase" },
  "Final account": { costReportStatus: "actualCostsAnd/OrCarbonEmissionsOfConstructionPost-completion", projectStatus: "complete" },
};
const RDS_PROJECT_STATUS = ["initiationAndConceptPhase", "designPhase", "constructionAndCommissioningPhase", "complete"];
const RDS_PRICE_BASIS = ["fixedUnitRates", "unitRatesSubjectToFluctuatingAdjustment"];

/** Our carbon boundary words -> RDS KnownCarbonReportingBoundaryEnum, or the words as given. */
export function rdsBoundary(text) {
  const t = String(text || "");
  if (/A0|B1|C1/.test(t)) return "Embodied carbon (EN 15978 stages A0-A5, B1-B5, C1-C4)";
  if (/A1\s*-\s*A5/.test(t)) return "Up front carbon (EN 15978 stages A1-A5)";
  if (/A1\s*-\s*A3/.test(t)) return "Products (EN 15978 stages A1-A3)";
  if (/A4\s*-\s*A5/.test(t)) return "Construction (EN 15978 stages A4-A5)";
  return t;
}
const rdsQuantitySource = (text) => (/bills? of quantities|boq/i.test(String(text || "")) ? "billsOfQuantities(BoQ)" : String(text || ""));

/** kgCO2e as an RDS Complex Measurement. */
const co2e = (kg, extra = {}) => ({ "@type": "absolute", "@item": "carbonDioxideEquivalent", "@unitOfMeasurement": "KGM", "@description": "kgCO2e", ...extra, "rics:Decimal": { $: r2(kg) } });

/**
 * The report as a RICS Data Standard 3.3.3 document (see the note above), with the
 * ADLM detail under rics:OtherData.adlm.
 * @param {object} report  from buildIcmsReport
 * @param {object} opts    { reportDate } YYYY-MM-DD, defaults to today
 */
export function icmsJson(report, { reportDate = new Date().toISOString().slice(0, 10) } = {}) {
  const A = report.attributes;
  const pt = A.projectType.value;
  const cur = A.currency.value;
  const [mainProjectType, container] = RDS_PROJECT[pt] || RDS_PROJECT["01"];
  const st = A.projectStatus.value;
  const status = RDS_STATUS[st] || (RDS_PROJECT_STATUS.includes(st) ? { projectStatus: st } : {});
  const notUsed = new Set(report.summary.groups.filter((g) => g.carbonReported === false).map((g) => g.code));

  // one entry per Group / Sub-Group the bill reaches, so the Totals add up to the placed cost once
  const buckets = new Map();
  for (const l of report.lines.filter((x) => x.group)) {
    const k = `${l.group}.${l.subGroup || ""}`;
    const b = buckets.get(k) || { group: l.group, subGroup: l.subGroup || null, cost: 0, kg: 0, lowKg: 0, counted: false };
    b.cost += l.amount;
    b.counted ||= l.carbonKg != null;
    b.kg += l.carbonKg || 0;
    b.lowKg += l.carbonLowKg ?? l.carbonKg ?? 0;
    buckets.set(k, b);
  }
  const placed = [...buckets.entries()].filter(([, b]) => b.cost > 0).sort(([a], [b]) => a.localeCompare(b)).map(([, b]) => b);
  const ident = (b) => ({
    "@category": "constructionCosts",
    "@group": RDS_GROUP[b.group] || groupTitle(b.group),
    "@code": `${pt}.2.${b.group}`,
    ...(b.subGroup ? { "@subcode": b.subGroup.split(".")[1], "@subgroup": subGroupTitle(b.subGroup) } : {}),
    "@description": b.subGroup ? subGroupTitle(b.subGroup) : groupTitle(b.group),
  });
  const costs = placed.map((b) => ({ ...ident(b), "rics:Total": { "@iso4217Code": cur, $: r2(b.cost) } }));
  // carbon only where a rate gave one: an uncounted bucket is left out rather than reported as zero
  const emissions = placed.filter((b) => notUsed.has(b.group) || b.counted).map((b) => (notUsed.has(b.group)
    ? { ...ident(b), "@isNotApplicable": true } // ICMS 3: "not used" for carbon
    : { ...ident(b), "rics:Forecast": [co2e(b.kg), co2e(b.lowKg, { "@isMinimum": true, "@description": "kgCO2e, low end" })] }));

  const works = { "@title": A.projectName.value, "@element": "project", "rics:Costs": costs, "rics:Emissions": emissions };
  if (container === "rics:Buildings") {
    const q = {};
    if (A.gfaIpms1.value) q["rics:ExternalFloorAreaAsIpms1"] = { "@unitOfMeasurement": "MTK", $: A.gfaIpms1.value };
    if (A.gfaIpms2.value) q["rics:InternalFloorAreaAsIpms2"] = { "@unitOfMeasurement": "MTK", $: A.gfaIpms2.value };
    if (Object.keys(q).length) works["rics:Quantities"] = q;
  }

  const address = {};
  if (A.country.value) address["xal:Country"] = { "xal:CountryNameCode": { "@Scheme": "ISO 3166-1 alpha-2", $: A.country.value } };
  if (A.location.value) address["xal:AddressLines"] = { "xal:AddressLine": [String(A.location.value)] };

  const project = {
    "@title": A.projectName.value,
    "@element": "project",
    "@mainProjectType": mainProjectType,
    ...(status.costReportStatus ? { "@costReportStatus": status.costReportStatus } : {}),
    ...(status.projectStatus ? { "@projectStatus": status.projectStatus } : {}),
    ...(RDS_PRICE_BASIS.includes(A.priceBasis.value) ? { "@reportPriceBasis": A.priceBasis.value } : {}),
    "rics:MetaData": { "rics:ReportDate": { "rics:Date": reportDate } },
    ...(A.client.value ? { "rics:Client": [{ "@name": String(A.client.value) }] } : {}),
    ...(Object.keys(address).length ? { "rics:Location": { "xal:AddressDetails": [address] } } : {}),
    "rics:CostBaseDate": { "rics:Date": A.baseDate.value },
    "rics:CarbonEmissions": {
      "@boundary": rdsBoundary(A.carbonBoundary.value),
      "@assessmentProcess": report.method,
      "rics:AssessmentTools": ["ADLM RateGen"],
      "rics:EmissionFactorSources": [String(A.emissionFactorSources.value)],
      "rics:MaterialQuantitySources": [rdsQuantitySource(A.quantitySource.value)],
    },
    [container]: [works],
    "rics:OtherData": { adlm: adlmDetail(report) },
  };

  return {
    "@xmlns:rics": `urn:xsdschema:rics:${RDS_VERSION}`,
    "@xmlns:xal": "urn:oasis:names:tc:ciq:xsdschema:xAL:2.0",
    "rics:DataTransfer": {
      "@description": `${report.edition} cost and carbon report, RICS Data Standard ${RDS_VERSION}`,
      "rics:GeneratedBy": { "@name": "ADLM Studio" },
      "rics:Currency": [{ "@iso4217Code": cur, "@isPrimaryCurrency": true }],
      "rics:CostedProjects": [project],
    },
  };
}

/** What RDS has no field for: the line detail, cost per m2, which attributes were assumed, coverage. */
function adlmDetail(report) {
  const attr = Object.fromEntries(Object.entries(report.attributes).map(([k, v]) => [k, v.value]));
  const pt = attr.projectType;
  return {
    standard: report.edition,
    note: "ICMS 3 codes and groupings. Cost includes contractors' overheads and profit as billed; carbon is upfront A1-A5 in kgCO2e from RateGen. Groups 10, 11 and 13 are 'not used' for carbon. Cost not yet placed in an ICMS Group is in construction.unplacedCost and is not in rics:Costs.",
    attributes: { ...attr, projectTypeTitle: ICMS_PROJECT_TYPES.find((t) => t.code === pt)?.title || "" },
    assumed: Object.entries(report.attributes).filter(([, v]) => !v.stated).map(([k]) => k),
    construction: {
      code: `${pt}.2`, // Level 2, Construction
      cost: report.summary.total,
      carbonKgCO2e: report.summary.carbonKg,
      carbonLowKgCO2e: report.summary.carbonLowKg,
      carbonCoverage: report.summary.carbonShare,
      unplacedCost: report.summary.unplaced,
      groups: report.summary.groups.filter((g) => g.amount > 0).map((g) => ({
        code: icmsCode({ projectType: pt, group: g.code }),
        title: g.title,
        cost: g.amount,
        carbonKgCO2e: g.carbonReported ? g.carbonKg : null,
        subGroups: subGroupTotals(report.lines, g.code, pt),
      })),
    },
    perM2: report.perM2,
    lines: report.lines.map((l) => ({
      code: l.code ? `${pt}.${l.code}` : null, description: l.description, kind: l.kind || "Measured work",
      qty: l.qty, unit: l.unit, rate: l.rate, cost: l.amount,
      carbonKgCO2e: l.carbonKg, carbonSource: l.carbonSource, carbonAssumed: l.carbonAssumed || null, placedBy: l.basis,
    })),
  };
}

function subGroupTotals(lines, group, pt) {
  const by = new Map();
  for (const l of lines.filter((x) => x.group === group)) {
    const k = l.subGroup || `${group}.999`;
    const s = by.get(k) || { code: `${pt}.2.${k}`, title: l.subGroup ? subGroupTitle(l.subGroup) : "All other costs", cost: 0, carbonKgCO2e: 0 };
    s.cost += l.amount;
    s.carbonKgCO2e += l.carbonKg || 0;
    by.set(k, s);
  }
  return [...by.values()].sort((a, b) => a.code.localeCompare(b.code));
}

/* ------------------------------ workbook ------------------------------ */

const NAVY = "FF1F2A44";
const head = (row) => {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } }));
};
const money = "#,##0.00";
const tonnes = "#,##0.000";

/** The ICMS 3 workbook: cover, cost by Group (G-2), carbon by Group (H-1/H-2), lines, and what is not placed. */
export async function exportIcmsWorkbook(report) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ADLM Studio";
  wb.created = new Date();
  const A = report.attributes;
  const pt = A.projectType.value;
  const cur = A.currency.value;

  // Cover: the attributes, saying which were assumed
  const cover = wb.addWorksheet("ICMS 3 report");
  cover.columns = [{ width: 34 }, { width: 60 }, { width: 18 }];
  cover.addRow([`${A.projectName.value}: ICMS 3 cost and carbon report`]).font = { bold: true, size: 14 };
  cover.addRow([report.edition]);
  cover.addRow([]);
  head(cover.addRow(["Attribute", "Value", "Stated or assumed"]));
  const label = {
    projectName: "Project", client: "Client", projectType: "Project type (Level 1)", country: "Country (ISO 3166)", currency: "Currency (ISO 4217)",
    baseDate: "Base date", priceBasis: "Price basis", projectStatus: "Project status", location: "Location",
    gfaIpms1: "Gross external area, IPMS 1 (m2)", gfaIpms2: "Gross internal area, IPMS 2 (m2)",
    carbonBoundary: "Carbon boundary", quantitySource: "Quantity source", emissionFactorSources: "Emission factor sources",
  };
  for (const [k, v] of Object.entries(A)) {
    const shown = k === "projectType" ? `${v.value} ${ICMS_PROJECT_TYPES.find((t) => t.code === v.value)?.title || ""}` : v.value ?? "Not stated";
    cover.addRow([label[k] || k, shown, v.stated ? "Stated" : "Assumed: set it in the ICMS details"]);
  }
  cover.addRow([]);
  cover.addRow(["Carbon method", report.method]);
  cover.addRow(["Carbon coverage", `${Math.round(report.summary.carbonShare * 100)}% of the cost has a carbon figure behind it`]);
  cover.addRow(["Placed in an ICMS Group", `${Math.round(report.summary.placedShare * 100)}% of the cost`]);
  cover.getColumn(2).alignment = { wrapText: true, vertical: "top" };

  // G-2: Construction Costs by Group, with cost per m2 where the floor area is stated
  const cost = wb.addWorksheet("Cost by Group (G-2)");
  cost.columns = [{ width: 12 }, { width: 62 }, { width: 20 }, { width: 10 }, { width: 18 }];
  head(cost.addRow(["Code", "Construction Costs (CC)", `Cost (${cur})`, "% of total", report.perM2 ? `${cur} per m2 (${report.perM2.basis})` : `${cur} per m2`]));
  for (const g of report.summary.groups) {
    const r = cost.addRow([icmsCode({ group: g.code }), g.title, g.amount, report.summary.total ? g.amount / report.summary.total : 0, report.perM2 ? g.amount / report.perM2.area : null]);
    r.getCell(3).numFmt = money; r.getCell(4).numFmt = "0.0%"; r.getCell(5).numFmt = money;
  }
  if (report.summary.unplaced > 0) {
    const r = cost.addRow(["", "Not yet placed in a Group (see 'Not placed')", report.summary.unplaced, report.summary.unplaced / report.summary.total, null]);
    r.font = { italic: true, color: { argb: "FFB00020" } }; r.getCell(3).numFmt = money; r.getCell(4).numFmt = "0.0%";
  }
  const tot = cost.addRow([`${pt}.2`, "Total Construction Costs", report.summary.total, 1, report.perM2 ? report.perM2.cost : null]);
  tot.font = { bold: true }; tot.getCell(3).numFmt = money; tot.getCell(4).numFmt = "0.0%"; tot.getCell(5).numFmt = money;

  // H-1 / H-2: Construction Carbon Emissions by Group, tCO2e
  const carbon = wb.addWorksheet("Carbon by Group (H-1, H-2)");
  carbon.columns = [{ width: 12 }, { width: 62 }, { width: 16 }, { width: 16 }, { width: 18 }];
  head(carbon.addRow(["Code", "Construction Carbon Emissions (CE), up front A1-A5", "tCO2e", "Low end tCO2e", report.perM2 ? `kgCO2e per m2 (${report.perM2.basis})` : "kgCO2e per m2"]));
  for (const g of report.summary.groups) {
    const r = g.carbonReported
      ? carbon.addRow([icmsCode({ group: g.code }), g.title, g.carbonKg / 1000, g.carbonLowKg / 1000, report.perM2 ? g.carbonKg / report.perM2.area : null])
      : carbon.addRow([icmsCode({ group: g.code }), g.title, "Not used", "", ""]);
    r.getCell(3).numFmt = tonnes; r.getCell(4).numFmt = tonnes; r.getCell(5).numFmt = "#,##0.0";
  }
  const ct = carbon.addRow([`${pt}.2`, "Total Construction Carbon Emissions", report.summary.carbonKg / 1000, report.summary.carbonLowKg / 1000, report.perM2 ? report.perM2.carbonKg : null]);
  ct.font = { bold: true }; ct.getCell(3).numFmt = tonnes; ct.getCell(4).numFmt = tonnes; ct.getCell(5).numFmt = "#,##0.0";
  carbon.addRow([]);
  carbon.addRow(["", `Carbon is counted on ${Math.round(report.summary.carbonShare * 100)}% of the cost. Low end: cement at the Nigerian producers' Scope 1 figure.`]);

  // Lines: every line with its code, money, carbon and how both were decided
  const det = wb.addWorksheet("Lines");
  det.columns = [
    { header: "ICMS code", width: 13 }, { header: "Sub-Group", width: 34 }, { header: "Kind", width: 15 }, { header: "Description", width: 60 },
    { header: "Qty", width: 11 }, { header: "Unit", width: 7 }, { header: `Rate (${cur})`, width: 14 }, { header: `Cost (${cur})`, width: 16 },
    { header: "kgCO2e", width: 13 }, { header: "Carbon from", width: 10 }, { header: "Carbon rate", width: 40 }, { header: "Assumed", width: 40 }, { header: "Placed by", width: 10 }, { header: "Why", width: 44 },
  ];
  head(det.getRow(1));
  det.views = [{ state: "frozen", ySplit: 1 }];
  for (const l of [...report.lines].sort((a, b) => String(a.code || "~").localeCompare(String(b.code || "~")))) {
    const r = det.addRow([
      l.code || "", l.subGroup ? subGroupTitle(l.subGroup) : l.group ? groupTitle(l.group) : "", l.kind || "Measured work", l.description,
      l.qty, l.unit, l.rate, l.amount, l.carbonKg ?? "", l.carbonSource, l.carbonRate || "", l.carbonAssumed || "", l.basis, l.why,
    ]);
    r.getCell(7).numFmt = money; r.getCell(8).numFmt = money; r.getCell(9).numFmt = "#,##0.0";
  }

  // Not placed: what the QS still has to put in a Group
  const open = report.lines.filter((l) => !l.group);
  const np = wb.addWorksheet("Not placed");
  np.columns = [{ header: "Description", width: 70 }, { header: "Unit", width: 8 }, { header: `Cost (${cur})`, width: 16 }, { header: "Why", width: 60 }];
  head(np.getRow(1));
  for (const l of open.sort((a, b) => b.amount - a.amount)) np.addRow([l.description, l.unit, l.amount, l.why]).getCell(3).numFmt = money;
  if (!open.length) np.addRow(["Every line is placed in an ICMS Group."]);

  const safe = String(A.projectName.value || "Project").replace(/[^\w.-]+/g, "_").slice(0, 60);
  return { buffer: await wb.xlsx.writeBuffer(), filename: `${safe}_ICMS3.xlsx` };
}
