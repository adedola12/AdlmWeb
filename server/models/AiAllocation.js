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
    // A cap of 0 is UNLIMITED, so it cannot express "off" — hence this flag.
    // On the default row, enabled:false is a PLATFORM-WIDE kill for that
    // feature: it applies even to users who hold their own allocation.
    enabled: { type: Boolean, default: true },
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

    // Master switch. On the DEFAULT row this is the platform-wide kill switch:
    // false turns AI off for everyone, including users with their own
    // allocation. On a user row it only affects that user.
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
