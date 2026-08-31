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

    // Which week of the programme this session belongs to. 0 means the course
    // has not been organised into weeks, which is the case for every course
    // that predates this field — the player falls back to a flat numbered list
    // rather than inventing a week for each one.
    week: { type: Number, default: 0, min: 0 },

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

    // The timed transcript of the lecture, produced by Amazon Transcribe from
    // the same archived master MediaConvert reads. Same submit/poll shape as
    // the transcode fields above, for the same reason: a two-hour lecture is
    // not something a request waits on.
    // An audio-only extract of the lecture, made only when the master is over
    // Transcribe's 2 GB ceiling. Transcribe reads this instead of the video.
    audioKey: { type: String, default: "" },
    audioJobId: { type: String, default: "" },
    audioStatus: {
      type: String,
      enum: ["", "SUBMITTED", "PROGRESSING", "COMPLETE", "ERROR"],
      default: "",
    },
    audioError: { type: String, default: "" },

    transcriptKey: { type: String, default: "" },
    transcriptJobName: { type: String, default: "" },
    transcriptStatus: {
      type: String,
      enum: ["", "SUBMITTED", "QUEUED", "IN_PROGRESS", "COMPLETED", "FAILED"],
      default: "",
    },
    transcriptError: { type: String, default: "" },
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
    classroomJoinUrl: { type: String, default: "" },
    classroomProvider: {
      type: String,
      enum: ["google_classroom", "other"],
      default: "google_classroom",
    },
    classroomCourseId: { type: String, default: "" },
    classroomNotes: { type: String, default: "" },
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

    // Who teaches it. His lesson panel names the tutor beside the course and
    // the running time; without this the cell would have to be dropped or
    // filled with a guess.
    tutorName: { type: String, trim: true, default: "" },
    tutorTitle: { type: String, trim: true, default: "" },

    // The piece of work the course ends in. His sidebar gives it a box of its
    // own, and it is the thing between a student and their certificate, so it
    // deserves to be a field rather than inferred from whichever module
    // happens to carry the last assignment.
    capstoneTitle: { type: String, trim: true, default: "" },
    capstoneDueAt: { type: Date, default: null },

    certificateTemplateUrl: { type: String },
    isPublished: { type: Boolean, default: true },
    sort: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const PaidCourse =
  mongoose.models.PaidCourse || mongoose.model("PaidCourse", PaidCourseSchema);
