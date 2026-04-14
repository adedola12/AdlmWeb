import mongoose from "mongoose";

const TrainingLocationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    city: { type: String, trim: true, default: "" },
    state: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, default: "" },

    trainingCostNGN: { type: Number, default: 0 },
    trainingCostUSD: { type: Number, default: 0 },

    bimInstallCostNGN: { type: Number, default: 0 },
    bimInstallCostUSD: { type: Number, default: 0 },

    durationDays: { type: Number, default: 1, min: 1 },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const TrainingLocation =
  mongoose.models.TrainingLocation ||
  mongoose.model("TrainingLocation", TrainingLocationSchema);
