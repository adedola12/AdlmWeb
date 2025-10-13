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
    username: { type: String, index: true, unique: true, sparse: true },
    avatarUrl: { type: String },
    zone: {
      type: String,
      enum: [
        "north_west",
        "north_east",
        "north_central",
        "south_west",
        "south_east",
        "south_south",
      ],
      default: null,
    },

    passwordHash: String,
    role: { type: String, enum: ["user", "admin"], default: "user" },
    disabled: { type: Boolean, default: false },
    entitlements: [EntitlementSchema],
    refreshVersion: { type: Number, default: 1 },
  },
  { timestamps: true }
);

export const User = mongoose.model("User", UserSchema);
