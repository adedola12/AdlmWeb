// server/models/UsageSession.js
//
// Plugin/app usage sessions built from client heartbeats (POST /usage/heartbeat).
// A session is a run of heartbeats from one user+product with no gap larger
// than the stale threshold (see routes/usage.js); `minutes` is the derived
// duration and is what the admin usage summary aggregates. Writes are
// best-effort — losing a heartbeat must never affect the client.
import mongoose from "mongoose";

const UsageSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      required: true,
    },
    // Denormalised so summaries don't need a users join and survive email edits.
    email: { type: String, trim: true, lowercase: true, default: "" },

    productKey: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
      index: true,
    },

    // What the client reported about itself (helps spot stale installs).
    appVersion: { type: String, trim: true, default: "" },
    fpVersion: { type: Number, default: 0 },
    // SHA-256 device fingerprint hash — correlates usage to a bound device.
    deviceFingerprint: { type: String, trim: true, default: "" },

    startedAt: { type: Date, default: Date.now },
    lastPingAt: { type: Date, default: Date.now, index: true },
    pings: { type: Number, default: 1 },
    // Derived session length; kept persisted so aggregation is a plain $sum.
    minutes: { type: Number, default: 1 },
  },
  { timestamps: true },
);

UsageSessionSchema.index({ userId: 1, productKey: 1, lastPingAt: -1 });
UsageSessionSchema.index({ productKey: 1, lastPingAt: -1 });

export const UsageSession =
  mongoose.models.UsageSession ||
  mongoose.model("UsageSession", UsageSessionSchema);
