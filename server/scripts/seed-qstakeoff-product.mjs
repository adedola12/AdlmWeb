// Sets up the ADLM QS Takeoff product record (product key "qstakeoff").
//
// PRODUCT NAMING — read before editing:
//   This is ADLM QS Takeoff, the standalone take-off app (source/repos/QSApp):
//   PDF, CAD, scanned drawings and IFC models in; quantities and a material
//   schedule out; saved to the ADLM Cloud. It is NOT ADLM Time Pro, whose
//   record keeps the historical key "qs-takeoff" (see seed-timepro-product.mjs).
//   Adedolapo chose the separate key "qstakeoff" on 7 Oct 2026.
//
// The key is what the app saves projects under: /projects/qstakeoff (and the
// per-discipline IFC uploads the website's model viewer reads). The projects
// routes accept any product key; a user can save once they hold a live
// entitlement for "qstakeoff".
//
// The price is not decided yet, so by default this creates the record
// UNPUBLISHED and "coming soon": nobody can buy it, but staff can grant it from
// the admin entitlements screen to test cloud save. --publish is refused until
// a price is given.
//
// Usage (from server/; local dev shares the production cluster):
//   node scripts/seed-qstakeoff-product.mjs                 # dry run
//   node scripts/seed-qstakeoff-product.mjs --apply         # create/update, unpublished
//   QSTAKEOFF_MONTHLY_NGN=... QSTAKEOFF_YEARLY_NGN=... node scripts/seed-qstakeoff-product.mjs --apply --publish

import "dotenv/config";
import { connectDB } from "../db.js";
import { Product } from "../models/Product.js";

const PRODUCT_KEY = "qstakeoff";
const PRODUCT_NAME = "ADLM QS Takeoff";

const MONTHLY_NGN = Number(process.env.QSTAKEOFF_MONTHLY_NGN || 0);
const YEARLY_NGN = Number(process.env.QSTAKEOFF_YEARLY_NGN || 0);
const SIX_MONTH_NGN = Number(process.env.QSTAKEOFF_SIX_MONTH_NGN || 0);

const apply = process.argv.includes("--apply");
const publish = process.argv.includes("--publish");

if (publish && MONTHLY_NGN <= 0 && YEARLY_NGN <= 0 && SIX_MONTH_NGN <= 0) {
  console.error("Refusing to publish QS Takeoff with no price. Set QSTAKEOFF_MONTHLY_NGN / QSTAKEOFF_YEARLY_NGN.");
  process.exit(1);
}

const fields = {
  key: PRODUCT_KEY,
  name: PRODUCT_NAME,
  blurb: "Quantity take-off from PDF, CAD, scanned drawings and IFC models, saved to the ADLM Cloud.",
  description:
    "ADLM QS Takeoff measures quantities from PDF drawings, CAD files, scanned " +
    "drawings and IFC models. Several discipline models can be merged and " +
    "aligned, and the take-off and material schedule are saved to your ADLM " +
    "account with the model, so you can continue on the web.",
  features: [
    "PDF, CAD, scanned drawings and IFC in one app",
    "Merge architectural, structural and MEP IFC models",
    "Automatic alignment and duplicate removal",
    "Bill of quantities and material schedule",
    "Save to the ADLM Cloud with a web model view",
  ],
  billingInterval: "monthly",
  isCourse: false,
  price: { monthlyNGN: MONTHLY_NGN, yearlyNGN: YEARLY_NGN, sixMonthNGN: SIX_MONTH_NGN, installNGN: 0 },
  isComingSoon: !publish,
};

await connectDB(process.env.MONGO_URI);
const existing = await Product.findOne({ key: PRODUCT_KEY });
console.log(`${existing ? "Update" : "Create"} product '${PRODUCT_KEY}' -> ${PRODUCT_NAME}` +
            ` (${publish ? "published" : existing ? `published stays ${existing.isPublished}` : "unpublished, coming soon"})${apply ? "" : " [dry run]"}`);

if (!apply) {
  console.log("Dry run. Re-run with --apply to write (this is the production database).");
  process.exit(0);
}

if (existing) {
  // Never silently flip a live product's visibility: only --publish sets it.
  Object.assign(existing, fields);
  if (publish) existing.isPublished = true;
  await existing.save();
} else {
  await Product.create({ ...fields, isPublished: publish });
}

const saved = await Product.findOne({ key: PRODUCT_KEY }).lean();
console.log(`  name        : ${saved.name}`);
console.log(`  published   : ${saved.isPublished}`);
console.log(`  coming soon : ${saved.isComingSoon}`);
console.log(`  monthly     : NGN ${saved.price?.monthlyNGN ?? 0}`);
console.log(`  yearly      : NGN ${saved.price?.yearlyNGN ?? 0}`);
process.exit(0);
