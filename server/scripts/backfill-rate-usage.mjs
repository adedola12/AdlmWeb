// Give the rate suggestions the history they would have had.
//
// RateUsage starts recording when it ships, so on day one every QS looks like
// they have never priced anything, and "you used this last time" says nothing
// until they have priced a second project. But every line priced from a rate
// on the web since 23 Sep already left a trail: the activity log entry
// "Priced a bill line from a rate", carrying the line's code and the rate's
// description.
//
// This turns those entries into RateUsage rows: the line's description and
// unit come from the project, and the rate id from the pricer's own merged
// library, matched on the description the log recorded. An entry whose
// project, line or rate can no longer be found is skipped and counted. Rows
// are written with via "backfill", and a second run writes nothing new, since
// a (project, code, rate) already recorded is not recorded again.
//
// Dry run by default (local dev shares the production cluster):
//   node scripts/backfill-rate-usage.mjs
//   node scripts/backfill-rate-usage.mjs --apply

import "dotenv/config";
import mongoose from "mongoose";

const APPLY = process.argv.includes("--apply");

await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.AUTH_DB || "adlmWeb" });

const { ActivityLog } = await import("../models/ActivityLog.js");
const { TakeoffProject } = await import("../models/TakeoffProject.js");
const { RateGenRate } = await import("../models/RateGenRate.js");
const { RateGenLibrary } = await import("../models/RateGenLibrary.js");
const { RateUsage } = await import("../models/RateUsage.js");
const { mergeRatesWithUserData } = await import("../util/rategenUserRates.js");
const { lineKey } = await import("../util/rateSuggestions.js");

const low = (v) => String(v || "").trim().toLowerCase();

const entries = await ActivityLog.find({
  action: "budget.updated",
  summary: "Priced a bill line from a rate",
})
  .select("ownerId actorId projectId projectName productKey meta createdAt")
  .lean();

console.log(APPLY ? "" : "DRY RUN: nothing will be written\n");
console.log(`${entries.length} pricing entr${entries.length === 1 ? "y" : "ies"} in the activity log`);

const masterRates = await RateGenRate.find({}).lean();
const mergedFor = new Map();
async function merged(userId) {
  const k = String(userId);
  if (!mergedFor.has(k)) {
    const lib = await RateGenLibrary.findOne({ userId }).lean();
    mergedFor.set(
      k,
      mergeRatesWithUserData(
        masterRates,
        Array.isArray(lib?.rateOverrides) ? lib.rateOverrides : [],
        Array.isArray(lib?.customRates) ? lib.customRates : [],
      ),
    );
  }
  return mergedFor.get(k);
}

const projects = new Map();
async function project(id) {
  const k = String(id);
  if (!projects.has(k)) {
    projects.set(
      k,
      await TakeoffProject.findById(id).select("name productKey items.code items.description items.unit").lean(),
    );
  }
  return projects.get(k);
}

const skipped = { noProject: 0, noLine: 0, noRate: 0, already: 0 };
const docs = [];
const seen = new Set();

for (const e of entries) {
  const userId = e.actorId || e.ownerId;
  const code = String(e.meta?.code || "").trim();
  const rateDesc = low(e.meta?.rate);
  if (!userId || !e.projectId || !code || !rateDesc) {
    skipped.noLine += 1;
    continue;
  }
  const p = await project(e.projectId);
  if (!p) {
    skipped.noProject += 1;
    continue;
  }
  const item = (p.items || []).find((it) => low(it?.code) === low(code));
  if (!item) {
    skipped.noLine += 1;
    continue;
  }
  // The log keeps the first 200 characters of the description.
  const rate = (await merged(userId)).find(
    (r) => low(r?.description).slice(0, 200) === rateDesc,
  );
  const rateId = String(rate?.rateId || rate?.id || "").trim();
  if (!rateId) {
    skipped.noRate += 1;
    continue;
  }
  const dedupe = `${e.projectId}|${low(code)}|${rateId}`;
  if (seen.has(dedupe)) continue;
  seen.add(dedupe);
  if (await RateUsage.exists({ projectId: e.projectId, code, rateId })) {
    skipped.already += 1;
    continue;
  }
  docs.push({
    userId,
    projectId: e.projectId,
    projectName: p.name || e.projectName || "",
    productKey: p.productKey || e.productKey || "",
    code,
    key: lineKey(item.description),
    unit: String(item.unit || "").trim(),
    rateId,
    rateDescription: String(rate.description || "").slice(0, 300),
    via: "backfill",
    createdAt: e.createdAt,
    updatedAt: e.createdAt,
  });
}

console.log(`${docs.length} usage row(s) to write`);
console.log("skipped:", skipped);

if (APPLY && docs.length) {
  // Each row keeps the date it was actually priced: Mongoose only stamps
  // createdAt when it is missing.
  await RateUsage.insertMany(docs, { ordered: false });
  console.log(`Wrote ${docs.length}.`);
} else if (!APPLY) {
  console.log("Re-run with --apply to write them.");
}

await mongoose.disconnect();
