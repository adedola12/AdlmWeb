// Resumes the Hub 1.0.2 broadcast. The ledger means this only ever mails
// people still marked pending, so re-running cannot double-send.
//
// Pacing: Resend rate-limits around 2/sec, and mailer.js treats ANY non-ok
// Resend reply as grounds to fall through to SMTP — whose Gmail credentials
// are rejected (535 BadCredentials). So a single 429 became a hard failure.
// Pace below the limit and retry once, rather than trusting a fallback that
// cannot authenticate.
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
const mode = process.argv[3] || "status";
const LIMIT = Number.parseInt(process.argv[4] || "0", 10) || Infinity;

await mongoose.connect(ssm("MONGO_URI"), { dbName: ssm("AUTH_DB") || "adlmWeb", serverSelectionTimeoutMS: 20000 });
const { BroadcastRecipient } = await import("./models/Broadcast.js");
const { sendMail } = await import("./util/mailer.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const counts = async () => {
  const [total, sent, pending, failed] = await Promise.all([
    BroadcastRecipient.countDocuments({ broadcastKey: KEY }),
    BroadcastRecipient.countDocuments({ broadcastKey: KEY, status: "sent" }),
    BroadcastRecipient.countDocuments({ broadcastKey: KEY, status: "pending" }),
    BroadcastRecipient.countDocuments({ broadcastKey: KEY, status: "failed" }),
  ]);
  return { total, sent, pending, failed };
};

if (mode === "requeue") {
  const r = await BroadcastRecipient.updateMany(
    { broadcastKey: KEY, status: "failed" },
    { $set: { status: "pending", error: "" } },
  );
  console.log(`requeued ${r.modifiedCount}`);
  console.log(JSON.stringify(await counts()));
} else if (mode === "send") {
  let sent = 0, failed = 0, done = 0;
  while (done < LIMIT) {
    const due = await BroadcastRecipient.find({ broadcastKey: KEY, status: "pending" }).limit(25).lean();
    if (!due.length) break;
    for (const r of due) {
      if (done >= LIMIT) break;
      const claim = await BroadcastRecipient.findOneAndUpdate(
        { _id: r._id, status: "pending" },
        { $set: { status: "failed", error: "in flight" }, $inc: { attempts: 1 } },
      );
      if (!claim) continue;

      let ok = false, lastErr = "";
      for (let attempt = 1; attempt <= 2 && !ok; attempt += 1) {
        try { await sendMail({ to: r.email, subject: SUBJECT, html: HTML }); ok = true; }
        catch (err) {
          lastErr = String(err?.message || err).slice(0, 300);
          if (attempt === 1) await sleep(4000);
        }
      }

      if (ok) {
        await BroadcastRecipient.updateOne({ _id: r._id }, { $set: { status: "sent", error: "", sentAt: new Date() } });
        sent += 1;
      } else {
        await BroadcastRecipient.updateOne({ _id: r._id }, { $set: { status: "failed", error: lastErr } });
        failed += 1;
      }
      done += 1;
      await sleep(1200);
    }
    process.stderr.write(`  batch done: sent ${sent} failed ${failed}\n`);
  }
  console.log(`RUN sent ${sent} failed ${failed}`);
  console.log(JSON.stringify(await counts()));
} else {
  console.log(JSON.stringify(await counts()));
}

await mongoose.disconnect();
