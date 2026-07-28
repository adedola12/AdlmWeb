// server/models/AiAllocation.js
// How much AI a user may consume per calendar month — overall and per feature.
//
// Two kinds of document:
//   scope "default" — exactly one row (userId null). The allowance every user
//                     gets unless they have their own, plus the ceiling that
//                     applies to all anonymous visitors combined.
//   scope "user"    — an override for one account, set from the admin page.
//
// A limit of 0 means UNLIMITED, not "blocked" — that keeps an unconfigured
// install behaving exactly as it did before this feature existed. To actually
// stop a user, set enabled=false.

import mongoose from "mongoose";

const LimitSchema = new mongoose.Schema(
  {
    calls: { type: Number, default: 0, min: 0 }, // model round-trips / requests
    tokens: { type: Number, default: 0, min: 0 },
    costUsd: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const AiAllocationSchema = new mongoose.Schema(
  {
    scope: { type: String, enum: ["default", "user"], default: "user", index: true },

    // Null on the default row. Sparse-unique so a user can hold at most one.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    email: { type: String, default: "", lowercase: true, trim: true, index: true },

    // Master switch for this user's AI access.
    enabled: { type: Boolean, default: true },

    // Applies across every feature combined.
    total: { type: LimitSchema, default: () => ({}) },

    // Per-feature caps, keyed by the feature keys in config/aiPricing.js.
    // A feature absent from the map is governed only by `total`.
    features: {
      type: Map,
      of: LimitSchema,
      default: () => new Map(),
    },

    // Default row only: the combined monthly ceiling for ALL anonymous
    // visitors. Guests can't be metered individually, but they can still burn
    // credit, so they get one shared budget.
    guestTotal: { type: LimitSchema, default: () => ({}) },

    notes: { type: String, default: "" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedByEmail: { type: String, default: "" },
  },
  { timestamps: true },
);

AiAllocationSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { userId: { $type: "objectId" } } },
);

export const AiAllocation =
  mongoose.models.AiAllocation || mongoose.model("AiAllocation", AiAllocationSchema);
