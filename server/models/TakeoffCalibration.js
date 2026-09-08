// server/models/TakeoffCalibration.js
//
// A user's own answer to "roughly how long does a takeoff of this size take
// you by hand?", asked once by the plugin after their first session. Stored
// with the counts of the session it was asked against so the answer can be
// turned into a multiplier on the rate table (util/takeoffTime.js
// calibrationScale) and applied to that user's sessions only. One document per
// user+product; `skipped` records that they were asked and declined, so the
// plugin never asks again.
import mongoose from "mongoose";

const TakeoffCalibrationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    product: { type: String, enum: ["HERON", "QUIV", "RATEGEN"], required: true },
    skipped: { type: Boolean, default: false },
    manualMinutes: { type: Number, default: 0, min: 0 },
    referenceCounts: {
      sheets: { type: Number, default: 0 },
      items: { type: Number, default: 0 },
      elementTypes: { type: Number, default: 0 },
      boqLines: { type: Number, default: 0 },
    },
    // Session the question was asked after, for traceability.
    referenceSessionId: { type: String, default: "" },
    // Baseline version the scale was derived against.
    baselineVersion: { type: String, default: "" },
    scale: { type: Number, default: 1 },
  },
  { timestamps: true },
);

TakeoffCalibrationSchema.index({ userId: 1, product: 1 }, { unique: true });

export const TakeoffCalibration =
  mongoose.models.TakeoffCalibration ||
  mongoose.model("TakeoffCalibration", TakeoffCalibrationSchema);
