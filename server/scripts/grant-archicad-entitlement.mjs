// Grants an active "archicad" entitlement to a user account.
// Usage: node server/scripts/grant-archicad-entitlement.mjs <email>
import "dotenv/config";
import { connectDB } from "../db.js";
import { User } from "../models/User.js";

const email = process.argv[2];
if (!email) {
  console.error("Usage: node grant-archicad-entitlement.mjs <email>");
  process.exit(1);
}

await connectDB(process.env.MONGO_URI);
const user = await User.findOne({ email: email.toLowerCase() });
if (!user) {
  console.error(`User not found: ${email}`);
  process.exit(1);
}

const existing = (user.entitlements || []).find(
  (e) => String(e.productKey).toLowerCase() === "archicad"
);
if (existing) {
  existing.status = "active";
  existing.expiresAt = undefined;
} else {
  user.entitlements.push({ productKey: "archicad", status: "active", seats: 1 });
}
await user.save();

console.log(`Granted: archicad entitlement active for ${user.email}`);
console.log(`  isGod flag: ${user.isGod === true}`);
console.log(`  entitlements: ${user.entitlements.map((e) => `${e.productKey}:${e.status}`).join(", ")}`);
process.exit(0);
