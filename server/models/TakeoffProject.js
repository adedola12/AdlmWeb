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

// ── Project Management (PM) sub-documents ─────────────────────────────────
// Lightweight WBS / EVM layer that sits alongside the BoQ. tasks can be
// hand-authored, generated from BoQ items (one task per line) or imported
// from MS Project (XML or MPP). Each task carries baseline + actual fields
// so we can derive Earned Value metrics (CPI, SPI, EV, PV, AC) without
// duplicating BoQ rates — when linkedBoqIdentities is populated, the task
// inherits its cost from the linked BoQ items.
const PmTaskSchema = new mongoose.Schema(
  {
    taskId: { type: String, default: "" }, // stable client/import id
    wbs: { type: String, default: "" },
    name: { type: String, default: "", trim: true },
    description: { type: String, default: "" },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    baselineStart: { type: Date, default: null },
    baselineEnd: { type: Date, default: null },
    durationDays: { type: Number, default: 0 },
    percentComplete: { type: Number, default: 0 }, // 0-100
    predecessors: { type: [String], default: [] }, // array of taskIds
    baselineCost: { type: Number, default: 0 },
    actualCost: { type: Number, default: 0 },
    resourceNames: { type: String, default: "" },
    assignedTo: { type: String, default: "" },
    status: {
      type: String,
      enum: ["not-started", "in-progress", "completed", "blocked"],
      default: "not-started",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },
    // Identities of BoQ items contributing to this task's cost. When non-empty
    // the task's baselineCost is derived from those items' qty × rate, so
    // edits to the BoQ flow through to the schedule view without a manual sync.
    linkedBoqIdentities: { type: [String], default: [] },
    isMilestone: { type: Boolean, default: false },
    isSummary: { type: Boolean, default: false }, // collapse / roll-up parent
    parentTaskId: { type: String, default: "" }, // for hierarchical WBS
    source: {
      type: String,
      enum: ["manual", "boq", "msproject-xml", "msproject-mpp", "csv"],
      default: "manual",
    },
    notes: { type: String, default: "" },
    createdAt: { type: Date, default: () => new Date() },
    updatedAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const PmRiskSchema = new mongoose.Schema(
  {
    riskId: { type: String, default: "" },
    title: { type: String, default: "", trim: true },
    description: { type: String, default: "" },
    probability: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    impact: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    status: {
      type: String,
      enum: ["open", "mitigating", "closed", "accepted"],
      default: "open",
    },
    owner: { type: String, default: "" },
    mitigation: { type: String, default: "" },
    createdAt: { type: Date, default: () => new Date() },
    updatedAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const PmIssueSchema = new mongoose.Schema(
  {
    issueId: { type: String, default: "" },
    title: { type: String, default: "", trim: true },
    description: { type: String, default: "" },
    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },
    status: {
      type: String,
      enum: ["open", "in-progress", "resolved", "closed"],
      default: "open",
    },
    owner: { type: String, default: "" },
    openedAt: { type: Date, default: () => new Date() },
    resolvedAt: { type: Date, default: null },
    notes: { type: String, default: "" },
  },
  { _id: false },
);

const PmImportSchema = new mongoose.Schema(
  {
    filename: { type: String, default: "" },
    format: { type: String, default: "" }, // "msproject-xml" | "msproject-mpp" | "csv"
    importedAt: { type: Date, default: () => new Date() },
    taskCount: { type: Number, default: 0 },
    note: { type: String, default: "" },
  },
  { _id: false },
);

const ProjectManagementSchema = new mongoose.Schema(
  {
    projectStart: { type: Date, default: null },
    projectFinish: { type: Date, default: null },
    baselineDate: { type: Date, default: null },
    // Total project budget override. When 0, dashboard falls back to contract
    // sum / BoQ gross total.
    budgetOverride: { type: Number, default: 0 },
    tasks: { type: [PmTaskSchema], default: [] },
    risks: { type: [PmRiskSchema], default: [] },
    issues: { type: [PmIssueSchema], default: [] },
    imports: { type: [PmImportSchema], default: [] },
    // Last time anything in this sub-document changed — used for the
    // dashboard "as of" timestamp.
    lastEditedAt: { type: Date, default: null },
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
    projectManagement: {
      type: ProjectManagementSchema,
      default: () => ({}),
    },
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
