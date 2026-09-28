import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchChannelUploads,
  FeedUnavailableError,
  uploadsPlaylistOf,
  shortsPlaylistOf,
} from "./youtubeRss.js";
import { runFreeLibraryAuto } from "./freeLibraryAuto.js";

const CHANNEL = "UCJ-dn5t2MiEGpMhPgtMYhKQ";
const KEY = "test-key-not-real";

const FEED = `<?xml version="1.0"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015">
<entry><yt:videoId>AAA111bbb22</yt:videoId><title>HERON for PlanSwift: Valuation</title>
<link rel="alternate" href="https://www.youtube.com/watch?v=AAA111bbb22"/>
<published>2026-09-18T10:00:00+00:00</published></entry>
</feed>`;

const playlistItem = (videoId, title, extra = {}) => ({
  snippet: {
    title,
    publishedAt: "2026-09-20T09:00:00Z",
    resourceId: { videoId },
    thumbnails: { high: { url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` } },
  },
  contentDetails: { videoId, videoPublishedAt: "2026-09-19T08:00:00Z" },
  ...extra,
});

const resp = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  json: async () => (typeof body === "string" ? JSON.parse(body) : body),
});

/** A fetch stand-in routed by URL; records every URL it was asked for. */
function mockFetch(routes) {
  const calls = [];
  const fn = async (url) => {
    calls.push(String(url));
    for (const [match, answer] of routes) {
      if (String(url).includes(match)) return typeof answer === "function" ? answer(url) : answer;
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  fn.calls = calls;
  return fn;
}

const silentLog = () => {
  const lines = [];
  return { lines, log: (m) => lines.push(["log", m]), warn: (m) => lines.push(["warn", m]) };
};

test("the channel's system playlists come from its id", () => {
  assert.equal(uploadsPlaylistOf(CHANNEL), "UUJ-dn5t2MiEGpMhPgtMYhKQ");
  assert.equal(shortsPlaylistOf(CHANNEL), "UUSHJ-dn5t2MiEGpMhPgtMYhKQ");
  assert.equal(uploadsPlaylistOf("@adlmstudio"), "");
});

test("RSS OK: the feed is used and the Data API is never called", async () => {
  const fetchImpl = mockFetch([["feeds/videos.xml", resp(200, FEED)]]);
  const out = await fetchChannelUploads(CHANNEL, { fetchImpl, env: { YOUTUBE_API_KEY: KEY } });
  assert.equal(out.source, "rss");
  assert.equal(out.videos.length, 1);
  assert.equal(out.videos[0].youtubeId, "AAA111bbb22");
  assert.equal(fetchImpl.calls.length, 1);
});

test("RSS 404 then API OK: same shape, Shorts marked, deleted videos dropped", async () => {
  const fetchImpl = mockFetch([
    ["feeds/videos.xml", resp(404, "Not Found")],
    [
      "playlistId=UUSH",
      resp(200, { items: [playlistItem("SHORT000000", "60 seconds of QUIV")] }),
    ],
    [
      "playlistId=UUJ",
      resp(200, {
        items: [
          playlistItem("NEW00000001", "QUIV for Revit: Rebar schedules"),
          playlistItem("SHORT000000", "60 seconds of QUIV"),
          playlistItem("GONE0000000", "Deleted video"),
        ],
      }),
    ],
  ]);
  const out = await fetchChannelUploads(CHANNEL, { fetchImpl, env: { YOUTUBE_API_KEY: KEY } });
  assert.equal(out.source, "api");
  assert.match(out.rssError, /404/);
  assert.deepEqual(
    out.videos.map((v) => [v.youtubeId, v.isShort]),
    [
      ["NEW00000001", false],
      ["SHORT000000", true],
    ],
  );
  const v = out.videos[0];
  assert.equal(v.title, "QUIV for Revit: Rebar schedules");
  assert.equal(v.thumbnailUrl, "https://i.ytimg.com/vi/NEW00000001/hqdefault.jpg");
  // The video's own publish date wins over the date it joined the playlist.
  assert.equal(v.publishedAt.toISOString(), "2026-09-19T08:00:00.000Z");
  const apiUrl = fetchImpl.calls.find((u) => u.includes("playlistId=UUJ"));
  assert.match(apiUrl, /playlistItems\?/);
  assert.match(apiUrl, /key=test-key-not-real/);
});

test("RSS 404 and no key: a no-key error, and the API is not called", async () => {
  const fetchImpl = mockFetch([["feeds/videos.xml", resp(404, "Not Found")]]);
  await assert.rejects(
    fetchChannelUploads(CHANNEL, { fetchImpl, env: {} }),
    (err) => err instanceof FeedUnavailableError && err.code === "no-key" && /dormant/.test(err.message),
  );
  assert.equal(fetchImpl.calls.length, 1);
});

test("API error: the reason is reported and the key never is", async () => {
  const fetchImpl = mockFetch([
    ["feeds/videos.xml", resp(404, "Not Found")],
    ["googleapis.com", resp(403, { error: { errors: [{ reason: "quotaExceeded" }] } })],
  ]);
  await assert.rejects(fetchChannelUploads(CHANNEL, { fetchImpl, env: { YOUTUBE_API_KEY: KEY } }), (err) => {
    assert.ok(err instanceof FeedUnavailableError);
    assert.equal(err.code, "api-error");
    assert.match(err.message, /403 \(quotaExceeded\)/);
    assert.doesNotMatch(err.message, new RegExp(KEY));
    return true;
  });
});

/* ── the job: a failed read changes nothing and is said once ── */

function fakeFreeVideo(known = []) {
  const writes = [];
  return {
    writes,
    find: () => ({ select: () => ({ lean: async () => known.map((youtubeId) => ({ youtubeId })) }) }),
    updateOne: async (q) => writes.push(q.youtubeId),
  };
}

test("job: RSS 404 and no key logs once over many runs, writes nothing, never throws", async () => {
  const FreeVideo = fakeFreeVideo();
  const health = { state: "ok" };
  const { lines, ...log } = silentLog();
  const fetchImpl = mockFetch([["feeds/videos.xml", resp(404, "Not Found")]]);
  const env = { YOUTUBE_CHANNEL_ID: CHANNEL };
  const fetchFeed = (id) => fetchChannelUploads(id, { fetchImpl, env });
  for (let i = 0; i < 4; i++) {
    const out = await runFreeLibraryAuto({ FreeVideo, fetchFeed, env, log, health });
    assert.equal(out.skipped, true);
    assert.equal(out.code, "no-key");
  }
  assert.equal(FreeVideo.writes.length, 0);
  assert.equal(lines.length, 1);
  assert.equal(lines[0][0], "warn");
  assert.match(lines[0][1], /YOUTUBE_API_KEY is not set/);
});

test("job: RSS 404 then API OK files the new upload and says so once; recovery is said once", async () => {
  const FreeVideo = fakeFreeVideo();
  const health = { state: "ok" };
  const { lines, ...log } = silentLog();
  let rssUp = false;
  const fetchImpl = mockFetch([
    ["feeds/videos.xml", () => (rssUp ? resp(200, FEED) : resp(404, "Not Found"))],
    ["playlistId=UUSH", resp(404, { error: { errors: [{ reason: "playlistNotFound" }] } })],
    ["playlistId=UUJ", resp(200, { items: [playlistItem("NEW00000001", "QUIV for Revit: Rebar schedules")] })],
  ]);
  const env = { YOUTUBE_CHANNEL_ID: CHANNEL, YOUTUBE_API_KEY: KEY };
  const fetchFeed = (id) => fetchChannelUploads(id, { fetchImpl, env });

  const first = await runFreeLibraryAuto({ FreeVideo, fetchFeed, env, log, health });
  assert.equal(first.source, "api");
  assert.equal(first.added, 1);
  assert.deepEqual(FreeVideo.writes, ["NEW00000001"]);
  await runFreeLibraryAuto({ FreeVideo, fetchFeed, env, log, health });
  assert.equal(lines.filter(([lvl]) => lvl === "warn").length, 1);

  rssUp = true;
  const back = await runFreeLibraryAuto({ FreeVideo, fetchFeed, env, log, health });
  assert.equal(back.source, "rss");
  await runFreeLibraryAuto({ FreeVideo, fetchFeed, env, log, health });
  assert.equal(lines.filter(([, m]) => /answering again/.test(m)).length, 1);
});

test("job: API error too is logged once, and nothing is written or unpublished", async () => {
  const FreeVideo = fakeFreeVideo(["OLD00000000"]);
  const health = { state: "ok" };
  const { lines, ...log } = silentLog();
  const fetchImpl = mockFetch([
    ["feeds/videos.xml", resp(500, "oops")],
    ["googleapis.com", resp(403, { error: { errors: [{ reason: "keyInvalid" }] } })],
  ]);
  const env = { YOUTUBE_CHANNEL_ID: CHANNEL, YOUTUBE_API_KEY: KEY };
  const fetchFeed = (id) => fetchChannelUploads(id, { fetchImpl, env });
  const a = await runFreeLibraryAuto({ FreeVideo, fetchFeed, env, log, health });
  const b = await runFreeLibraryAuto({ FreeVideo, fetchFeed, env, log, health });
  assert.equal(a.code, "api-error");
  assert.equal(b.ok, false);
  assert.equal(FreeVideo.writes.length, 0);
  assert.equal(lines.length, 1);
  assert.match(lines[0][1], /keyInvalid/);
});
