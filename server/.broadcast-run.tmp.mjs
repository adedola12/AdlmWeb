// One-off operator runner for the Hub 1.0.2 broadcast.
//
// Uses the same models and mailer the deployed /admin/broadcast endpoints use,
// so the ledger and its idempotency guarantee are identical — this just drives
// them from here instead of over HTTP, because that route needs an admin
// bearer token. Future sends should go through the API.
//
// Secrets are read from SSM into process.env and never printed.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import mongoose from "mongoose";

const P = "/adlm/cloud/prod", R = "eu-west-1";
const ssm = (n) => {
  try {
    return execFileSync("aws", ["ssm", "get-parameter", "--name", `${P}/${n}`, "--with-decryption",
      "--query", "Parameter.Value", "--output", "text", "--region", R],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch { return ""; }
};

for (const k of ["RESEND_API_KEY", "SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_PORT", "EMAIL_FROM"]) {
  const v = ssm(k);
  if (v && v !== "None") process.env[k] = v;
}

const KEY = "hub-v1.0.2-sep2026";
const SUBJECT = "A new Installer Hub is ready";
const HTML = readFileSync(process.argv[2], "utf8");
const mode = process.argv[3] || "preview";
const testTo = process.argv[4] || "";

await mongoose.connect(ssm("MONGO_URI"), {
  dbName: ssm("AUTH_DB") || "adlmWeb",
  serverSelectionTimeoutMS: 20000,
});

const { User } = await import("./models/User.js");
const { Broadcast, BroadcastRecipient, hashRecipient } = await import("./models/Broadcast.js");
const { sendMail } = await import("./util/mailer.js");

// Mirrors audienceQuery("all") in routes/admin.broadcast.js exactly.
const AUDIENCE = {
  email: { $ne: "" },
  emailVerified: true,
  "emailPrefs.marketing": { $ne: false },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (mode === "preview") {
  console.log(`recipients for "all": ${await User.countDocuments(AUDIENCE)}`);
} else if (mode === "test") {
  await sendMail({ to: testTo, subject: `[test] ${SUBJECT}`, html: HTML });
  console.log(`test sent to ${testTo}`);
} else if (mode === "enrol") {
  let b = await Broadcast.findOne({ key: KEY });
  if (!b) b = await Broadcast.create({ key: KEY, subject: SUBJECT, html: HTML, audience: "all", createdBy: "operator-script" });

  let batch = [], enrolled = 0, dup = 0;
  const flush = async () => {
    if (!batch.length) return;
    try { enrolled += (await BroadcastRecipient.insertMany(batch, { ordered: false })).length; }
    catch (e) {
      enrolled += e?.insertedDocs?.length ?? 0;
      const d = (e?.writeErrors || []).filter((x) => (x?.err?.code ?? x?.code) === 11000);
      dup += d.length;
      if ((e?.writeErrors || []).length !== d.length) throw e;
    }
    batch = [];
  };
  for await (const u of User.find(AUDIENCE, { email: 1 }).lean().cursor()) {
    const email = String(u.email || "").trim().toLowerCase();
    if (!email) continue;
    batch.push({ broadcastKey: KEY, userId: u._id, email, emailHash: hashRecipient(email) });
    if (batch.length >= 500) await flush();
  }
  await flush();
  console.log(`enrolled ${enrolled}, already present ${dup}`);
  console.log(`pending: ${await BroadcastRecipient.countDocuments({ broadcastKey: KEY, status: "pending" })}`);
} else if (mode === "send") {
  const b = await Broadcast.findOne({ key: KEY });
  if (!b) throw new Error("enrol first");
  if (b.status === "draft") { b.status = "sending"; b.startedAt = new Date(); await b.save(); }

  let sent = 0, failed = 0;
  for (;;) {
    const due = await BroadcastRecipient.find({ broadcastKey: KEY, status: "pending" }).limit(50).lean();
    if (!due.length) break;
    for (const r of due) {
      // Claim before sending: a crash leaves the row failed, never pending, so
      // a resume cannot mail the same person twice.
      const claim = await BroadcastRecipient.findOneAndUpdate(
        { _id: r._id, status: "pending" },
        { $set: { status: "failed", error: "in flight" }, $inc: { attempts: 1 } },
      );
      if (!claim) continue;
      try {
        await sendMail({ to: r.email, subject: SUBJECT, html: HTML });
        await BroadcastRecipient.updateOne({ _id: r._id }, { $set: { status: "sent", error: "", sentAt: new Date() } });
        sent += 1;
      } catch (err) {
        await BroadcastRecipient.updateOne({ _id: r._id }, { $set: { status: "failed", error: String(err?.message || err).slice(0, 300) } });
        failed += 1;
      }
      await sleep(500);
    }
    console.log(`  progress: sent ${sent}, failed ${failed}`);
  }
  const pending = await BroadcastRecipient.countDocuments({ broadcastKey: KEY, status: "pending" });
  if (!pending) { b.status = "done"; b.finishedAt = new Date(); await b.save(); }
  console.log(`\nDONE  sent ${sent}  failed ${failed}  pending ${pending}`);
}

await mongoose.disconnect();
