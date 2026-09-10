// Give every certificate already issued the reference it is going to be
// verified by.
//
// certificateRef was added with the Certificates screen. Every certificate
// issued before that has none, and without one GET /verify/:ref finds nothing
// — so the reference the register prints would be a reference that does not
// verify, which is worse than having no verify page at all.
//
// The reference is derived from the record's own id, deterministically, and it
// is the same formula the registers already display. So this writes down what
// was already true rather than assigning anything new, and running it twice
// changes nothing.
//
//   node scripts/backfill-certificate-refs.mjs --dry
//   node scripts/backfill-certificate-refs.mjs

import "dotenv/config";
import mongoose from "mongoose";

const DRY = process.argv.includes("--dry");

await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.AUTH_DB || "adlmWeb" });

const { CourseEnrollment } = await import("../models/CourseEnrollment.js");

const refFor = (id) => `CERT-${String(id).slice(-6).toUpperCase()}`;

const rows = await CourseEnrollment.find({
  certificateIssuedAt: { $ne: null },
  $or: [{ certificateRef: "" }, { certificateRef: { $exists: false } }],
})
  .select("_id email courseSku certificateState")
  .lean();

console.log(DRY ? "DRY RUN — nothing was written\n" : "");
console.log(`${rows.length} certificate(s) without a reference\n`);

// A collision would mean two certificates verifying as one another, so it is
// checked rather than assumed — six hex characters is 16 million, and the
// arithmetic being comfortable is not the same as it being right.
const seen = new Map();
const clashes = [];
for (const r of rows) {
  const ref = refFor(r._id);
  if (seen.has(ref)) clashes.push([ref, seen.get(ref), String(r._id)]);
  seen.set(ref, String(r._id));
}

const existing = await CourseEnrollment.find({ certificateRef: { $nin: ["", null] } })
  .select("_id certificateRef")
  .lean();
for (const e of existing) {
  if (seen.has(e.certificateRef) && seen.get(e.certificateRef) !== String(e._id)) {
    clashes.push([e.certificateRef, String(e._id), seen.get(e.certificateRef)]);
  }
}

if (clashes.length) {
  console.log("STOPPED — these references would collide:");
  for (const [ref, a, b] of clashes) console.log(`  ${ref}  ${a}  ${b}`);
  console.log("\nNothing was written. The reference formula needs more characters.");
  await mongoose.disconnect();
  process.exit(1);
}

let did = 0;
for (const r of rows) {
  const ref = refFor(r._id);
  console.log(`  ${ref}  ${r.email || "(no email)"}  ${r.courseSku || ""}`);
  if (DRY) continue;
  await CourseEnrollment.updateOne(
    { _id: r._id },
    {
      $set: {
        certificateRef: ref,
        // Every one of these was issued the normal way, by passing. Anything
        // else would have been set deliberately and is not in this list.
        certificateState: r.certificateState || "issued",
      },
    },
  );
  did += 1;
}

console.log(DRY ? "\nnothing written" : `\n${did} reference(s) written`);
await mongoose.disconnect();
