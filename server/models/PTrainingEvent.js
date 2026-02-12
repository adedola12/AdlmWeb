import mongoose from "mongoose";

const PricingSchema = new mongoose.Schema(
  {
    normalNGN: { type: Number, default: 0 },
    groupOf3NGN: { type: Number, default: 0 },
    earlyBird: {
      priceNGN: { type: Number, default: 0 },
      endsAt: { type: Date, default: null },
    },
  },
  { _id: false },
);

const MediaSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["image", "video"], default: "image" },
    url: { type: String, default: "" },
    title: { type: String, default: "" },
  },
  { _id: false },
);

const LocationSchema = new mongoose.Schema(
  {
    name: { type: String, default: "" },
    address: { type: String, default: "" },
    city: { type: String, default: "" },
    state: { type: String, default: "" },
    amenities: { type: [String], default: [] },
    googleMapsPlaceUrl: { type: String, default: "" },
    googleMapsEmbedUrl: { type: String, default: "" },
    photos: { type: [MediaSchema], default: [] },
  },
  { _id: false },
);

const FormFieldSchema = new mongoose.Schema(
  {
    key: { type: String, default: "" },
    label: { type: String, default: "" },
    type: { type: String, default: "short" }, // short|long|email|phone|select|multi|number|date
    required: { type: Boolean, default: false },
    options: { type: [String], default: [] },
    placeholder: { type: String, default: "" },
    helpText: { type: String, default: "" },
  },
  { _id: false },
);

const ChecklistItemSchema = new mongoose.Schema(
  {
    key: { type: String, default: "" },
    label: { type: String, default: "" },
    helpUrl: { type: String, default: "" },
  },
  { _id: false },
);

const EntitlementGrantSchema = new mongoose.Schema(
  {
    productKey: { type: String, default: "" },
    months: { type: Number, default: 1 },
    seats: { type: Number, default: 1 },
    licenseType: { type: String, default: "personal" }, // personal|organization
    organizationName: { type: String, default: "" },
  },
  { _id: false },
);

const PTrainingEventSchema = new mongoose.Schema(
  {
    title: { type: String, default: "" },
    subtitle: { type: String, default: "" },
    slug: { type: String, default: "" },

    description: { type: String, default: "" },
    fullDescription: { type: String, default: "" },

    startAt: { type: Date, default: null },
    endAt: { type: Date, default: null },

    capacityApproved: { type: Number, default: 0 },

    // pricing
    pricing: { type: PricingSchema, default: () => ({}) },

    // legacy
    priceNGN: { type: Number, default: 0 },

    flyerUrl: { type: String, default: "" },

    isPublished: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    sort: { type: Number, default: 0 },

    status: { type: String, default: "open" }, // open|closed|draft

    location: { type: LocationSchema, default: () => ({}) },

    // venue gallery
    media: { type: [MediaSchema], default: [] },

    // registration form schema
    formFields: { type: [FormFieldSchema], default: [] },

    installationChecklist: { type: [ChecklistItemSchema], default: [] },
    entitlementGrants: { type: [EntitlementGrantSchema], default: [] },
    softwareProductKeys: { type: [String], default: [] },

    whatYouGet: { type: [String], default: [] },
    requirements: { type: [String], default: [] },
  },
  { timestamps: true },
);

PTrainingEventSchema.index({ startAt: -1 });

export default mongoose.model("PTrainingEvent", PTrainingEventSchema);
