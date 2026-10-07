// server/models/IdealCustomerProfile.js
//
// One outbound prospecting segment: who we are looking for, which product we
// would pitch them, and who inside the firm to reach. The daily prospect
// finder (util/prospecting) walks every active profile and asks Claude, with
// web search, for real firms that match.
//
// Editable from the admin rather than hardcoded, so a new segment ("MEP
// contractors in Port Harcourt") is a form, not a deploy. The three starting
// profiles come from scripts/seed-prospecting-profiles.mjs.
import mongoose from "mongoose";

export const PROSPECT_PRODUCTS = ["quiv", "heron", "mep", "rategen"];

const list = (max = 40) => ({
  type: [{ type: String, trim: true, maxlength: 200 }],
  default: [],
  validate: { validator: (v) => v.length <= max, message: `At most ${max} entries.` },
});

const IdealCustomerProfileSchema = new mongoose.Schema(
  {
    // Stable slug so the seed updates a profile instead of duplicating it.
    key: { type: String, trim: true, lowercase: true, required: true, maxlength: 80 },

    segment: { type: String, trim: true, required: true, maxlength: 160 },
    targetProduct: { type: String, enum: PROSPECT_PRODUCTS, required: true },

    locations: list(),    // "Lagos", "Abuja", "Nigeria"
    companyTypes: list(), // "QS consultancy", "building contractor"
    jobTitles: list(),    // who to reach: "Managing Partner", "Head of Department"
    keywords: list(),     // steer the search: "bill of quantities", "NIQS"
    exclusions: list(),   // firms or kinds to skip: "ADLM customers", "recruiters"

    // Free-text context for the finder prompt, e.g. why this segment buys.
    notes: { type: String, trim: true, default: "", maxlength: 2000 },

    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

IdealCustomerProfileSchema.index({ key: 1 }, { unique: true });

export const IdealCustomerProfile =
  mongoose.models.IdealCustomerProfile ||
  mongoose.model("IdealCustomerProfile", IdealCustomerProfileSchema);

export default IdealCustomerProfile;
