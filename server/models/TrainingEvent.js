// server/models/TrainingEvent.js
import mongoose from "mongoose";

const FormFieldSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ["short", "email", "phone", "paragraph", "select", "multi", "date"],
      default: "short",
    },
    required: { type: Boolean, default: true },
    placeholder: { type: String, default: "" },
    options: { type: [String], default: [] },
  },
  { _id: false },
);

const MediaSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["image", "video"], required: true },
    url: { type: String, required: true },
    title: { type: String, default: "" },
  },
  { _id: false },
);

const EntitlementGrantSchema = new mongoose.Schema(
  {
    productKey: { type: String, required: true, trim: true, lowercase: true },
    months: { type: Number, default: 1, min: 1 },
    seats: { type: Number, default: 1, min: 1 },
    licenseType: {
      type: String,
      enum: ["personal", "organization"],
      default: "personal",
    },
    organizationName: { type: String, default: "", trim: true },
  },
  { _id: false },
);

const ChecklistItemSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    helpUrl: { type: String, default: "" },
  },
  { _id: false },
);

/* ---------------------- Pricing schemas ---------------------- */
const EarlyBirdSchema = new mongoose.Schema(
  {
    priceNGN: { type: Number, default: 0, min: 0 },
    endsAt: { type: Date, default: null },
  },
  { _id: false },
);

const PricingSchema = new mongoose.Schema(
  {
    normalNGN: { type: Number, default: 0, min: 0 },
    groupOf3NGN: { type: Number, default: 0, min: 0 },
    earlyBird: { type: EarlyBirdSchema, default: () => ({}) },
  },
  { _id: false },
);

const TrainingEventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, default: "", trim: true },
    slug: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    description: { type: String, default: "" },
    fullDescription: { type: String, default: "" },
    whatYouGet: { type: [String], default: [] },
    requirements: { type: [String], default: [] },

    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },

    capacityApproved: { type: Number, default: 14, min: 1 },

    // Legacy single price
    priceNGN: { type: Number, default: 0, min: 0 },

    // NEW pricing tiers
    pricing: { type: PricingSchema, default: () => ({}) },

    flyerUrl: { type: String, default: "" },

    location: {
      name: { type: String, default: "" },
      address: { type: String, default: "" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
      amenities: { type: [String], default: [] },
      googleMapsPlaceUrl: { type: String, default: "" },
      googleMapsEmbedUrl: { type: String, default: "" },

      // Location images (images only)
      photos: { type: [MediaSchema], default: [] },
    },

    // ✅ Venue Images & Videos (gallery)
    media: { type: [MediaSchema], default: [] },

    // admin-defined form schema
    formFields: { type: [FormFieldSchema], default: [] },

    installationChecklist: { type: [ChecklistItemSchema], default: [] },
    entitlementGrants: { type: [EntitlementGrantSchema], default: [] },

    softwareProductKeys: { type: [String], default: [] },

    isPublished: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    sort: { type: Number, default: 0 },
  },
  { timestamps: true },
);

TrainingEventSchema.pre("validate", function (next) {
  try {
    if (!this.pricing) this.pricing = {};

    const legacy = Number(this.priceNGN || 0) || 0;
    const normal =
      this.pricing?.normalNGN == null ? null : Number(this.pricing.normalNGN);

    if (normal == null || Number.isNaN(normal)) {
      this.pricing.normalNGN = legacy;
    }

    this.priceNGN = Number(this.pricing.normalNGN || 0) || 0;

    if (!this.pricing.earlyBird) this.pricing.earlyBird = {};
    const ebPrice = Number(this.pricing.earlyBird.priceNGN || 0) || 0;
    this.pricing.earlyBird.priceNGN = ebPrice;

    next();
  } catch (e) {
    next(e);
  }
});

export const TrainingEvent =
  mongoose.models.TrainingEvent ||
  mongoose.model("TrainingEvent", TrainingEventSchema);
