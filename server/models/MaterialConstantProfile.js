import mongoose from "mongoose";

// A firm's house standards for the Material Constants library — "we get 12
// blocks out of a m², not 10", "our concrete labour is ₦7,000/m³".
//
// Only the values a user actually CHANGED are stored. Everything else resolves
// from the catalog defaults in util/materialConstants.js at read time, so
// improving a default reaches every firm that never overrode it, and a key
// added to the catalog needs no migration here.
//
// Key names are shared with the desktop plugins (QUIV's MaterialConstantKeys.cs
// and Heron's MaterialConstantsStore) so the same library means the same thing
// on the desktop and on the web.
const MaterialConstantProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      unique: true,
      required: true,
    },
    // key → value. Unknown keys and out-of-range values are dropped by
    // sanitizeConstantOverrides before they ever get here.
    values: { type: Map, of: Number, default: () => new Map() },
  },
  { timestamps: true },
);

export const MaterialConstantProfile =
  mongoose.models.MaterialConstantProfile ||
  mongoose.model("MaterialConstantProfile", MaterialConstantProfileSchema);
