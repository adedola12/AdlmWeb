import mongoose from "mongoose";

const DeviceBindingSchema = new mongoose.Schema(
  {
    fingerprint: { type: String, required: true, trim: true },
    name: { type: String, default: "" },
    boundAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
    revokedAt: { type: Date, default: null },
    // Fingerprint algorithm version:
    //   1 = legacy SHA256(MachineName + MAC + Username)
    //   2 = hardware-bound SHA256(CPUId + BIOS SN + Motherboard SN)
    // Used for the seamless one-time migration from v1 → v2.
    fpVersion: { type: Number, default: 1, min: 1 },
  },
  { _id: false },
);

const EntitlementSchema = new mongoose.Schema(
  {
    productKey: { type: String, required: true, trim: true, lowercase: true },

    status: {
      type: String,
      enum: ["active", "inactive", "disabled", "expired"],
      default: "inactive",
    },

    expiresAt: { type: Date },

    seats: { type: Number, default: 1, min: 1 },
    devices: { type: [DeviceBindingSchema], default: [] },

    licenseType: {
      type: String,
      enum: ["personal", "organization"],
      default: "personal",
    },
    organizationName: { type: String, trim: true, default: "" },

    deviceFingerprint: { type: String, trim: true },
    deviceBoundAt: { type: Date },

    notify: {
      lastSentAt: { type: Date, default: null },
      lastSentKind: { type: String, enum: ["pre", "post"], default: null },
      lastSentDays: { type: Number, default: null },
    },

    // Extra project slots purchased by the user for this product.
    // Admin sets this when approving a storage add-on purchase.
    extraProjectSlots: { type: Number, default: 0, min: 0 },
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

    // Locked certificate name — set once on first certificate download, immutable after.
    certificateFirstName: { type: String, default: "", trim: true },
    certificateLastName: { type: String, default: "", trim: true },
    certificateNameLockedAt: { type: Date, default: null },
    whatsapp: { type: String, default: "", trim: true },

    // Optional user-supplied profile details.
    location: { type: String, default: "", trim: true },
    firmName: { type: String, default: "", trim: true },

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

    // Role key — references a Role.key (see server/models/Role.js). No enum so
    // admins can create custom roles; validated against existing roles on
    // assignment. "user" is the default no-admin-access role.
    role: {
      type: String,
      default: "user",
      lowercase: true,
      trim: true,
    },

    disabled: { type: Boolean, default: false },

    // Break-glass "God" support account flag. On its own this does NOTHING —
    // God powers only activate when this is true AND the email is also listed
    // in the GOD_ACCOUNT_EMAILS deploy env var (see server/util/godAccount.js).
    // Grants a fully-audited, OTP-gated super-admin that bypasses device/seat
    // binding so the technical team can sign in on any machine to fix issues.
    isGod: { type: Boolean, default: false },

    // Per-user security preferences. stepUpEnabled = require an emailed OTP
    // before sensitive actions (deleting projects, locking/unlocking a
    // contract). Off by default — opt-in from the profile page.
    security: {
      stepUpEnabled: { type: Boolean, default: false },
    },

    entitlements: { type: [EntitlementSchema], default: [] },

    refreshVersion: { type: Number, default: 1 },
    welcomeEmailSentAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const User = mongoose.models.User || mongoose.model("User", UserSchema);
