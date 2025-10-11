import mongoose from "mongoose";

const ItemSchema = new mongoose.Schema(
  {
    sn: Number,
    description: String,
    qty: Number,
    unit: { type: String, default: "" },
  },
  { _id: false }
);

const TakeoffProjectSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    productKey: { type: String, default: "revit", index: true }, // "revit" | "revitmep" | "planswift"
    name: { type: String, required: true },
    items: { type: [ItemSchema], default: [] },
    version: { type: Number, default: 1 },
  },
  { timestamps: true }
);

export const TakeoffProject = mongoose.model(
  "TakeoffProject",
  TakeoffProjectSchema
);
