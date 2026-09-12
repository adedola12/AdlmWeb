// server/models/OrgVideo.js
//
// A video that ADLM has recorded FOR one organisation — a demo walked through
// on a call, a recap of a training day, a "here is how your team should set
// this up". Not a course lesson (those belong to a SKU and an enrolment) and
// not a free lesson (those belong to everyone). This one belongs to a firm.
//
// There is no organisation object anywhere in the system: a firm is the set of
// accounts whose entitlements name it (see admin.learnQueues "organisations").
// So a video is filed under the organisation NAME, and `orgKey` is that name
// normalised, which is what an account's own names are matched against when
// it asks /me/org-videos. Typing "YSA" and "ysa " must land in the same place.
//
// THE PICTURE RIDES THE COURSE PIPELINE
//
// Same shape as a course module (PaidCourse.js): the master sits in the
// archive bucket under `sourceKey`, MediaConvert builds the HLS ladder under
// `outPrefix` in the delivery bucket, and `hlsKey` is the manifest CloudFront
// serves behind signed cookies. Playback goes through PlaybackSession like a
// lecture does, so the watermark carries a session ref and one login cannot
// stream to a whole office at once.
//
//   s3    — the pipeline above. `transcodeStatus` follows MediaConvert.
//   link  — a pasted URL (Drive, YouTube, an MP4). Nothing is processed.
//   bunny / r2 — earlier rows, before the pipeline was wired in. Still play;
//           nothing new is filed this way.

import mongoose from "mongoose";

export function orgKeyOf(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export const TRANSCODE_STATES = ["", "SUBMITTED", "PROGRESSING", "COMPLETE", "CANCELED", "ERROR"];

const WatchSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    email: { type: String, default: "" },
    firstAt: { type: Date, default: Date.now },
    lastAt: { type: Date, default: Date.now },
    count: { type: Number, default: 1 },
  },
  { _id: false },
);

const OrgVideoSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },

    orgName: { type: String, required: true, trim: true },
    orgKey: { type: String, required: true, index: true },

    source: { type: String, enum: ["s3", "link", "bunny", "r2", "none"], default: "none" },
    // A pasted link, or for the older rows the R2 URL / bunny:LIB:VIDEO.
    videoUrl: { type: String, default: "", trim: true },
    thumbnailUrl: { type: String, default: "", trim: true },
    durationSec: { type: Number, default: 0 },

    // ── The pipeline (source "s3") ──
    // Master in the archive bucket.
    sourceKey: { type: String, default: "" },
    // Where MediaConvert writes the ladder in the delivery bucket, and the
    // manifest inside it once the job completes.
    outPrefix: { type: String, default: "" },
    hlsKey: { type: String, default: "" },
    transcodeJobId: { type: String, default: "" },
    transcodeStatus: { type: String, enum: TRANSCODE_STATES, default: "" },
    transcodePercent: { type: Number, default: 0 },
    transcodeError: { type: String, default: "" },
    transcodeSubmittedAt: { type: Date, default: null },
    transcodeCheckedAt: { type: Date, default: null },

    // ── Older rows ──
    bunny: {
      libId: { type: String, default: "" },
      videoId: { type: String, default: "" },
      status: { type: Number, default: null },
    },
    r2: {
      key: { type: String, default: "" },
    },

    fileName: { type: String, default: "" },
    fileSize: { type: Number, default: 0 },

    isPublished: { type: Boolean, default: true, index: true },
    sort: { type: Number, default: 0 },
    // When the firm was emailed that this is waiting for them. Set once, the
    // first time the row is both published and watchable; never resent.
    notifiedAt: { type: Date, default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    viewCount: { type: Number, default: 0 },
    watches: { type: [WatchSchema], default: [] },
  },
  { timestamps: true },
);

OrgVideoSchema.index({ orgKey: 1, isPublished: 1, sort: 1, createdAt: -1 });

OrgVideoSchema.pre("validate", function setKey(next) {
  if (this.orgName) this.orgKey = orgKeyOf(this.orgName);
  next();
});

export const OrgVideo =
  mongoose.models.OrgVideo || mongoose.model("OrgVideo", OrgVideoSchema);
