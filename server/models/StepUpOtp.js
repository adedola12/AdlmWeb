// server/models/StepUpOtp.js
// One-time codes for "step-up" verification — the email OTP a user must pass
// before a sensitive action (deleting projects, locking/unlocking a contract).
// Mirrors PasswordReset, with a TTL index so expired/used codes self-purge.
import mongoose from "mongoose";

const StepUpOtpSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, index: true },
    code: { type: String, index: true }, // 6-digit string
    // No field-level index here — the TTL index below covers expiresAt.
    expiresAt: { type: Date },
    usedAt: { type: Date },
    attempts: { type: Number, default: 0 },
    requestedFromIp: String,
  },
  { timestamps: true }
);

StepUpOtpSchema.index({ userId: 1, usedAt: 1, expiresAt: 1 });
// Auto-delete documents once they expire (Mongo TTL monitor honours the
// per-document expiresAt value because expireAfterSeconds is 0).
StepUpOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const StepUpOtp =
  mongoose.models.StepUpOtp || mongoose.model("StepUpOtp", StepUpOtpSchema);
