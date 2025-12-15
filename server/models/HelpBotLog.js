import mongoose from "mongoose";

const HelpBotLogSchema = new mongoose.Schema(
  {
    ip: String,
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    role: String,
    message: String,
    matches: Number,
    flagged: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const HelpBotLog = mongoose.model("HelpBotLog", HelpBotLogSchema);
