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

/**
 * A published price the user has replaced with their own, for one location.
 *
 * Scoped by state because that is the whole point: a QS working in Kano and a
 * QS working in Lagos are correcting different markets, and one figure cannot
 * serve both. A null state means "everywhere I work", which is what someone
 * with no state set still needs.
 *
 * Held against the user rather than against the master catalog. The master
 * library is evidence we publish and stand behind; this is the user's own
 * correction to it, and the two must never be mistaken for each other.
 */
const UserPriceOverrideSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["material", "labour"], required: true },
    // Name and unit together, because the catalog deliberately carries rows
    // that share a name and differ by unit: steel is priced per tonne and per
    // kg, and matching on name alone would collapse them onto one figure.
    name: { type: String, required: true, trim: true },
    unit: { type: String, trim: true, default: "" },
    price: { type: Number, required: true, min: 0 },
    state: { type: String, trim: true, lowercase: true, default: null },
    note: { type: String, trim: true, default: "" },
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
    priceOverrides: { type: [UserPriceOverrideSchema], default: [] },
    ratesVersion: { type: Number, default: 1 },
    customRatesVersion: { type: Number, default: 1 },
    priceOverridesVersion: { type: Number, default: 1 },
  },
  { timestamps: true }
);

export const RateGenLibrary = mongoose.model(
  "RateGenLibrary",
  RateGenLibrarySchema
);
