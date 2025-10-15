import "dotenv/config";
import bcrypt from "bcryptjs";
import { connectDB } from "../db.js";
import { User } from "../models/User.js";

const email = process.argv[2];
const newPass = process.argv[3];

if (!email || !newPass) {
  console.log("Usage: node scripts/resetPassword.js <email> <newPassword>");
  process.exit(1);
}

await connectDB(process.env.MONGO_URI);

const u = await User.findOne({ email });
if (!u) {
  console.log("User not found");
  process.exit(1);
}

u.passwordHash = await bcrypt.hash(newPass, 10);
u.password = undefined;
await u.save();

console.log("Password reset OK for:", email);
process.exit(0);
