// The channel's public upload feed (R10): the newest fifteen uploads, with no
// API key. YouTube publishes it at /feeds/videos.xml?channel_id=UC…; it is
// plain Atom, read here with a few patterns rather than a new dependency.
//
// Shorts are in the feed too, linked as /shorts/<id>. The free library is the
// long-form lessons, so they are marked and the caller leaves them out.
//
// THE FALLBACK. The feed is not dependable: on 27 Sep 2026 it answered 404
// (once 500) from 01:37 to 06:52 UTC, then came back by itself. When it
// fails, fetchChannelUploads reads the same uploads off the YouTube Data API
// v3 instead, from the channel's uploads playlist with playlistItems.list
// (1 quota unit a call), and hands back the same shape. It needs
// YOUTUBE_API_KEY; without one the fallback is dormant and the caller is told
// why (FeedUnavailableError.code === "no-key").

const decode = (s) =>
  String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : "";
};

/** @returns {Array<{ youtubeId: string, title: string, publishedAt: Date|null, thumbnailUrl: string, isShort: boolean }>} */
export function parseFeed(xml) {
  const out = [];
  for (const m of String(xml || "").matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const youtubeId = tag(e, "yt:videoId");
    if (!youtubeId) continue;
    const link = (e.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/) || [])[1] || "";
    const thumb = (e.match(/<media:thumbnail[^>]*url="([^"]+)"/) || [])[1] || "";
    const published = tag(e, "published");
    out.push({
      youtubeId,
      title: tag(e, "title"),
      publishedAt: published ? new Date(published) : null,
      thumbnailUrl: thumb || `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
      isShort: /\/shorts\//.test(link),
    });
  }
  return out;
}

export async function fetchChannelFeed(channelId, { fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
  if (!channelId) throw new Error("No YouTube channel id");
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`,
      { signal: ctl.signal },
    );
    if (!res.ok) throw new Error(`YouTube feed answered ${res.status}`);
    return parseFeed(await res.text());
  } finally {
    clearTimeout(t);
  }
}

/* ─────────────────────────────────────────────── Data API v3 fallback ── */

const API = "https://www.googleapis.com/youtube/v3";

/** Why neither source could be read. `code` is "no-key" or "api-error". */
export class FeedUnavailableError extends Error {
  constructor(message, { code, rssError, apiError } = {}) {
    super(message);
    this.name = "FeedUnavailableError";
    this.code = code;
    this.rssError = rssError || null;
    this.apiError = apiError || null;
  }
}

// A channel's system playlists are its id with the "UC" swapped: UU holds
// every upload, UUSH only its Shorts. Deriving them saves a channels.list call.
const UC_ID = /^UC[\w-]{22}$/;
export const uploadsPlaylistOf = (channelId) => (UC_ID.test(channelId) ? `UU${channelId.slice(2)}` : "");
export const shortsPlaylistOf = (channelId) => (UC_ID.test(channelId) ? `UUSH${channelId.slice(2)}` : "");

const THUMBS = ["maxres", "standard", "high", "medium", "default"];

/** One playlistItem to the feed's shape. Null for a deleted or private video. */
export function shapeApiItem(item, shortIds = new Set()) {
  const youtubeId = item?.contentDetails?.videoId || item?.snippet?.resourceId?.videoId || "";
  if (!youtubeId) return null;
  const s = item.snippet || {};
  if (/^(Private|Deleted) video$/.test(s.title || "")) return null;
  const published = item?.contentDetails?.videoPublishedAt || s.publishedAt || "";
  const thumb = THUMBS.map((k) => s.thumbnails?.[k]?.url).find(Boolean);
  return {
    youtubeId: String(youtubeId),
    title: String(s.title || "").trim(),
    publishedAt: published ? new Date(published) : null,
    thumbnailUrl: thumb || `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
    isShort: shortIds.has(String(youtubeId)) || /#shorts\b/i.test(s.title || ""),
  };
}

async function apiGet(path, params, { fetchImpl, timeoutMs }) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${API}/${path}?${new URLSearchParams(params)}`, { signal: ctl.signal });
    if (!res.ok) {
      // The reason (quotaExceeded, keyInvalid, playlistNotFound) is in the
      // body. The URL carries the key, so it never goes into the message.
      let reason = "";
      try {
        reason = JSON.parse(await res.text())?.error?.errors?.[0]?.reason || "";
      } catch {
        /* the status alone, then */
      }
      const err = new Error(`YouTube Data API ${path} answered ${res.status}${reason ? ` (${reason})` : ""}`);
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/** The newest uploads off the Data API, in parseFeed's shape. */
export async function fetchUploadsViaApi(
  channelId,
  { apiKey, fetchImpl = globalThis.fetch, timeoutMs = 8000, limit = 15 } = {},
) {
  if (!apiKey) throw new Error("YOUTUBE_API_KEY is not set");
  const playlistId = uploadsPlaylistOf(channelId);
  if (!playlistId) throw new Error(`"${channelId}" is not a UC… channel id`);
  const list = (id) =>
    apiGet(
      "playlistItems",
      { part: "snippet,contentDetails", playlistId: id, maxResults: String(limit), key: apiKey },
      { fetchImpl, timeoutMs },
    );

  const uploads = await list(playlistId);
  // Which of those are Shorts costs one more unit. A channel with no Shorts
  // answers 404 for that playlist; then the #shorts title tag is all there is.
  let shortIds = new Set();
  try {
    const shorts = await list(shortsPlaylistOf(channelId));
    shortIds = new Set((shorts?.items || []).map((i) => i?.contentDetails?.videoId).filter(Boolean));
  } catch {
    /* title tag only */
  }
  return (uploads?.items || []).map((i) => shapeApiItem(i, shortIds)).filter(Boolean);
}

/**
 * The channel's newest uploads: the public feed first, the Data API when the
 * feed fails. Resolves to { videos, source: "rss" | "api", rssError? }.
 * Throws FeedUnavailableError when neither can be read.
 */
export async function fetchChannelUploads(
  channelId,
  { fetchImpl = globalThis.fetch, env = process.env, timeoutMs = 8000 } = {},
) {
  let rssError;
  try {
    return { videos: await fetchChannelFeed(channelId, { fetchImpl, timeoutMs }), source: "rss" };
  } catch (err) {
    rssError = String(err?.message || err);
  }
  const apiKey = String(env.YOUTUBE_API_KEY || "").trim();
  if (!apiKey) {
    throw new FeedUnavailableError(
      `YouTube feed failed (${rssError}) and YOUTUBE_API_KEY is not set, so the Data API fallback is dormant`,
      { code: "no-key", rssError },
    );
  }
  try {
    const videos = await fetchUploadsViaApi(channelId, { apiKey, fetchImpl, timeoutMs });
    return { videos, source: "api", rssError };
  } catch (err) {
    const apiError = String(err?.message || err);
    throw new FeedUnavailableError(`YouTube feed failed (${rssError}) and so did the Data API (${apiError})`, {
      code: "api-error",
      rssError,
      apiError,
    });
  }
}
