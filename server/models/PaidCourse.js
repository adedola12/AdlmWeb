import mongoose from "mongoose";

const ModuleSchema = new mongoose.Schema(
  {
    code: { type: String, required: true },
    title: { type: String, required: true },
    requiresSubmission: { type: Boolean, default: false },
    instructions: { type: String, default: "" },
  },
  { _id: false }
);

const PaidCourseSchema = new mongoose.Schema(
  {
    sku: { type: String, unique: true, index: true },
    title: { type: String, required: true },
    blurb: { type: String, default: "" },
    thumbnailUrl: { type: String },
    onboardingVideoUrl: { type: String },
    classroomJoinUrl: { type: String },
    modules: { type: [ModuleSchema], default: [] },
    certificateTemplateUrl: { type: String },
    isPublished: { type: Boolean, default: true },
    sort: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// ✅ guard against OverwriteModelError on hot-reload
export const PaidCourse =
  mongoose.models.PaidCourse || mongoose.model("PaidCourse", PaidCourseSchema);
