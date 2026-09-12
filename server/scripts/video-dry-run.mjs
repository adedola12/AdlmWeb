// What the next video announcement would do, without doing it.
//
//   node scripts/video-dry-run.mjs             the poll, as the cron would run it
//   node scripts/video-dry-run.mjs <url|id>    one specific video
//
// DRY_RUN is forced on HERE rather than left to the environment. The whole
// point of this script is that it cannot mail anybody, and a safety you have
// to remember to switch on is not a safety. Running it with DRY_RUN unset in
// .env is therefore fine, and running the real send through this file is not
// possible — use the admin Videos screen for that, where the consequence is
// visible in front of you.
//
// Everything below the transport is the real thing: the real audience out of
// the real database, the real template, the real batch loop, the real claim.
// Only the last inch is swapped. A dry run that took a different path would
// prove the dry-run path works and nothing else.
process.env.DRY_RUN = "true";

import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../db.js";

const arg = process.argv[2];

const { isConfigured, parseVideoId, fetchVideo, fetchRecentUploads } = await import(
  "../util/youtubeFeed.js"
);
const { audienceQuery, splitAudience, announceVideo, runVideoPoll, isDryRun } =
  await import("../util/videoNotifier.js");
const { newVideoMessage } = await import("../util/videoEmail.js");

const line = (s = "") => console.log(s);
const rule = () => line("─".repeat(72));

if (!isDryRun()) {
  console.error("DRY_RUN did not take. Refusing to run.");
  process.exit(1);
}

rule();
line("  VIDEO ANNOUNCEMENT — DRY RUN. Nothing will be sent.");
rule();

if (!isConfigured()) {
  line("");
  line("  YOUTUBE_API_KEY or YOUTUBE_CHANNEL_ID is missing, so the channel");
  line("  cannot be read. The audience below is still real.");
  line("");
}

await connectDB(process.env.MONGO_URI);

/* ── who would get it ─────────────────────────────────────────────────────── */

const all = await audienceQuery()
  .select("email firstName emailVerified emailPrefs emailUndeliverable")
  .lean();
const { recipients, skipped } = splitAudience(all);

line("");
line("  AUDIENCE");
line(`    would be mailed              ${recipients.length}`);
line(`    skipped, opted out           ${skipped.optedOut}`);
line(`    skipped, unverified          ${skipped.unverified}`);
line(`    skipped, previously bounced  ${skipped.undeliverable ?? 0}`);
line(`    skipped, no address          ${skipped.noAddress}`);
line("");

/* ── what they would get ──────────────────────────────────────────────────── */

async function preview(video) {
  const sample = recipients[0] || { firstName: "there", _id: "sample" };
  const { videoUnsubscribeUrl } = await import("../util/campaigns.js");
  const m = newVideoMessage({
    firstName: sample.firstName,
    title: video.title,
    description: video.description,
    thumbnailUrl: video.thumbnailUrl,
    videoUrl: `https://www.youtube.com/watch?v=${video.videoId}`,
    unsubscribeUrl: videoUnsubscribeUrl(sample._id),
  });

  rule();
  line(`  SUBJECT   ${m.subject}`);
  rule();
  line(m.text);
  rule();
}

if (!isConfigured()) {
  line("  Set YOUTUBE_API_KEY to go further.");
} else if (arg) {
  const id = parseVideoId(arg);
  if (!id) {
    console.error(`  "${arg}" is not a YouTube video link or id.`);
    await mongoose.disconnect();
    process.exit(1);
  }
  const video = await fetchVideo(id);
  if (!video) {
    console.error(`  YouTube has no public video ${id}. Still private or unlisted?`);
    await mongoose.disconnect();
    process.exit(1);
  }
  await preview(video);
  line("  Running the real send path with the transport swapped out…");
  line("");
  const out = await announceVideo(id, { actor: "dry-run" });
  line("");
  line(`  RESULT  ${JSON.stringify(out)}`);
} else {
  const uploads = await fetchRecentUploads(5);
  line(`  MOST RECENT ON THE CHANNEL (${uploads.length})`);
  for (const v of uploads) {
    const known = await mongoose.connection
      .collection("videos")
      .findOne({ videoId: v.videoId }, { projection: { notifiedAt: 1 } });
    const state = !known ? "NEW" : known.notifiedAt ? "announced" : "filed, not announced";
    line(`    ${v.videoId}  ${state.padEnd(21)}  ${v.title.slice(0, 40)}`);
  }
  if (uploads[0]) {
    line("");
    await preview(uploads[0]);
  }

  line("  Running the poll…");
  line("");
  const out = await runVideoPoll();
  line("");
  line(`  RESULT  ${JSON.stringify(out)}`);
  if (out?.seeded) {
    line("");
    line("  SEEDED. The videos collection was empty, so the back catalogue was");
    line("  filed and nobody was mailed. The next upload is the first one");
    line("  anybody hears about. This is the intended first run.");
  }
}

line("");
line("  Nothing was sent. Nothing was written to the videos collection.");
await mongoose.disconnect();
