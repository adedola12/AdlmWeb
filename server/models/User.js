// models/User.js
import mongoose from "mongoose";

const DeviceBindingSchema = new mongoose.Schema(
  {
    fingerprint: { type: String, required: true, trim: true },
    name: { type: String, default: "" }, // e.g. "Accounts-Laptop-01"
    boundAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
    revokedAt: { type: Date, default: null },
  },
  { _id: false },
);

const EntitlementSchema = new mongoose.Schema(
  {
    productKey: { type: String, required: true, trim: true, lowercase: true },

    status: {
      type: String,
      enum: ["active", "inactive", "disabled"],
      default: "inactive",
    },

    expiresAt: { type: Date },

    // ✅ Seat-based licensing
    seats: { type: Number, default: 1, min: 1 },
    devices: { type: [DeviceBindingSchema], default: [] },

    // ✅ NEW (used by your admin.js + auth.js logic)
    licenseType: {
      type: String,
      enum: ["personal", "organization"],
      default: "personal",
    },
    organizationName: { type: String, trim: true, default: "" },

    // ✅ LEGACY (keep so old docs still load)
    deviceFingerprint: { type: String, trim: true },
    deviceBoundAt: { type: Date },
  },
  { _id: false },
);

const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      index: true,
      unique: true,
      trim: true,
      lowercase: true,
    },

    // keep sparse unique so old docs without username don't collide
    username: {
      type: String,
      index: true,
      unique: true,
      sparse: true,
      trim: true,
    },

    avatarUrl: { type: String, default: "" },

    firstName: { type: String, default: "", trim: true },
    lastName: { type: String, default: "", trim: true },
    whatsapp: { type: String, default: "", trim: true },

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

    passwordHash: { type: String, default: "" },

    role: {
      type: String,
      enum: ["user", "mini_admin", "admin"],
      default: "user",
    },

    disabled: { type: Boolean, default: false },

    entitlements: { type: [EntitlementSchema], default: [] },

    refreshVersion: { type: Number, default: 1 },
    welcomeEmailSentAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const User = mongoose.models.User || mongoose.model("User", UserSchema);
