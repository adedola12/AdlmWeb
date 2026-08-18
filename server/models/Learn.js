// server/models/Learn.js
import mongoose from "mongoose";

/* -------- Free (YouTube) videos -------- */
const FreeVideoSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    youtubeId: { type: String, required: true },
    thumbnailUrl: { type: String },
    // Runtime in seconds. Nothing in the record told us how long a video was,
    // so the marketing tiles were showing invented figures. Stored here rather
    // than read from YouTube on every page load: the site should not depend on
    // a third-party quota to render a caption, and this survives the video
    // being made unlisted. Auto-filled on save when YOUTUBE_API_KEY is set,
    // otherwise typed in — same shape as PaidCourse lessons use.
    durationSec: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: true },
    sort: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const FreeVideo =
  mongoose.models.FreeVideo || mongoose.model("FreeVideo", FreeVideoSchema);

/* -------- Paid course CATALOG cards (marketing/videos) -------- */
const PaidCourseVideoSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true, unique: true }, // matches Product.courseSku
    title: { type: String, required: true },
    previewUrl: { type: String, required: true }, // Cloudinary/Drive/streaming url
    bullets: { type: [String], default: [] },
    description: { type: String, default: "" },
    thumbnailUrl: { type: String }, // optional card image
    isPublished: { type: Boolean, default: true },
    sort: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const PaidCourseVideo =
  mongoose.models.PaidCourseVideo ||
  mongoose.model("PaidCourseVideo", PaidCourseVideoSchema);
