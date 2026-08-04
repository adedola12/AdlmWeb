// Sets up the ADLM Time Pro product record for paid subscriptions.
//
// PRODUCT NAMING — read before editing:
//   This is ADLM Time Pro. It is NOT ADLM QS Takeoff, which is a separate
//   product that has not launched and must not be published by this script.
//   The record's `key` is "qs-takeoff" purely for historical reasons: the app
//   shipped as the free "ADLM Time Manager" under that key, and the paid
//   rollout deliberately kept it so existing installs and device bindings
//   carry over. See ADLMInstallerHub/Docs/TimePro-Paid-Setup-Runbook.md.
//   When the real QS Takeoff ships it will need a different key.
//
// Pricing per that runbook: NGN 2,000/month, NGN 20,000/year.
//
// One record drives three surfaces, because they all read this collection:
//   - the website product page at /product/qs-takeoff, so users can subscribe
//   - the InstallerHub admin Product dropdown (GET /admin/products)
//   - the /me/entitlements check the desktop app enforces at sign-in
//
// Usage:
//   node server/scripts/seed-timepro-product.mjs            # create/update, unpublished
//   node server/scripts/seed-timepro-product.mjs --publish  # and make it live
//
// Override pricing if it has changed since the runbook:
//   TIMEPRO_MONTHLY_NGN=2500 TIMEPRO_YEARLY_NGN=25000 node ... --publish
//
// NOTE: this script does NOT unpublish the old free "ADLM Time Manager"
// freebie entry. While that stays published the Hub keeps offering the app
// free regardless of price — see Part B step 3 of the runbook.

import "dotenv/config";
import { connectDB } from "../db.js";
import { Product } from "../models/Product.js";

// Historical key — see the naming note above. Not a product name.
const PRODUCT_KEY = "qs-takeoff";
const PRODUCT_NAME = "ADLM Time Pro";

const MONTHLY_NGN = Number(process.env.TIMEPRO_MONTHLY_NGN || 2000);
const YEARLY_NGN = Number(process.env.TIMEPRO_YEARLY_NGN || 20000);
const SIX_MONTH_NGN = Number(process.env.TIMEPRO_SIX_MONTH_NGN || 0);
const INSTALL_NGN = Number(process.env.TIMEPRO_INSTALL_NGN || 0);

const publish = process.argv.includes("--publish");

if (MONTHLY_NGN <= 0 && YEARLY_NGN <= 0 && SIX_MONTH_NGN <= 0) {
  console.error("Refusing to seed a paid product with no price.");
  process.exit(1);
}

await connectDB(process.env.MONGO_URI);

const fields = {
  key: PRODUCT_KEY,
  name: PRODUCT_NAME,
  blurb: "Site time management and productivity tracking for construction teams.",
  description:
    "ADLM Time Pro records labour tasks on site, tracks productivity against " +
    "planned output, and exports to Excel and MS Project. Timesheets sync to " +
    "your ADLM account so the same data is available on every machine you " +
    "sign in from.",
  features: [
    "Log labour tasks against trades and activities",
    "Productivity summaries by task and period",
    "Weather-aware site records",
    "Export to Excel and MS Project",
    "Cloud sync across your devices",
  ],
  billingInterval: "monthly",
  isCourse: false,
  price: {
    monthlyNGN: MONTHLY_NGN,
    yearlyNGN: YEARLY_NGN,
    sixMonthNGN: SIX_MONTH_NGN,
    installNGN: INSTALL_NGN,
  },
  isComingSoon: false,
};

const existing = await Product.findOne({ key: PRODUCT_KEY });

if (existing) {
  // Never silently flip a live product's visibility: only --publish sets it.
  Object.assign(existing, fields);
  if (publish) existing.isPublished = true;
  await existing.save();
  console.log(`Updated product '${PRODUCT_KEY}' -> ${PRODUCT_NAME}.`);
} else {
  await Product.create({ ...fields, isPublished: publish });
  console.log(`Created product '${PRODUCT_KEY}' -> ${PRODUCT_NAME}.`);
}

const saved = await Product.findOne({ key: PRODUCT_KEY }).lean();
console.log(`  name      : ${saved.name}`);
console.log(`  published : ${saved.isPublished}`);
console.log(`  monthly   : NGN ${saved.price?.monthlyNGN ?? 0}`);
console.log(`  yearly    : NGN ${saved.price?.yearlyNGN ?? 0}`);
console.log("");
console.log("Remaining manual step (runbook Part B step 3): unpublish the free");
console.log("'ADLM Time Manager' freebie, or the Hub keeps offering it for free.");

process.exit(0);
