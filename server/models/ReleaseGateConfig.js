// server/models/ReleaseGateConfig.js
//
// Who signs releases off. One document, _id "release-gate".
//
// There is deliberately no "enabled" flag. A missing document, an empty
// approver, or a deleted collection all leave the gate CLOSED: releases queue
// as pending and only the recorded emergency path can ship. Removing the
// approver therefore never opens the gate; it stops releases until someone is
// named. Every change to this document is emailed to the outgoing and incoming
// approver and written to the locked audit bucket (util/releaseGate.js).
import mongoose from "mongoose";

const HistorySchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    by: { type: String, trim: true, default: "" },
    action: { type: String, trim: true, default: "" },
    fromEmail: { type: String, trim: true, default: "" },
    toEmail: { type: String, trim: true, default: "" },
    note: { type: String, trim: true, default: "" },
  },
  { _id: false },
);

const ReleaseGateConfigSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "release-gate" },
    approverEmail: { type: String, trim: true, lowercase: true, default: "" },
    approverName: { type: String, trim: true, default: "" },
    approverGithub: { type: String, trim: true, default: "" },
    history: { type: [HistorySchema], default: [] },
  },
  { timestamps: true, demoTenancy: false },
);

export const ReleaseGateConfig =
  mongoose.models.ReleaseGateConfig ||
  mongoose.model("ReleaseGateConfig", ReleaseGateConfigSchema);
