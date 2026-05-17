import mongoose from "mongoose";
import crypto from "crypto";

/* One row of the ADLM software-suite table on the proposal. Snapshotted from
   the live Product catalog at create/update time so the document is stable
   even after products or prices change later. */
const SuiteRowSchema = new mongoose.Schema(
  {
    productKey: { type: String, trim: true, default: "" },
    name: { type: String, trim: true, default: "" },
    whatItDoes: { type: String, trim: true, default: "" },
    platform: { type: String, trim: true, default: "" },
    listPrice: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

/* One annual-partnership tier (Starter / Growth / Enterprise). */
const TierSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: "" },
    audience: { type: String, trim: true, default: "" },
    price: { type: String, trim: true, default: "" },
    features: { type: [String], default: [] },
    recommended: { type: Boolean, default: false },
  },
  { _id: false }
);

/* Quotation line item (page 5 of the proposal). */
const ProposalItemSchema = new mongoose.Schema(
  {
    source: { type: String, trim: true, default: "" },
    description: { type: String, trim: true, default: "" },
    term: { type: String, trim: true, default: "" },
    qty: { type: Number, default: 1, min: 0 },
    unitPrice: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  { _id: false }
);

/* Min/max physical-training investment computed live from TrainingLocation. */
const TrainingRangeSchema = new mongoose.Schema(
  {
    minNGN: { type: Number, default: 0 },
    maxNGN: { type: Number, default: 0 },
    minUSD: { type: Number, default: 0 },
    maxUSD: { type: Number, default: 0 },
    locationsCount: { type: Number, default: 0 },
  },
  { _id: false }
);

const ProposalSchema = new mongoose.Schema(
  {
    proposalNumber: { type: String, unique: true, required: true, trim: true },
    seq: { type: Number },

    // Public, unguessable token for the client-facing /proposal/:token view.
    shareToken: {
      type: String,
      unique: true,
      index: true,
      default: () => crypto.randomBytes(16).toString("hex"),
    },

    proposalDate: { type: Date, default: Date.now },
    validUntil: { type: Date, default: null },

    // Client / prospect
    clientFirm: { type: String, trim: true, default: "" },
    clientContact: { type: String, trim: true, default: "" },
    clientTitle: { type: String, trim: true, default: "" },
    clientEmail: { type: String, trim: true, lowercase: true, default: "" },
    clientPhone: { type: String, trim: true, default: "" },
    clientAddress: { type: String, trim: true, default: "" },
    clientUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    // Mirrors the Notion CRM "Category" select.
    clientCategory: { type: String, trim: true, default: "Lead" },

    preparedBy: {
      type: String,
      trim: true,
      default: "Adedolapo Quasim · Founder, ADLM Studio",
    },
    currency: { type: String, enum: ["NGN", "USD"], default: "NGN" },

    // Live-data snapshots
    suite: { type: [SuiteRowSchema], default: [] },
    tiers: { type: [TierSchema], default: [] },
    trainingRange: { type: TrainingRangeSchema, default: () => ({}) },

    // Quotation
    items: { type: [ProposalItemSchema], default: [] },
    subtotal: { type: Number, default: 0 },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    discountAmount: { type: Number, default: 0 },
    taxPercent: { type: Number, default: 0, min: 0, max: 100 },
    taxAmount: { type: Number, default: 0 },
    total: { type: Number, default: 0 },

    // Editable narrative copy
    execSummary: { type: String, trim: true, default: "" },
    terms: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "" },

    status: {
      type: String,
      enum: ["draft", "sent", "accepted", "declined"],
      default: "draft",
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    // Signing — the admin who prepared/sent it, plus the founder counter-sign.
    preparer: {
      name: { type: String, default: "" },
      email: { type: String, default: "" },
    },
    counterSign: {
      name: { type: String, default: "" },
      code: { type: String, default: "" },
    },

    // Notion CRM sync bookkeeping
    notion: {
      contactPageId: { type: String, default: "" },
      activityPageId: { type: String, default: "" },
      lastSyncedAt: { type: Date, default: null },
      lastError: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

ProposalSchema.index({ status: 1 });
ProposalSchema.index({ createdAt: -1 });
ProposalSchema.index({ clientEmail: 1 });

export const Proposal =
  mongoose.models.Proposal || mongoose.model("Proposal", ProposalSchema);
