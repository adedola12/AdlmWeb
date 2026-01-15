import mongoose from "mongoose";

const LineSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: ["material", "labour", "constant"],
      required: true,
    },

    // Stable binding into the shared libraries:
    refSn: { type: Number }, // preferred
    refKey: { type: String }, // fallback
    refName: { type: String }, // legacy fallback (matches your WPF string lookup)

    // Snapshot fields (optional but handy for UI)
    description: { type: String, default: "" },
    unit: { type: String, default: "" },

    // Cached price at build time (offline/local fallback)
    unitPriceAtBuild: { type: Number, default: 0 },

    qtyPerUnit: { type: Number, default: 0 }, // quantity per 1 output unit
    factor: { type: Number, default: 1 }, // e.g. waste, 1.4 multipliers, etc.
  },
  { _id: false }
);

const RateGenComputeItemSchema = new mongoose.Schema(
  {
    section: { type: String, required: true, index: true }, // "Blockwork"
    name: { type: String, required: true },
    outputUnit: { type: String, default: "m2" },

    // Optional defaults (client can still override like your WPF does)
    overheadPercentDefault: { type: Number, default: 10 },
    profitPercentDefault: { type: Number, default: 25 },

    enabled: { type: Boolean, default: true },
    notes: { type: String, default: "" },

    lines: { type: [LineSchema], default: [] },
  },
  { timestamps: true }
);

RateGenComputeItemSchema.index({ section: 1, name: 1 }, { unique: true });

export const RateGenComputeItem =
  mongoose.models.RateGenComputeItem ||
  mongoose.model("RateGenComputeItem", RateGenComputeItemSchema);
