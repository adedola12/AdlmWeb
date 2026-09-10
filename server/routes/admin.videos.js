// The Videos screen: what has been announced, and the button that announces
// one now.
//
// WHY THE MANUAL ENDPOINT EXISTS AT ALL
//
// The poller runs every fifteen minutes, which means the worst case between
// pressing publish on YouTube and the mail going out is fifteen minutes. That
// is fine for a tutorial and wrong for a launch, where the video, the post and
// the mail are supposed to land together. So there is a button that takes a
// URL off the clipboard and does it now.
//
// It is the SAME send, not a second one. Both paths go through
// announceVideo(), which claims the video before mailing anybody — so pressing
// the button on a video the poller is already halfway through announcing does
// nothing rather than sending it twice. That is the whole reason the claim
// lives in the notifier and not in either caller.

import express from "express";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { Video } from "../models/Video.js";
import { announceVideo, isDryRun } from "../util/videoNotifier.js";
import { fetchVideo, isConfigured, parseVideoId, watchUrl, YouTubeError } from "../util/youtubeFeed.js";
import { writeAudit, reqAuditContext } from "../util/audit.js";

const router = express.Router();

// The same gate the campaigns screen uses. This reaches the whole customer
// base, so it belongs with purchase approval rather than with content editing.
const hub = [requireAuth, requirePermission("adminhub")];

const shape = (v) => ({
  id: String(v._id),
  videoId: v.videoId,
  title: v.title || "",
  thumbnailUrl: v.thumbnailUrl || "",
  url: watchUrl(v.videoId),
  publishedAt: v.publishedAt || null,
  notifiedAt: v.notifiedAt || null,
  source: v.source || "poller",
  notifiedBy: v.notifiedBy || "",
  stats: {
    recipients: v.stats?.recipients ?? 0,
    sent: v.stats?.sent ?? 0,
    failed: v.stats?.failed ?? 0,
    skippedOptedOut: v.stats?.skippedOptedOut ?? 0,
    skippedUnverified: v.stats?.skippedUnverified ?? 0,
    dryRun: !!v.stats?.dryRun,
  },
  failedCount: (v.failedRecipients || []).length,
  at: v.createdAt,
});

/* ───────────────────────────────────────────────────────────────── the list ── */

router.get("/", ...hub, async (_req, res, next) => {
  try {
    const rows = await Video.find({}).sort({ publishedAt: -1, createdAt: -1 }).limit(200).lean();
    const items = rows.map(shape);

    res.json({
      items,
      counts: {
        all: items.length,
        notified: items.filter((i) => i.notifiedAt).length,
        pending: items.filter((i) => !i.notifiedAt).length,
        withFailures: items.filter((i) => i.failedCount > 0).length,
      },
      // Shown on the screen rather than left to be discovered: a DRY_RUN that
      // nobody knows is on looks exactly like a send that silently reaches
      // nobody, and an unconfigured poller looks exactly like a channel that
      // has not published anything.
      config: {
        pollerConfigured: isConfigured(),
        dryRun: isDryRun(),
      },
    });
  } catch (err) {
    next(err);
  }
});

/** The addresses that failed, for the row that is showing a failure count. */
router.get("/:videoId/failures", ...hub, async (req, res, next) => {
  try {
    const v = await Video.findOne({ videoId: req.params.videoId })
      .select("videoId failedRecipients")
      .lean();
    if (!v) return res.status(404).json({ error: "No such video" });
    res.json({ videoId: v.videoId, failedRecipients: v.failedRecipients || [] });
  } catch (err) {
    next(err);
  }
});

/* ───────────────────────────────────────────────────────────── announce now ── */

/**
 * POST /admin/videos/notify   { video: "<id or URL>" }
 *
 * Answers before it finishes. Eight hundred sends at fifty a batch with a
 * two-second pause is minutes of work, and a request held open that long is a
 * gateway timeout and an admin who does not know whether it worked. So the
 * response says what was accepted and the screen reads the outcome back off
 * the record.
 */
router.post("/notify", ...hub, async (req, res, next) => {
  try {
    const input = String(req.body?.video || req.body?.videoId || req.body?.url || "").trim();
    if (!input) {
      return res.status(400).json({ error: "Paste the video's URL, or its id." });
    }

    const videoId = parseVideoId(input);
    if (!videoId) {
      return res.status(400).json({
        error:
          "That is not a YouTube video link. Paste the watch URL, the youtu.be link, or the 11-character id.",
      });
    }

    let existing = await Video.findOne({ videoId }).lean();

    if (existing?.notifiedAt) {
      // Refused at the record, not guarded in the UI: a double-clicked button,
      // a retried request and a second admin all arrive here.
      return res.status(409).json({
        error: `"${existing.title}" was already announced on ${new Date(
          existing.notifiedAt,
        ).toLocaleString("en-GB")}.`,
        videoId,
        notifiedAt: existing.notifiedAt,
      });
    }

    // Not in the collection yet — this is the normal case for the button, and
    // the point of it. Fetch the real title and thumbnail rather than mailing
    // a blank subject line.
    if (!existing) {
      let found;
      try {
        found = await fetchVideo(videoId);
      } catch (err) {
        if (err instanceof YouTubeError) {
          return res.status(502).json({
            error: `YouTube would not answer: ${err.message}`,
          });
        }
        throw err;
      }

      if (!found) {
        return res.status(404).json({
          error: "YouTube has no public video with that id. Is it still private or unlisted?",
        });
      }

      // upsert, not create: the poller may have filed it in the moment between
      // the lookup above and this write.
      await Video.updateOne(
        { videoId },
        { $setOnInsert: { ...found, source: "manual" } },
        { upsert: true },
      );
      existing = await Video.findOne({ videoId }).lean();
    }

    const actor = req.user?.email || "";

    res.status(202).json({
      ok: true,
      videoId,
      title: existing?.title || "",
      dryRun: isDryRun(),
      started: true,
    });

    // After the response. Any throw from here reaches nobody, so it is caught
    // and logged rather than left to become an unhandled rejection that takes
    // the Lambda container with it.
    try {
      const out = await announceVideo(videoId, { actor });

      await writeAudit({
        actorId: req.user?._id,
        actorEmail: actor,
        action: "video.notify",
        status: 200,
        ...reqAuditContext(req),
        meta: { videoId, title: existing?.title || "", ...out },
      });
    } catch (err) {
      console.error(`[admin.videos] notify ${videoId} failed:`, err?.message || err);
    }
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin/videos/:videoId/resend-failed
 *
 * The one path allowed past the notifiedAt guard, because the video has
 * already been claimed and the point is to close the gap the first run left —
 * not to announce it again. It sends ONLY to the stored failures, so an admin
 * who presses it twice mails those same few people twice and nobody else.
 */
router.post("/:videoId/resend-failed", ...hub, async (req, res, next) => {
  try {
    const { videoId } = req.params;
    const v = await Video.findOne({ videoId }).select("videoId title notifiedAt failedRecipients").lean();
    if (!v) return res.status(404).json({ error: "No such video" });

    if (!v.notifiedAt) {
      return res.status(409).json({
        error: "This has not been announced yet. Announce it first — that mails everybody.",
      });
    }

    const failed = v.failedRecipients || [];
    if (!failed.length) {
      return res.status(400).json({ error: "Nothing failed on the last run." });
    }

    const actor = req.user?.email || "";
    res.status(202).json({ ok: true, videoId, retrying: failed.length, dryRun: isDryRun() });

    try {
      const out = await announceVideo(videoId, { actor, only: failed });

      await writeAudit({
        actorId: req.user?._id,
        actorEmail: actor,
        action: "video.resend-failed",
        status: 200,
        ...reqAuditContext(req),
        meta: { videoId, title: v.title, retried: failed.length, ...out },
      });
    } catch (err) {
      console.error(`[admin.videos] resend ${videoId} failed:`, err?.message || err);
    }
  } catch (err) {
    next(err);
  }
});

export default router;
