import mongoose from "mongoose";

/**
 * One playable recording: the master in the archive, and the HLS built from it.
 *
 * Broken out because a course now carries more than one recording per place —
 * a lecture and its short recap on a module, plus a course-level intro — and
 * ingest, transcode and playback all treat them as the same shape.
 */
const TrackSchema = new mongoose.Schema(
  {
    sourceKey: { type: String, default: "" },
    sourceName: { type: String, default: "" },
    sourceBytes: { type: Number, default: 0 },
    hlsKey: { type: String, default: "" },
    transcodeJobId: { type: String, default: "" },
    transcodeStatus: {
      type: String,
      enum: ["", "SUBMITTED", "PROGRESSING", "COMPLETE", "ERROR", "CANCELED"],
      default: "",
    },
    transcodeError: { type: String, default: "" },
    durationSec: { type: Number, default: 0 },
  },
  { _id: false },
);

const ModuleSchema = new mongoose.Schema(
  {
    code: String,
    title: String,
    requiresSubmission: { type: Boolean, default: false },
    instructions: { type: String, default: "" },
    videoUrl: { type: String },
    durationSec: { type: Number },
    assignmentPrompt: { type: String, default: "" },

    // Archive of the original recording in S3. `videoUrl` is what the player
    // streams; these describe the master the stream was produced from, so a
    // re-encode never has to go back to Google Drive.
    sourceKey: { type: String, default: "" },
    sourceName: { type: String, default: "" },
    sourceBytes: { type: Number, default: 0 },

    // HLS output built from the master by MediaConvert. `hlsKey` is the master
    // manifest; the player gets it as a CloudFront URL, never as a raw S3 one.
    hlsKey: { type: String, default: "" },
    transcodeJobId: { type: String, default: "" },
    transcodeStatus: {
      type: String,
      enum: ["", "SUBMITTED", "PROGRESSING", "COMPLETE", "ERROR", "CANCELED"],
      default: "",
    },
    transcodeError: { type: String, default: "" },

    // The 2-4 minute recap recorded alongside this session. Optional: the
    // building-works cohort has none, and MEP week 1 has none either.
    summary: { type: TrackSchema, default: () => ({}) },
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

    // `onboardingVideoUrl` is the legacy field — a plain URL on someone else's
    // host. `onboarding` is the same video carried through our own pipeline,
    // and wins when it has been encoded, because only it is behind the signed
    // cookies and the concurrency seat.
    onboardingVideoUrl: { type: String },
    onboarding: { type: TrackSchema, default: () => ({}) },
    modules: { type: [ModuleSchema], default: [] },

    // Reusable software library entries attached to this course (max 6).
    // The Software collection holds the actual installer URL + install
    // video; this array just records which entries appear on the course.
    softwareIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Software" }],
      default: [],
      validate: {
        validator: (v) => !Array.isArray(v) || v.length <= 6,
        message: "A course may have at most 6 softwares attached.",
      },
    },

    certificateTemplateUrl: { type: String },
    isPublished: { type: Boolean, default: true },
    sort: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const PaidCourse =
  mongoose.models.PaidCourse || mongoose.model("PaidCourse", PaidCourseSchema);
