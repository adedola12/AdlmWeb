import mongoose from "mongoose";
import { DEFAULT_HOURS_PER_DAY, PART_KINDS } from "../util/plantCosting.js";

/**
 * One part of a machine's day cost: its hire, its fuel, its operator.
 * quantity × unitPrice is what that part costs for ONE working day
 * (e.g. 15 litres × ₦1,000 of diesel). See util/plantCosting.js.
 */
export const PlantPartSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: PART_KINDS, default: "other" },
    description: { type: String, trim: true, default: "" },
    quantity: { type: Number, default: 1, min: 0 },
    unit: { type: String, trim: true, default: "" },
    unitPrice: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

/**
 * ADLM's plant library: a machine priced per day from its parts and used by
 * the hour. The hourly rate is DERIVED (day cost ÷ hours per day) and never
 * stored, so it cannot drift from the parts that make it.
 *
 * Not deleted, only disabled: a rate built last month names the machine that
 * priced it (the same reason a published rate cannot be deleted).
 */
const RateGenPlantSchema = new mongoose.Schema(
  {
    sn: { type: Number, required: true, unique: true, index: true },
    key: { type: String, default: "", index: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, trim: true, default: "" },
    hoursPerDay: { type: Number, default: DEFAULT_HOURS_PER_DAY, min: 0, max: 24 },
    parts: { type: [PlantPartSchema], default: [] },
    notes: { type: String, trim: true, default: "" },
    priceAsOf: { type: Date, default: Date.now },
    enabled: { type: Boolean, default: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

export const RateGenPlant =
  mongoose.models.RateGenPlant || mongoose.model("RateGenPlant", RateGenPlantSchema);
