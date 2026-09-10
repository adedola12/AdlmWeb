// server/util/videoEmail.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { firstTwoSentences, newVideoMessage } from "./videoEmail.js";

/* ────────────────────────────────────────────────────────── the excerpt ── */

test("two sentences, and only two", () => {
  assert.equal(
    firstTwoSentences("One. Two. Three. Four."),
    "One. Two.",
  );
});

test("a description shorter than two sentences comes back whole", () => {
  assert.equal(firstTwoSentences("Just the one."), "Just the one.");
  assert.equal(
    firstTwoSentences("No terminal punctuation at all"),
    "No terminal punctuation at all",
  );
  assert.equal(firstTwoSentences(""), "");
  assert.equal(firstTwoSentences(null), "");
});

test("an abbreviation is not a sentence end", () => {
  // Without this the excerpt stops at "Ltd." and reads as half a thought.
  assert.equal(
    firstTwoSentences("Built by ADLM Studio Ltd. for QS teams. Second one here. Third."),
    "Built by ADLM Studio Ltd. for QS teams. Second one here.",
  );
  assert.equal(
    firstTwoSentences("Ask Dr. Quasim about it. Then watch. Then this."),
    "Ask Dr. Quasim about it. Then watch.",
  );
});

test("? and ! end sentences, and a run of them counts once", () => {
  assert.equal(firstTwoSentences("Stuck on rebar? Watch this. Third."), "Stuck on rebar? Watch this.");
  assert.equal(firstTwoSentences("Wait... really? Yes. Third."), "Wait... really? Yes.");
});

test("a full stop with no space after it is not a boundary", () => {
  // Decimals and version numbers: "QUIV 2.4 ships today" must stay one piece.
  assert.equal(
    firstTwoSentences("QUIV 2.4 ships today. It saves 3.5 hours a week. Third."),
    "QUIV 2.4 ships today. It saves 3.5 hours a week.",
  );
});

test("links, hashtags and chapter markers are dropped before the prose is read", () => {
  // The real shape of a YouTube description. Left in, the excerpt would be a
  // URL and a list of timestamps.
  const desc = [
    "https://adlmstudio.net/quiv",
    "Take off a reinforced concrete slab in under four minutes. The plugin reads the Revit model directly.",
    "",
    "00:00 Intro",
    "01:24 Setting the rates",
    "#quantitysurveying #revit #adlm",
  ].join("\n");

  assert.equal(
    firstTwoSentences(desc),
    "Take off a reinforced concrete slab in under four minutes. The plugin reads the Revit model directly.",
  );
});

test("a very long pair of sentences is cut on a word and marked", () => {
  const long = `${"word ".repeat(120).trim()}. Second sentence.`;
  const out = firstTwoSentences(long, 100);
  assert.ok(out.length <= 101, `got ${out.length}`);
  assert.ok(out.endsWith("…"), out.slice(-20));
  assert.ok(!out.includes("wor…"), "must not cut mid-word");
});

/* ────────────────────────────────────────────────────────── the message ── */

const FIXTURE = {
  firstName: "Adedolapo Quasim",
  title: "Taking off a slab in QUIV",
  description: "Take off a slab in four minutes. It reads Revit directly. Third sentence.",
  thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
  videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  unsubscribeUrl: "https://www.adlmstudio.net/api/email/unsubscribe/videos.abc.def",
};

test("the subject is the title, prefixed", () => {
  assert.equal(newVideoMessage(FIXTURE).subject, "New video: Taking off a slab in QUIV");
});

test("the HTML carries the greeting, excerpt, linked thumbnail, CTA and signature", () => {
  const { html } = newVideoMessage(FIXTURE);

  assert.match(html, /Hi Adedolapo,/, "greets by first name only");
  assert.match(html, /I just published a new video:/);
  assert.match(html, /Take off a slab in four minutes\. It reads Revit directly\./);
  assert.ok(!html.includes("Third sentence"), "only two sentences are used");

  // The thumbnail is an <img> inside an <a> to the video, not a background.
  assert.match(
    html,
    /<a href="https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ"[^>]*>\s*<img src="https:\/\/i\.ytimg\.com/,
  );
  assert.match(html, /alt="Taking off a slab in QUIV"/, "alt carries the title");

  assert.match(html, /bgcolor="#1E6BCC"/, "the CTA is Blue");
  assert.match(html, /Watch the video/);
  assert.match(html, /Adedolapo Quasim/);
  assert.match(html, /CEO, ADLM Studio/);
  assert.match(html, /If it raises a question about your own project, reply to this mail\./);

  // Brand and layout.
  assert.match(html, /Lexend/);
  assert.match(html, /width:600px/);
  assert.match(html, /#0D2240/, "Navy");
  assert.match(html, /#F07020/, "Orange");
});

test("the unsubscribe link is in the HTML and the text, per recipient", () => {
  const { html, text } = newVideoMessage(FIXTURE);
  assert.match(html, /Unsubscribe from video updates/);
  assert.ok(html.includes(FIXTURE.unsubscribeUrl));
  assert.ok(text.includes(FIXTURE.unsubscribeUrl));
});

test("a missing name becomes 'there' rather than an empty greeting", () => {
  for (const firstName of ["", null, undefined, "   "]) {
    assert.match(newVideoMessage({ ...FIXTURE, firstName }).html, /Hi there,/);
  }
});

test("a video with no thumbnail renders without a dead image slot", () => {
  const { html } = newVideoMessage({ ...FIXTURE, thumbnailUrl: "" });
  assert.ok(!html.includes("<img"), "no img tag at all");
  assert.match(html, /Watch the video/, "the CTA still gets the reader there");
});

test("a title with HTML in it cannot break out into markup", () => {
  // Titles come from YouTube, which is to say from outside. An unescaped one
  // would let a video title rewrite the message in every inbox it reached.
  const { html, subject } = newVideoMessage({
    ...FIXTURE,
    title: `<script>alert(1)</script> & "quotes"`,
  });
  assert.ok(!html.includes("<script>"), "the tag is escaped, not emitted");
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&amp;/);
  // The subject is a header, not markup, so it stays as typed.
  assert.ok(subject.includes("<script>"));
});

test("the plain text version is written out, not a stripped copy of the HTML", () => {
  const { text } = newVideoMessage(FIXTURE);
  assert.ok(!text.includes("<"), "no tags survived into the text part");
  assert.match(text, /^Hi Adedolapo,/);
  assert.match(text, /Watch it here: https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ/);
  assert.match(text, /Adedolapo Quasim\nCEO, ADLM Studio/);
});
