// An override for one of the messages the studio sends.
//
// WHY AN OVERRIDE AND NOT THE MESSAGE ITSELF
//
// Every message already exists in code, written and working. Moving them all
// into the database would mean a migration that has to be perfect on the day
// it runs, against mail that includes password resets and receipts — the exact
// messages nobody wants to be the first to notice are broken.
//
// So a row here is an override: when one exists for a key, sendMail uses it;
// when it does not, the code version sends exactly as before. That makes
// editing safe to try, safe to undo (delete the row and the original is back),
// and safe to roll out one message at a time.
//
// WHAT CANNOT BE OVERRIDDEN
//
// The security codes — password reset, sign-in code, break-glass. Not because
// the mechanism could not carry them, but because their wording is the thing a
// person checks before typing a code into a box, and an admin account able to
// rewrite it is an admin account able to write a convincing phishing mail from
// the studio's own domain. The catalogue marks them, the route refuses them.

import mongoose from "mongoose";

const EmailTemplateSchema = new mongoose.Schema(
  {
    // Matches a key in util/emailCatalogue.js. Unique: one override per message.
    key: { type: String, required: true, unique: true, index: true },

    subject: { type: String, default: "" },
    html: { type: String, default: "" },

    // Who last changed the wording, so "why does the receipt say that" has an
    // answer that is not a guess.
    updatedByEmail: { type: String, default: "" },
  },
  { timestamps: true },
);

export const EmailTemplate =
  mongoose.models.EmailTemplate || mongoose.model("EmailTemplate", EmailTemplateSchema);
