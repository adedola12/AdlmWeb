// One row per message the studio actually sent.
//
// His Emails screen has a "Sent, 30 days" column, and nothing on this system
// recorded a send, so the figure had nowhere to come from. Written inside
// sendMail rather than at each of the twenty-four call sites, so a message
// added later is counted without anybody remembering to count it.
//
// WHAT IS DELIBERATELY NOT STORED
//
// Not the body, and not the subject after interpolation. A receipt's subject
// carries an invoice number, a project invitation carries a project name — a
// log of those is a second copy of customer data sitting somewhere nobody
// thinks to protect. The key and the day are enough to answer "how much of
// this goes out", which is the only question the column asks.
//
// The recipient is kept as a one-way hash, so "did this person get it" can be
// answered during a support call without the log itself becoming a mailing
// list.

import mongoose from "mongoose";
import crypto from "node:crypto";

const EmailSendSchema = new mongoose.Schema(
  {
    key: { type: String, default: "unattributed", index: true },
    toHash: { type: String, default: "" },
    ok: { type: Boolean, default: true },
    // Which transport carried it, because "Resend is down" and "the wording is
    // wrong" are different problems with the same symptom.
    via: { type: String, default: "" },
    // Indexed by the TTL index below, so not marked index:true here as well.
    at: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

// Thirty days is what the screen asks for; ninety is kept so a month-on-month
// comparison is possible. Mongo drops them after that on its own.
EmailSendSchema.index({ at: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const hashRecipient = (to) =>
  crypto
    .createHash("sha256")
    .update(String(Array.isArray(to) ? to[0] : to || "").trim().toLowerCase())
    .digest("hex")
    .slice(0, 32);

export const EmailSend = mongoose.models.EmailSend || mongoose.model("EmailSend", EmailSendSchema);
