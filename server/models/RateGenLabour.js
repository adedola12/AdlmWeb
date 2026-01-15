import mongoose from "mongoose";

const RateGenLabourSchema = new mongoose.Schema(
  {
    sn: { type: Number, required: true, unique: true, index: true },
    key: { type: String, default: "", index: true },
    name: { type: String, required: true, index: true },
    unit: { type: String, default: "" },
    defaultUnitPrice: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
    tags: { type: [String], default: [] },
  },
  { timestamps: true }
);

RateGenLabourSchema.index({ name: 1 });
RateGenLabourSchema.index({ key: 1 });

export const RateGenLabour =
  mongoose.models.RateGenLabour ||
  mongoose.model("RateGenLabour", RateGenLabourSchema);
