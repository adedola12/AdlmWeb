import mongoose from "mongoose";

// One row per (user, productKey, kind, token, category). `weight` increments
// each time the user picks this category for an item containing this token,
// so the most-frequent learned mapping wins. `kind` distinguishes between:
//   - "category" : UI classification (Substructure / Superstructure / HVAC…)
//   - "trade"    : Trade / work-section classification (Concrete Works, Formwork…)
// Existing rows without a kind field are treated as "category" for backward
// compatibility.
const CategoryFeedbackSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      required: true,
    },
    productKey: { type: String, default: "", index: true },
    kind: { type: String, default: "category", index: true },
    token: { type: String, required: true, index: true },
    category: { type: String, required: true },
    weight: { type: Number, default: 1 },
  },
  { timestamps: true },
);

CategoryFeedbackSchema.index(
  { userId: 1, productKey: 1, kind: 1, token: 1, category: 1 },
  { unique: true },
);

export const CategoryFeedback = mongoose.model(
  "CategoryFeedback",
  CategoryFeedbackSchema,
);
