import mongoose from "mongoose";

const CourseEnrollmentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    email: { type: String, index: true },
    courseSku: { type: String, index: true },
    status: { type: String, enum: ["active", "completed"], default: "active" },
    completedModules: { type: [String], default: [] },
    certificateUrl: { type: String },
    certificateIssuedAt: { type: Date },
    accessStartedAt: { type: Date, default: null },
    accessExpiresAt: { type: Date, default: null },
    lastProgressAt: { type: Date, default: null },
    classroomLastSyncedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const CourseEnrollment =
  mongoose.models.CourseEnrollment ||
  mongoose.model("CourseEnrollment", CourseEnrollmentSchema);
