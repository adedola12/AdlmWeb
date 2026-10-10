#!/usr/bin/env node
// server/scripts/seed-prospecting-profiles.mjs
//
// Inserts the starting ideal customer profiles (config/prospectingProfiles.js).
// Insert-only: a profile that already exists is left exactly as an admin
// last edited it.
//
//   node scripts/seed-prospecting-profiles.mjs           dry run, prints what it would do
//   node scripts/seed-prospecting-profiles.mjs --apply   writes
//
// Local dev and production share one Atlas cluster, so --apply is production.
import "dotenv/config";
import mongoose from "mongoose";
import { IdealCustomerProfile } from "../models/IdealCustomerProfile.js";
import { SEED_PROFILES } from "../config/prospectingProfiles.js";

const APPLY = process.argv.includes("--apply");

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI is not set");
  await mongoose.connect(uri, { dbName: process.env.DB_NAME || "adlmWeb" });

  console.log(`Prospecting profiles: ${SEED_PROFILES.length} in the seed${APPLY ? "" : " (dry run)"}`);
  for (const p of SEED_PROFILES) {
    const err = new IdealCustomerProfile(p).validateSync();
    if (err) throw new Error(`Seed profile "${p.key}" is invalid: ${err.message}`);

    const exists = await IdealCustomerProfile.exists({ key: p.key });
    console.log(`  ${exists ? "keep  " : "insert"}  ${p.segment} -> ${p.targetProduct}`);
    if (APPLY && !exists) {
      await IdealCustomerProfile.updateOne({ key: p.key }, { $setOnInsert: p }, { upsert: true, runValidators: true });
    }
  }
  if (!APPLY) console.log("\nDry run. Re-run with --apply to write (this is the production database).");
}

try {
  await main();
} finally {
  await mongoose.disconnect().catch(() => {});
}
