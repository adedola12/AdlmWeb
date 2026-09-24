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
// The comparison and the writes live in util/youtubeLibrary.js and are the
// same code the admin's YouTube status screen runs. This is the command line
// over them. It is idempotent and additive:
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
//   node server/scripts/sync-youtube-free-videos.mjs --hold    # create new rows
//                                    UNPUBLISHED (see below)
//   node server/scripts/sync-youtube-free-videos.mjs --publish # publish every
//                                    catalogue video that is currently hidden
//
// --hold / --publish exist because the database is shared with the live site
// while the client that can show a hundred videos may not have shipped yet:
// the older lesson page only looked through the first twelve, so a freshly
// filed library would have read "Video not found" for most links. Sync with
// --hold, deploy the API and client, then run --publish.
//
// To refresh the catalogue after new uploads:
//   python -m yt_dlp --flat-playlist -J https://www.youtube.com/@ADLMStudio/videos
//   then file the new ids in the JSON and run this again.

import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../db.js";
import { FreeVideo } from "../models/Learn.js";
import { loadCatalogue, validateCatalogue, planSync, applyPlan } from "../util/youtubeLibrary.js";

const dry = process.argv.includes("--dry");
const force = process.argv.includes("--force");
const hold = process.argv.includes("--hold");
const publish = process.argv.includes("--publish");

const catalogue = loadCatalogue();
// Fail before touching the database if the file names a shelf that does not
// exist — a typo there would file a video under "More lessons" on the site,
// which is exactly the kind of quiet wrongness this check is for.
const problems = validateCatalogue(catalogue);
if (problems.length) {
  console.error("The catalogue cannot be applied:");
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

await connectDB(process.env.MONGO_URI);

const existing = await FreeVideo.find({}).lean();
const plan = planSync(catalogue.videos, existing, { force, publish });

for (const v of plan.creates) console.log(`+ ${String(v.section || "").padEnd(16)} ${v.youtubeId}  ${v.title}`);
for (const u of plan.updates) {
  console.log(`~ ${String(u.section || "").padEnd(16)} ${u.youtubeId}  ${u.title}  ← ${Object.keys(u.set).join(", ")}`);
}

if (!dry) await applyPlan(FreeVideo, plan, { hold });

const catalogueIds = new Set(catalogue.videos.map((v) => v.youtubeId));
const held = await FreeVideo.countDocuments({ youtubeId: { $in: [...catalogueIds] }, isPublished: false });

console.log(
  `\n${dry ? "[dry run] " : ""}created ${plan.creates.length}${hold ? " (held, unpublished)" : ""}, updated ${plan.updates.length}, unchanged ${plan.unchanged}` +
    (held && !dry ? `\n${held} catalogue video(s) are unpublished — run with --publish once the site can show them` : "") +
    (plan.orphans.length
      ? `\nnot in the catalogue (left as they are): ${plan.orphans.map((d) => `${d.youtubeId} "${d.title}"`).join("; ")}`
      : ""),
);

await mongoose.disconnect();
