// Files the ADLM Studio YouTube channel into the free video library.
//
// The source is server/data/youtube-free-videos.json: every long-form video
// on the channel, each already filed onto a shelf (see
// util/freeVideoSections.js) with a sort position and whether the product
// page recommends it. That file was built from a yt-dlp dump of the channel
// and its playlists — there is no YOUTUBE_API_KEY on this deployment, so the
// pull happens on a developer machine and the result is checked in, which
// also means the mapping is reviewable in a diff rather than living only in
// the database.
//
// This script is idempotent and additive:
//
//   * a video not yet in the library is created, published;
//   * a video already there (matched on youtubeId) keeps the title and the
//     thumbnail someone may have typed, and only has BLANK fields filled in:
//     section, productLabel, durationSec, publishedAt, sort;
//   * `recommended` is written on every run, because it is a curation flag
//     that belongs to the catalogue file, not a free-text field.
//
// Nothing is ever deleted or unpublished here.
//
// Usage:
//   node server/scripts/sync-youtube-free-videos.mjs           # apply
//   node server/scripts/sync-youtube-free-videos.mjs --dry     # report only
//   node server/scripts/sync-youtube-free-videos.mjs --force   # also overwrite
//                                    section/sort/duration/date on existing rows
//
// To refresh the catalogue after new uploads:
//   python -m yt_dlp --flat-playlist -J https://www.youtube.com/@ADLMStudio/videos
//   then file the new ids in the JSON and run this again.

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { connectDB } from "../db.js";
import { FreeVideo } from "../models/Learn.js";
import { isSectionSlug } from "../util/freeVideoSections.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.resolve(here, "../data/youtube-free-videos.json");

const dry = process.argv.includes("--dry");
const force = process.argv.includes("--force");

const catalogue = JSON.parse(fs.readFileSync(FILE, "utf8"));
const videos = catalogue.videos || [];
if (!videos.length) {
  console.error(`No videos in ${FILE}`);
  process.exit(1);
}

// Fail before touching the database if the file names a shelf that does not
// exist — a typo there would file a video under "More lessons" on the site,
// which is exactly the kind of quiet wrongness this check is for.
const badShelf = videos.filter((v) => v.section && !isSectionSlug(v.section));
if (badShelf.length) {
  console.error("Unknown section slugs:");
  for (const v of badShelf) console.error(`  ${v.youtubeId} -> "${v.section}"`);
  process.exit(1);
}
const dupes = videos.map((v) => v.youtubeId).filter((id, i, a) => a.indexOf(id) !== i);
if (dupes.length) {
  console.error(`Duplicate youtubeIds in catalogue: ${[...new Set(dupes)].join(", ")}`);
  process.exit(1);
}

await connectDB(process.env.MONGO_URI);

const existing = await FreeVideo.find({}).lean();
const byId = new Map(existing.map((d) => [String(d.youtubeId || "").trim(), d]));

let created = 0;
let updated = 0;
let untouched = 0;
const log = [];

for (const v of videos) {
  const doc = byId.get(v.youtubeId);
  const publishedAt = v.publishedAt ? new Date(v.publishedAt) : undefined;

  if (!doc) {
    created += 1;
    log.push(`+ ${v.section.padEnd(16)} ${v.youtubeId}  ${v.title}`);
    if (!dry) {
      await FreeVideo.create({
        title: v.title,
        youtubeId: v.youtubeId,
        thumbnailUrl: "",
        durationSec: Number(v.durationSec) || 0,
        productLabel: v.productLabel || "",
        section: v.section || "",
        recommended: !!v.recommended,
        publishedAt,
        isPublished: true,
        sort: Number(v.sort) || 0,
      });
    }
    continue;
  }

  const set = {};
  const fill = (key, value, isBlank) => {
    if (value === undefined || value === null || value === "") return;
    const cur = doc[key];
    if (force || isBlank(cur)) {
      if (cur !== value && !(cur instanceof Date && value instanceof Date && +cur === +value)) {
        set[key] = value;
      }
    }
  };
  fill("section", v.section, (c) => !c);
  fill("productLabel", v.productLabel, (c) => !c);
  fill("durationSec", Number(v.durationSec) || 0, (c) => !(Number(c) > 0));
  fill("publishedAt", publishedAt, (c) => !c);
  fill("sort", Number(v.sort) || 0, (c) => !(Number(c) !== 0));
  if (!!doc.recommended !== !!v.recommended) set.recommended = !!v.recommended;

  if (!Object.keys(set).length) {
    untouched += 1;
    continue;
  }
  updated += 1;
  log.push(`~ ${v.section.padEnd(16)} ${v.youtubeId}  ${doc.title}  ← ${Object.keys(set).join(", ")}`);
  if (!dry) await FreeVideo.updateOne({ _id: doc._id }, { $set: set });
}

// Library rows the catalogue does not know about — reported, never touched.
const catalogueIds = new Set(videos.map((v) => v.youtubeId));
const orphans = existing.filter((d) => !catalogueIds.has(String(d.youtubeId || "").trim()));

console.log(log.join("\n"));
console.log(
  `\n${dry ? "[dry run] " : ""}created ${created}, updated ${updated}, unchanged ${untouched}` +
    (orphans.length
      ? `\nnot in the catalogue (left as they are): ${orphans.map((d) => `${d.youtubeId} "${d.title}"`).join("; ")}`
      : ""),
);

await mongoose.disconnect();
