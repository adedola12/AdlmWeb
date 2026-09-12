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
//
// PER-RECIPIENT TRACKING, AND WHY IT IS OPT-IN
//
// Opens and clicks are recorded against the message, and for a CAMPAIGN the
// recipient's address is stored in clear so "who actually read it" can be
// answered. That is a deliberate reversal of the paragraph above, taken as a
// decision, and it is scoped rather than blanket: `to` is written only when the
// caller passes `track`, which campaign sends do and transactional sends do
// not. A receipt still logs nothing but a hash, because nobody needs to know
// who opened their own invoice, and the day someone does need to know is the
// day this file should be argued about again rather than quietly relied on.
//
// Anything stored here is disclosable. If per-recipient open and click data is
// kept, the privacy policy has to say so.

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

    // --- correlation -------------------------------------------------------
    // The provider's own id for the message. Without it an Open event arriving
    // an hour later cannot be matched to anything, so this is the one field
    // every send writes whether it is tracked or not.
    messageId: { type: String, default: "", index: true },

    // --- per-recipient, campaigns only -------------------------------------
    // Empty for transactional mail. See the note at the top of this file.
    to: { type: String, default: "" },
    campaign: { type: String, default: "", index: true },

    // --- engagement --------------------------------------------------------
    // firstOpenAt is kept separately from openCount because "did it land" and
    // "how often was it revisited" are different questions, and the second is
    // noisy: an image proxy can open a message several times without a person
    // ever seeing it.
    firstOpenAt: { type: Date, default: null },
    lastOpenAt: { type: Date, default: null },
    openCount: { type: Number, default: 0 },

    firstClickAt: { type: Date, default: null },
    lastClickAt: { type: Date, default: null },
    clickCount: { type: Number, default: 0 },
    lastLink: { type: String, default: "" },
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
