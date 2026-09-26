#!/usr/bin/env node
// server/scripts/erase-takeoff-records.mjs
//
// A "delete my take-off records" request (privacy policy, "Take-off timing"):
// removes a user's Takeoff Time Log sessions and calibration answer while the
// account stays open. Deleting the account itself does this on its own (the
// User model's delete hooks); this script is for the request without that, and
// for an account already removed outside mongoose (Atlas console, mongosh),
// where the hooks did not run: pass --userId then.
//
//   node scripts/erase-takeoff-records.mjs --email someone@firm.com           (dry run: counts only)
//   node scripts/erase-takeoff-records.mjs --email someone@firm.com --apply   (erases)
//   node scripts/erase-takeoff-records.mjs --userId 64f0c2...  --apply
//
// Local dev and production share one Atlas cluster, so --apply is production.
import "dotenv/config";
import mongoose from "mongoose";
import { User } from "../models/User.js";
import { countTakeoffRecords, eraseTakeoffRecords } from "../services/takeoffErasure.js";

const args = {};
const rest = process.argv.slice(2);
for (let i = 0; i < rest.length; i++) {
  const k = rest[i];
  if (!k.startsWith("--")) continue;
  const next = rest[i + 1];
  if (next === undefined || next.startsWith("--")) args[k.slice(2)] = true;
  else args[k.slice(2)] = rest[++i];
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI is not set");
  const email = String(args.email || "").trim().toLowerCase();
  const userIdArg = String(args.userId || "").trim();
  if (!email && !userIdArg) throw new Error("Pass --email or --userId");

  await mongoose.connect(uri, { dbName: process.env.DB_NAME || "adlmWeb" });

  let userId = userIdArg;
  if (email) {
    const u = await User.findOne({ email }).select("_id email").lean();
    if (!u) throw new Error(`No account with email ${email}. If it was already deleted, pass --userId instead.`);
    userId = String(u._id);
  }
  if (!mongoose.isValidObjectId(userId)) throw new Error(`Not a user id: ${userId}`);

  const found = await countTakeoffRecords([userId]);
  console.log(`User ${userId}${email ? ` (${email})` : ""}: ${found.sessions} take-off session(s), ${found.calibrations} calibration answer(s).`);

  if (!args.apply) {
    console.log("Dry run. Re-run with --apply to erase them (this is the production database).");
    return;
  }
  const gone = await eraseTakeoffRecords([userId]);
  console.log(`Erased ${gone.sessions} session(s) and ${gone.calibrations} calibration answer(s).`);
}

main()
  .catch((err) => {
    console.error(err.message || err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect().catch(() => {}));
