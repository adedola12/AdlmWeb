// A document the composer made and kept.
//
// WHY THIS EXISTS AT ALL
//
// The composer kept its work in localStorage. That is fine for a scratchpad
// and wrong for a document: it lives in one browser, on one machine, for one
// person. A quotation written on the office desktop cannot be opened from a
// laptop, a colleague cannot pick it up, and clearing site data throws away
// work nobody knew was only ever in a browser.
//
// His Saved documents screen assumes a store. This is that store.
//
// THE SOURCE IS THE DOCUMENT
//
// What is kept is the composer's own markup, not rendered HTML or a PDF. That
// is the whole point of his design — "each one opens back into the composer
// exactly as it was, still editable, block by block". Storing the output
// instead would give a thing that can be looked at and never changed.

import mongoose from "mongoose";

const SavedDocumentSchema = new mongoose.Schema(
  {
    // Which template it prints on: letter, report, statement, invoice,
    // receipt, boq, valuation. Not an enum — the composer's list of kinds is
    // in the client, and validating it in two places guarantees they drift.
    template: { type: String, default: "letter", trim: true },

    title: { type: String, default: "Untitled", trim: true },
    // The reference a person quotes on the phone — INV-1042, Q-2416.
    number: { type: String, default: "", trim: true },
    // Who it is addressed to, as typed. Free text: plenty of documents go to
    // "The Principal Partner" rather than to an account we hold.
    to: { type: String, default: "", trim: true },

    // Who it is from, when that is not simply the letterhead. Blank on almost
    // every document, and blank on every one saved before the field existed —
    // which the composer reads as missing rather than assuming a fresh shape.
    from: { type: String, default: "", trim: true },

    source: { type: String, default: "" },
    blocks: { type: Number, default: 0 },

    // Who wrote it. Kept as both, because the id answers "show me mine" and
    // the email still reads correctly after somebody leaves.
    byId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    byEmail: { type: String, default: "", trim: true },

    // Set when the document is actually sent to somebody. A saved document is
    // not an issued one, and the Issued register only counts what left.
    sentAt: { type: Date, default: null },
    sentTo: { type: String, default: "", trim: true },
  },
  { timestamps: true },
);

// The screen lists newest first, and always for one studio rather than one
// person, so this is the index that matters.
SavedDocumentSchema.index({ updatedAt: -1 });

export const SavedDocument = mongoose.model("SavedDocument", SavedDocumentSchema);
