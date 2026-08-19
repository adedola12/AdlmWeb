// server/scripts/seed-demo-data.js
// Builds the fake dataset a demo session works against.
//
//   node scripts/seed-demo-data.js             # default spread
//   node scripts/seed-demo-data.js --per 20    # rows per collection
//   node scripts/seed-demo-data.js --wipe      # remove demo rows, seed nothing
//   node scripts/seed-demo-data.js --dry-run   # report only, write nothing
//
// Rows are CLONED from real ones and put through the placeholder masker on the
// way, rather than hand-written as fixtures. Two reasons:
//
//   * validity — a clone satisfies whatever the schema requires, including the
//     required fields, enums and nested shapes this script would otherwise have
//     to learn for fifty-odd models and then keep in step with forever;
//   * fidelity — the demo screens end up with realistic record counts, field
//     lengths and status spreads, which is exactly what a designer needs to lay
//     out against. Invented fixtures are always suspiciously tidy.
//
// Nothing real is modified: the source rows are read, never written.
import "../models/tenancy.bootstrap.js";
import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../db.js";
import { runAsDemo } from "../util/demoContext.js";
import { maskPayload } from "../util/demoData.js";

// The collections behind the admin screens worth walking. Others stay empty —
// an empty screen is honest, and seeding everything would clone half the
// database for no design benefit.
const COLLECTIONS = [
  "User",
  "Training",
  "TrainingEnrollment",
  "PTrainingEvent",
  "Product",
  "Purchase",
  "Invoice",
  "Proposal",
  "SupportTicket",
  "Changelog",
  "Showcase",
  "Freebie",
  "Learn",
  "Coupon",
  "Lead",
];

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

// Unique indexes are global, not per-tenant: a cloned row carrying the same
// `key`, `slug` or `email` as its real original would collide on insert. Every
// unique string path is therefore rewritten to something no real row holds.
function uniqueStringPaths(schema) {
  return Object.entries(schema.paths)
    .filter(([, p]) => p.instance === "String" && p.options?.unique)
    .map(([name]) => name);
}

function setPath(doc, path, value) {
  const parts = path.split(".");
  let node = doc;
  for (const part of parts.slice(0, -1)) {
    if (!node[part] || typeof node[part] !== "object") return;
    node = node[part];
  }
  node[parts.at(-1)] = value;
}

function getPath(doc, path) {
  return path.split(".").reduce((n, part) => (n == null ? n : n[part]), doc);
}

async function seedCollection(modelName, perCollection, dryRun) {
  const Model = mongoose.models[modelName];
  if (!Model) {
    console.warn(`  ! ${modelName}: no such model, skipped`);
    return 0;
  }

  // Outside any demo scope — these are the real rows being used as templates.
  const source = await Model.find({}).limit(perCollection).lean();
  if (!source.length) {
    console.log(`  · ${modelName}: no rows to clone, skipped`);
    return 0;
  }

  const uniquePaths = uniqueStringPaths(Model.schema);

  const clones = source.map((row, i) => {
    const { _id, __v, ...rest } = row;
    const masked = maskPayload(rest);
    for (const path of uniquePaths) {
      const current = getPath(masked, path);
      if (typeof current === "string" && current) {
        setPath(masked, path, `demo-${i + 1}-${current}`.slice(0, 120));
      }
    }
    return masked;
  });

  if (dryRun) {
    // Validate against the real schema without touching the database, so a
    // clone that could never have been inserted is reported now rather than
    // half way through writing to production.
    const invalid = [];
    for (const [i, clone] of clones.entries()) {
      const err = new Model(clone).validateSync();
      if (err) invalid.push(`#${i + 1} ${Object.keys(err.errors || {}).join(", ")}`);
    }
    const note = invalid.length ? `  (${invalid.length} would fail: ${invalid[0]})` : "";
    console.log(`  · ${modelName}: would insert ${clones.length}${note}`);
    return clones.length;
  }

  // Awaited INSIDE runAsDemo — see the warning in util/demoContext.js. Handing
  // the lazy query back out would run it with the scope already unwound.
  const inserted = await runAsDemo(async () =>
    await Model.insertMany(clones, { ordered: false, rawResult: false }),
  );
  console.log(`  ✓ ${modelName}: ${inserted.length}`);
  return inserted.length;
}

async function wipe(dryRun) {
  let total = 0;
  for (const name of COLLECTIONS) {
    const Model = mongoose.models[name];
    if (!Model) continue;
    // Inside the demo tenant, so this can only ever match demo rows — an empty
    // filter here is scoped by the plugin, never a full-collection delete.
    // The filter is EXPLICIT rather than left to the tenancy plugin. This is a
    // destructive operation against production, and nothing destructive should
    // depend on ambient context being intact: if the scope were ever lost, an
    // empty filter deletes the entire collection. `{ isDemo: true }` cannot,
    // whatever the context says. Belt and braces, and the braces are the belt.
    if (dryRun) {
      const n = await runAsDemo(async () => await Model.countDocuments({ isDemo: true }));
      if (n) console.log(`  · ${name}: would remove ${n}`);
      total += n;
      continue;
    }
    const { deletedCount } = await runAsDemo(
      async () => await Model.deleteMany({ isDemo: true }),
    );
    if (deletedCount) console.log(`  ✗ ${name}: removed ${deletedCount}`);
    total += deletedCount || 0;
  }
  return total;
}

async function main() {
  const perCollection = Number(arg("per", 15));
  const wipeOnly = process.argv.includes("--wipe");
  const dryRun = process.argv.includes("--dry-run");

  await connectDB(process.env.MONGO_URI);

  // Compile every model so mongoose.models is populated. The route files import
  // them individually; here nothing has, so load the directory.
  const { readdirSync } = await import("node:fs");
  const { fileURLToPath, pathToFileURL } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const modelsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "models");
  const modelFiles = readdirSync(modelsDir).filter(
    // .test.js lives alongside the models, and importing one runs its suite —
    // which tried to spin up a second mongoose connection mid-seed.
    (f) => f.endsWith(".js") && !f.endsWith(".test.js"),
  );
  for (const file of modelFiles) {
    await import(pathToFileURL(join(modelsDir, file)).href);
  }

  if (dryRun) console.log("\nDRY RUN — nothing will be written.");

  console.log("\nClearing existing demo rows…");
  await wipe(dryRun);

  if (wipeOnly) {
    console.log(`\nDone (wipe only${dryRun ? ", dry run" : ""}).\n`);
    await mongoose.disconnect();
    return;
  }

  console.log(`\nSeeding up to ${perCollection} rows per collection…`);
  let total = 0;
  for (const name of COLLECTIONS) {
    try {
      total += await seedCollection(name, perCollection, dryRun);
    } catch (err) {
      // One collection failing (a validator this clone cannot satisfy, say)
      // must not abandon the rest of the seed half-finished.
      console.warn(`  ! ${name}: ${err?.message || err}`);
    }
  }

  console.log(
    dryRun ? `\nWould seed ${total} demo rows. Nothing written.\n` : `\nSeeded ${total} demo rows.\n`,
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[seed-demo-data] failed:", err);
  process.exit(1);
});
