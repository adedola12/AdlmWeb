import mongoose from "mongoose";

const LineSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: ["material", "labour", "constant"],
      required: true,
    },
    refSn: { type: Number }, // SN from library
    description: { type: String, default: "" },
    unit: { type: String, default: "" },
    unitPriceAtBuild: { type: Number }, // cached
    qtyPerUnit: { type: Number, default: 0 },
    factor: { type: Number, default: 1 },
  },
  { _id: false }
);

const RateGenComputeItemSchema = new mongoose.Schema(
  {
    section: { type: String, required: true, index: true }, // "Blockwork"
    name: { type: String, required: true },
    outputUnit: { type: String, default: "m2" },
    poPercent: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
    lines: { type: [LineSchema], default: [] },
  },
  { timestamps: true }
);

RateGenComputeItemSchema.index({ section: 1, name: 1 }, { unique: true });

export const RateGenComputeItem =
  mongoose.models.RateGenComputeItem ||
  mongoose.model("RateGenComputeItem", RateGenComputeItemSchema);
