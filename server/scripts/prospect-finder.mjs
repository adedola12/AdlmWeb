#!/usr/bin/env node
// server/scripts/prospect-finder.mjs
//
// Runs the daily prospect finder by hand.
//
//   node scripts/prospect-finder.mjs --sample            recorded responses, in-memory store: no key, no spend, no writes
//   node scripts/prospect-finder.mjs --live              real Claude + Hunter calls, in-memory store: spends, writes nothing but the AI usage rows
//   node scripts/prospect-finder.mjs --live --apply      the real thing: writes prospects and contacts
//
//   --profile <key>   only this profile
//   --cap <n>         override PROSPECT_DAILY_CAP for this run
//
// Local dev and production share one Atlas cluster, so --apply is production.
import "dotenv/config";
import mongoose from "mongoose";
import { runProspectFinder } from "../util/prospecting/finder.js";
import { createStore } from "../util/prospecting/store.js";
import { memoryModels } from "../util/prospecting/memoryModels.js";
import { researchCompanies } from "../util/prospecting/research.js";
import { domainSearch } from "../util/prospecting/hunter.js";
import { dailyCap } from "../util/prospecting/guards.js";
import { SEED_PROFILES } from "../config/prospectingProfiles.js";

const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const opt = (f) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : undefined);

const SAMPLE = flag("--sample");
const LIVE = flag("--live");
const APPLY = flag("--apply");
if (SAMPLE === LIVE) {
  console.log("Pick one: --sample (recorded responses) or --live (real calls).");
  process.exit(1);
}
if (SAMPLE && APPLY) {
  console.log("Refusing --sample --apply: sample firms must never reach the real database.");
  process.exit(1);
}
const mode = SAMPLE ? "sample" : "live";
const only = opt("--profile");
const cap = opt("--cap") !== undefined ? dailyCap(opt("--cap")) : dailyCap();

async function main() {
  // Live runs connect even without --apply, so the money they spend is
  // recorded on the AI usage screen.
  if (LIVE) {
    if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set");
    await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.DB_NAME || "adlmWeb" });
  }

  let models;
  if (APPLY) {
    const [{ IdealCustomerProfile }, { Prospect }, { ProspectContact }, { OutreachDraft }, { Suppression }] = await Promise.all([
      import("../models/IdealCustomerProfile.js"),
      import("../models/Prospect.js"),
      import("../models/ProspectContact.js"),
      import("../models/OutreachDraft.js"),
      import("../models/Suppression.js"),
    ]);
    models = { IdealCustomerProfile, Prospect, ProspectContact, OutreachDraft, Suppression };
  } else {
    models = memoryModels();
    await models.IdealCustomerProfile.insertMany(SEED_PROFILES.map((p) => ({ ...p, active: true })));
  }

  const store = createStore(models);
  const loadProfiles = async () => {
    const rows = await models.IdealCustomerProfile.find({ active: true }).lean();
    return only ? rows.filter((p) => p.key === only) : rows;
  };

  console.log(`Prospect finder: ${mode}, ${APPLY ? "WRITING to the database" : "in-memory store (nothing written)"}, cap ${cap}\n`);
  const report = await runProspectFinder({
    store,
    loadProfiles,
    research: (a) => researchCompanies({ ...a, mode }),
    findContacts: (domain) => domainSearch(domain, { mode }),
    cap,
  });

  console.log("");
  for (const p of report.profiles) {
    console.log(`■ ${p.profile}  share ${p.share}${p.skippedReason ? `  (skipped: ${p.skippedReason})` : ""}${p.error ? `  FAILED: ${p.error}` : ""}`);
    for (const d of p.added) console.log(`    + ${d}`);
    for (const s of p.skipped) console.log(`    - ${s.domain || s.input}  ${s.reason}`);
    for (const d of p.dropped) console.log(`    x ${d.companyName}  ${d.reason}`);
    if (p.noContact.length) console.log(`    no contact: ${p.noContact.join(", ")}`);
  }

  if (!APPLY) {
    console.log("\nContacts chosen (★ = primary, the one the emails will go to):");
    for (const pr of models.Prospect.rows) {
      console.log(`  ${pr.companyName}  [${pr.domain}]  ${pr.location}${pr.statusNote ? `  (${pr.statusNote})` : ""}`);
      for (const c of models.ProspectContact.rows.filter((x) => x.prospectId === pr._id)) {
        console.log(`    ${c.primary ? "★" : " "} ${c.name || "(no name)"}, ${c.title || "(no title)"}  <${c.email}>  ${c.confidence}%`);
      }
    }
  }

  console.log(`\nAdded ${report.added} (cap ${report.cap}, ${report.foundBefore} already today). Cost $${report.costUsd.toFixed(4)}${SAMPLE ? " (what these recorded calls would have cost)" : ""}.`);
  if (report.errors.length) console.log(`Errors: ${JSON.stringify(report.errors, null, 1)}`);
}

try {
  await main();
} finally {
  if (LIVE) {
    const { flushAiUsage } = await import("../services/aiUsage.js");
    await flushAiUsage();
    await mongoose.disconnect().catch(() => {});
  }
}
