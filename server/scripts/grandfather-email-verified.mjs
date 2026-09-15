// Treat every account that existed before verification did as verified.
//
// WHY THIS HAS TO RUN WITH THE FEATURE, NOT AFTER IT
//
// `emailVerified` defaults to false, so the moment the gate goes live every
// account already on the system reads as unverified — 485 of them — and every
// one is refused at checkout. They have been buying, renewing and raising
// tickets for months; the address is as proved as it is going to get.
//
// The gate is for people signing up from now on. This draws the line.
//
// WHO IS DELIBERATELY LEFT ALONE
//
// Accounts created in the last hour, in case this is run while somebody is
// mid-signup and genuinely has an unconfirmed address. A person who has to
// confirm twice is a small annoyance; letting an unconfirmed address through
// because a script was run at the wrong moment is the thing the gate exists
// to stop.
//
//   node scripts/grandfather-email-verified.mjs          # say what it would do
//   node scripts/grandfather-email-verified.mjs --write  # do it

import "dotenv/config";
import mongoose from "mongoose";
import { User } from "../models/User.js";

const WRITE = process.argv.includes("--write");
const HOUR = 60 * 60 * 1000;
const cutoff = new Date(Date.now() - HOUR);

await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.AUTH_DB || "adlmWeb" });
console.log(`${WRITE ? "Writing" : "Dry run"} — database ${mongoose.connection.name}\n`);

const q = {
  $and: [
    { $or: [{ emailVerified: { $exists: false } }, { emailVerified: false }] },
    { $or: [{ createdAt: { $lt: cutoff } }, { createdAt: { $exists: false } }] },
  ],
};

const [total, toMark, recent] = await Promise.all([
  User.estimatedDocumentCount(),
  User.countDocuments(q),
  User.countDocuments({ createdAt: { $gte: cutoff } }),
]);

console.log(`  ${String(total).padStart(4)}  accounts in total`);
console.log(`  ${String(toMark).padStart(4)}  to be marked verified (existed before the gate)`);
console.log(`  ${String(recent).padStart(4)}  created in the last hour — left alone deliberately\n`);

if (WRITE && toMark) {
  const r = await User.updateMany(q, {
    $set: { emailVerified: true, emailVerifiedAt: new Date() },
  });
  console.log(`${r.modifiedCount} marked verified.`);
} else if (!WRITE) {
  console.log("Re-run with --write to apply.");
} else {
  console.log("Nothing to do.");
}

await mongoose.disconnect();
