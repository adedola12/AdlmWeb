// server/util/youtubeLibrary.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadCatalogue,
  validateCatalogue,
  planSync,
  libraryStatus,
  classifyOembed,
  checkAvailability,
} from "./youtubeLibrary.js";

const cat = (videos) => ({ channel: "c", channelId: "UC", pulledOn: "2026-09-09", videos });
const cv = (over) => ({ youtubeId: "a", title: "A", durationSec: 60, publishedAt: "2026-01-01", section: "quiv", productLabel: "QUIV", recommended: false, sort: 10, ...over });
const doc = (over) => ({ _id: "id-" + (over.youtubeId || "a"), youtubeId: "a", title: "A", isPublished: true, recommended: false, section: "quiv", productLabel: "QUIV", durationSec: 60, sort: 10, publishedAt: new Date("2026-01-01"), ...over });

test("the checked-in catalogue is valid and every video sits on a real shelf", () => {
  const c = loadCatalogue();
  assert.ok(c.videos.length > 100);
  assert.deepEqual(validateCatalogue(c), []);
});

test("validation names a bad shelf and a duplicate id", () => {
  const problems = validateCatalogue(cat([cv({ section: "nope" }), cv({}), cv({})]));
  assert.ok(problems.some((p) => p.includes('"nope"')));
  assert.ok(problems.some((p) => p.includes("appears twice")));
});

test("a video the library lacks is created; one it holds only has blanks filled", () => {
  const plan = planSync(
    [cv({}), cv({ youtubeId: "b", title: "B from YouTube", section: "heron", durationSec: 90, sort: 5 })],
    [doc({ youtubeId: "b", title: "B typed by hand", section: "", productLabel: "", durationSec: 0, sort: 0, publishedAt: null })],
  );
  assert.equal(plan.creates.length, 1);
  assert.equal(plan.creates[0].youtubeId, "a");
  assert.equal(plan.updates.length, 1);
  assert.deepEqual(Object.keys(plan.updates[0].set).sort(), ["durationSec", "productLabel", "publishedAt", "section", "sort"]);
  // The title somebody typed is never touched.
  assert.equal(plan.updates[0].set.title, undefined);
});

test("a filled field is left alone unless forced; recommended is always the catalogue's", () => {
  const existing = [doc({ section: "heron", recommended: false })];
  const gentle = planSync([cv({ section: "quiv", recommended: true })], existing);
  assert.deepEqual(gentle.updates[0].set, { recommended: true });
  const forced = planSync([cv({ section: "quiv", recommended: true })], existing, { force: true });
  assert.deepEqual(forced.updates[0].set, { section: "quiv", recommended: true });
});

test("publish flips a held catalogue video and nothing else; orphans are reported, not touched", () => {
  const existing = [doc({ isPublished: false }), doc({ youtubeId: "zzz", isPublished: false })];
  const plan = planSync([cv({})], existing, { publish: true });
  assert.deepEqual(plan.updates.map((u) => u.youtubeId), ["a"]);
  assert.deepEqual(plan.updates[0].set, { isPublished: true });
  assert.deepEqual(plan.orphans.map((o) => o.youtubeId), ["zzz"]);
  assert.equal(plan.unchanged, 0);
});

test("a library that matches the catalogue plans nothing", () => {
  const plan = planSync([cv({})], [doc({})]);
  assert.equal(plan.creates.length + plan.updates.length, 0);
  assert.equal(plan.unchanged, 1);
});

test("the status counts what the screen needs to show", () => {
  const s = libraryStatus(cat([cv({}), cv({ youtubeId: "b", section: "heron", recommended: true }), cv({ youtubeId: "c", section: "heron" })]), [
    doc({ youtubeId: "a", recommended: true }), // published, recommended, quiv
    doc({ youtubeId: "b", isPublished: false, recommended: true, section: "heron" }), // held
    doc({ youtubeId: "old", section: "", durationSec: 0 }), // orphan, unfiled
    // c is in the catalogue but not in the library
  ]);
  assert.equal(s.summary.catalogue, 3);
  assert.equal(s.summary.library, 3);
  assert.equal(s.summary.published, 2);
  assert.equal(s.summary.held, 1);
  assert.equal(s.summary.missing, 1);
  assert.equal(s.summary.orphans, 1);
  assert.equal(s.summary.unfiled, 1);
  assert.equal(s.summary.noDuration, 1);
  assert.equal(s.summary.recommended, 1);
  assert.equal(s.rows.length, 4);
  assert.ok(s.rows.some((r) => r.youtubeId === "c" && !r.inLibrary && r.inCatalogue));
  assert.ok(s.rows.some((r) => r.youtubeId === "old" && r.inLibrary && !r.inCatalogue));
  const quiv = s.shelves.find((x) => x.slug === "quiv");
  assert.deepEqual([quiv.total, quiv.published, quiv.recommended], [1, 1, 1]);
  assert.ok(s.shelves.some((x) => x.label.startsWith("More lessons")));
  assert.deepEqual(s.products.find((p) => p.key === "revit"), { key: "revit", own: 1, shared: 0 });
  // held videos do not count as recommended on a product page, because the page cannot show them
  assert.deepEqual(s.products.find((p) => p.key === "planswift"), { key: "planswift", own: 0, shared: 0 });
});

test("oEmbed statuses map to what the lesson page will experience", () => {
  assert.equal(classifyOembed(200), "ok");
  assert.equal(classifyOembed(401), "private");
  assert.equal(classifyOembed(404), "missing");
  assert.equal(classifyOembed(500), "error");
});

test("availability is checked with a bounded number of requests in flight and a result per id", async () => {
  let inFlight = 0;
  let peak = 0;
  const fetchImpl = async (url) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight -= 1;
    const id = decodeURIComponent(url).split("v=")[1];
    if (id === "gone") return { status: 404, json: async () => ({}) };
    if (id === "priv") return { status: 401, json: async () => ({}) };
    return { status: 200, json: async () => ({ title: "T " + id }) };
  };
  const ids = ["a", "b", "gone", "priv", "e", "f", "g", "a"];
  const res = await checkAvailability(ids, { concurrency: 3, fetchImpl });
  assert.equal(Object.keys(res).length, 7);
  assert.equal(res.gone.state, "missing");
  assert.equal(res.priv.state, "private");
  assert.equal(res.a.state, "ok");
  assert.equal(res.a.title, "T a");
  assert.ok(peak <= 3, `peak in flight was ${peak}`);
});
