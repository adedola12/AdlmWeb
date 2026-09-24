// server/util/youtubeDuration.js
//
// Look up a video's runtime from the YouTube Data API.
//
// Optional by design: without YOUTUBE_API_KEY this returns 0 and the caller
// keeps whatever duration was typed in. The site never calls YouTube to
// render a page — durations are stored on our own record, so a quota outage,
// a rate limit or an unlisted video cannot blank the captions.
const ENDPOINT = "https://www.googleapis.com/youtube/v3/videos";

// "PT12M41S" -> 761
export function parseIso8601Duration(iso) {
  const m = /^P(?:([\d.]+)D)?T?(?:([\d.]+)H)?(?:([\d.]+)M)?(?:([\d.]+)S)?$/.exec(
    String(iso || ""),
  );
  if (!m) return 0;
  const [, d, h, min, sec] = m;
  return Math.round(
    (Number(d || 0) * 86400) + (Number(h || 0) * 3600) + (Number(min || 0) * 60) + Number(sec || 0),
  );
}

export async function fetchDurationSec(youtubeId) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key || !youtubeId) return 0;
  try {
    const url = `${ENDPOINT}?part=contentDetails&id=${encodeURIComponent(youtubeId)}&key=${key}`;
    const res = await fetch(url);
    if (!res.ok) return 0;
    const json = await res.json();
    return parseIso8601Duration(json.items?.[0]?.contentDetails?.duration);
  } catch {
    // A lookup failure must never block saving the video.
    return 0;
  }
}

export default fetchDurationSec;
