import mongoose from "mongoose";

/**
 * Lead — a warm prospect captured by the ADLM AI Agent when a visitor is
 * interested but not ready to sign up / buy on the spot. Feeds follow-up
 * (and, when NOTION_API_KEY is configured, the Notion CRM).
 *
 * Deliberately loose: the agent collects whatever the visitor volunteers.
 * Only `email` is really meaningful for follow-up, but we never hard-require
 * it so a partial capture is still better than nothing.
 */
const LeadSchema = new mongoose.Schema(
  {
    name: { type: String, default: "", trim: true },
    email: { type: String, default: "", trim: true, lowercase: true, index: true },
    phone: { type: String, default: "", trim: true },

    // Free-text of what they're after, plus any product keys the agent matched.
    interest: { type: String, default: "", trim: true },
    productKeys: { type: [String], default: [] },

    // Anything else the agent thought worth recording (budget, timeline, role…).
    note: { type: String, default: "", trim: true },

    // Where it came from — always "ai-agent" today, kept for future surfaces.
    source: { type: String, default: "ai-agent", trim: true },

    // Linked account when the visitor was logged in.
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    // Client-generated conversation id so we can join a lead to its transcript.
    sessionId: { type: String, default: "", index: true },

    ip: { type: String, default: "" },

    status: {
      type: String,
      enum: ["new", "contacted", "converted", "closed"],
      default: "new",
      index: true,
    },

    // Best-effort Notion sync bookkeeping (mirrors the proposal sync shape).
    notion: {
      contactPageId: { type: String, default: "" },
      lastSyncedAt: { type: Date, default: null },
      lastError: { type: String, default: "" },
    },
  },
  { timestamps: true },
);

export const Lead = mongoose.models.Lead || mongoose.model("Lead", LeadSchema);
