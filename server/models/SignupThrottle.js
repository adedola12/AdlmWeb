// One row per sign-up attempt that passed the other checks, keyed by a hash of
// the visitor address (util/signupGuard.js). Rows expire after a day, which is
// the longest window the cap looks at.
import mongoose from "mongoose";

const SignupThrottleSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, index: true },
    at: { type: Date, required: true, default: () => new Date() },
  },
  { versionKey: false },
);

SignupThrottleSchema.index({ at: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

export const SignupThrottle =
  mongoose.models.SignupThrottle || mongoose.model("SignupThrottle", SignupThrottleSchema);
