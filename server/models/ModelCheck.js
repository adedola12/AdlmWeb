import mongoose from "mongoose";

const CategoryResultSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    count: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["Pass", "Fail", "Warning", "NotApplicable"],
      default: "Pass",
    },
  },
  { _id: false },
);

const RebarResultSchema = new mongoose.Schema(
  {
    hostCategory: { type: String, required: true },
    total: { type: Number, default: 0 },
    withRebar: { type: Number, default: 0 },
    coveragePercent: { type: Number, default: 0 },
  },
  { _id: false },
);

const ModelCheckSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    projectName: { type: String, required: true, trim: true },
    projectNumber: { type: String, default: "", trim: true },
    modelType: {
      type: String,
      enum: ["Architectural", "Structural"],
      required: true,
    },
    checkedAt: { type: Date, default: Date.now },
    checkedByUser: { type: String, default: "" },
    readinessScore: { type: Number, default: 0, min: 0, max: 100 },
    overallStatus: {
      type: String,
      enum: ["Pass", "Fail", "Warning"],
      default: "Fail",
    },
    totalElements: { type: Number, default: 0 },
    missingCategories: { type: Number, default: 0 },
    overlapCount: { type: Number, default: 0 },
    qsQueryText: { type: String, default: "" },
    categories: { type: [CategoryResultSchema], default: [] },
    rebarAnalysis: { type: [RebarResultSchema], default: [] },
  },
  {
    timestamps: true,
  },
);

// Index for listing checks by user, newest first
ModelCheckSchema.index({ userId: 1, createdAt: -1 });

const ModelCheck = mongoose.model("ModelCheck", ModelCheckSchema);
export default ModelCheck;
