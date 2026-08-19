// Renames labour rates in the master library, carrying every reference with them.
//
// Why this needs a script rather than an edit: LabourName is a KEY, not a label.
// Three separate things match on it by exact string, and each fails silently in
// its own way if a rename lands in one place and not the others.
//
//   1. The master collection itself, one row per name per zone/state.
//   2. RateGenLibrary.priceOverrides, matched on `name|unit` lowercased. An
//      orphaned override never matches again, so a user's own price quietly
//      reverts to the master figure with nothing on screen to say so.
//   3. The desktop's rate build-ups, which call GetLabourRate(name) and get 0
//      back on a miss. A renamed rate prices its build-up at zero in silence.
//
// (3) lives in the desktop repo and is changed alongside this; this script
// handles (1) and (2), which are the ones holding live user data.
//
// Usage:
//   node server/scripts/rename-labour-rates.mjs                 # dry run, changes nothing
//   node server/scripts/rename-labour-rates.mjs --apply         # rename, after a backup
//   node server/scripts/rename-labour-rates.mjs --restore <backup.json>

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";

const HERE = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(HERE, "..", ".env") });

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const restoreAt = args.indexOf("--restore");
const RESTORE_FILE = restoreAt >= 0 ? args[restoreAt + 1] : null;

// Spelling only. "whelled" is not a word, and a pneumatic roller runs on tyres.
// Deliberately NOT touching "Static steel wheeled roller - (2.7 to 6 tonnes)":
// that one is spelled correctly and its stray dash is a formatting question, not
// a spelling one, so it is left for a separate decision.
const RENAMES = {
  "Vibratory whelled roller (8 to 10 tons)": "Vibratory wheeled roller (8 to 10 tons)",
  "Vibratory whelled roller (10 to 20 tons)": "Vibratory wheeled roller (10 to 20 tons)",
  "Pneumatic tired roller (2.7 to 10 tonnes)": "Pneumatic tyred roller (2.7 to 10 tonnes)",
  "Pneumatic tired roller (10 to 20 tonnes)": "Pneumatic tyred roller (10 to 20 tonnes)",
  "Pneumatic tired roller (20 to 31.8 tonnes)": "Pneumatic tyred roller (20 to 31.8 tonnes)",
};

const uri = process.env.RATEGEN_MONGO_URI || process.env.MONGO_URI || "";
if (!uri) {
  console.error("RATEGEN_MONGO_URI or MONGO_URI is not set. Nothing to connect to.");
  process.exit(1);
}
const rateDbName = process.env.RATEGEN_DB || "ADLMRateDB";
const labColl = process.env.RATEGEN_LAB_COLLECTION || "labours";

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });

async function main() {
  await client.connect();
  const labs = client.db(rateDbName).collection(labColl);

  // priceOverrides live on the AUTH database, which db.js names explicitly via
  // AUTH_DB (default "adlmWeb"). It is NOT the connection string's default
  // database — that is "test" here, where the collection does not exist, so
  // reading it would report zero overrides and quietly orphan every real one.
  const appDb = client.db(process.env.AUTH_DB || "adlmWeb");
  const libs = appDb.collection("rategenlibraries");

  console.log(`rates      : ${rateDbName}.${labColl}`);
  console.log(`user libs  : ${appDb.databaseName}.rategenlibraries\n`);

  if (RESTORE_FILE) return restore(labs, libs);

  const olds = Object.keys(RENAMES);

  const rateDocs = await labs
    .find({ LabourName: { $in: olds } }, { projection: { LabourName: 1 } })
    .toArray();

  const libDocs = await libs
    .find({ "priceOverrides.name": { $in: olds } }, { projection: { priceOverrides: 1 } })
    .toArray();

  let ovCount = 0;
  for (const d of libDocs) {
    for (const o of d.priceOverrides || []) {
      if (o.kind === "labour" && olds.includes(o.name)) ovCount++;
    }
  }

  console.log("rename plan:");
  for (const [from, to] of Object.entries(RENAMES)) {
    const n = rateDocs.filter((d) => d.LabourName === from).length;
    console.log(`   ${String(n).padStart(4)} rows   ${from}`);
    console.log(`               -> ${to}`);
  }
  console.log(`\n${rateDocs.length} rate rows to rename`);
  console.log(`${ovCount} user price override(s) across ${libDocs.length} library/libraries to carry over`);

  // A name nobody carries is a sign the map is stale — say so rather than
  // reporting a clean run that did nothing.
  const missing = olds.filter((o) => !rateDocs.some((d) => d.LabourName === o));
  if (missing.length) {
    console.log(`\nNOT FOUND in the master library (already renamed, or misspelt here):`);
    for (const m of missing) console.log(`   ${m}`);
  }

  if (!rateDocs.length && !ovCount) {
    console.log("\nNothing to do.");
    return;
  }

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to write these.");
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = path.join(HERE, `rename-labour-rates.backup.${stamp}.json`);
  fs.writeFileSync(
    backup,
    JSON.stringify(
      {
        renames: RENAMES,
        rateIds: rateDocs.map((d) => ({ _id: String(d._id), LabourName: d.LabourName })),
        libraryIds: libDocs.map((d) => String(d._id)),
      },
      null,
      2
    )
  );
  console.log(`\nbacked up to ${backup}`);

  let renamedRates = 0;
  for (const [from, to] of Object.entries(RENAMES)) {
    const r = await labs.updateMany({ LabourName: from }, { $set: { LabourName: to } });
    renamedRates += r.modifiedCount;
  }
  console.log(`renamed ${renamedRates} rate rows`);

  // Positional filtered update, so only the labour override with that exact name
  // moves and a material sharing the name is left alone.
  let renamedOverrides = 0;
  for (const [from, to] of Object.entries(RENAMES)) {
    const r = await libs.updateMany(
      { priceOverrides: { $elemMatch: { kind: "labour", name: from } } },
      { $set: { "priceOverrides.$[o].name": to } },
      { arrayFilters: [{ "o.kind": "labour", "o.name": from }] }
    );
    renamedOverrides += r.modifiedCount;
  }
  console.log(`updated ${renamedOverrides} user library document(s)`);
}

async function restore(labs, libs) {
  const data = JSON.parse(fs.readFileSync(RESTORE_FILE, "utf8"));
  const pairs = Object.entries(data.renames);
  console.log(`reversing ${pairs.length} rename(s) from ${RESTORE_FILE}`);

  if (!APPLY) {
    console.log("Dry run. Add --apply to write the restore.");
    return;
  }

  for (const [from, to] of pairs) {
    await labs.updateMany({ LabourName: to }, { $set: { LabourName: from } });
    await libs.updateMany(
      { priceOverrides: { $elemMatch: { kind: "labour", name: to } } },
      { $set: { "priceOverrides.$[o].name": from } },
      { arrayFilters: [{ "o.kind": "labour", "o.name": to }] }
    );
  }
  console.log("reversed");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => client.close());
