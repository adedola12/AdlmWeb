// A published YouTube video, and whether the studio has told anybody about it.
//
// WHY THERE IS A COLLECTION AT ALL
//
// The poller has to answer one question every fifteen minutes: "is this new?"
// YouTube cannot answer it — the uploads playlist looks the same on the run
// that mails everybody and on the ninety-five runs that do not. So the answer
// has to live here. A videoId absent from this collection is new; a videoId
// present is not, whatever the playlist says.
//
// WHY notifiedAt IS THE GUARD AND NOT A BOOLEAN
//
// A flag answers "did we send it". A date answers "did we send it, and when",
// which is the question actually asked six weeks later when somebody wants to
// know why a customer got two mails about the same video. The uniqueness of
// videoId plus a null-to-date transition is what makes a second send
// impossible rather than merely unlikely — the same reasoning as the
// broadcast ledger in models/Broadcast.js.
//
// A row is written when the video is FIRST SEEN, not when it is mailed. That
// ordering matters: if the poller crashes between seeing and sending, the next
// run finds the row, sees notifiedAt is still null, and sends. Written the
// other way round, a crash would mean the video is silently never announced.

import mongoose from "mongoose";

const VideoSchema = new mongoose.Schema(
  {
    // The YouTube watch id, e.g. "dQw4w9WgXcQ". Unique: this is the whole
    // de-duplication guarantee, enforced by the database rather than by a
    // check-then-write that two concurrent pollers could both pass.
    videoId: { type: String, required: true, unique: true, index: true, trim: true },

    title: { type: String, default: "", trim: true },
    description: { type: String, default: "" },
    thumbnailUrl: { type: String, default: "", trim: true },
    publishedAt: { type: Date, default: null },

    // Null until the announcement has actually gone out. The send loop sets it
    // BEFORE mailing anybody (see util/videoNotifier.js) so a run that dies
    // halfway cannot be replayed into a second mailshot.
    notifiedAt: { type: Date, default: null, index: true },

    // How it got here: the poller found it, or an admin pushed it by hand from
    // the Videos screen. Worth recording — "why did this go out at 2am" and
    // "why did this go out the moment I uploaded" are different questions.
    source: { type: String, enum: ["poller", "manual"], default: "poller" },
    notifiedBy: { type: String, default: "", trim: true },

    // What the send actually did. Kept as figures rather than recomputed from
    // the user collection later: the audience moves, so counting it again next
    // month answers a different question from the one being asked.
    stats: {
      recipients: { type: Number, default: 0 },
      sent: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      skippedOptedOut: { type: Number, default: 0 },
      skippedUnverified: { type: Number, default: 0 },
      // Addresses that bounced permanently on an earlier send. Counted apart
      // from the opt-outs on purpose: "60 people asked us to stop" and "60
      // mailboxes no longer exist" are the same number and completely
      // different news.
      skippedUndeliverable: { type: Number, default: 0 },
      dryRun: { type: Boolean, default: false },
    },

    // Addresses that threw on the last run, so "Resend to failed" has
    // something to work from. Capped when written — a thousand bad addresses
    // is a provider outage, and storing all thousand helps nobody.
    failedRecipients: { type: [String], default: [] },
  },
  { timestamps: true },
);

// Drives the poller's "which of these ids do I already know about" lookup and
// the admin screen's "what has been announced" list.
VideoSchema.index({ publishedAt: -1 });

export const Video = mongoose.models.Video || mongoose.model("Video", VideoSchema);
