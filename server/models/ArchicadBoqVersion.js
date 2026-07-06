// server/models/ArchicadBoqVersion.js
//
// Immutable BoQ version snapshots for QUIV-for-ArchiCAD projects
// (TakeoffProject documents with productKey "archicad").
//
// Storage decision: the CURRENT costed BoQ (contract shape) is the version
// document with isCurrent:true — extract/reapply-rates create a new current
// and demote the previous one, while margin/budget PATCHes mutate the current
// document only. Embedding the canonical BoQ on TakeoffProject was rejected:
// ItemSchema.elementIds is [Number] (Revit element ids) and adding a parallel
// GUID schema would have meant modifying the shared project model. The project
// still receives a lossy ItemSchema mapping of the lines (for PM/valuation/
// public-dashboard reuse); the full canonical lines (with ArchiCAD GUIDs,
// provenance and quantitiesBreakdown) live here.
//
// lines/categories/issues use Mixed so the canonical contract shape is stored
// verbatim — the costing engine (services/archicadCosting.js) is the single
// authority on the line shape; a strict schema here would risk silently
// dropping contract fields as they evolve.

import mongoose from "mongoose";

const ArchicadBoqVersionSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TakeoffProject",
      required: true,
      index: true,
    },
    versionNumber: { type: Number, required: true },
    isCurrent: { type: Boolean, default: false },
    extractedAt: { type: Date, default: () => new Date() },
    modelVersion: { type: String, default: "" },
    currency: { type: String, default: "NGN" },
    lines: { type: [mongoose.Schema.Types.Mixed], default: [] },
    categories: { type: [mongoose.Schema.Types.Mixed], default: [] },
    totals: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    issues: { type: [mongoose.Schema.Types.Mixed], default: [] },
    // itemRefs whose quantity changed vs the previous current version.
    changedLineRefs: { type: [String], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

ArchicadBoqVersionSchema.index({ projectId: 1, versionNumber: -1 });
ArchicadBoqVersionSchema.index({ projectId: 1, isCurrent: 1 });

export const ArchicadBoqVersion =
  mongoose.models.ArchicadBoqVersion ||
  mongoose.model("ArchicadBoqVersion", ArchicadBoqVersionSchema);
