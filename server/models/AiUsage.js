// server/models/AiUsage.js
// One document per AI model round-trip, across every AI feature on the platform
// (Ada, HelpBot, and the three AWS AI-service tools). Event-level rather than
// pre-aggregated so the admin dashboard can slice by user, feature, model or
// billing account after the fact without a migration — and so a surprise in the
// AWS bill can always be traced back to the exact calls that caused it.
//
// Written fire-and-forget by services/aiUsage.js: a failure here must never
// break the user-facing AI call.

import mongoose from "mongoose";

const AiUsageSchema = new mongoose.Schema(
  {
    // When the call was made. Separate from createdAt so a backfill can carry
    // the real timestamp.
    at: { type: Date, default: Date.now, index: true },

    // Null for anonymous visitors (Ada and HelpBot both serve guests).
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    email: { type: String, default: "", lowercase: true, trim: true, index: true },
    name: { type: String, default: "" },
    role: { type: String, default: "guest" },

    // Feature key from config/aiPricing.js — "ada-chat", "ai-boq-check", …
    feature: { type: String, required: true, index: true },
    // Which surface the call came from ("cloud" = website, plugins send their own).
    product: { type: String, default: "cloud", index: true },

    provider: { type: String, default: "" }, // anthropic | openai | adlm-ai-service
    model: { type: String, default: "" },
    billedTo: { type: String, default: "unknown", index: true }, // aws | anthropic | openai

    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    cacheReadTokens: { type: Number, default: 0 },
    cacheWriteTokens: { type: Number, default: 0 },
    // Subset of cacheWriteTokens written with the 1-hour TTL, billed at 2x the
    // input rate instead of 1.25x. Kept as a subset so rows written before the
    // extended TTL existed still price correctly.
    cacheWrite1hTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },

    // "reported"  — the provider returned a usage block (trustworthy)
    // "estimated" — derived from payload size (~4 chars/token), approximate
    // "none"      — no basis at all; cost is 0 and must be shown as unknown
    tokenSource: { type: String, default: "none" },

    costUsd: { type: Number, default: 0 },
    ms: { type: Number, default: 0 },

    ok: { type: Boolean, default: true },
    errorCode: { type: String, default: "" },

    sessionId: { type: String, default: "" },
    ip: { type: String, default: "" },
  },
  { timestamps: true },
);

// Dashboard access paths: the time-window scan, the per-user drill-down, and
// the per-feature/per-account rollups.
AiUsageSchema.index({ at: -1 });
AiUsageSchema.index({ userId: 1, at: -1 });
AiUsageSchema.index({ feature: 1, at: -1 });
AiUsageSchema.index({ billedTo: 1, at: -1 });
// Serves the allocation check, which is per user + feature + current month.
AiUsageSchema.index({ userId: 1, feature: 1, at: -1 });

// Optional retention. AI_USAGE_TTL_DAYS=0 (default) keeps rows forever, which
// is what you want while the credit pool is being watched.
const ttlDays = Number(process.env.AI_USAGE_TTL_DAYS || 0);
if (ttlDays > 0) {
  AiUsageSchema.index({ at: 1 }, { expireAfterSeconds: ttlDays * 86400 });
}

export const AiUsage = mongoose.models.AiUsage || mongoose.model("AiUsage", AiUsageSchema);
