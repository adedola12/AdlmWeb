// A template somebody has asked the engine to learn.
//
// WHY A REQUEST IS A RECORD AND NOT A CONVERSATION
//
// Richard's Templates screen carries a button, "Ask for a template", and his
// note under it says why: a template is built by a developer, so the part
// that belongs on an admin screen is saying what is needed and what it is
// for — "so the request exists somewhere other than a conversation."
//
// That is the whole reason this collection exists. Without it the button
// would push a row into an array that dies with the page, which is a worse
// version of asking in a message: at least the message can be scrolled back
// to. Here the request sits on the list beside the templates that do exist,
// marked "asked for", until the block is written and it is marked built.
//
// WHAT IT NEEDS IS THE FIELD THAT MATTERS
//
// A name and a sentence say what to call it. `needs` is what it actually gets
// built from — the blocks it cannot do without: a retention table, a pair of
// signatures, a total that runs across pages. A request without that is a
// title, and a title cannot be built.

import mongoose from "mongoose";

const TemplateRequestSchema = new mongoose.Schema(
  {
    // Slugged from the name on the way in, and unique, so asking twice for
    // the same thing updates the request instead of listing it twice.
    key: { type: String, required: true, unique: true, index: true, trim: true },

    name: { type: String, required: true, trim: true },

    // One sentence. It is what the list prints under the name, which is why
    // it is required — a row that says nothing is a row nobody can act on.
    what: { type: String, required: true, trim: true },

    // His form asks for a page size here; the built templates print whose
    // letterhead they use. Both are "paper" in the column, and both are what
    // the person filling it in meant by the word.
    paper: { type: String, default: "A4 portrait", trim: true },

    needs: { type: String, required: true, trim: true },

    state: { type: String, enum: ["asked", "built"], default: "asked", index: true },

    // The access token carries an email and no name, so this is what there
    // is to record. It is enough to go back and ask what they meant.
    byEmail: { type: String, default: "", trim: true },

    // Set when a developer has written the block and marked it done, so the
    // list can stop showing it as outstanding without losing the record of
    // who asked and what for.
    builtAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const TemplateRequest =
  mongoose.models.TemplateRequest || mongoose.model("TemplateRequest", TemplateRequestSchema);
