// server/routes/me.orgVideos.js
//
// The organisation's shelf, from the account's side. Mounted at /me/org-videos.
//
// WHOSE SHELF
//
// Nothing on the account says "I am YSA" in one place. The firm's name sits on
// each entitlement (licenseType "organization" carries organizationName) and,
// for accounts that signed up as a company, on the account itself. So the
// shelf is every published video filed under any of those names, normalised
// the same way the admin screen normalises them when filing (see orgKeyOf).
//
// An expired licence still gets the shelf. A demo recorded for a firm is not
// a thing that stops being theirs when the subscription lapses — and a lapsed
// firm watching "here is what you had" is a renewal, not a leak.
//
// PLAYBACK IS A SESSION, LIKE A LECTURE
//
// An uploaded recording streams from CloudFront behind signed cookies, and
// the cookies are only ever set by /:id/playback/start — which also claims a
// concurrency seat and writes the PlaybackSession row the watermark points
// at. Same rules as the courses: the same limit on simultaneous streams, the
// same heartbeat, the same audit trail. A pasted link has none of that; the
// client plays it directly and logs a watch.

import express from "express";
import mongoose from "mongoose";
import { OrgVideo, orgKeyOf } from "../models/OrgVideo.js";
import { User } from "../models/User.js";
import { PlaybackSession } from "../models/PlaybackSession.js";
import { requireAuth } from "../middleware/auth.js";
import { presignArchiveUrl } from "../utils/awsS3.js";
import { signPlaybackCookies, playbackCookieOptions, cdnUrl } from "../utils/cloudfrontSign.js";
import { isCloudfrontConfigured } from "../utils/orgVideoStorage.js";

const router = express.Router();
router.use(requireAuth);

// The same seat rules as routes/meCourses.js, deliberately: one account, one
// office, the same number of screens.
const LIVE_WINDOW_MS = 90 * 1000;
const MAX_CONCURRENT = Math.max(1, Number(process.env.COURSE_MAX_CONCURRENT_STREAMS || 2) || 2);
const ORG_VIDEO_SKU = "org-video";

const liveSince = () => new Date(Date.now() - LIVE_WINDOW_MS);
const clientIp = (req) =>
  String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.ip || req.socket?.remoteAddress || "";
const makeSessionRef = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const toIso = (v) => (v ? new Date(v).toISOString() : null);

async function orgKeysFor(userId) {
  const u = await User.findById(userId, {
    organizationName: 1,
    "entitlements.organizationName": 1,
  }).lean();
  if (!u) return { keys: [], names: [] };
  const names = new Map();
  const add = (n) => {
    const key = orgKeyOf(n);
    if (key && !names.has(key)) names.set(key, String(n).trim());
  };
  add(u.organizationName);
  for (const e of u.entitlements || []) add(e.organizationName);
  return { keys: [...names.keys()], names: [...names.values()] };
}

function forViewer(v) {
  const stream = v.source === "s3";
  return {
    id: String(v._id),
    title: v.title,
    description: v.description || "",
    orgName: v.orgName,
    source: v.source,
    // "stream" rows are played through /playback/start; the others carry
    // whatever the client needs to play them itself.
    kind: stream ? "stream" : v.source === "bunny" ? "embed" : v.source === "none" ? "none" : "link",
    videoUrl: stream ? "" : v.videoUrl || "",
    embedUrl:
      v.source === "bunny" && v.bunny?.videoId && v.bunny?.libId
        ? `https://iframe.mediadelivery.net/embed/${v.bunny.libId}/${v.bunny.videoId}`
        : "",
    // A stream row is watchable the moment the master is in; the ladder
    // replaces it when the encode completes.
    ready: stream ? !!(v.hlsKey || v.sourceKey) : v.source !== "none",
    adaptive: !!v.hlsKey,
    thumbnailUrl: v.thumbnailUrl || "",
    durationSec: v.durationSec || 0,
    createdAt: v.createdAt,
  };
}

async function logWatch(doc, uid, email) {
  const me = String(uid);
  const w = doc.watches.find((x) => String(x.userId) === me);
  if (w) {
    w.lastAt = new Date();
    w.count = (w.count || 0) + 1;
  } else if (doc.watches.length < 500) {
    doc.watches.push({ userId: uid, email: email || "" });
  }
  doc.viewCount = (doc.viewCount || 0) + 1;
  await doc.save();
}

// GET /me/org-videos
router.get("/", async (req, res) => {
  try {
    const uid = req.user?.id || req.user?._id;
    const { keys, names } = await orgKeysFor(uid);
    if (!keys.length) return res.json({ ok: true, organisation: "", organisations: [], items: [] });

    const rows = await OrgVideo.find({ orgKey: { $in: keys }, isPublished: true })
      .sort({ sort: 1, createdAt: -1 })
      .lean();

    return res.json({
      ok: true,
      organisation: names[0] || "",
      organisations: names,
      items: rows.map(forViewer),
    });
  } catch (err) {
    console.error("[me.orgVideos] list failed:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

/**
 * POST /me/org-videos/:id/playback/start
 *
 * Claims a streaming seat and hands out the only URL that plays an uploaded
 * recording. 409 when the account already has MAX_CONCURRENT live streams
 * across courses and org videos together.
 */
router.post("/:id/playback/start", express.json(), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(404).json({ error: "Not found" });
    const uid = req.user?.id || req.user?._id;
    const { keys } = await orgKeysFor(uid);
    const doc = await OrgVideo.findOne({ _id: id, orgKey: { $in: keys }, isPublished: true });
    if (!doc) return res.status(404).json({ error: "Not found" });

    // Re-entering the SAME video is a reconnect, not a second stream.
    await PlaybackSession.updateMany(
      { userId: uid, courseSku: ORG_VIDEO_SKU, moduleCode: String(doc._id), endedAt: null },
      { $set: { endedAt: new Date() } },
    );

    const live = await PlaybackSession.find({
      userId: uid,
      endedAt: null,
      lastSeenAt: { $gte: liveSince() },
    })
      .sort({ lastSeenAt: -1 })
      .lean();
    if (live.length >= MAX_CONCURRENT) {
      return res.status(409).json({
        error: "Too many active streams",
        limit: MAX_CONCURRENT,
        active: live.map((s) => ({
          sessionRef: s.sessionRef,
          moduleCode: s.moduleCode,
          startedAt: toIso(s.startedAt),
          lastSeenAt: toIso(s.lastSeenAt),
        })),
      });
    }

    const session = await PlaybackSession.create({
      userId: uid,
      email: req.user?.email || "",
      courseSku: ORG_VIDEO_SKU,
      moduleCode: String(doc._id),
      track: "lecture",
      sessionRef: makeSessionRef(),
      ip: clientIp(req),
      userAgent: String(req.headers["user-agent"] || "").slice(0, 300),
    });

    let playbackUrl = "";
    let playbackExpiresAt = null;
    let kind = "";
    if (doc.source === "s3") {
      if (doc.hlsKey && isCloudfrontConfigured()) {
        try {
          // Derive the prefix from the key being SERVED, never from
          // doc.outPrefix. The two diverge for as long as a re-encode runs:
          // outPrefix already names the new ladder directory while hlsKey still
          // names the old one that is playing. Signing outPrefix granted a
          // directory nobody was asking for and denied the one they were, so
          // every member got 403 for the length of an encode.
          const keyPrefix = doc.hlsKey.replace(/index\.m3u8$/, "");
          const { cookies, expiresAt } = signPlaybackCookies({ keyPrefix, ip: clientIp(req) });
          for (const [name, value] of Object.entries(cookies)) {
            res.cookie(name, value, playbackCookieOptions(expiresAt));
          }
          playbackUrl = cdnUrl(doc.hlsKey);
          playbackExpiresAt = toIso(expiresAt);
          kind = "stream";
        } catch (e) {
          console.warn("[me.orgVideos] could not sign cookies:", e?.message || e);
        }
      }
      // No ladder yet, but the master is archived: a short-lived direct link
      // so a fresh upload is watchable straight away. Superseded by the
      // ladder the moment the encode completes.
      if (!playbackUrl && doc.sourceKey) {
        try {
          playbackUrl = await presignArchiveUrl(doc.sourceKey);
          playbackExpiresAt = toIso(new Date(Date.now() + 2 * 60 * 60 * 1000));
          kind = "master";
        } catch (e) {
          console.warn("[me.orgVideos] could not presign master:", e?.message || e);
        }
      }
    } else {
      playbackUrl = doc.videoUrl || "";
      kind = doc.source;
    }

    await logWatch(doc, uid, req.user?.email);

    return res.json({
      sessionId: String(session._id),
      sessionRef: session.sessionRef,
      heartbeatSec: 30,
      kind,
      playbackUrl,
      playbackExpiresAt,
    });
  } catch (err) {
    console.error("[me.orgVideos] playback start failed:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

/** Keeps the seat alive and records how far the viewer actually got. */
router.post("/playback/ping", express.json(), async (req, res) => {
  const sessionId = String(req.body?.sessionId || "");
  if (!mongoose.isValidObjectId(sessionId)) return res.status(400).json({ error: "sessionId required" });
  const uid = req.user?.id || req.user?._id;
  const positionSec = Math.max(0, Number(req.body?.positionSec || 0) || 0);
  const watchedDeltaSec = Math.min(120, Math.max(0, Number(req.body?.watchedDeltaSec || 0) || 0));
  const session = await PlaybackSession.findOneAndUpdate(
    { _id: sessionId, userId: uid, courseSku: ORG_VIDEO_SKU, endedAt: null },
    { $set: { lastSeenAt: new Date(), positionSec }, $inc: { watchedSec: watchedDeltaSec } },
    { new: true },
  );
  if (!session) return res.status(404).json({ error: "Session not found" });
  res.json({ ok: true });
});

/** Releases the seat. Best-effort — a dropped heartbeat frees it anyway. */
router.post("/playback/stop", express.json(), async (req, res) => {
  const sessionId = String(req.body?.sessionId || "");
  if (!mongoose.isValidObjectId(sessionId)) return res.status(400).json({ error: "sessionId required" });
  const uid = req.user?.id || req.user?._id;
  await PlaybackSession.updateOne(
    { _id: sessionId, userId: uid, courseSku: ORG_VIDEO_SKU, endedAt: null },
    { $set: { endedAt: new Date(), lastSeenAt: new Date() } },
  );
  res.json({ ok: true });
});

// POST /me/org-videos/:id/watched — the watch log for a pasted link, which
// never goes through playback/start.
router.post("/:id/watched", express.json(), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(404).json({ error: "Not found" });
    const uid = req.user?.id || req.user?._id;
    const { keys } = await orgKeysFor(uid);
    const doc = await OrgVideo.findOne({ _id: id, orgKey: { $in: keys }, isPublished: true });
    if (!doc) return res.status(404).json({ error: "Not found" });
    await logWatch(doc, uid, req.user?.email);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[me.orgVideos] watched failed:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

export default router;
