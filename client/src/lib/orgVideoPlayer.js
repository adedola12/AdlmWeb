// src/lib/orgVideoPlayer.js
//
// What to put on screen for an organisation video's URL. One answer shared by
// the admin preview and the account's shelf, so the two never disagree about
// whether something plays.
//
//   { kind: "iframe", src }  — Bunny embed, YouTube
//   { kind: "video",  src }  — an MP4 (R2, Cloudinary, Drive's download link)
//   null                     — nothing to play yet

import { parseBunny, bunnyIframeSrc } from "./video";

const YT =
  /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i;

export function playableFor(item) {
  if (!item) return null;
  if (item.embedUrl) return { kind: "iframe", src: item.embedUrl };
  const url = String(item.videoUrl || "").trim();
  if (!url) return null;

  const yt = url.match(YT);
  if (yt) return { kind: "iframe", src: `https://www.youtube.com/embed/${yt[1]}?rel=0` };

  const parsed = parseBunny(url);
  if (!parsed) return null;
  if (parsed.kind === "bunny") {
    return { kind: "iframe", src: bunnyIframeSrc(parsed.libId, parsed.videoId) };
  }
  return { kind: "video", src: parsed.src };
}

/** "12:04" from seconds, or "" when nothing is known. */
export function clockOf(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  if (!s) return "";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`
    : `${m}:${String(r).padStart(2, "0")}`;
}

/** "184 MB" from bytes. */
export function sizeOf(bytes) {
  const n = Number(bytes) || 0;
  if (!n) return "";
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 * 1024 * 1024) return `${Math.round(n / (1024 * 1024))} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
