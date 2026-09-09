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
// Source of the picture, in order of preference:
//   bunny  — uploaded through the admin screen, encoded by Bunny Stream and
//            played through its embed. `bunny.status` tracks the encode.
//   r2     — a plain MP4 on the public R2 bucket (the fallback when Bunny is
//            not configured), played as a <video>.
//   link   — a pasted URL (Drive, YouTube, an MP4 somewhere). Nothing is
//            processed; the client works out how to play it.

import mongoose from "mongoose";

export function orgKeyOf(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Bunny's own status numbers, kept as they are so a row can be read against
// their dashboard. https://docs.bunny.net/reference/video_getvideo
export const BUNNY_STATUS = {
  0: "created",
  1: "uploaded",
  2: "processing",
  3: "transcoding",
  4: "finished",
  5: "error",
  6: "upload-failed",
  7: "segmenting",
  8: "playlists-created",
};

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

    source: { type: String, enum: ["bunny", "r2", "link", "none"], default: "none" },
    // bunny:LIB:VIDEO, an R2 public URL, or whatever was pasted.
    videoUrl: { type: String, default: "", trim: true },
    thumbnailUrl: { type: String, default: "", trim: true },
    durationSec: { type: Number, default: 0 },

    bunny: {
      libId: { type: String, default: "" },
      videoId: { type: String, default: "" },
      status: { type: Number, default: null },
      encodeProgress: { type: Number, default: 0 },
      // What Bunny has produced so far — "360p,720p,1080p". The admin reads
      // this to know whether a re-encode would give the firm anything better.
      resolutions: { type: String, default: "" },
      lastCheckedAt: { type: Date, default: null },
      error: { type: String, default: "" },
    },
    r2: {
      key: { type: String, default: "" },
    },
    // Where the picture was before Bunny was asked to fetch and encode it.
    // Kept until the encode is playable, then the old R2 object is removed
    // and this is cleared — so a fetch that fails costs nothing.
    previousSource: {
      source: { type: String, default: "" },
      videoUrl: { type: String, default: "" },
      r2Key: { type: String, default: "" },
    },

    // Bytes of the original upload, for the admin table.
    fileName: { type: String, default: "" },
    fileSize: { type: Number, default: 0 },

    isPublished: { type: Boolean, default: true, index: true },
    sort: { type: Number, default: 0 },

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
