// Small shared helpers for the free video library.
//
// The library is the ADLM Studio YouTube channel, filed onto shelves by the
// server (GET /learn/free/sections). Three pages draw on it — Learn, the
// lesson player, and the product pages' recommended strip — and each used to
// carry its own copy of the id parser and thumbnail rule. One copy here.

import { API_BASE } from "../config";

/** "https://youtu.be/abc…", a watch URL, an embed URL or a bare id -> the id. */
export function extractYouTubeId(input = "") {
  const s = String(input || "").trim();
  try {
    if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
    const url = new URL(s);
    if (url.hostname.includes("youtu.be")) return url.pathname.replace("/", "");
    if (url.hostname.includes("youtube.com")) {
      const id = url.searchParams.get("v");
      if (id) return id;
      const m = url.pathname.match(/\/(?:embed|shorts)\/([a-zA-Z0-9_-]{11})/);
      if (m) return m[1];
    }
  } catch {
    // Not a URL and not an id: nothing to embed.
  }
  return "";
}

/** YouTube's own still. hqdefault exists for every video; maxres does not. */
export function youtubeThumb(id, size = "hqdefault") {
  return id ? `https://img.youtube.com/vi/${id}/${size}.jpg` : "";
}

/** 761 -> "12:41", 3723 -> "1:02:03", 0 -> "". */
export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(Number(totalSeconds) || 0));
  if (!s) return "";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

async function getJson(url, signal) {
  const res = await fetch(url, { credentials: "include", signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** The whole published library, grouped by shelf. */
export async function fetchFreeVideoSections(signal) {
  const data = await getJson(`${API_BASE}/learn/free/sections`, signal);
  return Array.isArray(data?.sections) ? data.sections : [];
}

/** The short recommended strip for one catalogue product key. */
export async function fetchRecommendedVideos(productKey, limit = 6, signal) {
  const key = String(productKey || "").trim();
  if (!key) return [];
  const data = await getJson(
    `${API_BASE}/learn/free/recommended?product=${encodeURIComponent(key)}&limit=${limit}`,
    signal,
  );
  return Array.isArray(data?.items) ? data.items : [];
}

/** One video by id, with its shelf resolved as `sectionInfo`. Null if gone. */
export async function fetchFreeVideo(id, signal) {
  const res = await fetch(`${API_BASE}/learn/free/${encodeURIComponent(id)}`, {
    credentials: "include",
    signal,
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data?.item || null;
}

/** Published videos on one shelf, in shelf order. */
export async function fetchFreeVideosInSection(slug, pageSize = 24, signal) {
  const data = await getJson(
    `${API_BASE}/learn/free?section=${encodeURIComponent(slug)}&page=1&pageSize=${pageSize}`,
    signal,
  );
  return Array.isArray(data?.items) ? data.items : [];
}

// The shelf table, fetched once per page load and shared by every caller —
// the admin editors' section pickers, mostly.
let sectionListPromise = null;
export function fetchFreeVideoSectionList() {
  if (!sectionListPromise) {
    sectionListPromise = getJson(`${API_BASE}/learn/free/section-list`)
      .then((d) => (Array.isArray(d?.sections) ? d.sections : []))
      .catch(() => {
        sectionListPromise = null;
        return [];
      });
  }
  return sectionListPromise;
}
