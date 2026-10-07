import test from "node:test";
import assert from "node:assert/strict";
import { parseFeed } from "./youtubeRss.js";
import { planNewUploads, runFreeLibraryAuto } from "./freeLibraryAuto.js";
import { fileVideo } from "./freeVideoSections.js";

const FEED = `<?xml version="1.0"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015">
<entry><id>yt:video:AAA111bbb22</id><yt:videoId>AAA111bbb22</yt:videoId>
<title>HERON for PlanSwift: Valuation &amp; Variation</title>
<link rel="alternate" href="https://www.youtube.com/watch?v=AAA111bbb22"/>
<published>2026-09-18T10:00:00+00:00</published>
<media:group><media:thumbnail url="https://i1.ytimg.com/vi/AAA111bbb22/hqdefault.jpg" width="480" height="360"/></media:group></entry>
<entry><yt:videoId>SHORT000000</yt:videoId><title>60 seconds of QUIV</title>
<link rel="alternate" href="https://www.youtube.com/shorts/SHORT000000"/><published>2026-09-17T10:00:00+00:00</published></entry>
<entry><yt:videoId>OLD00000000</yt:videoId><title>Getting started with the Hub</title>
<link rel="alternate" href="https://www.youtube.com/watch?v=OLD00000000"/><published>2026-01-01T10:00:00+00:00</published></entry>
</feed>`;

test("the public feed is read without a key, and Shorts are told apart", () => {
  const v = parseFeed(FEED);
  assert.equal(v.length, 3);
  assert.equal(v[0].title, "HERON for PlanSwift: Valuation & Variation");
  assert.equal(v[0].thumbnailUrl, "https://i1.ytimg.com/vi/AAA111bbb22/hqdefault.jpg");
  assert.equal(v[0].publishedAt.toISOString(), "2026-09-18T10:00:00.000Z");
  assert.equal(v[1].isShort, true);
  assert.equal(v[2].thumbnailUrl, "https://i.ytimg.com/vi/OLD00000000/hqdefault.jpg");
});

test("a new long-form upload is filed on its shelf and published; known ones are left alone", () => {
  const rows = planNewUploads(parseFeed(FEED), ["OLD00000000"]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].section, "heron");
  assert.equal(rows[0].productLabel, "HERON for PlanSwift");
  assert.equal(rows[0].isPublished, true);
});

test("filing: a hand-set shelf wins, then starter titles, playlists, title words", () => {
  assert.equal(fileVideo({ title: "Getting started with QUIV", section: "quiv" }), "quiv");
  assert.equal(fileVideo({ title: "Getting Started with the ADLM PlanSwift Plugin" }), "getting-started");
  assert.equal(fileVideo({ title: "Lesson 4", playlists: ["Autodesk Revit  Beginners tutorial"] }), "revit-basics");
  assert.equal(fileVideo({ title: "Planswift VS CostX" }), "costx");
  assert.equal(fileVideo({ title: "Something else entirely" }), "");
});

test("the job writes only what is new, once, and can be switched off", async () => {
  const writes = [];
  const FreeVideo = {
    find: () => ({ select: () => ({ lean: async () => [{ youtubeId: "OLD00000000" }] }) }),
    updateOne: async (q, u) => writes.push([q, u]),
  };
  const out = await runFreeLibraryAuto({ FreeVideo, fetchFeed: async () => parseFeed(FEED), env: {}, log: {} });
  assert.deepEqual(out, { ok: true, checked: 3, shorts: 1, added: 1 });
  assert.equal(writes[0][0].youtubeId, "AAA111bbb22");
  assert.ok(writes[0][1].$setOnInsert);
  const off = await runFreeLibraryAuto({
    FreeVideo,
    fetchFeed: async () => assert.fail("should not fetch"),
    env: { FREE_LIBRARY_AUTO: "off" },
  });
  assert.equal(off.skipped, true);
});

test("a video an admin deleted is never filed again", async () => {
  const writes = [];
  const FreeVideo = {
    find: () => ({ select: () => ({ lean: async () => [] }) }),
    updateOne: async (q) => writes.push(q.youtubeId),
  };
  const out = await runFreeLibraryAuto({
    FreeVideo,
    fetchFeed: async () => parseFeed(FEED),
    ignoredIds: async () => ["AAA111bbb22"],
    env: {},
    log: {},
  });
  assert.deepEqual(writes, ["OLD00000000"]);
  assert.equal(out.added, 1);
});
