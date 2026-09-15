// server/util/youtubeFeed.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseVideoId,
  pickThumbnail,
  shapePlaylistItem,
  shapeVideo,
} from "./youtubeFeed.js";

/* ───────────────────────────────────────────────────────────── id parsing ── */

test("every shape YouTube hands out yields the same id", () => {
  const id = "dQw4w9WgXcQ";
  for (const input of [
    id,
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}&t=42s`,
    `http://www.youtube.com/watch?list=PLabc&v=${id}`,
    `https://youtu.be/${id}`,
    `https://youtu.be/${id}?si=xyz`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/live/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
    `  https://www.youtube.com/watch?v=${id}  `,
    `youtube.com/watch?v=${id}`,
  ]) {
    assert.equal(parseVideoId(input), id, `failed for: ${input}`);
  }
});

test("anything that is not a YouTube video is refused, not guessed at", () => {
  for (const input of [
    "",
    null,
    undefined,
    "   ",
    "not a url",
    // The channel page, not a video. Accepting this would announce nothing.
    "https://www.youtube.com/@adlmstudio",
    "https://www.youtube.com/channel/UCabcdefghijklmnopqrstu",
    // Right host, no id.
    "https://www.youtube.com/watch?v=",
    "https://www.youtube.com/watch?list=PLabc",
    // Wrong host entirely — a look-alike domain must not pass.
    "https://vimeo.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ",
  ]) {
    assert.equal(parseVideoId(input), "", `should not have parsed: ${input}`);
  }
});

test("a bare id must be exactly eleven base64url characters", () => {
  // The strictness is the point: loosened, this matches typos and turns them
  // into lookups for videos that do not exist.
  assert.equal(parseVideoId("dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(parseVideoId("dQw4w9WgXc"), ""); // ten
  assert.equal(parseVideoId("dQw4w9WgXcQQ"), ""); // twelve
  assert.equal(parseVideoId("dQw4w9WgXc!"), ""); // out of alphabet
  assert.equal(parseVideoId("_-Qw4w9WgXc"), "_-Qw4w9WgXc"); // _ and - are in it
});

/* ────────────────────────────────────────────────────────────── shaping ── */

test("the biggest available thumbnail wins, and a missing one is empty not undefined", () => {
  assert.equal(
    pickThumbnail({
      default: { url: "d.jpg" },
      high: { url: "h.jpg" },
      maxres: { url: "m.jpg" },
    }),
    "m.jpg",
  );
  // maxres does not exist for every video; standard does not exist for older
  // ones. Walking down is what stops a 120px image in a 536px slot.
  assert.equal(pickThumbnail({ default: { url: "d.jpg" }, high: { url: "h.jpg" } }), "h.jpg");
  assert.equal(pickThumbnail({ default: { url: "d.jpg" } }), "d.jpg");
  assert.equal(pickThumbnail({}), "");
  assert.equal(pickThumbnail(undefined), "");
});

test("a playlist item prefers videoPublishedAt over the playlist's own date", () => {
  // The case that matters: uploaded private in June, made public in September.
  // snippet.publishedAt is when it entered the playlist and would date the
  // announcement three months wrong.
  const shaped = shapePlaylistItem({
    contentDetails: { videoId: "dQw4w9WgXcQ", videoPublishedAt: "2026-09-01T10:00:00Z" },
    snippet: {
      title: "  Taking off a slab in QUIV  ",
      description: "First line.",
      publishedAt: "2026-06-02T08:00:00Z",
      resourceId: { videoId: "dQw4w9WgXcQ" },
      thumbnails: { high: { url: "h.jpg" } },
    },
  });

  assert.equal(shaped.videoId, "dQw4w9WgXcQ");
  assert.equal(shaped.title, "Taking off a slab in QUIV", "the title is trimmed");
  assert.equal(shaped.thumbnailUrl, "h.jpg");
  assert.equal(shaped.publishedAt.toISOString(), "2026-09-01T10:00:00.000Z");
});

test("with no videoPublishedAt it falls back to the playlist date", () => {
  const shaped = shapePlaylistItem({
    contentDetails: { videoId: "dQw4w9WgXcQ" },
    snippet: { title: "T", publishedAt: "2026-06-02T08:00:00Z", thumbnails: {} },
  });
  assert.equal(shaped.publishedAt.toISOString(), "2026-06-02T08:00:00.000Z");
});

test("an item with no video id is dropped rather than half-stored", () => {
  // A playlist keeps a row for a video that has since been deleted or made
  // private. A record with no id could never be matched against YouTube again.
  assert.equal(shapePlaylistItem({ snippet: { title: "Deleted video" } }), null);
  assert.equal(shapePlaylistItem({}), null);
  assert.equal(shapePlaylistItem(null), null);
  assert.equal(shapeVideo({ snippet: { title: "x" } }), null);
});

test("a videos.list entry shapes to the same fields", () => {
  const shaped = shapeVideo({
    id: "dQw4w9WgXcQ",
    snippet: {
      title: "Manual announce",
      description: "Body.",
      publishedAt: "2026-09-10T09:00:00Z",
      thumbnails: { maxres: { url: "m.jpg" } },
    },
  });
  assert.deepEqual(
    { ...shaped, publishedAt: shaped.publishedAt.toISOString() },
    {
      videoId: "dQw4w9WgXcQ",
      title: "Manual announce",
      description: "Body.",
      thumbnailUrl: "m.jpg",
      publishedAt: "2026-09-10T09:00:00.000Z",
    },
  );
});
