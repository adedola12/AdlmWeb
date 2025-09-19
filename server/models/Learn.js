// server/models/Learn.js
import mongoose from "mongoose";

const FreeVideoSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    youtubeId: { type: String, required: true }, // e.g. "dQw4w9WgXcQ"
    // optional override thumbnail; if not set, client uses https://img.youtube.com/vi/:id/hqdefault.jpg
    thumbnailUrl: { type: String },
    isPublished: { type: Boolean, default: true },
    sort: { type: Number, default: 0 }, // for ordering
  },
  { timestamps: true }
);

const PaidCourseSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true, unique: true }, // e.g. "bimCourse" / "bimMepCourse"
    title: { type: String, required: true },
    // MP4 or streaming URL (Cloudinary, etc)
    previewUrl: { type: String, required: true },
    // short bullet points for highlights
    bullets: { type: [String], default: [] },
    // rich text allowed; keep simple string
    description: { type: String, default: "" },
    isPublished: { type: Boolean, default: true },
    sort: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const FreeVideo = mongoose.model("FreeVideo", FreeVideoSchema);
export const PaidCourse = mongoose.model("PaidCourse", PaidCourseSchema);
