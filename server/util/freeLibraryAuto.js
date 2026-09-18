// New uploads reach the free lesson library by themselves (R02, R10).
//
// Runs in the fifteen-minute video-poll job (scheduled.js). Reads the
// channel's public feed, and files every long-form upload the library does not
// hold yet onto a shelf by the rules in freeVideoSections.js, published, so it
// shows on the Learn page within a quarter of an hour of going up on YouTube.
//
// Additive only, like the catalogue sync: nothing is changed or unpublished,
// and a video somebody has already filed or hidden is left alone (matched on
// youtubeId, whatever its state). FREE_LIBRARY_AUTO=off stops it.

import { fetchChannelFeed } from "./youtubeRss.js";
import { fileVideo, sectionOf } from "./freeVideoSections.js";
import { loadCatalogue } from "./youtubeLibrary.js";

export function channelIdNow(env = process.env) {
  return String(env.YOUTUBE_CHANNEL_ID || loadCatalogue()?.channelId || "").trim();
}

/** The rows to create for uploads the library does not hold. Pure. */
export function planNewUploads(feed, knownIds) {
  const known = new Set((knownIds || []).map(String));
  return (feed || [])
    .filter((v) => !v.isShort && v.youtubeId && !known.has(v.youtubeId))
    .map((v) => {
      const section = fileVideo({ title: v.title });
      return {
        youtubeId: v.youtubeId,
        title: v.title || "ADLM lesson",
        thumbnailUrl: v.thumbnailUrl,
        publishedAt: v.publishedAt || null,
        section,
        productLabel: sectionOf(section)?.label || "",
        isPublished: true,
        recommended: false,
        sort: 0,
        durationSec: 0,
      };
    });
}

export async function runFreeLibraryAuto({
  FreeVideo,
  fetchFeed = fetchChannelFeed,
  env = process.env,
  log = console,
} = {}) {
  if (/^(off|0|false|no)$/i.test(String(env.FREE_LIBRARY_AUTO || "").trim())) {
    return { ok: true, skipped: true, reason: "off" };
  }
  const feed = await fetchFeed(channelIdNow(env));
  const ids = feed.map((v) => v.youtubeId);
  const known = await FreeVideo.find({ youtubeId: { $in: ids } }).select("youtubeId").lean();
  const rows = planNewUploads(feed, known.map((k) => k.youtubeId));
  for (const row of rows) {
    await FreeVideo.updateOne({ youtubeId: row.youtubeId }, { $setOnInsert: row }, { upsert: true });
    log.log?.(`[free-library] filed ${row.youtubeId} on "${row.section || "More lessons"}": ${row.title}`);
  }
  return { ok: true, checked: feed.length, shorts: feed.filter((v) => v.isShort).length, added: rows.length };
}
