import mongoose from "mongoose";

const RateItemSchema = new mongoose.Schema(
  {
    sn: Number,
    description: String,
    unit: String,
    price: Number,
    category: { type: String, default: "" },
  },
  { _id: false }
);

const RateGenLibrarySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    materials: { type: [RateItemSchema], default: [] },
    labour: { type: [RateItemSchema], default: [] },
    version: { type: Number, default: 1 },
  },
  { timestamps: true }
);

export const RateGenLibrary = mongoose.model(
  "RateGenLibrary",
  RateGenLibrarySchema
);
