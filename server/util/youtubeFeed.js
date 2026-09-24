// Reading the studio's uploads off the YouTube Data API.
//
// Everything here is pure fetch-and-shape. It knows nothing about the database
// and nothing about email — deciding what is new is util/videoNotifier.js's
// job, and keeping the two apart is what makes both testable without a network
// or a Mongo.
//
// WHICH DATE IS THE PUBLISH DATE
//
// A playlistItem carries TWO timestamps and they are not the same thing.
// `snippet.publishedAt` is when the video was added to the playlist;
// `contentDetails.videoPublishedAt` is when the video itself went public. For
// the uploads playlist they usually agree, but they come apart on anything
// uploaded private and made public later — which is exactly how a launch video
// gets made. So videoPublishedAt is preferred and the snippet date is only the
// fallback.
//
// WHICH THUMBNAIL
//
// Biggest first, because the email renders it 536px wide and the default is
// 120px. maxres does not exist for every video, standard does not exist for
// older ones, and high is the only size YouTube effectively always returns —
// so the list walks down until something is there rather than assuming.

const API = "https://www.googleapis.com/youtube/v3";

/** Thrown for anything the caller could plausibly do something about. */
export class YouTubeError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "YouTubeError";
    this.status = status;
  }
}

const apiKey = () => String(process.env.YOUTUBE_API_KEY || "").trim();
const channelId = () => String(process.env.YOUTUBE_CHANNEL_ID || "").trim();

/** Configured enough to run at all. Checked before anything reaches the wire. */
export function isConfigured() {
  return Boolean(apiKey() && channelId());
}

async function call(path, params) {
  const key = apiKey();
  if (!key) throw new YouTubeError("YOUTUBE_API_KEY is not set", 0);

  const qs = new URLSearchParams({ ...params, key });
  const res = await fetch(`${API}/${path}?${qs}`);

  if (!res.ok) {
    // The body carries the real reason — quotaExceeded and keyInvalid are both
    // 403 and are very different problems, so it is worth surfacing rather
    // than reporting "403" and leaving somebody guessing.
    const body = await res.text().catch(() => "");
    let reason = "";
    try {
      reason = JSON.parse(body)?.error?.errors?.[0]?.reason || "";
    } catch {
      /* a non-JSON error body is still an error; the status carries it */
    }
    throw new YouTubeError(
      `YouTube ${path} failed: ${res.status}${reason ? ` (${reason})` : ""}`,
      res.status,
    );
  }

  return res.json();
}

/* ─────────────────────────────────────────────────────────────── shaping ── */

const THUMB_ORDER = ["maxres", "standard", "high", "medium", "default"];

export function pickThumbnail(thumbnails = {}) {
  for (const size of THUMB_ORDER) {
    const url = thumbnails?.[size]?.url;
    if (url) return url;
  }
  return "";
}

export const watchUrl = (videoId) =>
  `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;

/**
 * One playlistItem to the fields the videos collection stores.
 *
 * Returns null rather than a half-filled record when there is no video id: a
 * playlist can hold an item whose video has since been deleted or made
 * private, and a row with no id is a row that can never be matched against
 * YouTube again.
 */
export function shapePlaylistItem(item) {
  const videoId =
    item?.contentDetails?.videoId || item?.snippet?.resourceId?.videoId || "";
  if (!videoId) return null;

  const s = item.snippet || {};
  const published = item?.contentDetails?.videoPublishedAt || s.publishedAt || null;

  return {
    videoId: String(videoId),
    title: String(s.title || "").trim(),
    description: String(s.description || ""),
    thumbnailUrl: pickThumbnail(s.thumbnails),
    publishedAt: published ? new Date(published) : null,
  };
}

/** The same shape, from a videos.list entry — the manual path's source. */
export function shapeVideo(item) {
  const videoId = item?.id || "";
  if (!videoId) return null;

  const s = item.snippet || {};
  return {
    videoId: String(videoId),
    title: String(s.title || "").trim(),
    description: String(s.description || ""),
    thumbnailUrl: pickThumbnail(s.thumbnails),
    publishedAt: s.publishedAt ? new Date(s.publishedAt) : null,
  };
}

/* ───────────────────────────────────────────────────────────── id parsing ── */

const BARE_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * A video id out of whatever an admin pasted.
 *
 * The manual endpoint exists so a video can be announced the moment it is up,
 * and the thing on the clipboard at that moment is a URL from the browser or
 * the share sheet, not a bare id. So every shape YouTube hands out is
 * accepted, and a bare id still works.
 *
 * The bare-id test is strict: 11 characters of the base64url alphabet.
 * Loosened, it would match half of every URL that failed the patterns above
 * and turn a typo into a lookup for a video that does not exist.
 */
export function parseVideoId(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (BARE_ID.test(raw)) return raw;

  let url;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return "";
  }

  const host = url.hostname.replace(/^www\./, "");
  const seg = url.pathname.split("/").filter(Boolean);

  // youtu.be/<id>
  if (host === "youtu.be") return BARE_ID.test(seg[0] || "") ? seg[0] : "";

  if (!/(^|\.)youtube(-nocookie)?\.com$/.test(host)) return "";

  // youtube.com/watch?v=<id>
  const v = url.searchParams.get("v");
  if (v && BARE_ID.test(v)) return v;

  // youtube.com/embed|shorts|live|v/<id>
  if (["embed", "shorts", "live", "v"].includes(seg[0]) && BARE_ID.test(seg[1] || "")) {
    return seg[1];
  }

  return "";
}

/* ───────────────────────────────────────────────────────────── the calls ── */

// The uploads playlist id never changes for a channel, so it is resolved once
// per process rather than on every fifteen-minute poll. That is one API unit
// saved per run, but more importantly one fewer thing that can fail between
// the schedule firing and the videos being read.
let _uploadsPlaylistId = "";

export async function uploadsPlaylistId() {
  if (_uploadsPlaylistId) return _uploadsPlaylistId;

  const id = channelId();
  if (!id) throw new YouTubeError("YOUTUBE_CHANNEL_ID is not set", 0);

  const json = await call("channels", { part: "contentDetails", id });
  const uploads = json?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) {
    throw new YouTubeError(
      `No channel found for YOUTUBE_CHANNEL_ID "${id}". It must be the UC… id, not the @handle.`,
      404,
    );
  }

  _uploadsPlaylistId = uploads;
  return uploads;
}

/** Only for tests, which change the env between cases. */
export function _resetUploadsCache() {
  _uploadsPlaylistId = "";
}

/**
 * The most recent uploads, newest first.
 *
 * One page, and a small one. The poller runs every fifteen minutes, so the
 * question it is really asking is "did anything appear since the last run" —
 * and a channel that published more than `limit` videos in fifteen minutes has
 * a different problem from the one this code solves. Paging the whole history
 * every run would spend quota re-reading videos already in the collection.
 */
export async function fetchRecentUploads(limit = 15) {
  const playlistId = await uploadsPlaylistId();

  const json = await call("playlistItems", {
    part: "snippet,contentDetails",
    playlistId,
    maxResults: String(Math.min(Math.max(Number(limit) || 15, 1), 50)),
  });

  return (json?.items || []).map(shapePlaylistItem).filter(Boolean);
}

/** One video by id, for the manual announce. Null when YouTube has no such video. */
export async function fetchVideo(videoId) {
  const id = String(videoId || "").trim();
  if (!id) return null;

  const json = await call("videos", { part: "snippet", id });
  const item = json?.items?.[0];
  return item ? shapeVideo(item) : null;
}
