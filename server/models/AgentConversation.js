import mongoose from "mongoose";

/**
 * AgentConversation — a rolling transcript of one visitor's chat with the
 * ADLM AI Agent, upserted by client-generated sessionId. Kept for conversion
 * tuning: which questions the agent handled, where it dropped people, and
 * whether the session ended in a lead / checkout deep-link.
 *
 * Best-effort only — a failed write never blocks a reply.
 */
const MessageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["user", "assistant"], required: true },
    text: { type: String, default: "" },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const AgentConversationSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    role: { type: String, default: "guest" },
    ip: { type: String, default: "" },

    messages: { type: [MessageSchema], default: [] },
    turns: { type: Number, default: 0 },

    // Outcome signals for the conversion funnel.
    capturedLead: { type: Boolean, default: false },
    offeredCheckout: { type: Boolean, default: false },
    offeredSignup: { type: Boolean, default: false },
    productKeysOffered: { type: [String], default: [] },
  },
  { timestamps: true },
);

export const AgentConversation =
  mongoose.models.AgentConversation ||
  mongoose.model("AgentConversation", AgentConversationSchema);
