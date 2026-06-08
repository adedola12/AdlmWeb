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
    // For 'binary' events (legacy semantic) amount = qty × rate when ratified,
    // 0 when unratified. For 'partial' events amount = the value delta moved
    // by this transition, i.e. qty × rate × (nextPercent − previousPercent) / 100.
    // Summing positive amounts gives "value of work done in this period".
    amount: { type: Number, default: 0 },
    statusField: {
      type: String,
      enum: ["completed", "purchased"],
      default: "completed",
    },
    markedValue: { type: Boolean, default: true },
    // Percent context for partial events. Defaults to 0/0 so legacy events
    // (pre-partial-valuation) still deserialize cleanly.
    previousPercent: { type: Number, default: 0 },
    nextPercent: { type: Number, default: 0 },
    eventType: {
      type: String,
      enum: ["binary", "partial"],
      default: "binary",
    },
    markedAt: { type: Date, default: Date.now },
    markedDay: { type: String, default: "" },
  },
  { _id: false },
);

const ProvisionalSumSchema = new mongoose.Schema(
  {
    description: { type: String, default: "", trim: true },
    amount: { type: Number, default: 0 },
    // PC sums are budgetary allowances — the actual scope is executed and
    // billed later. The `completed` flag is the QS's "yes, this allowance
    // has been executed/used" toggle. Until ticked, the amount counts
    // toward the BAC but NOT toward earned value or the PM dashboard's
    // "Done" buckets. Matches preliminary-item semantics.
    completed: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
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
    // QS-entered actual spend on this preliminary item. Distinct from
    // the allocation × pool calculation (which is what the contract
    // pays). actualAmount captures what the contractor really spent,
    // letting the QS spot rows that are running over their planned
    // share of the preliminary pool.
    actualAmount: { type: Number, default: 0 },
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
    // Variations represent extra/change work that may or may not yet be
    // executed on site. The `completed` flag is the QS's "this variation
    // has been done and is being claimed" toggle. Counts toward BAC always;
    // toward earned value only when ticked. Same semantics as PC sums.
    completed: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
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

// Result of validating an uploaded IFC against the discipline's quantities.
// The Element IDs the quantities were measured from (item.elementIds) must
// all be present in the model's IFC (matched on the Revit Element ID written
// into each element's IFC `Tag`). status:
//   "valid"         — every required Element ID was found in the IFC
//   "invalid"       — (reserved) a previously-stored model failed a re-check
//   "no-quantities" — this discipline has no measured items to validate against
//   "unchecked"     — no client-side parse was available (e.g. a .frag upload)
const ModelValidationSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["valid", "invalid", "no-quantities", "unchecked"],
      default: "unchecked",
    },
    requiredCount: { type: Number, default: 0 }, // distinct Element IDs the discipline's quantities need
    matchedCount: { type: Number, default: 0 }, // of those, how many are in the IFC
    missingCount: { type: Number, default: 0 },
    ifcElementCount: { type: Number, default: 0 }, // total elements the client parsed from the IFC
    sampleMissingIds: { type: [Number], default: [] }, // capped sample for the UI
    checkedAt: { type: Date, default: null },
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
    validation: { type: ModelValidationSchema, default: () => ({}) },
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
    // Actual time tracking — QS-recorded "this task really took N days".
    // When both actualStartDate and actualEndDate are set, the duration
    // can be auto-derived (server falls back to that calc in summarise).
    // Lets users see schedule slip (actual − planned days) alongside the
    // existing cost variance.
    actualStartDate: { type: Date, default: null },
    actualEndDate: { type: Date, default: null },
    actualDurationDays: { type: Number, default: 0 },
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
    // Weight (0-100) per link, parallel to linkedBoqIdentities. Lets a
    // single BoQ line be split across multiple tasks — e.g. "Windows &
    // Doors" → "First fix" at 70 + "Final fix" at 30. Baseline cost for
    // a task = Σ (item.amount × weight/100). Missing entries default to
    // 100 (full item), preserving the pre-feature behaviour for legacy
    // data. The dashboard surfaces total-weight-per-item so users see
    // whether a single BoQ line is balanced (sum = 100), under-allocated
    // (gap in WBS coverage), or over-allocated (double-counted in EV).
    linkedBoqWeights: { type: [Number], default: [] },
    isMilestone: { type: Boolean, default: false },
    isSummary: { type: Boolean, default: false }, // collapse / roll-up parent
    // True when MS Project flagged this task as being on the critical
    // path (Critical=1 in MSPDI, or TotalSlack=0). Drives the "critical
    // path" badge in the WBS table and the priority-bump applied at
    // import time. Manual tasks default to false; users can flip it on
    // a per-task basis via the edit modal.
    criticalPath: { type: Boolean, default: false },
    // Total slack in days as reported by MS Project. 0 = critical;
    // higher values = scheduling buffer. Surfaces in tooltips so users
    // can see how much room each task has before it eats into the
    // finish date.
    totalSlackDays: { type: Number, default: 0 },
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
    // Contingency reserve as a % of (measured + provisional + preliminaries).
    // Allows the QS to allow for unforeseen costs. 5% is the QS standard;
    // can be 0 to disable.
    contingencyPercent: { type: Number, default: 5 },
    // VAT / sales tax as a % of (subtotal + contingency). Nigeria's
    // standard VAT is 7.5%. Set to 0 if the contract is tax-exclusive
    // or VAT is handled outside the build.
    taxPercent: { type: Number, default: 7.5 },
    // Frozen totals at lock time so the client can compare live actuals
    // against the contract baseline even after edits.
    contractSum: { type: Number, default: 0 },
    measuredAtLock: { type: Number, default: 0 },
    provisionalAtLock: { type: Number, default: 0 },
    preliminaryAtLock: { type: Number, default: 0 },
    // Frozen contingency + tax amounts at lock time. Lets the client
    // show "contract included ₦5.7M contingency" even years later,
    // independent of the live BoQ values.
    contingencyAtLock: { type: Number, default: 0 },
    taxAtLock: { type: Number, default: 0 },
    baseItems: { type: [ContractBaseItemSchema], default: [] },
    notes: { type: String, default: "" },
    // bcrypt-hashed 4-digit PIN required to unlock the contract once locked.
    // Stored hashed, never returned to the client. Empty string = no PIN set
    // (back-compat for projects locked before this feature shipped — those
    // can still be unlocked without a PIN).
    lockPinHash: { type: String, default: "" },
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
    // Partial-completion percentage (0-100). Used for partial valuation —
    // the value-of-work-done for this line is qty × rate × (completed
    // ? 1 : percentComplete / 100). The binary completed/purchased flag
    // still represents "ratified / paid in full"; the percentage tracks
    // progress before that final sign-off. PM tasks linked to this item
    // propagate their own percentComplete down to this field.
    percentComplete: { type: Number, default: 0 },
    percentCompleteUpdatedAt: { type: Date, default: null },
    description: { type: String, default: "" },
    takeoffLine: { type: String, default: "" },
    materialName: { type: String, default: "" },
    elementIds: { type: [Number], default: [] },
    level: { type: String, default: "" },
    type: { type: String, default: "" },
    code: { type: String, default: "" },
    category: { type: String, default: "" },
    trade: { type: String, default: "" },
    // BIM model discipline this line belongs to (architectural | structural |
    // mep | unknown). Derived from category on save (deriveItemDiscipline) or
    // supplied explicitly by the plugin. Drives the per-discipline IFC
    // Element-ID validation gate.
    discipline: { type: String, default: "" },

    // ── Takeoff → Materials linkage (QUIV material-rate upgrade) ──
    // Set on derived material/labour lines so each one ties back to the
    // takeoff line it came from. sourceTakeoffCode matches the parent
    // TakeoffItem.code; elementIds (above) are copied from that line.
    sourceTakeoffCode: { type: String, default: "" },
    // Material | Labour | Plant | Consumable | Equipment
    componentKind: { type: String, default: "" },
    // true ⇒ machine-derived from a takeoff save (vs a manual Material entry)
    derived: { type: Boolean, default: false },
    // Per-unit net cost from the rate build-up — kept for margin maths.
    // null = not supplied (so legacy/takeoff lines stay untouched).
    netUnitCost: { type: Number, default: null },
    // Overhead / profit % carried from the rate build-up (for margin calc).
    overheadPercent: { type: Number, default: null },
    profitPercent: { type: Number, default: null },
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
    // Informational model metadata shared by takeoff + derived-materials
    // payloads. Used for display and to make the two projects easy to relate.
    modelTitle: { type: String, default: "" },
    modelPath: { type: String, default: "" },
    // "takeoff-derived" marks a materials project that was auto-created from a
    // takeoff save (vs a manual Material-module save). "" for normal projects.
    origin: { type: String, default: "" },
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
