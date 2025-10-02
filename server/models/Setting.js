import mongoose from "mongoose";

const SettingSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, index: true },
    fxRateNGNUSD: { type: Number, default: 0.001 }, // 1 NGN = 0.001 USD (example)
  },
  { timestamps: true }
);

export const Setting = mongoose.model("Setting", SettingSchema);
