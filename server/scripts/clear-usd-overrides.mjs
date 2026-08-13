// Clears the explicit USD price overrides on products so their dollar prices
// are converted from naira at the live exchange rate instead.
//
// Why this exists: a USD field left blank means "convert from the naira price
// at today's rate" (calcUSD in util/fx.js). A filled one is a fixed figure that
// never moves. ADLM's dollar prices were set when the naira was around ₦800 to
// the dollar; at ₦1,360 they no longer bear any relation to the naira price
// beside them — RateGen was ₦70,000 a year and $100, which is ₦136,000.
//
// Clearing an override DESTROYS the figure that was there, so this writes a
// backup of every value it removes and can put them all back with --restore.
//
// Usage:
//   node server/scripts/clear-usd-overrides.mjs                 # dry run, changes nothing
//   node server/scripts/clear-usd-overrides.mjs --apply         # clear them
//   node server/scripts/clear-usd-overrides.mjs --apply --only rategen,revit
//   node server/scripts/clear-usd-overrides.mjs --restore <backup.json>

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { connectDB } from "../db.js";
import { Product } from "../models/Product.js";
import { getFxRate, calcUSD } from "../util/fx.js";

const USD_FIELDS = [
  ["monthlyUSD", "monthlyNGN"],
  ["sixMonthUSD", "sixMonthNGN"],
  ["yearlyUSD", "yearlyNGN"],
  ["installUSD", "installNGN"],
  ["discountedMonthlyUSD", "discountedMonthlyNGN"],
  ["discountedSixMonthUSD", "discountedSixMonthNGN"],
  ["discountedYearlyUSD", "discountedYearlyNGN"],
];

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const restoreIdx = argv.indexOf("--restore");
const onlyIdx = argv.indexOf("--only");
const only = onlyIdx >= 0 ? String(argv[onlyIdx + 1] || "").split(",").filter(Boolean) : null;

const money = (n) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });

await connectDB(process.env.MONGO_URI);

/* ------------------------------- restore ------------------------------- */
if (restoreIdx >= 0) {
  const file = argv[restoreIdx + 1];
  if (!file) {
    console.error("--restore needs the path to a backup file");
    process.exit(1);
  }
  const backup = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const entry of backup.products) {
    const p = await Product.findOne({ key: entry.key });
    if (!p) {
      console.warn(`  ! ${entry.key} no longer exists, skipped`);
      continue;
    }
    // p.set() rather than assigning into p.price — Mongoose tracks the change
    // reliably on a nested path, and it is the same call that unsets below.
    for (const [field, value] of Object.entries(entry.cleared)) {
      p.set(`price.${field}`, value);
    }
    await p.save();
    console.log(`  restored ${entry.key}: ${Object.keys(entry.cleared).join(", ")}`);
  }
  console.log(`\nRestored ${backup.products.length} product(s) from ${file}.`);
  process.exit(0);
}

/* -------------------------------- clear -------------------------------- */
const fx = await getFxRate();
console.log(`Live rate: ${fx} (₦${Math.round(1 / fx)} to the dollar)\n`);

const products = await Product.find(only ? { key: { $in: only } } : {});
if (only && products.length !== only.length) {
  const found = products.map((p) => p.key);
  console.warn(`! not found: ${only.filter((k) => !found.includes(k)).join(", ")}\n`);
}

const backup = { takenAt: new Date().toISOString(), fxRateNGNUSD: fx, products: [] };
let fields = 0;

for (const p of products.sort((a, b) => a.key.localeCompare(b.key))) {
  const cleared = {};
  const lines = [];

  for (const [usd, ngn] of USD_FIELDS) {
    const had = p.price?.[usd];
    if (had == null) continue; // already converting — nothing to clear
    const ngnValue = Number(p.price?.[ngn] || 0);
    const becomes = calcUSD(ngnValue, fx, undefined);
    cleared[usd] = had;
    lines.push(
      `    ${usd.padEnd(22)} $${money(had).padEnd(9)} -> $${money(becomes)}` +
        `   (₦${money(ngnValue)})`,
    );
  }

  if (!lines.length) continue;
  fields += lines.length;
  backup.products.push({ key: p.key, name: p.name, cleared });

  console.log(`  ${p.key} — ${p.name}`);
  console.log(lines.join("\n"));

  if (apply) {
    // Setting the path to undefined is what makes Mongoose $unset it, which is
    // the state that means "convert at the live rate" — writing 0 would be a
    // fixed price of nothing.
    for (const field of Object.keys(cleared)) p.set(`price.${field}`, undefined);
    await p.save();
  }
}

if (!fields) {
  console.log("Nothing to clear — every product already converts at the live rate.");
  process.exit(0);
}

console.log(
  `\n${fields} override(s) across ${backup.products.length} product(s).`,
);

if (!apply) {
  console.log("\nDry run — nothing was written. Re-run with --apply to clear them.");
  process.exit(0);
}

const file = path.join(
  process.cwd(),
  `usd-overrides-backup-${backup.takenAt.replace(/[:.]/g, "-")}.json`,
);
fs.writeFileSync(file, JSON.stringify(backup, null, 2));
console.log(`\nCleared. Previous values saved to:\n  ${file}`);
console.log(`Put them back with:\n  node server/scripts/clear-usd-overrides.mjs --restore ${file}`);
process.exit(0);
