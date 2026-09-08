#!/usr/bin/env node
// server/scripts/seed-takeoff-sessions.mjs
//
// Put 200 realistic Takeoff Time Log sessions into the database so the admin
// Time saved page can be reviewed before HERON and QUIV ship the feature.
//
// Every record is written with `seeded: true`. The summary endpoints exclude
// seeded records from all totals unless the page explicitly asks for them
// (includeSeeded=1), so these can never leak into a number ADLM quotes.
//
// The records go through the SAME builder the plugin route uses
// (buildSessionRecord in routes/telemetry.takeoff.js) against the active
// baseline, so the estimates on screen are the ones production would produce.
//
// Shape: 3 firms + a few personal licences, 2 products (HERON, QUIV), 9 users,
// sessions spread over the last 90 days, weekday-heavy, sizes drawn from a
// skewed distribution so there are a few large jobs and many small ones, about
// 6% cancelled.
//
// Usage (from server/):
//   node scripts/seed-takeoff-sessions.mjs            # dry run: prints what it would write
//   node scripts/seed-takeoff-sessions.mjs --write    # insert them
//   node scripts/seed-takeoff-sessions.mjs --wipe     # delete previously seeded records only
//   node scripts/seed-takeoff-sessions.mjs --wipe --write   # replace
//   node scripts/seed-takeoff-sessions.mjs --count 400 --days 180 --seed 7
//
// Deterministic for a given --seed, so a review can be repeated.
import "dotenv/config";
import mongoose from "mongoose";

import { connectDB } from "../db.js";
import { TakeoffSession } from "../models/TakeoffSession.js";
import { getActiveBaseline } from "../services/takeoffBaseline.js";
import { buildSessionRecord, slugFirm } from "../routes/telemetry.takeoff.js";

const hasFlag = (f) => process.argv.includes(f);
function numArg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i < 0 || i + 1 >= process.argv.length) return fallback;
  const n = Number(process.argv[i + 1]);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
}

// Small seeded PRNG (mulberry32) so runs are reproducible.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRMS = [
  { name: "Lekki Build & Co", users: ["ade", "chioma", "musa"] },
  { name: "Northgate Quantity Surveyors", users: ["tunde", "ngozi"] },
  { name: "Abuja Cost Partners", users: ["kemi", "ibrahim"] },
  { name: "", users: ["solo1", "solo2"] }, // personal licences
];
const PRODUCTS = [
  { product: "HERON", productKey: "planswift", version: "2.9.1", mode: "auto" },
  { product: "QUIV", productKey: "revit", version: "2026.1", mode: "assisted" },
];

function uuid(rand) {
  const h = () => Math.floor(rand() * 16).toString(16);
  const s = (n) => Array.from({ length: n }, h).join("");
  return `${s(8)}-${s(4)}-4${s(3)}-8${s(3)}-${s(12)}`;
}

// Log-normal-ish size: most sessions small, a few big.
function size(rand, base) {
  const u = rand();
  return Math.max(1, Math.round(base * Math.exp(1.1 * (u * u * 3 - 0.6))));
}

function makeSessions({ count, days, seed }) {
  const rand = rng(seed);
  const users = [];
  FIRMS.forEach((f, fi) =>
    f.users.forEach((u) =>
      users.push({
        userId: new mongoose.Types.ObjectId(
          (0x5eed0000 + fi * 100 + users.length).toString(16).padStart(8, "0") + "0".repeat(16),
        ),
        email: `seed.${u}@example.invalid`,
        firmName: f.name,
        firmId: slugFirm(f.name),
        seatId: `seed-${u}-device`,
      }),
    ),
  );
  const now = Date.now();
  const out = [];
  for (let i = 0; i < count; i++) {
    const user = users[Math.floor(rand() * users.length)];
    const p = PRODUCTS[rand() < 0.6 ? 0 : 1];
    // Weekday-heavy start times, office hours Africa/Lagos (UTC+1).
    let start;
    for (;;) {
      start = new Date(now - rand() * days * 86400000);
      const dow = start.getUTCDay();
      if (dow === 0 || dow === 6 ? rand() < 0.15 : true) break;
    }
    start.setUTCHours(7 + Math.floor(rand() * 9), Math.floor(rand() * 60), 0, 0);

    const counts =
      p.product === "HERON"
        ? (() => {
            const sheets = size(rand, 3);
            const area = size(rand, 12);
            const linear = size(rand, 9);
            const cnt = size(rand, 6);
            return {
              sheets,
              items: area + linear + cnt,
              itemsByKind: { area, linear, count: cnt },
              elementTypes: Math.min(area + linear + cnt, size(rand, 6)),
              boqLines: size(rand, 18),
            };
          })()
        : (() => {
            const items = size(rand, 60);
            return {
              sheets: size(rand, 2),
              items,
              elementTypes: Math.min(items, size(rand, 5)),
              boqLines: size(rand, 14),
            };
          })();

    // Automated time: roughly proportional to size with noise, in seconds.
    const work = counts.items * (p.product === "HERON" ? 14 : 4) + counts.sheets * 40 + counts.boqLines * 6;
    const activeSeconds = Math.max(60, Math.round(work * (0.7 + rand() * 0.8)));
    const idle = rand() < 0.35 ? Math.round(rand() * 1800) : Math.round(rand() * 90);
    const wallSeconds = activeSeconds + idle;
    const cancelled = rand() < 0.06;

    out.push({
      user,
      raw: {
        sessionId: uuid(rand),
        product: p.product,
        productKey: p.productKey,
        productVersion: p.version,
        mode: p.mode,
        projectRef: `Job ${100 + Math.floor(rand() * 60)}`,
        startedAt: start.toISOString(),
        endedAt: new Date(start.getTime() + wallSeconds * 1000).toISOString(),
        wallSeconds,
        activeSeconds: cancelled ? Math.round(activeSeconds * rand()) : activeSeconds,
        counts,
        cancelled,
        clientTimezone: "Africa/Lagos",
        seatId: user.seatId,
      },
    });
  }
  return out;
}

async function main() {
  const write = hasFlag("--write");
  const wipe = hasFlag("--wipe");
  const count = numArg("--count", 200);
  const days = numArg("--days", 90);
  const seed = numArg("--seed", 2026);

  await connectDB();

  if (wipe) {
    const existing = await TakeoffSession.countDocuments({ seeded: true });
    if (write) {
      const r = await TakeoffSession.deleteMany({ seeded: true });
      console.log(`[seed] wiped ${r.deletedCount} seeded sessions`);
    } else console.log(`[seed] would wipe ${existing} seeded sessions (add --write)`);
    if (!hasFlag("--count") && count === 200 && process.argv.filter((a) => a.startsWith("--")).every((a) => a === "--wipe" || a === "--write")) {
      await mongoose.disconnect();
      return;
    }
  }

  const baseline = await getActiveBaseline();
  const plan = makeSessions({ count, days, seed });

  const records = [];
  for (const { user, raw } of plan) {
    const ctx = {
      userId: user.userId,
      email: user.email,
      productKey: raw.productKey,
      firmId: user.firmId,
      firmName: user.firmName,
      baseline,
      calibration: null,
    };
    const { record, error } = buildSessionRecord(raw, ctx);
    if (error) throw new Error(`seed generator produced an invalid record: ${error}`);
    record.seeded = true;
    records.push(record);
  }

  const live = records.filter((r) => !r.cancelled);
  const hours = (s) => (s / 3600).toFixed(1);
  console.log(
    `[seed] ${records.length} sessions over ${days} days, baseline ${baseline.version}: ` +
      `${live.length} completed, ${records.length - live.length} cancelled; ` +
      `active ${hours(live.reduce((n, r) => n + r.activeSeconds, 0))} h, ` +
      `estimated manual ${hours(live.reduce((n, r) => n + r.baseline.estimatedManualSeconds, 0))} h, ` +
      `saved ${hours(live.reduce((n, r) => n + r.savedSeconds, 0))} h`,
  );
  const byFirm = {};
  for (const r of live) byFirm[r.firmName || "(personal)"] = (byFirm[r.firmName || "(personal)"] || 0) + r.savedSeconds;
  for (const [f, s] of Object.entries(byFirm)) console.log(`        ${f.padEnd(32)} ${hours(s)} h saved`);

  if (!write) {
    console.log("[seed] dry run: nothing written. Re-run with --write to insert.");
  } else {
    const r = await TakeoffSession.insertMany(records, { ordered: false });
    console.log(`[seed] inserted ${r.length} seeded sessions`);
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
