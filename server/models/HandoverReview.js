// server/models/HandoverReview.js
//
// One record per reviewed QUIV auto take-off (handover) run: how many steps
// the run saved, and how many of those the estimator kept or rejected before
// closing the panel (POST /ai/quiv/handover-review).
//
// This is the success metric of work-board item r2-ai-auto-takeoff ("share of
// auto-proposed lines accepted without edit"). It is not a usage meter: the
// run itself was already charged as one quiv-handover call when it started,
// and a review never spends a model call.
//
// Counts only. No module names, level names, quantities or file names, for
// the same reason as TakeoffSession: the numbers are enough to judge the
// feature, and nothing else leaves the estimator's machine.
import mongoose from "mongoose";

const HandoverReviewSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    email: { type: String, default: "", lowercase: true, trim: true },
    product: { type: String, default: "quiv" },
    pluginVersion: { type: String, default: "" },

    stepsPlanned: { type: Number, default: 0, min: 0 },
    stepsSaved: { type: Number, default: 0, min: 0 },
    stepsKept: { type: Number, default: 0, min: 0 },
    stepsRejected: { type: Number, default: 0, min: 0 },
    linesKept: { type: Number, default: 0, min: 0 },
    linesRejected: { type: Number, default: 0, min: 0 },
    // The whole run was undone instead of reviewed step by step.
    undoneWhole: { type: Boolean, default: false },
    seconds: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

export const HandoverReview =
  mongoose.models.HandoverReview || mongoose.model("HandoverReview", HandoverReviewSchema);
