import mongoose from "mongoose";

/**
 * ADLM's own overhead and profit default for one trade, for the MASTER rate
 * library. Applied only when a master rate is created without a percentage
 * (routes/admin.rategen.rates.js); a stored master rate is never rewritten.
 *
 * One document per trade. Either half may be null, meaning the built-in
 * 10% / 25% applies to that half.
 */
const RateGenTradeMarginSchema = new mongoose.Schema(
  {
    sectionKey: { type: String, required: true, unique: true, trim: true, lowercase: true },
    overheadPercent: { type: Number, default: null, min: 0 },
    profitPercent: { type: Number, default: null, min: 0 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

export const RateGenTradeMargin =
  mongoose.models.RateGenTradeMargin ||
  mongoose.model("RateGenTradeMargin", RateGenTradeMarginSchema);
