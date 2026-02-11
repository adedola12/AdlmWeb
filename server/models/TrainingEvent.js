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
    options: { type: [String], default: [] }, // for select/multi
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
    description: { type: String, default: "" }, // short summary
    fullDescription: { type: String, default: "" }, // long
    whatYouGet: { type: [String], default: [] },
    requirements: { type: [String], default: [] },

    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },

    capacityApproved: { type: Number, default: 14, min: 1 }, // ✅ approval cap
    priceNGN: { type: Number, default: 0, min: 0 },

    location: {
      name: { type: String, default: "" },
      address: { type: String, default: "" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
      amenities: { type: [String], default: [] },
      googleMapsPlaceUrl: { type: String, default: "" }, // https://maps.google.com/?q=...
      googleMapsEmbedUrl: { type: String, default: "" }, // optional embed
    },

    media: { type: [MediaSchema], default: [] },

    // ✅ Admin-defined form schema
    formFields: { type: [FormFieldSchema], default: [] },

    // ✅ What user sees after approval
    installationChecklist: { type: [ChecklistItemSchema], default: [] },

    // ✅ What to grant when installation is marked complete
    entitlementGrants: { type: [EntitlementGrantSchema], default: [] },

    isPublished: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    sort: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const TrainingEvent =
  mongoose.models.TrainingEvent ||
  mongoose.model("TrainingEvent", TrainingEventSchema);
