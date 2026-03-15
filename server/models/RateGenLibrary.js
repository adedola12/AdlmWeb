import mongoose from "mongoose";

const BreakdownLineSchema = new mongoose.Schema(
  {
    componentName: { type: String, trim: true, default: "" },
    quantity: { type: Number, default: 0 },
    unit: { type: String, trim: true, default: "" },
    unitPrice: { type: Number, default: 0 },
    lineTotal: { type: Number, default: 0 },
    refKind: { type: String, trim: true, default: "" },
    refSn: { type: Number, default: null },
    refName: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const RateItemSchema = new mongoose.Schema(
  {
    sn: Number,
    description: String,
    unit: String,
    price: Number,
    category: { type: String, default: "" },
  },
  { _id: false }
);

const UserRateOverrideSchema = new mongoose.Schema(
  {
    rateId: { type: String, trim: true, default: "" },
    sectionKey: { type: String, trim: true, default: "" },
    sectionLabel: { type: String, trim: true, default: "" },
    itemNo: { type: Number, default: null },
    code: { type: String, trim: true, default: "" },
    description: { type: String, trim: true, default: "" },
    unit: { type: String, trim: true, default: "" },
    netCost: { type: Number, default: 0 },
    overheadPercent: { type: Number, default: 10 },
    profitPercent: { type: Number, default: 25 },
    overheadValue: { type: Number, default: 0 },
    profitValue: { type: Number, default: 0 },
    totalCost: { type: Number, default: 0 },
    breakdown: { type: [BreakdownLineSchema], default: [] },
    sourceUpdatedAt: { type: Date, default: null },
    clientUpdatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const UserCustomRateLineSchema = new mongoose.Schema(
  {
    rateType: {
      type: String,
      enum: ["material", "labour"],
      required: true,
      trim: true,
    },
    description: { type: String, trim: true, default: "" },
    quantity: { type: Number, default: 0 },
    unit: { type: String, trim: true, default: "" },
    unitPrice: { type: Number, default: 0 },
    totalCost: { type: Number, default: 0 },
    category: { type: String, trim: true, default: "" },
    refSn: { type: Number, default: null },
    refName: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const UserCustomRateSchema = new mongoose.Schema(
  {
    customRateId: { type: String, required: true, trim: true },
    sectionKey: { type: String, trim: true, default: "" },
    sectionLabel: { type: String, trim: true, default: "" },
    title: { type: String, trim: true, default: "" },
    description: { type: String, trim: true, default: "" },
    unit: { type: String, trim: true, default: "" },
    materials: { type: [UserCustomRateLineSchema], default: [] },
    labour: { type: [UserCustomRateLineSchema], default: [] },
    breakdown: { type: [BreakdownLineSchema], default: [] },
    netCost: { type: Number, default: 0 },
    overheadPercent: { type: Number, default: 10 },
    profitPercent: { type: Number, default: 10 },
    overheadValue: { type: Number, default: 0 },
    profitValue: { type: Number, default: 0 },
    totalCost: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const RateGenLibrarySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    materials: { type: [RateItemSchema], default: [] },
    labour: { type: [RateItemSchema], default: [] },
    version: { type: Number, default: 1 },
    rateOverrides: { type: [UserRateOverrideSchema], default: [] },
    customRates: { type: [UserCustomRateSchema], default: [] },
    ratesVersion: { type: Number, default: 1 },
    customRatesVersion: { type: Number, default: 1 },
  },
  { timestamps: true }
);

export const RateGenLibrary = mongoose.model(
  "RateGenLibrary",
  RateGenLibrarySchema
);
