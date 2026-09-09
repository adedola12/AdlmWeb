// Attach the pictures taken out of the Dutum proposal to the records they
// actually belong to.
//
// Idempotent: every write is keyed and re-running changes nothing. Run with
// --dry to see what it would do.
//
//   node scripts/seed-proposal-assets.mjs --dry
//   node scripts/seed-proposal-assets.mjs
//
// WHAT THIS DOES NOT DO, AND WHY
//
// Events were on the list and need nothing: all 30 trainings already carry
// images. Seeding there would have meant inventing events that never ran, or
// overwriting real artwork with worse.
//
// Two products are left without an image on purpose. RateGen is a rate
// library and Time Pro is a programme tool, and nothing in that deck shows
// either of them. Hanging a Revit screenshot on RateGen would fill the gap
// and mislead the buyer, which is worse than the gap.

import "dotenv/config";
import mongoose from "mongoose";

const DRY = process.argv.includes("--dry");

await mongoose.connect(process.env.MONGO_URI, {
  dbName: process.env.AUTH_DB || "adlmWeb",
});

const { IndustryLeader } = await import("../models/Showcase.js");
const { Product } = await import("../models/Product.js");
const { Training } = await import("../models/Training.js");

const did = [];
const skipped = [];

/* ── partners ──────────────────────────────────────────────────────────── */

// The NIQS is the professional body this studio trains for and exhibits at,
// which makes it the one partner logo that is genuinely ours to show.
const NIQS = {
  name: "Nigerian Institute of Quantity Surveyors",
  code: "NIQS",
  logoUrl: "/adlm/partners/niqs-stand.jpg",
  website: "https://niqs.org.ng",
  featured: true,
  slot: "testimonials-leaders",
};

const already = await IndustryLeader.findOne({ code: "NIQS" }).lean();
if (already) {
  skipped.push("partner NIQS — already there");
} else if (DRY) {
  did.push(`partner NIQS would be added (${NIQS.logoUrl})`);
} else {
  await IndustryLeader.create(NIQS);
  did.push(`partner NIQS added (${NIQS.logoUrl})`);
}

/* ── products ──────────────────────────────────────────────────────────── */

// Only where the picture is honestly of that product.
const PRODUCT_IMAGES = [
  { key: "mep", image: "/adlm/product/model-revit.jpg", why: "a Revit model, which is what the MEP plugin works inside" },
];

for (const row of PRODUCT_IMAGES) {
  const p = await Product.findOne({ key: row.key }).select("key name images thumbnailUrl").lean();
  if (!p) {
    skipped.push(`product ${row.key} — no such product`);
    continue;
  }
  if ((p.images || []).includes(row.image)) {
    skipped.push(`product ${row.key} — already has it`);
    continue;
  }
  if (DRY) {
    did.push(`product ${row.key} would gain ${row.image} — ${row.why}`);
    continue;
  }
  await Product.updateOne(
    { _id: p._id },
    {
      $addToSet: { images: row.image },
      // Only fills a gap; a product that already has a thumbnail keeps it.
      ...(p.thumbnailUrl ? {} : { $set: { thumbnailUrl: row.image } }),
    },
  );
  did.push(`product ${row.key} gained ${row.image}`);
}

/* ── what was left alone ───────────────────────────────────────────────── */

const trainings = await Training.countDocuments();
const withArt = await Training.countDocuments({ imageUrls: { $exists: true, $ne: [] } });
const bare = await Product.find({ $or: [{ images: { $size: 0 } }, { images: { $exists: false } }] })
  .select("key")
  .lean();

console.log(DRY ? "DRY RUN — nothing was written\n" : "");
for (const d of did) console.log("  did     ", d);
for (const s of skipped) console.log("  skipped ", s);

console.log(`\n  events   ${withArt} of ${trainings} trainings already carry artwork — nothing to seed`);
if (bare.length) {
  console.log(
    `  still bare: ${bare.map((b) => b.key).join(", ")} — nothing in that deck shows them, ` +
      `and a wrong picture is worse than none`,
  );
}

// A hotlink to somebody else's CDN is a logo that will vanish without notice.
const hotlinked = await IndustryLeader.find({ logoUrl: /^https?:\/\/(?!adlmstudio)/ })
  .select("name logoUrl")
  .lean();
for (const h of hotlinked) {
  console.log(`\n  WARNING  ${h.name}'s logo is hotlinked from ${new URL(h.logoUrl).host}`);
  console.log("           It is not ours, it can disappear, and it may not be licensed.");
}

await mongoose.disconnect();
