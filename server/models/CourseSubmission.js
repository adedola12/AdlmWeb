import mongoose from "mongoose";

const CourseSubmissionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    email: { type: String, index: true },
    courseSku: { type: String, index: true },
    moduleCode: { type: String, index: true },
    // Before 18 Sep 2026: a Cloudinary URL. Now the file sits in private
    // storage (util/fileStore.js) under fileKey, and fileUrl is filled with a
    // short-lived signed link when a submission is listed.
    fileUrl: { type: String, default: "" },
    fileKey: { type: String, default: "" },
    storage: { type: String, enum: ["", "s3", "r2"], default: "" },
    fileName: { type: String, default: "" },
    fileSize: { type: Number, default: 0 },
    fileType: { type: String, default: "" },
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
    // R13: an optional mark out of 100, who marked it (by name, for the
    // learner), and when the learner first read the result.
    score: { type: Number, min: 0, max: 100, default: null },
    gradedByName: { type: String, default: "" },
    feedbackSeenAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const CourseSubmission =
  mongoose.models.CourseSubmission ||
  mongoose.model("CourseSubmission", CourseSubmissionSchema);
