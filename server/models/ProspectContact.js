// server/models/ProspectContact.js
//
// A person at a prospect firm, found through Hunter.io domain search. One
// row per email address across the whole collection, so the same person is
// never contacted twice under two companies or two profiles.
//
// NDPA 2023: `source` records where the address came from (provider plus the
// public pages Hunter cites), which is what we show a person who asks how we
// got their details.
import mongoose from "mongoose";

const ProspectContactSchema = new mongoose.Schema(
  {
    prospectId: { type: mongoose.Schema.Types.ObjectId, ref: "Prospect", required: true, index: true },

    name: { type: String, trim: true, default: "", maxlength: 160 },
    title: { type: String, trim: true, default: "", maxlength: 160 },
    email: { type: String, trim: true, lowercase: true, required: true, maxlength: 254 },
    // Hunter's 0-100 confidence that the address is real and deliverable.
    confidence: { type: Number, min: 0, max: 100, default: 0 },

    source: {
      provider: { type: String, trim: true, default: "hunter", maxlength: 40 },
      urls: { type: [{ type: String, trim: true, maxlength: 1000 }], default: [] },
      retrievedAt: { type: Date, default: Date.now },
    },

    // The contact the drafts are addressed to. One per prospect.
    primary: { type: Boolean, default: false },
  },
  { timestamps: true },
);

ProspectContactSchema.index({ email: 1 }, { unique: true });

export const ProspectContact =
  mongoose.models.ProspectContact || mongoose.model("ProspectContact", ProspectContactSchema);

export default ProspectContact;
