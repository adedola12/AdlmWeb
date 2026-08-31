// server/scripts/seed-quiv-ai-limits.js
//
// Give every QUIV user a daily allowance for the two metered plugin actions:
//
//   quiv-prompt     10 model round-trips per day (tokens counted, cost billed)
//   quiv-handover   10 full automated takeoff runs per day (no tokens at all)
//
// Written onto the DEFAULT allocation row, so it applies to every account that
// does not hold an override of its own. Per-user overrides set on the admin
// AI-usage page continue to win.
//
// Why daily rather than monthly, which is what every other feature uses: a QS
// who spends a month's allowance on the first morning is stuck until the 1st,
// and that reads as the product being broken rather than as a limit. Ten a day
// is a larger annual ceiling than most monthly caps and it comes back tomorrow.
//
// Usage (from server/):
//   node scripts/seed-quiv-ai-limits.js            # only set what is missing
//   node scripts/seed-quiv-ai-limits.js --force    # reset both to 10/day
//   node scripts/seed-quiv-ai-limits.js --calls 25 # a different number
//
// Idempotent without --force: a limit that already exists is left exactly as
// it is, so re-running this never quietly undoes a deliberate change.
import "dotenv/config";
import mongoose from "mongoose";

import { connectDB } from "../db.js";
import { AiAllocation } from "../models/AiAllocation.js";

const FEATURES = ["quiv-prompt", "quiv-handover"];

function hasFlag(f) {
  return process.argv.includes(f);
}

function numArg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i < 0 || i + 1 >= process.argv.length) return fallback;
  const n = Number(process.argv[i + 1]);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
}

async function main() {
  const force = hasFlag("--force");
  const calls = numArg("--calls", 10);

  await connectDB();

  // Same upsert getDefaultAllocation() uses, so this works on a fresh install
  // that has never had the row.
  const doc = await AiAllocation.findOneAndUpdate(
    { scope: "default" },
    { $setOnInsert: { scope: "default", userId: null, enabled: true } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  if (!doc.features) doc.features = new Map();

  let changed = 0;
  for (const key of FEATURES) {
    const existing = doc.features.get(key);

    if (existing && !force) {
      console.log(
        `  ${key.padEnd(16)} left alone — ${existing.calls || 0} per ` +
          `${existing.window || "month"} (use --force to reset)`,
      );
      continue;
    }

    doc.features.set(key, {
      enabled: true,
      calls,
      tokens: 0, // 0 is UNLIMITED here: the cap is the number of actions,
      costUsd: 0, // not the size of them
      window: "day",
    });
    changed++;
    console.log(`  ${key.padEnd(16)} set to ${calls} per day`);
  }

  if (changed) {
    doc.markModified("features");
    await doc.save();
    console.log(`\nSaved. ${changed} feature limit(s) written to the default allocation.`);
  } else {
    console.log("\nNothing to do — both limits were already set.");
  }

  // The allowance snapshot is cached in-process for 30s in a running server;
  // this script writes straight to Mongo, so a live server picks the change up
  // within that window on its own.
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error("[seed-quiv-ai-limits] failed:", e?.message || e);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
