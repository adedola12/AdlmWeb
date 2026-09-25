// server/models/Prospect.js
//
// A company the prospect finder found for an ideal customer profile, with
// the research behind it. One row per company DOMAIN: the domain is the
// dedupe key (util/prospecting/dedupe.js), so the same firm surfacing under
// two profiles or on two days is never added twice.
//
// NDPA 2023: every row keeps the source URLs it was built from, and the
// admin delete-on-request action removes the row and its contacts outright,
// leaving only a hashed entry on the Suppression list so the firm is never
// re-added.
import mongoose from "mongoose";
import { PROSPECT_PRODUCTS } from "./IdealCustomerProfile.js";

export const PROSPECT_STATUSES = [
  "new",       // found, no draft yet
  "drafted",   // emails written, waiting in the review queue
  "approved",  // a reviewer approved the draft (phase 2 sends it)
  "rejected",  // the draft was rejected; the prospect may be redrafted
  "bad_fit",   // a reviewer says this firm is not a customer; never redrafted
  "contacted", // phase 2: first email sent
  "replied",   // phase 3: a reply arrived
  "booked",    // phase 3: a call is booked
  "opted_out", // asked us to stop; permanent
];

const SourceSchema = new mongoose.Schema(
  {
    url: { type: String, trim: true, required: true, maxlength: 1000 },
    title: { type: String, trim: true, default: "", maxlength: 300 },
    retrievedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const ProspectSchema = new mongoose.Schema(
  {
    profileId: { type: mongoose.Schema.Types.ObjectId, ref: "IdealCustomerProfile", required: true, index: true },
    matchedProduct: { type: String, enum: PROSPECT_PRODUCTS, required: true },

    companyName: { type: String, trim: true, required: true, maxlength: 200 },
    // Bare registrable host, lowercase, no scheme or "www." (normaliseDomain).
    domain: { type: String, trim: true, lowercase: true, required: true, maxlength: 253 },
    website: { type: String, trim: true, default: "", maxlength: 500 },
    location: { type: String, trim: true, default: "", maxlength: 200 },

    whatTheyDo: { type: String, trim: true, default: "", maxlength: 2000 },
    recentProjects: {
      type: [{ type: String, trim: true, maxlength: 500 }],
      default: [],
    },
    // Every URL the research came from. Required: a prospect we cannot say
    // where we found is one we should not be holding (NDPA).
    sources: {
      type: [SourceSchema],
      validate: { validator: (v) => Array.isArray(v) && v.length > 0, message: "At least one source URL is required." },
    },

    status: { type: String, enum: PROSPECT_STATUSES, default: "new", index: true },
    statusNote: { type: String, trim: true, default: "", maxlength: 2000 },

    // The Lagos calendar day it was found on, "YYYY-MM-DD". The daily cap
    // counts rows by this, not by createdAt, so a run that crosses UTC
    // midnight still counts against the right working day.
    foundDay: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
    finderRunId: { type: String, trim: true, default: "", maxlength: 80 },
  },
  { timestamps: true },
);

ProspectSchema.index({ domain: 1 }, { unique: true });
ProspectSchema.index({ createdAt: -1 });
ProspectSchema.index({ profileId: 1, status: 1, createdAt: -1 });

export const Prospect = mongoose.models.Prospect || mongoose.model("Prospect", ProspectSchema);

export default Prospect;
