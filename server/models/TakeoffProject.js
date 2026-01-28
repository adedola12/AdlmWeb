import mongoose from "mongoose";

const ItemSchema = new mongoose.Schema(
  {
    // common
    sn: { type: Number, default: 0 },
    qty: { type: Number, default: 0 },
    unit: { type: String, default: "" },

    // ✅ NEW: persisted rate (so refresh won't wipe it)
    rate: { type: Number, default: 0 },

    // classic takeoff items
    description: { type: String, default: "" },

    // ✅ materials items (your Revit materials VM uses these)
    takeoffLine: { type: String, default: "" },
    materialName: { type: String, default: "" },

    // traceability
    elementIds: { type: [Number], default: [] },
    level: { type: String, default: "" },
    type: { type: String, default: "" },

    // stable grouping / merge key
    code: { type: String, default: "" },
  },
  { _id: false },
);

const TakeoffProjectSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },

    // e.g. "revit", "planswift", "revit-materials"
    productKey: { type: String, default: "revit", index: true },

    clientProjectKey: { type: String, default: "", index: true },

    modelFingerprint: { type: String, default: "" },
    fingerprint: { type: String, default: "" },

    // keep your existing field (used by other takeoff modules)
    mergeSameTypeLevel: { type: Boolean, default: true },

    name: { type: String, required: true, trim: true },

    checklistCompositeKeys: { type: [String], default: [] },

    items: { type: [ItemSchema], default: [] },

    version: { type: Number, default: 1 },
  },
  { timestamps: true }
);

TakeoffProjectSchema.index({ userId: 1, productKey: 1, updatedAt: -1 });
TakeoffProjectSchema.index({ userId: 1, productKey: 1, clientProjectKey: 1 });

export const TakeoffProject = mongoose.model(
  "TakeoffProject",
  TakeoffProjectSchema
);
