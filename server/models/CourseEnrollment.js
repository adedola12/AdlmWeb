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
  },
  { timestamps: true }
);

export const CourseEnrollment =
  mongoose.models.CourseEnrollment ||
  mongoose.model("CourseEnrollment", CourseEnrollmentSchema);
