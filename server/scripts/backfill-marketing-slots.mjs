// Give existing marketing rows the slot they are already showing in.
//
// The Marketing screen asks where a thing appears on the website. The field is
// new, so every existing row had no answer and the screen would have said
// "nowhere" about items that are on the site right now — which is worse than
// no column at all, because it is confidently wrong.
//
// The backfill is not a guess. Each collection already renders in exactly one
// place today, and this writes that place down:
//
//   IndustryLeader  → /testimonials, via TestInd   (reads /showcase/industry-leaders)
//   TrainedCompany  → /testimonials, via TestComp  (reads /showcase/companies)
//   Testimonial     → /testimonials, via TestUser  (reads /showcase/testimonials)
//   Freebie         → the members' freebies page
//   Flyer           → training artwork, the only built flyer slot
//
// Only rows with no slot are touched, so running it twice changes nothing and
// an admin's later choice is never overwritten.
//
//   node scripts/backfill-marketing-slots.mjs          # say what it would do
//   node scripts/backfill-marketing-slots.mjs --write  # do it

import "dotenv/config";
import mongoose from "mongoose";
import { IndustryLeader, TrainedCompany, Testimonial } from "../models/Showcase.js";
import { Freebie } from "../models/Freebie.js";
import { Flyer } from "../models/Flyer.js";

const WRITE = process.argv.includes("--write");

const PLAN = [
  [IndustryLeader, "testimonials-leaders", "industry leaders"],
  [TrainedCompany, "testimonials-companies", "trained companies"],
  [Testimonial, "testimonials-people", "what people said"],
  [Freebie, "members-freebies", "members' downloads"],
  [Flyer, "events-art", "training artwork"],
];

await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.AUTH_DB || "adlmWeb" });
console.log(`${WRITE ? "Writing" : "Dry run"} — database ${mongoose.connection.name}\n`);

let total = 0;
for (const [Model, slot, what] of PLAN) {
  const q = { $or: [{ slot: { $exists: false } }, { slot: "" }, { slot: null }] };
  const n = await Model.countDocuments(q);
  total += n;
  console.log(`  ${String(n).padStart(3)}  ${Model.modelName.padEnd(16)} → ${slot}  (${what})`);
  if (WRITE && n) await Model.updateMany(q, { $set: { slot } });
}

console.log(
  `\n${total} row${total === 1 ? "" : "s"} ${WRITE ? "updated" : "would be updated"}.` +
    (WRITE ? "" : "  Re-run with --write to apply."),
);
await mongoose.disconnect();
