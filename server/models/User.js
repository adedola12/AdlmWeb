import mongoose from "mongoose";

const EntitlementSchema = new mongoose.Schema(
  {
    productKey: { type: String, required: true }, // "planswift" | "revit" | "rategen"
    status: {
      type: String,
      enum: ["active", "inactive", "disabled"],
      default: "inactive",
    },
    expiresAt: { type: Date },
  },
  { _id: false }
);

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, index: true, unique: true },
    passwordHash: String,
    role: { type: String, enum: ["user", "admin"], default: "user" },
    disabled: { type: Boolean, default: false },
    entitlements: [EntitlementSchema],
    refreshVersion: { type: Number, default: 1 }, // bump to invalidate all refresh
  },
  { timestamps: true }
);

export const User = mongoose.model("User", UserSchema);
