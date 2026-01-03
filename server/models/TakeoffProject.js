import mongoose from "mongoose";

const ItemSchema = new mongoose.Schema(
  {
    sn: Number,
    description: String,
    qty: Number,
    unit: { type: String, default: "" },
    elementIds: { type: [Number], default: [] },
    level: String,
    type: String,
    code: String,
  },
  { _id: false }
);

const TakeoffProjectSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    productKey: { type: String, default: "revit", index: true },

    clientProjectKey: { type: String, default: "", index: true },

    // ✅ ADD THIS (your plugin expects it)
    modelFingerprint: { type: String, default: "" },

    fingerprint: { type: String, default: "" },

    mergeSameTypeLevel: { type: Boolean, default: true },

    name: { type: String, required: true },

    // ✅ This is what drives checklist restore
    checklistCompositeKeys: { type: [String], default: [] },

    items: { type: [ItemSchema], default: [] },

    version: { type: Number, default: 1 },
  },
  { timestamps: true }
);

TakeoffProjectSchema.index({ userId: 1, productKey: 1, updatedAt: -1 });

export const TakeoffProject = mongoose.model(
  "TakeoffProject",
  TakeoffProjectSchema
);
