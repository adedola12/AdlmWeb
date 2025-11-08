// server/models/Refresh.js
import mongoose from "mongoose";

const RefreshSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
      required: true,
    },
    token: { type: String, index: true, required: true },
    ua: String,
    ip: String,
  },
  { timestamps: true }
);

RefreshSchema.index({ token: 1 }, { unique: true });

export const Refresh =
  mongoose.models.Refresh || mongoose.model("Refresh", RefreshSchema);
