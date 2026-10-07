// server/util/youtubeLibrary.js
//
// The channel and the library, side by side.
//
// The ADLM Studio YouTube channel is filed into the free library by hand:
// data/youtube-free-videos.json lists every long-form video with the shelf it
// belongs on, a sort position and whether the product page recommends it.
// This module is everything that compares that catalogue with what the
// FreeVideo collection actually holds — the same code behind the admin's
// YouTube status screen and the command-line sync, so the two can never
// disagree about what "in sync" means.
//
// The catalogue is IMPORTED rather than read from disk. The API runs as one
// bundled file on Lambda, where data/ does not exist at runtime; an import
// travels with the bundle, a readFileSync would find nothing there.
//
// Everything that touches the database takes the model as an argument. The
// planning and the summary are pure, and tested as such.

import catalogueJson from "../data/youtube-free-videos.json" with { type: "json" };
import { FREE_VIDEO_SECTIONS, sectionOf, isSectionSlug, fileVideo } from "./freeVideoSections.js";

export function loadCatalogue() {
  return catalogueJson;
}

/** Problems that make a catalogue unsafe to apply. Empty means fine. */
export function validateCatalogue(cat) {
  const out = [];
  const videos = cat?.videos || [];
  if (!videos.length) out.push("The catalogue has no videos.");
  for (const v of videos) {
    if (!v.youtubeId) out.push(`A video has no youtubeId: ${JSON.stringify(v).slice(0, 80)}`);
    if (v.section && !isSectionSlug(v.section)) out.push(`${v.youtubeId} names a shelf that does not exist: "${v.section}"`);
  }
  const seen = new Set();
  for (const v of videos) {
    if (seen.has(v.youtubeId)) out.push(`${v.youtubeId} appears twice`);
    seen.add(v.youtubeId);
  }
  return out;
}

const sameDate = (a, b) => (a ? new Date(a).getTime() : 0) === (b ? new Date(b).getTime() : 0);

/**
 * What applying the catalogue would change.
 *
 * Additive by design: a video the library lacks is created; one it already
 * holds keeps the title and thumbnail somebody may have typed, and only has
 * BLANK fields filled (section, productLabel, durationSec, publishedAt, sort).
 * `recommended` is a curation flag owned by the catalogue and is written every
 * time. Nothing is deleted or unpublished.
 *
 *   force    overwrite section/sort/duration/date even when set
 *   publish  also flip catalogue videos that are unpublished to published
 */
export function planSync(catalogueVideos, existingDocs, { force = false, publish = false } = {}) {
  const byId = new Map((existingDocs || []).map((d) => [String(d.youtubeId || "").trim(), d]));
  const creates = [];
  const updates = [];
  let unchanged = 0;

  for (const raw of catalogueVideos || []) {
    // R10: an entry with no hand-set shelf is filed by the rules.
    const section = fileVideo(raw);
    const v = { ...raw, section, productLabel: raw.productLabel || sectionOf(section)?.label || "" };
    const doc = byId.get(v.youtubeId);
    const publishedAt = v.publishedAt ? new Date(v.publishedAt) : undefined;
    if (!doc) {
      creates.push(v);
      continue;
    }
    const set = {};
    const fill = (key, value, isBlank) => {
      if (value === undefined || value === null || value === "") return;
      const cur = doc[key];
      if (!(force || isBlank(cur))) return;
      const same = value instanceof Date ? sameDate(cur, value) : cur === value;
      if (!same) set[key] = value;
    };
    fill("section", v.section, (c) => !c);
    fill("productLabel", v.productLabel, (c) => !c);
    fill("durationSec", Number(v.durationSec) || 0, (c) => !(Number(c) > 0));
    fill("publishedAt", publishedAt, (c) => !c);
    fill("sort", Number(v.sort) || 0, (c) => !(Number(c) !== 0));
    if (!!doc.recommended !== !!v.recommended) set.recommended = !!v.recommended;
    if (publish && doc.isPublished === false) set.isPublished = true;

    if (Object.keys(set).length) updates.push({ id: String(doc._id), youtubeId: v.youtubeId, title: doc.title, section: v.section, set });
    else unchanged += 1;
  }

  const catalogueIds = new Set((catalogueVideos || []).map((v) => v.youtubeId));
  const orphans = (existingDocs || []).filter((d) => !catalogueIds.has(String(d.youtubeId || "").trim()));

  return { creates, updates, unchanged, orphans };
}

/** Apply a plan. `hold` creates the new rows unpublished. */
export async function applyPlan(FreeVideo, plan, { hold = false } = {}) {
  for (const v of plan.creates) {
    await FreeVideo.create({
      title: v.title,
      youtubeId: v.youtubeId,
      thumbnailUrl: "",
      durationSec: Number(v.durationSec) || 0,
      productLabel: v.productLabel || "",
      section: v.section || "",
      recommended: !!v.recommended,
      publishedAt: v.publishedAt ? new Date(v.publishedAt) : undefined,
      isPublished: !hold,
      sort: Number(v.sort) || 0,
    });
  }
  for (const u of plan.updates) {
    await FreeVideo.updateOne({ _id: u.id }, { $set: u.set });
  }
  return { created: plan.creates.length, updated: plan.updates.length, unchanged: plan.unchanged };
}

/**
 * The status screen's whole payload: a summary, the shelves, every product's
 * recommended count, and one row per video whether it is in the catalogue, in
 * the library, or both.
 */
export function libraryStatus(cat, existingDocs) {
  const videos = cat?.videos || [];
  const docs = existingDocs || [];
  const catById = new Map(videos.map((v) => [v.youtubeId, v]));
  const docById = new Map(docs.map((d) => [String(d.youtubeId || "").trim(), d]));

  const rows = [];
  for (const d of docs) {
    const id = String(d.youtubeId || "").trim();
    const c = catById.get(id);
    const shelf = sectionOf(d.section);
    rows.push({
      id: String(d._id),
      youtubeId: id,
      title: d.title || c?.title || "Untitled",
      section: d.section || "",
      sectionLabel: shelf?.label || "",
      filed: !!shelf,
      productKey: shelf?.productKey || "",
      published: d.isPublished !== false,
      recommended: !!d.recommended,
      durationSec: Number(d.durationSec) || 0,
      publishedAt: d.publishedAt || null,
      createdAt: d.createdAt || null,
      inCatalogue: !!c,
      inLibrary: true,
      // Where the catalogue and the row disagree on the shelf, say so: the
      // catalogue is the reviewed mapping, the row is what the site shows.
      catalogueSection: c?.section || "",
      shelfDiffers: !!c && !!c.section && c.section !== (d.section || ""),
    });
  }
  for (const v of videos) {
    if (docById.has(v.youtubeId)) continue;
    const shelf = sectionOf(v.section);
    rows.push({
      id: "",
      youtubeId: v.youtubeId,
      title: v.title,
      section: v.section || "",
      sectionLabel: shelf?.label || "",
      filed: !!shelf,
      productKey: shelf?.productKey || "",
      published: false,
      recommended: !!v.recommended,
      durationSec: Number(v.durationSec) || 0,
      publishedAt: v.publishedAt || null,
      createdAt: null,
      inCatalogue: true,
      inLibrary: false,
      catalogueSection: v.section || "",
      shelfDiffers: false,
    });
  }

  const inLibrary = rows.filter((r) => r.inLibrary);
  const summary = {
    channel: cat?.channel || "",
    channelId: cat?.channelId || "",
    pulledOn: cat?.pulledOn || "",
    catalogue: videos.length,
    library: inLibrary.length,
    published: inLibrary.filter((r) => r.published).length,
    held: inLibrary.filter((r) => !r.published).length,
    missing: rows.filter((r) => !r.inLibrary).length,
    orphans: inLibrary.filter((r) => !r.inCatalogue).length,
    unfiled: inLibrary.filter((r) => !r.filed).length,
    noDuration: inLibrary.filter((r) => !r.durationSec).length,
    recommended: inLibrary.filter((r) => r.recommended && r.published).length,
    shelfDiffers: inLibrary.filter((r) => r.shelfDiffers).length,
  };

  const shelves = FREE_VIDEO_SECTIONS.map((s) => {
    const on = inLibrary.filter((r) => r.section === s.slug);
    return {
      slug: s.slug,
      label: s.label,
      productKey: s.productKey,
      total: on.length,
      published: on.filter((r) => r.published).length,
      recommended: on.filter((r) => r.recommended && r.published).length,
    };
  }).filter((s) => s.total > 0);
  if (summary.unfiled) {
    const on = inLibrary.filter((r) => !r.filed);
    shelves.push({ slug: "", label: "More lessons (unfiled)", productKey: "", total: on.length, published: on.filter((r) => r.published).length, recommended: 0 });
  }

  // The strip each product page draws: what it would show today.
  const products = {};
  for (const s of FREE_VIDEO_SECTIONS) {
    if (!s.productKey || s.productKey === "*") continue;
    products[s.productKey] = (products[s.productKey] || 0) + inLibrary.filter((r) => r.section === s.slug && r.recommended && r.published).length;
  }
  const shared = inLibrary.filter((r) => r.productKey === "*" && r.recommended && r.published).length;

  return { summary, shelves, products: Object.entries(products).map(([key, own]) => ({ key, own, shared })), rows };
}

// ── availability ────────────────────────────────────────────────────────────
//
// YouTube's oEmbed endpoint answers for any watchable video (public or
// unlisted) and refuses for a private, removed or embedding-disabled one,
// without an API key. That is exactly the question the library needs
// answered: will the lesson page play this?
const OEMBED = "https://www.youtube.com/oembed?format=json&url=";

export function classifyOembed(status) {
  if (status === 200) return "ok";
  if (status === 401 || status === 403) return "private";
  if (status === 404 || status === 400) return "missing";
  return "error";
}

export async function checkAvailability(ids, { concurrency = 8, fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
  const list = [...new Set((ids || []).map((s) => String(s || "").trim()).filter(Boolean))];
  const results = {};
  let next = 0;
  async function worker() {
    while (next < list.length) {
      const id = list[next++];
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), timeoutMs);
      try {
        const res = await fetchImpl(`${OEMBED}${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, { signal: ac.signal, redirect: "follow" });
        let title = "";
        if (res.status === 200) {
          try {
            title = (await res.json())?.title || "";
          } catch {
            title = "";
          }
        }
        results[id] = { state: classifyOembed(res.status), status: res.status, title };
      } catch {
        results[id] = { state: "error", status: 0, title: "" };
      } finally {
        clearTimeout(t);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length || 1) }, worker));
  return results;
}
