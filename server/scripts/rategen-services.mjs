#!/usr/bin/env node
// server/scripts/rategen-services.mjs
//
// RateGen's building-services rates (util/servicesRates.js) are unpriced drafts:
// the owner's choice (3 Oct 2026) was to build them now and leave the prices to
// ADLM's price team. This lists what the team has to price, as a CSV to fill in.
//
//   node scripts/rategen-services.mjs prices [--out services-prices.csv]
//   node scripts/rategen-services.mjs rates  [--out services-rates.csv]
//
// Read-only: it touches no database.
import fs from "node:fs";
import { SERVICES_RATES, servicesPriceList } from "../util/servicesRates.js";

const [, , cmd = "prices", ...rest] = process.argv;
const outAt = rest.indexOf("--out");
const out = outAt >= 0 ? rest[outAt + 1] : null;
const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

let rows;
if (cmd === "prices") {
  rows = [["Kind", "Name", "Unit", "Used in rates", "Unit price (NGN), Lagos", "Price as of", "Source"]];
  for (const x of servicesPriceList()) rows.push([x.kind, x.name, x.unit, x.usedIn, "", "", ""]);
} else if (cmd === "rates") {
  rows = [["Code", "Group", "Description", "Unit", "Line", "Quantity", "Line unit", "Kind"]];
  for (const r of SERVICES_RATES) for (const b of r.breakdown) rows.push([r.code, r.group, r.description, r.unit, b.componentName, b.quantity, b.unit, b.refKind]);
} else {
  console.error("Usage: node scripts/rategen-services.mjs prices|rates [--out file.csv]");
  process.exit(2);
}

const csv = rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
if (out) {
  fs.writeFileSync(out, csv);
  console.log(`${rows.length - 1} rows written to ${out}`);
} else {
  process.stdout.write(csv);
}
