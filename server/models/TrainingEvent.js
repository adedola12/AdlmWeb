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

/* ---------------------- NEW: Pricing schemas ---------------------- */
const EarlyBirdSchema = new mongoose.Schema(
  {
    priceNGN: { type: Number, default: 0, min: 0 },
    // When null/empty, earlybird is not active (even if price is set)
    endsAt: { type: Date, default: null },
  },
  { _id: false },
);

const PricingSchema = new mongoose.Schema(
  {
    // Normal fee
    normalNGN: { type: Number, default: 0, min: 0 },

    // Group of 3 fee (you can enforce the group size in your checkout logic)
    groupOf3NGN: { type: Number, default: 0, min: 0 },

    // Earlybird fee and expiry
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

    // ✅ Legacy single price (kept for backward compatibility)
    // Treat this as the normal fee for older clients.
    priceNGN: { type: Number, default: 0, min: 0 },

    // ✅ NEW pricing tiers
    pricing: { type: PricingSchema, default: () => ({}) },

    // ✅ Flyer image (used in Products page + event page hero)
    flyerUrl: { type: String, default: "" },

    location: {
      name: { type: String, default: "" },
      address: { type: String, default: "" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
      amenities: { type: [String], default: [] },
      googleMapsPlaceUrl: { type: String, default: "" },
      googleMapsEmbedUrl: { type: String, default: "" },

      // ✅ Location images
      photos: { type: [MediaSchema], default: [] }, // use type="image"
    },

    // general media (optional)
    media: { type: [MediaSchema], default: [] },

    // admin-defined form schema
    formFields: { type: [FormFieldSchema], default: [] },

    // user sees this after approval
    installationChecklist: { type: [ChecklistItemSchema], default: [] },

    // grants applied when installation complete is marked
    entitlementGrants: { type: [EntitlementGrantSchema], default: [] },

    // ✅ selected software product keys from product library
    softwareProductKeys: { type: [String], default: [] },

    isPublished: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    sort: { type: Number, default: 0 },
  },
  { timestamps: true },
);

/**
 * Backward compatibility:
 * - If older code still sets priceNGN only, we auto-copy it to pricing.normalNGN.
 * - If newer code sets pricing.normalNGN, we mirror it into priceNGN (legacy field).
 */
TrainingEventSchema.pre("validate", function (next) {
  try {
    if (!this.pricing) this.pricing = {};

    const legacy = Number(this.priceNGN || 0) || 0;
    const normal =
      this.pricing?.normalNGN == null ? null : Number(this.pricing.normalNGN);

    // If pricing.normal is missing, use legacy price
    if (normal == null || Number.isNaN(normal)) {
      this.pricing.normalNGN = legacy;
    }

    // Mirror normal -> legacy for older clients that read priceNGN
    if (this.priceNGN == null) {
      this.priceNGN = Number(this.pricing.normalNGN || 0) || 0;
    } else {
      // keep legacy in sync if new normal is provided
      this.priceNGN = Number(this.pricing.normalNGN || 0) || 0;
    }

    // Normalize earlyBird
    if (!this.pricing.earlyBird) this.pricing.earlyBird = {};
    const ebPrice = Number(this.pricing.earlyBird.priceNGN || 0) || 0;
    this.pricing.earlyBird.priceNGN = ebPrice;

    // endsAt can stay null or a Date
    next();
  } catch (e) {
    next(e);
  }
});

export const TrainingEvent =
  mongoose.models.TrainingEvent ||
  mongoose.model("TrainingEvent", TrainingEventSchema);
