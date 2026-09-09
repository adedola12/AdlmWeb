import "dotenv/config";
import mongoose from "mongoose";
const uri = process.env.MONGO_URI;
await mongoose.connect(uri, { dbName: process.env.DB_NAME || "adlmWeb" });
const users = mongoose.connection.collection("users");
const q = { $or: [ { email: /ysa/i }, { username: /ysa/i }, { firstName: /innocent/i }, { username: /innocent/i }, { email: /innocent/i }, { lastName: /innocent/i } ] };
const rows = await users.find(q, { projection: { email:1, username:1, firstName:1, lastName:1, role:1, createdAt:1, entitlements:1, refreshVersion:1, deletedAt:1, disabled:1, suspended:1 } }).limit(20).toArray();
for (const u of rows) {
  const ents = u.entitlements || [];
  const json = JSON.stringify(u);
  console.log({ _id: String(u._id), email: u.email, username: u.username, first: u.firstName, role: u.role, createdAt: u.createdAt, refreshVersion: u.refreshVersion, entCount: ents.length, docBytes: json.length, devices: ents.map(e => (e.devices||[]).length), keys: ents.map(e=>e.productKey), statuses: ents.map(e=>e.status), expires: ents.map(e=>e.expiresAt) });
}
await mongoose.disconnect();
