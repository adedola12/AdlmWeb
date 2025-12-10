// server/models/Showcase.js
import mongoose from "mongoose";

const IndustryLeaderSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // e.g. "Skyline Construction"
    code: { type: String }, // e.g. "SC"
    logoUrl: { type: String }, // logo image url (optional)
    website: { type: String }, // optional
  },
  { timestamps: true }
);

const TrainedCompanySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    code: { type: String }, // e.g. "A&S"
    location: { type: String }, // e.g. "Boston, MA"
    logoUrl: { type: String }, // optional
    website: { type: String }, // optional
  },
  { timestamps: true }
);

const TestimonialSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    role: { type: String, required: true },
    company: { type: String, required: true },
    location: { type: String, required: true },
    category: {
      type: String,
      enum: [
        "Commercial",
        "Residential",
        "Infrastructure",
        "Sustainable",
        "Industrial",
        "Mixed-Use",
        "Other",
      ],
      default: "Other",
    },
    rating: { type: Number, default: 5 }, // 1–5 stars
    text: { type: String, required: true },

    // avatar handling
    avatarUrl: { type: String }, // direct image url
    linkedinUrl: { type: String }, // public LinkedIn profile URL (for reference)

    featured: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const IndustryLeader = mongoose.model(
  "IndustryLeader",
  IndustryLeaderSchema
);
export const TrainedCompany = mongoose.model(
  "TrainedCompany",
  TrainedCompanySchema
);
export const Testimonial = mongoose.model("Testimonial", TestimonialSchema);
