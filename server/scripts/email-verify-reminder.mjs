// The one reminder to accounts that signed up but never confirmed their email
// (2026-09-18). Starts their 14-day clock (util/unconfirmedSweep.js).
//
// Who gets it: plain customer accounts, email unconfirmed, not disabled, no
// live licence, no purchase, and not already reminded. Licensed or paying
// unconfirmed accounts are not threatened with closure; the site prompts them.
//
//   node --env-file=.env scripts/email-verify-reminder.mjs          # list only
//   node --env-file=.env scripts/email-verify-reminder.mjs --send   # send
//
// Sends through sendMail(), i.e. whatever transport is live (MAIL_TRANSPORT).
// Paced at one message a second, which also fits the SES sandbox limit.

import mongoose from "mongoose";
import { User } from "../models/User.js";
import { Purchase } from "../models/Purchase.js";
import { confirmReminder } from "../util/emailContent.js";
import { sendMail } from "../util/mailer.js";

const SEND = process.argv.includes("--send");
const now = Date.now();

function liveLicence(entitlements) {
  return (Array.isArray(entitlements) ? entitlements : []).some(
    (e) =>
      e &&
      String(e.status || "").toLowerCase() === "active" &&
      (!e.expiresAt || new Date(e.expiresAt).getTime() > now),
  );
}

await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB || "adlmWeb" });

const users = await User.find(
  { emailVerified: { $ne: true }, disabled: { $ne: true }, emailVerifyReminderAt: null },
  { email: 1, firstName: 1, role: 1, entitlements: 1 },
).lean();

const due = [];
for (const u of users) {
  if (String(u.role || "user").toLowerCase() !== "user") continue;
  if (liveLicence(u.entitlements)) continue;
  if (await Purchase.exists({ userId: u._id })) continue;
  due.push(u);
}

console.log(`${users.length} unconfirmed; ${due.length} get the reminder${SEND ? "" : " (list only; add --send)"}`);

let sent = 0;
let failed = 0;
if (SEND) {
  for (const u of due) {
    try {
      const { subject, html } = confirmReminder({ firstName: u.firstName });
      await sendMail({ to: u.email, subject, html, templateKey: "account.confirm-reminder" });
      await User.updateOne({ _id: u._id }, { $set: { emailVerifyReminderAt: new Date() } });
      sent += 1;
    } catch (err) {
      failed += 1;
      console.error(`failed for ${String(u._id)}: ${err?.message || err}`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log(`sent ${sent}, failed ${failed}`);
}

await mongoose.disconnect();
