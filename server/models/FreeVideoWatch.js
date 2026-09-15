import mongoose from "mongoose";

/**
 * One person's history against one free lesson.
 *
 * Free lessons need no sign-in, which is the whole point of them, so most
 * views will never produce a row here. That is correct rather than a gap: a
 * watch can only be attributed to an account when there is an account, and
 * "Free lessons watched" on My learning is a per-account panel.
 *
 * WHAT `watchedSec` ACTUALLY MEASURES, because the name flatters it: seconds
 * the lesson page was open and visible, not seconds of video played. The
 * lessons are YouTube embeds in a cross-origin iframe, and without pulling in
 * the YouTube IFrame API there is no play/pause/ended event to read — the page
 * genuinely cannot see the player's state. Dwell is the honest signal
 * available, so it is what is stored, and the panel says "opened" rather than
 * claiming a completion nobody measured.
 *
 * One row per person per lesson, upserted: re-watching updates the row rather
 * than filling the collection with duplicates. `firstWatchedAt` survives that,
 * so "you have come back to this three times" stays answerable later.
 */
const FreeVideoWatchSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    videoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FreeVideo",
      required: true,
    },

    // Denormalised so the panel renders even if the lesson is later
    // unpublished or deleted. Somebody watched it; that stays true.
    title: { type: String, trim: true, default: "" },

    // Cumulative across visits, capped per request server-side so a stuck or
    // tampered client cannot claim hours.
    watchedSec: { type: Number, default: 0, min: 0 },

    // How many separate times this lesson was opened.
    opens: { type: Number, default: 0, min: 0 },

    firstWatchedAt: { type: Date, default: Date.now },
    lastWatchedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

// The upsert key. Also what makes the panel's "most recent first" cheap.
FreeVideoWatchSchema.index({ userId: 1, videoId: 1 }, { unique: true });
FreeVideoWatchSchema.index({ userId: 1, lastWatchedAt: -1 });

export const FreeVideoWatch =
  mongoose.models.FreeVideoWatch ||
  mongoose.model("FreeVideoWatch", FreeVideoWatchSchema);
