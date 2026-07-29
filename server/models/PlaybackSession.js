import mongoose from "mongoose";

/**
 * One row per time a student starts playing a lecture.
 *
 * Two jobs:
 *   1. Concurrency — how many streams an account has running right now, which
 *      is what actually stops one paid login being shared around a study group.
 *   2. Forensics — if a watermarked recording surfaces, the watermark carries
 *      the session ref, and this is the row it points at: who, when, from what
 *      IP and device.
 *
 * Deliberately NOT expired by TTL. The rows are the audit trail; `endedAt`
 * closes them, and "active" is derived from `lastSeenAt` being recent.
 */
const PlaybackSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      required: true,
    },
    email: { type: String, default: "" },
    courseSku: { type: String, index: true },
    moduleCode: { type: String, default: "" },

    // Short, human-quotable handle that also appears in the video watermark.
    sessionRef: { type: String, index: true, required: true },

    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },

    startedAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now, index: true },
    endedAt: { type: Date, default: null },

    // Rough watch time, accumulated from heartbeats.
    watchedSec: { type: Number, default: 0 },
    // Furthest position reached, so the player can offer "resume".
    positionSec: { type: Number, default: 0 },
  },
  { timestamps: true },
);

PlaybackSessionSchema.index({ userId: 1, lastSeenAt: -1 });
PlaybackSessionSchema.index({ courseSku: 1, moduleCode: 1, lastSeenAt: -1 });

export const PlaybackSession =
  mongoose.models.PlaybackSession ||
  mongoose.model("PlaybackSession", PlaybackSessionSchema);
