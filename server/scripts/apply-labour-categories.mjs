// Gives every labour and plant rate a specific category, replacing the three
// coarse buckets the master library has carried so far.
//
// Why this exists: RateGen's labour library sorted 84 rates into "Labour",
// "Plant" and "Small Plant" and nothing finer, so the category filter in the
// desktop could only ever narrow 84 rows to 41. Materials next to it are
// categorised properly ("MEP - Electrical - Cables & Wiring (installed)"), so
// the labour side looked unfinished by comparison.
//
// The new categories REFINE the old ones rather than re-cut them: everything
// that was "Plant" stays under "Plant - ...", and likewise for the other two.
// Nothing changes zone, price, name or unit — only LabourCategory.
//
// The desktop builds its filter list from whatever distinct categories the data
// carries, so it needs no release to show these; users get them on their next
// cloud sync.
//
// Matching is by LabourName across EVERY document, because the master library
// holds one row per name per zone/state. A name priced in six zones is six
// documents and all six need the same category.
//
// Usage:
//   node server/scripts/apply-labour-categories.mjs                    # dry run, changes nothing
//   node server/scripts/apply-labour-categories.mjs --apply            # write, after taking a backup
//   node server/scripts/apply-labour-categories.mjs --restore <backup.json>

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";

// Load server/.env no matter which directory this is run from — the usage line
// above runs it from the repo root, where `dotenv/config` would find nothing.
const HERE = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(HERE, "..", ".env") });

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const restoreAt = args.indexOf("--restore");
const RESTORE_FILE = restoreAt >= 0 ? args[restoreAt + 1] : null;

const MAP_FILE = path.join(HERE, "labour-categories.json");

const uri = process.env.RATEGEN_MONGO_URI || process.env.MONGO_URI || "";
if (!uri) {
  console.error("RATEGEN_MONGO_URI or MONGO_URI is not set. Nothing to connect to.");
  process.exit(1);
}
const dbName = process.env.RATEGEN_DB || "ADLMRateDB";
const collName = process.env.RATEGEN_LAB_COLLECTION || "labours";

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });

async function main() {
  await client.connect();
  const coll = client.db(dbName).collection(collName);
  console.log(`db ${dbName}, collection ${collName}\n`);

  if (RESTORE_FILE) return restore(coll);

  const mapping = JSON.parse(fs.readFileSync(MAP_FILE, "utf8"));
  const docs = await coll
    .find({}, { projection: { LabourName: 1, LabourCategory: 1, zone: 1, state: 1 } })
    .limit(50000)
    .toArray();

  console.log(`${docs.length} labour documents in the collection`);

  // A name the map does not know is left completely alone. Report it rather than
  // guessing: another zone may carry rates this map was never built against.
  const unmapped = new Map();
  const changes = [];

  for (const d of docs) {
    const name = String(d.LabourName || "");
    const next = mapping[name];
    if (!next) {
      unmapped.set(name, (unmapped.get(name) || 0) + 1);
      continue;
    }
    const current = String(d.LabourCategory || "");
    if (current === next) continue;
    changes.push({ _id: d._id, name, from: current, to: next });
  }

  const distinctChanged = new Set(changes.map((c) => c.name));
  console.log(`${changes.length} documents to update, across ${distinctChanged.size} distinct names`);

  if (unmapped.size) {
    console.log(`\n${unmapped.size} name(s) are NOT in the map and stay as they are:`);
    for (const [n, k] of [...unmapped].sort((a, b) => b[1] - a[1])) {
      console.log(`   ${String(k).padStart(4)}x  ${n}`);
    }
    console.log("   Add them to labour-categories.json to include them.");
  }

  const summary = new Map();
  for (const c of changes) {
    const key = `${c.from || "(blank)"}  ->  ${c.to}`;
    summary.set(key, (summary.get(key) || 0) + 1);
  }
  console.log("\nchanges by category:");
  for (const [k, v] of [...summary].sort()) console.log(`   ${String(v).padStart(5)}  ${k}`);

  if (!changes.length) {
    console.log("\nNothing to do.");
    return;
  }

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to write these.");
    return;
  }

  // Every previous value, so --restore can put the collection back exactly.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = path.join(HERE, `labour-categories.backup.${stamp}.json`);
  fs.writeFileSync(
    backup,
    JSON.stringify(changes.map((c) => ({ _id: String(c._id), LabourCategory: c.from })), null, 2)
  );
  console.log(`\nbacked up ${changes.length} previous values to ${backup}`);

  const ops = changes.map((c) => ({
    updateOne: { filter: { _id: c._id }, update: { $set: { LabourCategory: c.to } } },
  }));
  const res = await coll.bulkWrite(ops, { ordered: false });
  console.log(`updated ${res.modifiedCount} documents`);
}

async function restore(coll) {
  const rows = JSON.parse(fs.readFileSync(RESTORE_FILE, "utf8"));
  console.log(`restoring ${rows.length} previous values from ${RESTORE_FILE}`);

  if (!APPLY) {
    console.log("Dry run. Add --apply to write the restore.");
    return;
  }

  const { ObjectId } = await import("mongodb");
  const ops = rows.map((r) => ({
    updateOne: {
      filter: { _id: new ObjectId(r._id) },
      update: { $set: { LabourCategory: r.LabourCategory } },
    },
  }));
  const res = await coll.bulkWrite(ops, { ordered: false });
  console.log(`restored ${res.modifiedCount} documents`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => client.close());
