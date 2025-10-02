// import mongoose from "mongoose";

// const PurchaseSchema = new mongoose.Schema(
//   {
//     userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
//     email: { type: String, index: true },
//     productKey: { type: String, required: true }, // rategen|planswift|revit
//     requestedMonths: { type: Number, default: 1 }, // from user
//     status: {
//       type: String,
//       enum: ["pending", "approved", "rejected"],
//       default: "pending",
//       index: true,
//     },
//     decidedBy: { type: String }, // admin email
//     decidedAt: { type: Date },
//     approvedMonths: { type: Number }, // what admin actually granted
//   },
//   { timestamps: true }
// );

// export const Purchase = mongoose.model("Purchase", PurchaseSchema);

import mongoose from "mongoose";

const LineSchema = new mongoose.Schema(
  {
    productKey: String,
    name: String,
    billingInterval: String,
    qty: Number,
    unit: Number, // unit price in chosen currency
    install: Number, // install fee in chosen currency
    subtotal: Number, // unit*qty + install (chosen currency)
  },
  { _id: false }
);

const PurchaseSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    email: { type: String, index: true },

    // new fields:
    currency: { type: String, enum: ["NGN", "USD"], default: "NGN" },
    totalAmount: { type: Number, default: 0 },
    lines: { type: [LineSchema], default: [] },
    paystackRef: { type: String }, // returned from init
    paid: { type: Boolean, default: false },

    // legacy compatibility
    productKey: { type: String }, // optional now
    requestedMonths: { type: Number }, // optional now

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    decidedBy: { type: String },
    decidedAt: { type: Date },
    approvedMonths: { type: Number },
  },
  { timestamps: true }
);

export const Purchase = mongoose.model("Purchase", PurchaseSchema);
