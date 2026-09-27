// server/models/OpenIntent.js
//
// One row per "Open in QUIV / HERON" ticket (util/openIntent.js). Two jobs:
//
//   1. Single use. Redeem flips `redeemedAt` with a conditional update, so the
//      same ticket cannot open a project twice, even across Lambda instances.
//   2. The success metric on the work board: issued vs redeemed per week, and
//      why the rest failed (`failure`). A row issued and never redeemed is a
//      click that found no handler, or a user who gave up.
//
// Rows expire after 30 days. Nothing here is a secret: the ticket itself is
// never stored, only its jti.
import mongoose from "mongoose";

const OpenIntentSchema = new mongoose.Schema(
  {
    jti: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: "TakeoffProject", required: true },
    product: { type: String, enum: ["quiv", "heron"], required: true },
    expiresAt: { type: Date, required: true },
    redeemedAt: { type: Date, default: null },
    // The last reason a redeem was refused, e.g. "WRONG_ACCOUNT", "EXPIRED".
    failure: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 },
  },
  { versionKey: false },
);

export const OpenIntent =
  mongoose.models.OpenIntent || mongoose.model("OpenIntent", OpenIntentSchema);
