// Parse real-world BoQ workbooks through the importer + budget pipeline.
// Temporary tooling — safe to delete.
// Usage: node scripts/test-real-boq-parse.mjs <file.xlsx> [--verbose]
import fs from "node:fs";
import { parseBoqWorkbook } from "../util/boqExcelImport.js";
import { backfillBudgetLinks } from "../util/budgetBillLink.js";
import { ensureBillItemCoverage } from "../util/budgetCoverage.js";
import { deriveBillRatesFromBudget } from "../util/deriveBillRates.js";

const file = process.argv[2];
const verbose = process.argv.includes("--verbose");
const buf = fs.readFileSync(file);

const t0 = Date.now();
const parsed = await parseBoqWorkbook(buf);
const parseMs = Date.now() - t0;

const items = parsed.items;
const gross = items.reduce((a, it) => a + (it.qty || 0) * (it.rate || 0), 0);
const priced = items.filter((it) => (it.rate || 0) > 0).length;
const withTakeoff = items.filter((it) => it.takeoffLine).length;

console.log(`FILE: ${file.split("\\").pop()}`);
console.log(`  parse: ${parseMs}ms`);
console.log(`  items: ${items.length} (${priced} priced, ${withTakeoff} with group context)`);
console.log(`  gross (qty×rate): ₦${Math.round(gross).toLocaleString()}`);
console.log(`  categories (${parsed.categories.length}): ${parsed.categories.slice(0, 12).join(" | ")}${parsed.categories.length > 12 ? " …" : ""}`);
console.log(`  budget rows: ${parsed.budgetItems.length}`);
console.log(`  warnings: ${parsed.warnings.join(" / ") || "none"}`);

// Duplicate-code sanity: codes must be unique.
const codes = new Set(items.map((i) => i.code));
console.log(`  codes unique: ${codes.size === items.length ? "YES" : `NO (${items.length - codes.size} dups)`}`);

// Budget pipeline.
const project = { items, budgetItems: [] };
const budget = parsed.budgetItems.map((b) => ({ ...b }));
const { linked } = backfillBudgetLinks(project.items, budget);
const linkedCount = budget.filter((b) => b.billIdentity).length;
project.budgetItems = ensureBillItemCoverage(project.items, budget);
const { updated } = deriveBillRatesFromBudget(project);
console.log(`  budget link: ${linkedCount}/${budget.length} rows linked to bill lines (${linked} via linker)`);
console.log(`  after coverage: ${project.budgetItems.length} budget rows | ${updated} bill rates derived from build-up`);

if (verbose) {
  console.log("\n  sample items:");
  for (const it of items.slice(0, 12)) {
    console.log(
      `    [${it.code}] ${it.category ? "{" + it.category + "} " : ""}${it.takeoffLine ? "(" + it.takeoffLine.slice(0, 30) + ") " : ""}${it.description.slice(0, 45)} | ${it.qty} ${it.unit} @ ${it.rate}`,
    );
  }
  console.log("\n  sample budget rows:");
  for (const b of parsed.budgetItems.slice(0, 10)) {
    console.log(
      `    [${b.billIdentity || "-"}] ${b.componentKind} {${b.category}} (${(b.takeoffLine || "").slice(0, 25)}) ${b.description.slice(0, 35)} | ${b.qty} ${b.unit} @ ${b.rate}`,
    );
  }
}
