import mongoose from "mongoose";

// One row per (user, productKey, token, category). `weight` increments
// each time the user picks this category for an item containing this token,
// so the most-frequent learned mapping wins.
const CategoryFeedbackSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      required: true,
    },
    productKey: { type: String, default: "", index: true },
    token: { type: String, required: true, index: true },
    category: { type: String, required: true },
    weight: { type: Number, default: 1 },
  },
  { timestamps: true },
);

CategoryFeedbackSchema.index(
  { userId: 1, productKey: 1, token: 1, category: 1 },
  { unique: true },
);

export const CategoryFeedback = mongoose.model(
  "CategoryFeedback",
  CategoryFeedbackSchema,
);
