// Sign-up counters per visitor (util/signupGuard.js): one small document per
// visitor key and time bucket ("h<hour>" or "d<day>"), incremented atomically.
// The key is a hash of the visitor's network, never the address itself. Each
// counter expires shortly after its bucket ends.
import mongoose from "mongoose";

const SignupThrottleSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    bucket: { type: String, required: true },
    n: { type: Number, default: 0 },
    expireAt: { type: Date, required: true },
  },
  { versionKey: false },
);

SignupThrottleSchema.index({ key: 1, bucket: 1 }, { unique: true });
SignupThrottleSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export const SignupThrottle =
  mongoose.models.SignupThrottle || mongoose.model("SignupThrottle", SignupThrottleSchema);
