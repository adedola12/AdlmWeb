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

const ProvisionalSumSchema = new mongoose.Schema(
  {
    description: { type: String, default: "", trim: true },
    amount: { type: Number, default: 0 },
  },
  { _id: false },
);

// Preliminary items — one entry per BESMM4 preliminary line (setting out,
// insurances, site accommodation, etc). allocation = percentage of total
// preliminary amount assigned to this line (sum should be 100). completed
// flag drives the preliminary-done deduction from the outstanding prelim
// pool, mirroring how measured items drive valuation.
const PreliminaryItemSchema = new mongoose.Schema(
  {
    name: { type: String, default: "", trim: true },
    allocation: { type: Number, default: 0 }, // 0-100
    completed: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
    notes: { type: String, default: "" },
  },
  { _id: false },
);

// Variations from site instructions / change orders — measured work variance
// lives on each item's actualQty/actualRate. This log captures variations that
// are not derived from the takeoff (architects' instructions, change requests,
// client extras) so they can be tracked against the project total.
const VariationSchema = new mongoose.Schema(
  {
    description: { type: String, default: "", trim: true },
    qty: { type: Number, default: 0 },
    unit: { type: String, default: "", trim: true },
    rate: { type: Number, default: 0 },
    reference: { type: String, default: "", trim: true },
    issuedAt: { type: Date, default: null },
    // Provenance — helps the UI colour-code variations that came from the
    // auto-add-on-lock flow versus ones the user keyed in manually.
    source: {
      type: String,
      enum: ["manual", "post-lock-new-item"],
      default: "manual",
    },
  },
  { _id: false },
);

// Snapshot of an item taken at contract lock time. Used post-lock to detect
// re-measurement: if the live item's qty differs from snapshotQty and the
// user hasn't set actualQty, we auto-populate actualQty with the new qty so
// the design-change variation is tracked without losing the original contract
// quantity.
const ContractBaseItemSchema = new mongoose.Schema(
  {
    identity: { type: String, default: "" }, // matches itemIdentity()
    description: { type: String, default: "" },
    qty: { type: Number, default: 0 },
    unit: { type: String, default: "" },
    rate: { type: Number, default: 0 },
  },
  { _id: false },
);

// One numbered interim certificate. Cumulative-less-previous arithmetic:
// each certificate carries its own cumulative value-to-date; the amount due
// this period is derived as cumulativeValue minus the sum of all previous
// certificates' `thisCertificate` totals. Retention / VAT / WHT are captured
// at the moment of issue so historical certs remain reproducible even if
// the project settings change later.
const CertificateSchema = new mongoose.Schema(
  {
    number: { type: Number, required: true },
    date: { type: Date, default: () => new Date() },
    periodStart: { type: Date, default: null },
    periodEnd: { type: Date, default: null },
    cumulativeValue: { type: Number, default: 0 },
    lessPrevious: { type: Number, default: 0 },
    thisCertificate: { type: Number, default: 0 },
    retentionPct: { type: Number, default: 5 },
    retentionAmount: { type: Number, default: 0 },
    retentionReleased: { type: Number, default: 0 },
    vatPct: { type: Number, default: 7.5 },
    vatAmount: { type: Number, default: 0 },
    whtPct: { type: Number, default: 2.5 },
    whtAmount: { type: Number, default: 0 },
    netPayable: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["draft", "approved", "paid"],
      default: "draft",
    },
    notes: { type: String, default: "" },
    // Snapshot of which items were counted toward this cert, for audit:
    snapshotCompletedCount: { type: Number, default: 0 },
    snapshotTotalCount: { type: Number, default: 0 },
  },
  { _id: false },
);

// Final Account — closure document reconciling measured work actuals,
// approved variations, retention release and overall project settlement.
// Once finalized, all project data is frozen (items, variations, certs).
const FinalAccountSchema = new mongoose.Schema(
  {
    finalized: { type: Boolean, default: false },
    finalizedAt: { type: Date, default: null },
    finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    measuredWorkFinal: { type: Number, default: 0 },
    provisionalFinal: { type: Number, default: 0 },
    preliminaryFinal: { type: Number, default: 0 },
    variationsFinal: { type: Number, default: 0 },
    retentionReleased: { type: Number, default: 0 },
    totalCertifiedToDate: { type: Number, default: 0 },
    agreedContractSum: { type: Number, default: 0 },
    finalContractValue: { type: Number, default: 0 },
    savings: { type: Number, default: 0 }, // positive = under-run, negative = over-run
    notes: { type: String, default: "" },
  },
  { _id: false },
);

// IFC / BIM model attached to the project — one per discipline. Files are
// stored in Cloudflare R2 (S3-compatible); `key` is the R2 object key used
// for deletion and signed-URL regeneration, `url` is the public-read URL.
const ProjectModelSchema = new mongoose.Schema(
  {
    sourceFile: { type: String, default: "" },
    key: { type: String, default: "" },
    url: { type: String, default: "" },
    sizeBytes: { type: Number, default: 0 },
    format: { type: String, default: "ifc" }, // "ifc" | "fragments"
    uploadedAt: { type: Date, default: null },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { _id: false },
);

const ProjectModelsSchema = new mongoose.Schema(
  {
    architectural: { type: ProjectModelSchema, default: () => ({}) },
    structural: { type: ProjectModelSchema, default: () => ({}) },
    mep: { type: ProjectModelSchema, default: () => ({}) },
  },
  { _id: false },
);

const ContractSchema = new mongoose.Schema(
  {
    locked: { type: Boolean, default: false },
    lockedAt: { type: Date, default: null },
    lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    approvedAt: { type: Date, default: null },
    // Preliminaries as a percentage of (measured work + provisional sums).
    // Typical range in Nigerian practice is 5 – 10%. Stored as whole number.
    preliminaryPercent: { type: Number, default: 7.5 },
    // Frozen totals at lock time so the client can compare live actuals
    // against the contract baseline even after edits.
    contractSum: { type: Number, default: 0 },
    measuredAtLock: { type: Number, default: 0 },
    provisionalAtLock: { type: Number, default: 0 },
    preliminaryAtLock: { type: Number, default: 0 },
    baseItems: { type: [ContractBaseItemSchema], default: [] },
    notes: { type: String, default: "" },
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
    category: { type: String, default: "" },
    trade: { type: String, default: "" },
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
    provisionalSums: { type: [ProvisionalSumSchema], default: [] },
    variations: { type: [VariationSchema], default: [] },
    preliminaryItems: { type: [PreliminaryItemSchema], default: [] },
    contract: { type: ContractSchema, default: () => ({}) },
    certificates: { type: [CertificateSchema], default: [] },
    finalAccount: { type: FinalAccountSchema, default: () => ({}) },
    models: { type: ProjectModelsSchema, default: () => ({}) },
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
