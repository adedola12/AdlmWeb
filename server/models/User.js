// models/User.js
import mongoose from "mongoose";

const EntitlementSchema = new mongoose.Schema(
  {
    productKey: { type: String, required: true },
    status: {
      type: String,
      enum: ["active", "inactive", "disabled"],
      default: "inactive",
    },
    expiresAt: { type: Date },
    deviceFingerprint: { type: String },
    deviceBoundAt: { type: Date },
  },
  { _id: false }
);

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, index: true, unique: true },
    username: { type: String, index: true, unique: true, sparse: true }, // NEW
    passwordHash: String,
    role: { type: String, enum: ["user", "admin"], default: "user" },
    disabled: { type: Boolean, default: false },
    entitlements: [EntitlementSchema],
    refreshVersion: { type: Number, default: 1 },
  },
  { timestamps: true }
);

export const User = mongoose.model("User", UserSchema);
