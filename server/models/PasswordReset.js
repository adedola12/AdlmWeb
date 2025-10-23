// server/models/PasswordReset.js
import mongoose from "mongoose";

const PasswordResetSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, index: true },
    code: { type: String, index: true }, // 6-digit string
    expiresAt: { type: Date, index: true },
    usedAt: { type: Date },
    attempts: { type: Number, default: 0 },
    requestedFromIp: String,
  },
  { timestamps: true }
);

PasswordResetSchema.index({ userId: 1, usedAt: 1, expiresAt: 1 });

export const PasswordReset =
  mongoose.models.PasswordReset ||
  mongoose.model("PasswordReset", PasswordResetSchema);
