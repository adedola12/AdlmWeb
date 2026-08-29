/**
 * Rewrites the Google Classroom references still sitting in product copy.
 *
 * The code stopped linking out to Google Classroom, but the sales copy did
 * not: feature bullets like "100% Online (Google Classroom)" live in
 * Product.features in the database, not in the repo, so they still render on
 * the product page after the integration is gone.
 *
 *   node scripts/retire-classroom-product-copy.mjs                  # dry run, prints a diff
 *   node scripts/retire-classroom-product-copy.mjs --apply          # writes to the DB
 *   node scripts/retire-classroom-product-copy.mjs --include-copy   # also blurb/description
 *
 * By default only `features` is rewritten — that is where the bullets are.
 * --include-copy extends the rewrite to Product.blurb and Product.description.
 * Either way the run REPORTS every field that mentions Classroom, including
 * course copy it never touches, so nothing is a surprise.
 *
 * A bullet the ruleset cannot confidently rewrite is left untouched and
 * flagged for a human rather than mangled. The rules are idempotent, so
 * re-running is safe and a second run finds nothing left to change.
 *
 * The rewrite itself lives in util/classroomCopy.js and is covered by
 * util/classroomCopy.test.js.
 */
import "dotenv/config";
import { connectDB } from "../db.js";
import { Product } from "../models/Product.js";
import { PaidCourse } from "../models/PaidCourse.js";
import {
  MENTIONS_CLASSROOM,
  rewriteFeatures,
  rewriteText,
} from "../util/classroomCopy.js";

const APPLY = process.argv.includes("--apply");
const INCLUDE_COPY = process.argv.includes("--include-copy");

await connectDB();

const products = await Product.find({}).sort({ name: 1 });

let changedCount = 0;
const needsAHuman = [];
const reportOnly = [];

for (const p of products) {
  const changes = [];

  // ── feature bullets (always) ──
  const before = (p.features || []).map(String);
  if (before.some((f) => MENTIONS_CLASSROOM.test(f))) {
    const { features, unresolved, changed } = rewriteFeatures(before);
    for (const line of unresolved) {
      needsAHuman.push({ owner: p.key, field: "features", line });
    }
    if (changed) {
      changes.push({ field: "features", before, after: features });
      p.features = features;
    }
  }

  // ── blurb / description (only with --include-copy) ──
  for (const field of ["blurb", "description"]) {
    const value = String(p[field] || "");
    if (!MENTIONS_CLASSROOM.test(value)) continue;

    if (!INCLUDE_COPY) {
      reportOnly.push({ owner: p.key, field, value, hint: "--include-copy" });
      continue;
    }

    const { text, unresolved, changed } = rewriteText(value);
    if (unresolved) {
      needsAHuman.push({ owner: p.key, field, line: unresolved });
      continue;
    }
    if (changed) {
      changes.push({ field, before: [value], after: [text] });
      p[field] = text;
    }
  }

  if (!changes.length) continue;

  changedCount += 1;
  console.log("=".repeat(70));
  console.log(`${p.name}  (productKey: ${p.key})`);
  for (const c of changes) {
    console.log(`\n  ${c.field}:`);
    for (const line of c.before) console.log(`    - ${line}`);
    for (const line of c.after) console.log(`    + ${line}`);
  }

  if (APPLY) await p.save();
}

// ── Course copy is edited on the course setup page, not here. Report it so
//    the sweep is honest about what it did not cover. ──
const courses = await PaidCourse.find({}, { sku: 1, blurb: 1, description: 1 }).lean();
for (const c of courses) {
  for (const field of ["blurb", "description"]) {
    const value = String(c[field] || "");
    if (MENTIONS_CLASSROOM.test(value)) {
      reportOnly.push({
        owner: `course:${c.sku}`,
        field,
        value,
        hint: "course setup page",
      });
    }
  }
}

console.log("\n" + "=".repeat(70));
console.log(
  APPLY
    ? `Applied. ${changedCount} product(s) updated.`
    : `Dry run. ${changedCount} product(s) would change.`,
);

if (needsAHuman.length) {
  console.log(
    `\nNEEDS A HUMAN — ${needsAHuman.length} line(s) mention Classroom but did not`,
  );
  console.log("match a rewrite rule. Left unchanged:");
  for (const u of needsAHuman) {
    console.log(`  [${u.owner}] ${u.field}: ${u.line}`);
  }
}

if (reportOnly.length) {
  console.log(
    `\nNOT TOUCHED BY THIS RUN — ${reportOnly.length} field(s) mention Classroom:`,
  );
  for (const r of reportOnly) {
    const clipped = r.value.length > 140 ? r.value.slice(0, 140) + "…" : r.value;
    console.log(`  [${r.owner}] ${r.field} (${r.hint}): ${clipped}`);
  }
}

if (!APPLY && changedCount) {
  console.log("\nRe-run with --apply to write these to the database.");
}

process.exit(0);
