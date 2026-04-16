import mongoose from "mongoose";

const DefaultValuationSettings = Object.freeze({
  showDailyLog: true,
  showValuationSettings: true,
  showActualColumns: false,
  dashboardChartMode: "pie",
  retentionPct: 5,
  vatPct: 7.5,
  withholdingPct: 2.5,
});

const ValuationSettingsSchema = new mongoose.Schema(
  {
    showDailyLog: {
      type: Boolean,
      default: DefaultValuationSettings.showDailyLog,
    },
    showValuationSettings: {
      type: Boolean,
      default: DefaultValuationSettings.showValuationSettings,
    },
    showActualColumns: {
      type: Boolean,
      default: DefaultValuationSettings.showActualColumns,
    },
    dashboardChartMode: {
      type: String,
      enum: ["pie", "ribbon", "line"],
      default: DefaultValuationSettings.dashboardChartMode,
    },
    retentionPct: {
      type: Number,
      default: DefaultValuationSettings.retentionPct,
    },
    vatPct: {
      type: Number,
      default: DefaultValuationSettings.vatPct,
    },
    withholdingPct: {
      type: Number,
      default: DefaultValuationSettings.withholdingPct,
    },
    rateSyncEnabled: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false },
);

const ValuationEventSchema = new mongoose.Schema(
  {
    itemKey: { type: String, default: "" },
    itemSn: { type: Number, default: 0 },
    description: { type: String, default: "" },
    takeoffLine: { type: String, default: "" },
    materialName: { type: String, default: "" },
    qty: { type: Number, default: 0 },
    unit: { type: String, default: "" },
    rate: { type: Number, default: 0 },
    amount: { type: Number, default: 0 },
    statusField: {
      type: String,
      enum: ["completed", "purchased"],
      default: "completed",
    },
    markedValue: { type: Boolean, default: true },
    markedAt: { type: Date, default: Date.now },
    markedDay: { type: String, default: "" },
  },
  { _id: false },
);

const ItemSchema = new mongoose.Schema(
  {
    sn: { type: Number, default: 0 },
    qty: { type: Number, default: 0 },
    unit: { type: String, default: "" },
    rate: { type: Number, default: 0 },
    actualQty: { type: Number, default: null },
    actualRate: { type: Number, default: null },
    actualRecordedAt: { type: Date, default: null },
    actualUpdatedAt: { type: Date, default: null },
    purchased: { type: Boolean, default: false },
    purchasedAt: { type: Date, default: null },
    completed: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
    statusUpdatedAt: { type: Date, default: null },
    description: { type: String, default: "" },
    takeoffLine: { type: String, default: "" },
    materialName: { type: String, default: "" },
    elementIds: { type: [Number], default: [] },
    level: { type: String, default: "" },
    type: { type: String, default: "" },
    code: { type: String, default: "" },
  },
  { _id: false },
);

const TakeoffProjectSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    productKey: { type: String, default: "revit", index: true },
    clientProjectKey: { type: String, default: "", index: true },
    modelFingerprint: { type: String, default: "" },
    fingerprint: { type: String, default: "" },
    mergeSameTypeLevel: { type: Boolean, default: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, trim: true, lowercase: true, default: "" },
    publicToken: { type: String, default: null, sparse: true },
    publicShareEnabled: { type: Boolean, default: false },
    checklistCompositeKeys: { type: [String], default: [] },
    items: { type: [ItemSchema], default: [] },
    valuationSettings: {
      type: ValuationSettingsSchema,
      default: () => ({ ...DefaultValuationSettings }),
    },
    valuationEvents: { type: [ValuationEventSchema], default: [] },
    version: { type: Number, default: 1 },
  },
  { timestamps: true },
);

TakeoffProjectSchema.index({ userId: 1, productKey: 1, updatedAt: -1 });
TakeoffProjectSchema.index({ userId: 1, productKey: 1, clientProjectKey: 1 });
TakeoffProjectSchema.index({ userId: 1, productKey: 1, slug: 1 }, { sparse: true });

export const TakeoffProject = mongoose.model(
  "TakeoffProject",
  TakeoffProjectSchema,
);
