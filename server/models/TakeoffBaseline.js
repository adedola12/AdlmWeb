// server/models/TakeoffBaseline.js
//
// A versioned manual-takeoff rate table (minutes per unit of work). Exactly one
// version is active at a time and new sessions are estimated with it; a
// session records the version it used, and a version that has ever been
// referenced is never edited, only superseded. That immutability is what lets
// ADLM quote a figure and later show exactly which assumptions produced it.
//
// Defaults come from config/takeoffBaselineDefaults.js and are seeded on first
// use (see services/takeoffBaseline.js).
import mongoose from "mongoose";
import { RATE_KEYS } from "../config/takeoffBaselineDefaults.js";

const ratesShape = {};
for (const k of RATE_KEYS) ratesShape[k] = { type: Number, default: 0, min: 0 };

const TakeoffBaselineSchema = new mongoose.Schema(
  {
    version: { type: String, required: true, unique: true, trim: true },
    rates: { type: new mongoose.Schema(ratesShape, { _id: false }), required: true },
    // Free text: where the numbers came from (assumed / timed on N takeoffs).
    notes: { type: String, default: "" },
    active: { type: Boolean, default: false, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    activatedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const TakeoffBaseline =
  mongoose.models.TakeoffBaseline || mongoose.model("TakeoffBaseline", TakeoffBaselineSchema);
