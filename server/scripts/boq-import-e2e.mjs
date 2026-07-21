// E2E helper for testing the admin-granted BoQ Import feature locally.
// Temporary tooling — safe to delete after verification.
//
// Usage (from server/):
//   node scripts/boq-import-e2e.mjs setup            → ensure test user exists, list an admin
//   node scripts/boq-import-e2e.mjs mint <email>     → print localStorage "auth" JSON for that user
//   node scripts/boq-import-e2e.mjs status <email>   → entitlements + revit projects for that user
//   node scripts/boq-import-e2e.mjs cleanup          → remove test user's imported projects + grant + user
import "dotenv/config";
import jwt from "jsonwebtoken";
import { connectDB } from "../db.js";
import { User } from "../models/User.js";
import { TakeoffProject } from "../models/TakeoffProject.js";

const TEST_EMAIL = "boq-import-test@adlm.dev";
const cmd = process.argv[2];

await connectDB(process.env.MONGO_URI);

function safeUser(u) {
  return {
    _id: String(u._id),
    id: String(u._id),
    email: u.email,
    name: u.name || u.fullName || "",
    role: u.role || "user",
    entitlements: (u.entitlements || []).map((e) => ({
      productKey: e.productKey,
      status: e.status,
      expiresAt: e.expiresAt || null,
      licenseType: e.licenseType || "personal",
    })),
  };
}

function mintToken(u) {
  return jwt.sign(
    {
      _id: String(u._id),
      id: String(u._id),
      email: u.email,
      role: u.role || "user",
    },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: "2h" },
  );
}

if (cmd === "setup") {
  const admin = await User.findOne({ role: "admin" }).sort({ createdAt: 1 });
  let test = await User.findOne({ email: TEST_EMAIL });
  if (!test) {
    test = await User.create({
      email: TEST_EMAIL,
      name: "BoQ Import Test",
      passwordHash: "not-a-login-password",
      role: "user",
      entitlements: [],
    });
    console.log("created test user");
  }
  console.log(
    JSON.stringify(
      {
        admin: admin ? { _id: String(admin._id), email: admin.email } : null,
        testUser: { _id: String(test._id), email: test.email },
      },
      null,
      2,
    ),
  );
} else if (cmd === "mint") {
  const email = String(process.argv[3] || "").toLowerCase();
  const u = await User.findOne({ email });
  if (!u) throw new Error(`User not found: ${email}`);
  const auth = { user: safeUser(u), accessToken: mintToken(u), licenseToken: null };
  console.log(JSON.stringify(auth));
} else if (cmd === "status") {
  const email = String(process.argv[3] || TEST_EMAIL).toLowerCase();
  const u = await User.findOne({ email });
  if (!u) throw new Error(`User not found: ${email}`);
  const projects = await TakeoffProject.find(
    { userId: u._id },
    { name: 1, productKey: 1, origin: 1, items: 1, budgetItems: 1, customCategories: 1 },
  ).lean();
  console.log(
    JSON.stringify(
      {
        email: u.email,
        entitlements: (u.entitlements || []).map(
          (e) => `${e.productKey}:${e.status}:${e.expiresAt ? new Date(e.expiresAt).toISOString().slice(0, 10) : "-"}`,
        ),
        projects: projects.map((p) => ({
          id: String(p._id),
          name: p.name,
          productKey: p.productKey,
          origin: p.origin,
          items: (p.items || []).length,
          budgetItems: (p.budgetItems || []).length,
          customCategories: p.customCategories || [],
        })),
      },
      null,
      2,
    ),
  );
} else if (cmd === "cleanup") {
  const u = await User.findOne({ email: TEST_EMAIL });
  if (u) {
    const del = await TakeoffProject.deleteMany({ userId: u._id });
    await User.deleteOne({ _id: u._id });
    console.log(`deleted ${del.deletedCount} project(s) and the test user ${TEST_EMAIL}`);
  } else {
    console.log("test user not found — nothing to clean");
  }
} else {
  console.log("commands: setup | mint <email> | status [email] | cleanup");
}
process.exit(0);
