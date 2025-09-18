import mongoose from "mongoose";

const PurchaseSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    email: { type: String, index: true },
    productKey: { type: String, required: true }, // rategen|planswift|revit
    requestedMonths: { type: Number, default: 1 }, // from user
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    decidedBy: { type: String }, // admin email
    decidedAt: { type: Date },
    approvedMonths: { type: Number }, // what admin actually granted
  },
  { timestamps: true }
);

export const Purchase = mongoose.model("Purchase", PurchaseSchema);
