// server/models/TakeoffSession.js
//
// One record per takeoff / quantity-extraction session run with an ADLM tool
// (POST /telemetry/takeoff-sessions). The plugin sends identity, timings and
// COUNTS ONLY; the server resolves the firm, picks the baseline and computes
// the manual-time estimate and the time saved, so every figure on the Time
// saved dashboard can be reproduced from this document plus the
// TakeoffBaseline version it names.
//
// Privacy rule, enforced by the route's whitelist and repeated here so nobody
// "helpfully" adds a field: no drawing content, file names, element names,
// quantities or prices are ever stored. `projectRef` is a hash or a label the
// user typed, never a path.
import mongoose from "mongoose";

export const TAKEOFF_SCHEMA_VERSION = 1;

const CountsSchema = new mongoose.Schema(
  {
    sheets: { type: Number, default: 0, min: 0 }, // drawings or views processed
    items: { type: Number, default: 0, min: 0 }, // measured items / element instances
    elementTypes: { type: Number, default: 0, min: 0 }, // distinct categories
    boqLines: { type: Number, default: 0, min: 0 }, // lines written to output
    // Optional split of `items` by PlanSwift measurement kind. Absent for QUIV.
    itemsByKind: {
      type: new mongoose.Schema(
        {
          area: { type: Number, default: 0, min: 0 },
          linear: { type: Number, default: 0, min: 0 },
          count: { type: Number, default: 0, min: 0 },
        },
        { _id: false },
      ),
      default: undefined,
    },
  },
  { _id: false },
);

const BaselineRefSchema = new mongoose.Schema(
  {
    method: {
      type: String,
      enum: ["admin_rate_table", "user_calibration"],
      default: "admin_rate_table",
    },
    // TakeoffBaseline.version the rate table came from.
    version: { type: String, default: "" },
    // Present when method is user_calibration: the calibration used and the
    // multiplier it applied to the rate table.
    calibrationId: { type: mongoose.Schema.Types.ObjectId, ref: "TakeoffCalibration", default: null },
    scale: { type: Number, default: 1 },
    estimatedManualSeconds: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const TakeoffSessionSchema = new mongoose.Schema(
  {
    // Client-generated UUID; duplicates (retries) are dropped, not doubled.
    sessionId: { type: String, required: true, unique: true, trim: true },

    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // Denormalised like UsageSession so admin tables need no join.
    email: { type: String, trim: true, lowercase: true, default: "" },
    // The bound device's fingerprint hash. There is no seat entity in the
    // platform (seats are a count on the entitlement), so the device IS the
    // seat for reporting purposes.
    seatId: { type: String, trim: true, default: "" },
    // Normalised organisation name from the entitlement (or the profile's
    // firmName), resolved server-side. Null for a personal licence.
    firmId: { type: String, trim: true, default: null, index: true },
    firmName: { type: String, trim: true, default: "" },

    product: { type: String, enum: ["HERON", "QUIV", "RATEGEN"], required: true, index: true },
    productKey: { type: String, trim: true, lowercase: true, default: "" },
    productVersion: { type: String, trim: true, default: "" },
    mode: { type: String, enum: ["auto", "assisted"], default: "auto" },
    projectRef: { type: String, trim: true, default: "" },

    startedAt: { type: Date, required: true, index: true },
    endedAt: { type: Date, required: true },
    activeSeconds: { type: Number, required: true, min: 0 },
    wallSeconds: { type: Number, required: true, min: 0 },

    counts: { type: CountsSchema, default: () => ({}) },
    baseline: { type: BaselineRefSchema, default: () => ({}) },

    // estimatedManualSeconds - activeSeconds, floored at 0. Always 0 for a
    // cancelled session; cancelled sessions are also excluded from totals.
    savedSeconds: { type: Number, default: 0, min: 0 },

    cancelled: { type: Boolean, default: false },
    // Written by scripts/seed-takeoff-sessions.mjs so the dashboard can be
    // reviewed before real data arrives. Never counted in public totals.
    seeded: { type: Boolean, default: false, index: true },

    clientTimezone: { type: String, trim: true, default: "" },
    schemaVersion: { type: Number, default: TAKEOFF_SCHEMA_VERSION },
    // When the server received it (startedAt is the client's clock).
    receivedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

TakeoffSessionSchema.index({ product: 1, startedAt: -1 });
TakeoffSessionSchema.index({ firmId: 1, startedAt: -1 });
TakeoffSessionSchema.index({ userId: 1, startedAt: -1 });
TakeoffSessionSchema.index({ seeded: 1, cancelled: 1, startedAt: -1 });

export const TakeoffSession =
  mongoose.models.TakeoffSession || mongoose.model("TakeoffSession", TakeoffSessionSchema);
