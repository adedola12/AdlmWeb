import mongoose from "mongoose";

const RateGenMaterialSchema = new mongoose.Schema(
  {
    sn: { type: Number, required: true, unique: true, index: true },
    key: { type: String, default: "", index: true }, // stable slug (optional)
    name: { type: String, required: true, index: true },
    unit: { type: String, default: "" },
    defaultUnitPrice: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
    tags: { type: [String], default: [] },
  },
  { timestamps: true }
);

RateGenMaterialSchema.index({ name: 1 });
RateGenMaterialSchema.index({ key: 1 });

export const RateGenMaterial =
  mongoose.models.RateGenMaterial ||
  mongoose.model("RateGenMaterial", RateGenMaterialSchema);
