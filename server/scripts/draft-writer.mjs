#!/usr/bin/env node
// server/scripts/draft-writer.mjs
//
// Runs the email writer by hand.
//
//   node scripts/draft-writer.mjs --preview           sample research (invented .example firms) -> REAL model -> print drafts.
//                                                      Uses draft briefs, writes nothing but the AI usage rows.
//   node scripts/draft-writer.mjs --apply             drafts every real "new" prospect with a contact, into the review queue.
//                                                      Only products whose brief is marked "Status: ready".
//   --limit <n>   at most n prospects (default 20; preview default 6)
//
// Model calls go through aiClient.createMessage, so they use AGENT_PROVIDER
// (Bedrock by default) and are metered as "prospect-email-draft". Local dev
// and production share one Atlas cluster, so --apply is production.
import "dotenv/config";
import mongoose from "mongoose";
import { createMessage } from "../services/aiClient.js";
import { flushAiUsage } from "../services/aiUsage.js";
import { createStore } from "../util/prospecting/store.js";
import { memoryModels } from "../util/prospecting/memoryModels.js";
import { runProspectFinder } from "../util/prospecting/finder.js";
import { researchCompanies } from "../util/prospecting/research.js";
import { domainSearch } from "../util/prospecting/hunter.js";
import { loadBriefs, productName } from "../util/prospecting/writer.js";
import { runDraftWriter } from "../util/prospecting/drafter.js";
import { SEED_PROFILES } from "../config/prospectingProfiles.js";

const argv = process.argv.slice(2);
const PREVIEW = argv.includes("--preview");
const APPLY = argv.includes("--apply");
if (PREVIEW === APPLY) {
  console.log("Pick one: --preview (sample firms, nothing saved) or --apply (real prospects, into the review queue).");
  process.exit(1);
}
const limit = argv.includes("--limit") ? Number(argv[argv.indexOf("--limit") + 1]) : PREVIEW ? 6 : 20;

async function main() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set");
  // Connected in both modes: the preview spends real money, and that belongs
  // on the AI usage screen.
  await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.DB_NAME || "adlmWeb" });
  const briefs = loadBriefs();

  let store;
  let models;
  if (PREVIEW) {
    models = memoryModels();
    await models.IdealCustomerProfile.insertMany(SEED_PROFILES.map((p) => ({ ...p, active: true })));
    store = createStore(models);
    await runProspectFinder({
      store,
      loadProfiles: () => models.IdealCustomerProfile.find({ active: true }).lean(),
      research: (a) => researchCompanies({ ...a, mode: "sample" }),
      findContacts: (d) => domainSearch(d, { mode: "sample" }),
      log: () => {},
    });
  } else {
    store = (await import("../util/prospecting/store.js")).default;
  }

  const briefLine = Object.entries(briefs).map(([k, b]) => `${k}:${b.status}`).join("  ");
  console.log(`Draft writer: ${PREVIEW ? "PREVIEW on sample firms, nothing saved" : "WRITING to the review queue"}\nBriefs: ${briefLine}\n`);

  const report = await runDraftWriter({ store, briefs, create: createMessage, limit, requireReady: APPLY });

  if (PREVIEW) {
    for (const { domain, attempts, draft } of report.drafted) {
      const p = models.Prospect.rows.find((x) => x.domain === domain);
      const c = models.ProspectContact.rows.find((x) => String(x._id) === String(draft.contactId));
      console.log("=".repeat(78));
      console.log(`${p.companyName}  ->  ${c.name}, ${c.title}  <${c.email}>`);
      console.log(`${productName(draft.product)} · ${draft.model} · ${attempts === 1 ? "passed first time" : "passed after one rewrite"}`);
      for (const e of draft.emails) {
        console.log(`\n--- Day ${e.dayOffset} · Subject: ${e.subject}\n`);
        console.log(e.body);
      }
      console.log("");
    }
  }
  for (const s of report.skipped) console.log(`skipped ${s.domain}: ${s.reason}`);
  for (const f of report.failed) console.log(`FAILED ${f.domain}: ${f.error}`);
  console.log(`\nDrafted ${report.drafted.length}, skipped ${report.skipped.length}, failed ${report.failed.length}.`);
}

try {
  await main();
} finally {
  await flushAiUsage();
  await mongoose.disconnect().catch(() => {});
}
