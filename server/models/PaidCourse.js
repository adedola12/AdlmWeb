import mongoose from "mongoose";

const ModuleSchema = new mongoose.Schema(
  {
    code: String,
    title: String,
    requiresSubmission: { type: Boolean, default: false },
    instructions: { type: String, default: "" },
    videoUrl: { type: String },
    durationSec: { type: Number },
    assignmentPrompt: { type: String, default: "" },
  },
  { _id: false },
);

const PaidCourseSchema = new mongoose.Schema(
  {
    sku: { type: String, unique: true, index: true },
    title: { type: String, required: true },
    blurb: { type: String, default: "" },
    description: { type: String, default: "" },
    thumbnailUrl: { type: String },
    onboardingVideoUrl: { type: String },
    classroomJoinUrl: { type: String, default: "" },
    classroomProvider: {
      type: String,
      enum: ["google_classroom", "other"],
      default: "google_classroom",
    },
    classroomCourseId: { type: String, default: "" },
    classroomNotes: { type: String, default: "" },
    modules: { type: [ModuleSchema], default: [] },
    certificateTemplateUrl: { type: String },
    isPublished: { type: Boolean, default: true },
    sort: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const PaidCourse =
  mongoose.models.PaidCourse || mongoose.model("PaidCourse", PaidCourseSchema);
