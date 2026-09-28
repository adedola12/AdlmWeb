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
//
// The channel is read from its public feed, or from the Data API when the feed
// is down (youtubeRss.js fetchChannelUploads). When neither answers, the run
// files nothing and says so once, not every fifteen minutes.

import { fetchChannelUploads } from "./youtubeRss.js";
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

// How the last run's read of the channel went, so a feed that stays down is
// reported ONCE when it goes down (and once when it comes back), not every
// fifteen minutes. Per warm Lambda container; a cold start may say it again.
const feedHealth = { state: "ok" };

function noteFeedState(health, next, log, message) {
  if (health.state === next) return;
  health.state = next;
  if (next === "ok") log.log?.(`[free-library] ${message}`);
  else log.warn?.(`[free-library] ${message}`);
}

export async function runFreeLibraryAuto({
  FreeVideo,
  // Resolves to an array of uploads, or to { videos, source }.
  fetchFeed = (channelId) => fetchChannelUploads(channelId, { env }),
  // YouTube ids an admin deleted from the library: never re-filed.
  ignoredIds = async () => [],
  env = process.env,
  log = console,
  health = feedHealth,
} = {}) {
  if (/^(off|0|false|no)$/i.test(String(env.FREE_LIBRARY_AUTO || "").trim())) {
    return { ok: true, skipped: true, reason: "off" };
  }

  // A failed read changes nothing: the job is additive, so every video already
  // on the shelves stays exactly as it was until a read succeeds again.
  let got;
  try {
    got = await fetchFeed(channelIdNow(env));
  } catch (err) {
    const code = err?.code || "error";
    const error = String(err?.message || err);
    noteFeedState(health, code, log, `${error}. Nothing changes in the library; checking again every run.`);
    return { ok: false, skipped: true, reason: "feed-unavailable", code, error };
  }
  const feed = Array.isArray(got) ? got : got?.videos || [];
  const source = Array.isArray(got) ? undefined : got?.source;
  if (source === "api") {
    noteFeedState(health, "api", log, `YouTube feed failed (${got.rssError}); reading uploads from the Data API instead.`);
  } else {
    noteFeedState(health, "ok", log, "YouTube feed is answering again.");
  }

  const ids = feed.map((v) => v.youtubeId);
  const known = await FreeVideo.find({ youtubeId: { $in: ids } }).select("youtubeId").lean();
  const ignored = (await ignoredIds()) || [];
  const rows = planNewUploads(feed, [...known.map((k) => k.youtubeId), ...ignored]);
  for (const row of rows) {
    await FreeVideo.updateOne({ youtubeId: row.youtubeId }, { $setOnInsert: row }, { upsert: true });
    log.log?.(`[free-library] filed ${row.youtubeId} on "${row.section || "More lessons"}": ${row.title}`);
  }
  return {
    ok: true,
    ...(source ? { source } : {}),
    checked: feed.length,
    shorts: feed.filter((v) => v.isShort).length,
    added: rows.length,
  };
}
