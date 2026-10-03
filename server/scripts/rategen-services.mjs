#!/usr/bin/env node
// server/scripts/rategen-services.mjs
//
// RateGen's MEPF library and building-services rates (util/mepfLibrary.js,
// util/servicesRates.js), from research to publication. The owner's choices
// (3 Oct 2026): prices researched online and CHECKED by ADLM's price team before
// anyone sees them; the library goes into the RateGen master, which SERVIQ already
// fetches; SERVIQ's auto-pricing from the finished rates comes in a later release.
//
//   node scripts/rategen-services.mjs review  --out mepf-review.xlsx
//       The price team's sheet: every item not yet checked, most doubtful first
//       (biggest gap between researched and master price, then unpriced), with
//       sources. They fill "Checked price (NGN)" and "Checked by".
//
//   node scripts/rategen-services.mjs checks  --file mepf-review.xlsx [--apply]
//       Reads the filled sheet back into assets/rategen/mepf-library.json.
//
//   node scripts/rategen-services.mjs publish [--apply]
//       Writes checked items into the RateGen master (south_west rows: every other
//       zone and state falls back to them) and the fully priced rates into the
//       master rates (section "services"). Dry run without --apply. Refuses to
//       write anything until work-board item rategen-mepf-library-serviq is
//       approved; never publishes a researched price nobody has checked.

import "dotenv/config";
import fs from "node:fs";
import ExcelJS from "exceljs";

const [, , cmd, ...rest] = process.argv;
const arg = (k) => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : null; };
const APPLY = rest.includes("--apply");
const LIB_PATH = new URL("../assets/rategen/mepf-library.json", import.meta.url);
const WORK_KEY = "rategen-mepf-library-serviq";
const BY = "mepf-2026-10";

async function review() {
  const { mepfReviewList } = await import("../util/mepfLibrary.js");
  const { SERVICES_RATES } = await import("../util/servicesRates.js");
  const used = new Map();
  for (const r of SERVICES_RATES) for (const b of r.breakdown) used.set(b.componentName, (used.get(b.componentName) || 0) + 1);

  const wb = new ExcelJS.Workbook();
  wb.creator = "ADLM Studio";
  const ws = wb.addWorksheet("MEPF prices to check", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "Status", key: "status", width: 12 },
    { header: "Kind", key: "kind", width: 9 },
    { header: "Name", key: "name", width: 52 },
    { header: "Unit", key: "unit", width: 7 },
    { header: "Category", key: "category", width: 44 },
    { header: "Master price (NGN)", key: "master", width: 14 },
    { header: "Researched price (NGN)", key: "researched", width: 14 },
    { header: "Low", key: "low", width: 11 },
    { header: "High", key: "high", width: 11 },
    { header: "Confidence", key: "confidence", width: 11 },
    { header: "Gap vs master", key: "gap", width: 11 },
    { header: "Used in rates", key: "used", width: 8 },
    { header: "Source", key: "source", width: 40 },
    { header: "Source date", key: "date", width: 12 },
    { header: "How it was worked out", key: "notes", width: 60 },
    { header: "Checked price (NGN)", key: "checked", width: 14 },
    { header: "Checked by", key: "checkedBy", width: 14 },
    { header: "Comment", key: "comment", width: 30 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const i of mepfReviewList()) {
    const r = i.researched;
    const src = r?.sources?.[0];
    const row = ws.addRow({
      status: i.status,
      kind: i.kind,
      name: i.name,
      unit: i.unit,
      category: i.category,
      master: i.masterPrice ?? null,
      researched: r?.price ?? null,
      low: r?.low ?? null,
      high: r?.high ?? null,
      confidence: r?.confidence ?? "",
      gap: i.masterPrice > 0 && r?.price > 0 ? `${Math.round((r.price / i.masterPrice - 1) * 100)}%` : "",
      used: used.get(i.name) || 0,
      source: src ? { text: src.title || src.url, hyperlink: src.url } : "",
      date: src ? `${src.date} (${src.dateKind})` : "",
      notes: [r?.conversion, r?.notes].filter(Boolean).join(" | "),
    });
    if (i.status === "needs-price") row.getCell("status").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDE2E1" } };
    for (const k of ["master", "researched", "low", "high", "checked"]) row.getCell(k).numFmt = "#,##0";
  }
  const out = arg("out") || "mepf-review.xlsx";
  await wb.xlsx.writeFile(out);
  console.log(`${ws.rowCount - 1} items to check written to ${out}`);
}

async function checks() {
  const file = arg("file");
  if (!file) throw new Error("--file mepf-review.xlsx is required");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  const head = {};
  ws.getRow(1).eachCell((c, i) => (head[String(c.value)] = i));
  const lib = JSON.parse(fs.readFileSync(LIB_PATH, "utf8"));
  const byName = new Map(lib.items.map((i) => [i.name, i]));
  let n = 0;
  ws.eachRow((row, i) => {
    if (i === 1) return;
    const name = String(row.getCell(head["Name"]).value || "");
    const price = Number(row.getCell(head["Checked price (NGN)"]).value);
    const by = String(row.getCell(head["Checked by"]).value || "").trim();
    const it = byName.get(name);
    if (!it || !(price > 0)) return;
    if (!by) { console.log(`  skip ${name}: a checked price needs the checker's name`); return; }
    it.checkedPrice = price;
    it.checkedBy = by;
    it.checkedAt = new Date().toISOString().slice(0, 10);
    it.comment = String(row.getCell(head["Comment"]).value || "");
    n++;
  });
  console.log(`${n} checked prices read${APPLY ? "" : " (dry run)"}`);
  if (APPLY) fs.writeFileSync(LIB_PATH, JSON.stringify(lib, null, 1) + "\n");
}

async function publish() {
  const { MEPF_ITEMS } = await import("../util/mepfLibrary.js");
  const { pricedServicesRates, SERVICES_SECTION } = await import("../util/servicesRates.js");
  const items = MEPF_ITEMS.filter((i) => i.checkedPrice > 0);
  const rates = pricedServicesRates({ basis: "published" });
  const ready = rates.filter((r) => r.priced);
  console.log(`Checked items: ${items.length} (new ${items.filter((i) => !i.inMaster).length}, master re-priced ${items.filter((i) => i.inMaster && i.checkedPrice !== i.masterPrice).length})`);
  console.log(`Rates fully priced: ${ready.length} of ${rates.length}; not ready: ${rates.length - ready.length}`);
  if (!APPLY) return console.log("Dry run. Re-run with --apply to write to the RateGen master (production).");

  const mongoose = (await import("mongoose")).default;
  const { MongoClient } = await import("mongodb");
  await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.AUTH_DB || "adlmWeb" });
  try {
    const { WorkItem } = await import("../models/WorkItem.js");
    const { stageBlock } = await import("../util/workBoard.js");
    const work = await WorkItem.findOne({ key: WORK_KEY }).lean();
    const block = !work ? "not on the work board" : stageBlock(work, "building");
    if (block) throw new Error(`Refused: ${WORK_KEY} is not cleared (${block}).`);

    const client = new MongoClient(process.env.RATEGEN_MONGO_URI || process.env.MONGO_URI);
    await client.connect();
    const db = client.db(process.env.RATEGEN_DB || "ADLMRateDB");
    const mats = db.collection(process.env.RATEGEN_MAT_COLLECTION || "Materials");
    const labs = db.collection(process.env.RATEGEN_LAB_COLLECTION || "labours");
    for (const i of items) {
      const isLab = i.kind === "labour";
      const coll = isLab ? labs : mats;
      const key = isLab ? "LabourName" : "MaterialName";
      const doc = isLab
        ? { LabourName: i.name, LabourUnit: i.unit, LabourPrice: i.checkedPrice, LabourCategory: i.category }
        : { MaterialName: i.name, MaterialUnit: i.unit, MaterialPrice: i.checkedPrice, MaterialCategory: i.category };
      // the zone row every state and zone falls back to; a state's own row is untouched
      await coll.updateOne(
        { [key]: i.name, zone: "south_west", state: { $exists: false } },
        { $set: { ...doc, zone: "south_west", updatedAt: new Date(), updatedBy: BY, checkedBy: i.checkedBy } },
        { upsert: true },
      );
    }
    await client.close();

    const { RateGenRate } = await import("../models/RateGenRate.js");
    const { bumpMeta } = await import("../models/RateGenMeta.js");
    for (const r of ready) {
      await RateGenRate.updateOne(
        { sectionKey: SERVICES_SECTION.key, code: r.code, state: null, zone: null },
        { $set: {
          sectionKey: SERVICES_SECTION.key, sectionLabel: SERVICES_SECTION.label, itemNo: r.itemNo, code: r.code,
          description: r.description, unit: r.unit, netCost: r.netCost, overheadPercent: r.overheadPercent, profitPercent: r.profitPercent,
          overheadValue: r.overheadValue, profitValue: r.profitValue, totalCost: r.totalCost,
          breakdown: r.breakdown.map((b) => ({ componentName: b.componentName, quantity: b.quantity, unit: b.unit, unitPrice: b.unitPrice, totalPrice: b.totalPrice, refKind: b.refKind, refName: b.componentName, priceAsOf: new Date() })),
        } },
        { upsert: true },
      );
    }
    if (ready.length) await bumpMeta("rates", BY, `MEPF services rates: ${ready.length}`);
    console.log(`Published ${items.length} items and ${ready.length} rates.`);
  } finally {
    await mongoose.disconnect();
  }
}

const run = { review, checks, publish }[cmd];
if (!run) {
  console.error("Usage: node scripts/rategen-services.mjs review|checks|publish  (see the header)");
  process.exit(2);
}
run().catch((e) => { console.error(e.message); process.exit(1); });
