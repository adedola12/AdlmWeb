// server/scripts/backfill-breakdown-refkind.js
//
// One-time backfill: stamp `refKind` (and `priceAsOf`) onto existing
// RateGenRate breakdown lines that predate the provenance fields, so labour vs
// material classification is deterministic across the whole catalogue and each
// stored rate is time-traceable. Idempotent — only fills blanks, so it is safe
// to re-run.
//
// Usage (from the server/ directory, with the same env as the app):
//   node scripts/backfill-breakdown-refkind.js            # apply
//   node scripts/backfill-breakdown-refkind.js --dry      # report only, no writes
//   node scripts/backfill-breakdown-refkind.js --limit 50 # cap docs scanned

import mongoose from "mongoose";
import { ensureDb } from "../db.js";
import { RateGenRate } from "../models/RateGenRate.js";
import { classifyComponentKind } from "../util/rategenUserRates.js";

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const limIdx = args.indexOf("--limit");
const LIMIT = limIdx >= 0 ? Math.max(0, Number(args[limIdx + 1]) || 0) : 0;

async function main() {
  await ensureDb();

  const query = RateGenRate.find({}).sort({ _id: 1 });
  if (LIMIT > 0) query.limit(LIMIT);

  const cursor = query.cursor();

  let scanned = 0;
  let changedDocs = 0;
  let changedLines = 0;
  const kindTally = {};

  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    scanned++;
    let dirty = false;
    const when = doc.updatedAt || doc.createdAt || new Date();

    for (const line of doc.breakdown || []) {
      if (!line) continue;

      if (!line.refKind || String(line.refKind).trim() === "") {
        const name = line.componentName || line.refName || "";
        const kind = classifyComponentKind(name, line.refKind);
        line.refKind = kind;
        kindTally[kind] = (kindTally[kind] || 0) + 1;
        changedLines++;
        dirty = true;
      }

      if (!line.priceAsOf) {
        line.priceAsOf = when;
        dirty = true;
      }
    }

    if (dirty) {
      changedDocs++;
      if (!DRY) {
        doc.markModified("breakdown");
        await doc.save(); // pre-save preserves the provenance fields + re-derives totals
      }
    }
  }

  console.log(
    `${DRY ? "[DRY RUN] " : ""}Scanned ${scanned} rate(s); ` +
      `${DRY ? "would update" : "updated"} ${changedDocs} rate(s) / ${changedLines} breakdown line(s).`
  );
  console.log("refKind assigned:", JSON.stringify(kindTally));

  await mongoose.connection.close();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[backfill-breakdown-refkind] failed:", err);
    process.exit(1);
  });
