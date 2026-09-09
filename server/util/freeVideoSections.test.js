// server/util/freeVideoSections.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FREE_VIDEO_SECTIONS,
  UNFILED_SECTION,
  groupBySection,
  recommendedFor,
  sectionOf,
} from "./freeVideoSections.js";

const v = (over) => ({
  title: "t",
  youtubeId: "x",
  isPublished: true,
  recommended: false,
  sort: 0,
  ...over,
});

test("every section has a unique slug and a label", () => {
  const slugs = new Set();
  for (const s of FREE_VIDEO_SECTIONS) {
    assert.ok(s.slug && s.label, `section ${JSON.stringify(s)} is incomplete`);
    assert.ok(!slugs.has(s.slug), `duplicate slug ${s.slug}`);
    slugs.add(s.slug);
  }
});

test("the catalogue keys the sections point at are the real ones", () => {
  // These are Product.key values in the live catalogue. A typo here would
  // silently empty a product page's recommendations, so it is pinned.
  const known = new Set(["*", "", "revit", "planswift", "mep", "rategen", "qs-takeoff", "civil3d", "bimbld", "BIMMEP"]);
  for (const s of FREE_VIDEO_SECTIONS) {
    assert.ok(known.has(s.productKey), `${s.slug} points at unknown product "${s.productKey}"`);
  }
});

test("videos are grouped in shelf order, empty shelves dropped, unfiled last", () => {
  const groups = groupBySection([
    v({ title: "revit tut", section: "revit-basics" }),
    v({ title: "install", section: "getting-started" }),
    v({ title: "nowhere", section: "" }),
    v({ title: "ghost shelf", section: "does-not-exist" }),
    v({ title: "quiv demo", section: "quiv" }),
  ]);
  assert.deepEqual(
    groups.map((g) => g.slug),
    ["getting-started", "quiv", "revit-basics", UNFILED_SECTION.slug],
  );
  assert.equal(groups.at(-1).count, 2);
  assert.equal(groups.at(-1).label, "More lessons");
});

test("within a shelf, sort wins, then the YouTube publish date", () => {
  const [g] = groupBySection([
    v({ title: "old, high sort", section: "quiv", sort: 90, publishedAt: "2020-01-01" }),
    v({ title: "newest, no sort", section: "quiv", sort: 0, publishedAt: "2026-06-01" }),
    v({ title: "older, no sort", section: "quiv", sort: 0, publishedAt: "2025-06-01" }),
    v({ title: "top", section: "quiv", sort: 100, publishedAt: "2019-01-01" }),
  ]);
  assert.deepEqual(
    g.videos.map((x) => x.title),
    ["top", "old, high sort", "newest, no sort", "older, no sort"],
  );
});

test("a product page gets its own recommended videos first, then the shared ones", () => {
  const all = [
    v({ title: "quiv demo", section: "quiv", recommended: true, sort: 100 }),
    v({ title: "quiv walls", section: "quiv", recommended: true, sort: 80 }),
    v({ title: "quiv not flagged", section: "quiv", recommended: false, sort: 200 }),
    v({ title: "quiv unpublished", section: "quiv", recommended: true, isPublished: false, sort: 300 }),
    v({ title: "install", section: "getting-started", recommended: true, sort: 100 }),
    v({ title: "heron demo", section: "heron", recommended: true, sort: 100 }),
    v({ title: "revit basics", section: "revit-basics", recommended: false }),
  ];
  assert.deepEqual(
    recommendedFor(all, "revit").map((x) => x.title),
    ["quiv demo", "quiv walls", "install"],
  );
  assert.deepEqual(
    recommendedFor(all, "PLANSWIFT").map((x) => x.title),
    ["heron demo", "install"],
  );
  assert.deepEqual(recommendedFor(all, "revit", 1).map((x) => x.title), ["quiv demo"]);
  assert.deepEqual(recommendedFor(all, ""), []);
  // A product with no shelf of its own still gets the shared walkthroughs.
  assert.deepEqual(recommendedFor(all, "civil3d").map((x) => x.title), ["install"]);
});

test("sectionOf resolves a slug and rejects anything else", () => {
  assert.equal(sectionOf("heron").label, "HERON for PlanSwift");
  assert.equal(sectionOf(" heron "), sectionOf("heron"));
  assert.equal(sectionOf("nope"), null);
  assert.equal(sectionOf(""), null);
});
