// server/utils/bunnyStream.js
//
// The small part of the Bunny Stream API the site uses, in one place. The
// course uploader in routes/adminBunny.js predates this and talks to Bunny
// inline; it is left alone (see the note there about older clients). New
// callers should come through here.
//
// WHY THE BROWSER UPLOADS, NOT THE API
//
// The API runs on Lambda behind API Gateway, which caps a request body at
// 10MB. A demo recording is hundreds of megabytes. So the server only CREATES
// the video (a JSON call) and signs a short-lived TUS token; the browser then
// streams the bytes straight to Bunny with that token, and Bunny encodes. The
// API key never reaches the browser — the signature is a hash of it.
// https://docs.bunny.net/reference/tus-resumable-uploads

import crypto from "crypto";

const API = "https://video.bunnycdn.com";

function apiKey() {
  return String(process.env.BUNNY_STREAM_API_KEY || "").trim();
}
function libId() {
  return String(process.env.BUNNY_STREAM_LIB_ID || "").trim();
}

export function isBunnyConfigured() {
  return Boolean(apiKey() && libId());
}

export function bunnyLibId() {
  return libId();
}

async function call(path, init = {}) {
  const r = await fetch(`${API}/library/${libId()}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      AccessKey: apiKey(),
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
  const text = await r.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!r.ok) {
    const msg = json?.message || json?.title || text || `Bunny ${r.status}`;
    const err = new Error(`Bunny Stream: ${msg}`);
    err.status = r.status;
    throw err;
  }
  return json;
}

/** Creates an empty video container. Returns { guid, ... }. */
export function createBunnyVideo(title) {
  return call("/videos", {
    method: "POST",
    body: JSON.stringify({ title: String(title || `upload-${Date.now()}`) }),
  });
}

/** Full video record: status, encodeProgress, length, thumbnailFileName … */
export function getBunnyVideo(videoId) {
  return call(`/videos/${encodeURIComponent(videoId)}`, { method: "GET" });
}

/**
 * Runs the encode again with the library's current settings. This is what
 * "improve the quality" can honestly mean for a file Bunny already holds: it
 * produces every rendition the library allows (up to the source's own
 * resolution — nothing here invents detail that was not recorded).
 * https://docs.bunny.net/reference/video_reencodevideo
 */
export function reencodeBunnyVideo(videoId) {
  return call(`/videos/${encodeURIComponent(videoId)}/reencode`, { method: "POST" });
}

/**
 * Bunny pulls a file from a public URL into a new video and encodes it. The
 * road from a plain MP4 (R2, a direct link) to adaptive streaming without the
 * file passing through the API. Returns { id, ... } — Bunny's fetch reply
 * names the new video's guid as `id`.
 * https://docs.bunny.net/reference/video_fetchnewvideo
 */
export function fetchBunnyVideo(url, title) {
  return call("/videos/fetch", {
    method: "POST",
    body: JSON.stringify({ url: String(url), title: String(title || "") }),
  });
}

export async function deleteBunnyVideo(videoId) {
  try {
    await call(`/videos/${encodeURIComponent(videoId)}`, { method: "DELETE" });
    return true;
  } catch (e) {
    // Already gone is the outcome we wanted.
    if (e.status === 404) return true;
    throw e;
  }
}

/**
 * The TUS upload credential: sha256(libraryId + apiKey + expire + videoId),
 * exactly as Bunny specifies, plus everything the browser needs to send
 * alongside it. `expire` is unix seconds.
 */
export function bunnyTusAuth(videoId, ttlSeconds = 6 * 60 * 60) {
  const expire = Math.floor(Date.now() / 1000) + ttlSeconds;
  const signature = crypto
    .createHash("sha256")
    .update(`${libId()}${apiKey()}${expire}${videoId}`)
    .digest("hex");
  return {
    endpoint: `${API}/tusupload`,
    libraryId: libId(),
    videoId,
    signature,
    expire,
  };
}

export function bunnyShorthand(videoId) {
  return `bunny:${libId()}:${videoId}`;
}

export function bunnyEmbedUrl(videoId) {
  return `https://iframe.mediadelivery.net/embed/${libId()}/${videoId}`;
}
