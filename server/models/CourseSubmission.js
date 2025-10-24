import mongoose from "mongoose";

const CourseSubmissionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    email: { type: String, index: true },
    courseSku: { type: String, index: true },
    moduleCode: { type: String, index: true },
    fileUrl: { type: String, required: true },
    note: { type: String, default: "" },
    gradeStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    gradedBy: { type: String },
    gradedAt: { type: Date },
    feedback: { type: String, default: "" },
  },
  { timestamps: true }
);

export const CourseSubmission =
  mongoose.models.CourseSubmission ||
  mongoose.model("CourseSubmission", CourseSubmissionSchema);
