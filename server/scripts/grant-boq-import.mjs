// Grants the admin-only "boq-import" feature (Excel BoQ import + the generated
// material & labour schedule) to an account.
//
// The Admin panel is the normal way to do this; this script exists for the
// break-glass case where you need to switch it on without a browser session.
// It applies the SAME eligibility rule the admin endpoint enforces — the
// account must already subscribe to QUIV, Heron or MEP — so a grant made here
// can never be one the UI would have refused.
//
// Usage: node server/scripts/grant-boq-import.mjs <email> [months]
//        node server/scripts/grant-boq-import.mjs <email> --revoke

import "dotenv/config";
import dayjs from "dayjs";
import { connectDB } from "../db.js";
import { User } from "../models/User.js";
import {
  BOQ_IMPORT_ENTITLEMENT,
  BOQ_IMPORT_ENTITLEMENTS,
  BOQ_IMPORT_PRODUCTS,
  isBoqImportEligible,
  subscribedBoqProducts,
  hasBoqImportGrant,
} from "../util/boqImportAccess.js";

const email = String(process.argv[2] || "").toLowerCase();
const revoke = process.argv.includes("--revoke");
const months = Number(process.argv[3]) > 0 ? Number(process.argv[3]) : 12;

if (!email) {
  console.error("Usage: node server/scripts/grant-boq-import.mjs <email> [months|--revoke]");
  process.exit(1);
}

await connectDB(process.env.MONGO_URI);

const user = await User.findOne({ email });
if (!user) {
  console.error(`User not found: ${email}`);
  process.exit(1);
}

if (revoke) {
  const before = (user.entitlements || []).length;
  user.entitlements = (user.entitlements || []).filter(
    (e) => !BOQ_IMPORT_ENTITLEMENTS.includes(e.productKey),
  );
  await user.save();
  console.log(`Revoked ${before - user.entitlements.length} BoQ Import grant(s) from ${email}`);
  process.exit(0);
}

if (!isBoqImportEligible(user)) {
  console.error(
    `${email} has no active QUIV, Heron or MEP subscription — BoQ Import is an ` +
      `add-on to a licence, not a licence of its own. Nothing was changed.`,
  );
  process.exit(1);
}

const expiresAt = dayjs().add(months, "month").toDate();
let ent = (user.entitlements || []).find((e) => e.productKey === BOQ_IMPORT_ENTITLEMENT);
if (ent) {
  ent.status = "active";
  ent.expiresAt = expiresAt;
} else {
  user.entitlements.push({
    productKey: BOQ_IMPORT_ENTITLEMENT,
    status: "active",
    seats: 1,
    licenseType: "personal",
    expiresAt,
  });
}
await user.save();

const products = subscribedBoqProducts(user).map((k) => BOQ_IMPORT_PRODUCTS[k].label);
console.log(`Granted "${BOQ_IMPORT_ENTITLEMENT}" to ${email}`);
console.log(`  expires : ${dayjs(expiresAt).format("YYYY-MM-DD")}`);
console.log(`  grant live: ${hasBoqImportGrant(user)}`);
console.log(`  can import: ${products.length ? products.join(", ") : "(no importable subscription)"}`);
process.exit(0);
