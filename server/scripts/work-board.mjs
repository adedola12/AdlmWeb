#!/usr/bin/env node
// server/scripts/work-board.mjs
//
// The work board from the command line (docs/WORK_BOARD.md). This is how a
// Claude session files a proposal before it builds a new feature, and how the
// board is seeded with the work already in flight.
//
//   node scripts/work-board.mjs status
//   node scripts/work-board.mjs seed [--apply]
//   node scripts/work-board.mjs propose --file proposal.json [--apply] [--by you@adlm]
//   node scripts/work-board.mjs check --key <key>      exit 0 only if it may be built
//
// Without --apply every write is a dry run that prints what it would do.
// Local dev and production share one Atlas cluster, so --apply is production.
// proposal.json = { title, products[], kind, summary, businessCase{...}, design{surfaces} }
import "dotenv/config";
import fs from "node:fs";
import mongoose from "mongoose";
import { WorkItem } from "../models/WorkItem.js";
import { esc, gateMail, getGateConfig } from "../util/releaseGate.js";
import { initialDecision, missingBusinessCase, needsApproval, stageBlock } from "../util/workBoard.js";
import { AS_OF, SEED } from "./work-board.seed.mjs";

const [, , cmd, ...rest] = process.argv;
const args = {};
for (let i = 0; i < rest.length; i++) {
  const k = rest[i];
  if (!k.startsWith("--")) continue;
  const next = rest[i + 1];
  if (next === undefined || next.startsWith("--")) args[k.slice(2)] = true;
  else args[k.slice(2)] = rest[++i];
}
const APPLY = args.apply === true;
const say = (...a) => console.log(...a);

async function connect() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI is not set");
  await mongoose.connect(uri, { dbName: process.env.DB_NAME || "adlmWeb" });
}

// Refreshed on every seed; everything else is written once, on insert.
const REFRESHED = ["title", "summary", "products", "kind", "progress", "pending", "blockedOn", "refs"];

async function seed() {
  const owner = String(process.env.RELEASE_GATE_OWNER_EMAIL || "admin@adlmstudio.net").toLowerCase();
  say(`Work board seed, as of ${AS_OF}: ${SEED.length} items${APPLY ? "" : " (dry run)"}`);
  let order = 0;
  for (const s of SEED) {
    order += 10;
    const decision = s.decision || initialDecision(s.kind);
    const set = { sortOrder: order };
    for (const k of REFRESHED) if (s[k] !== undefined) set[k] = s[k];
    const onInsert = {
      key: s.key,
      stage: s.stage,
      decision: { status: decision, note: decision === "grandfathered" ? `Under way before the proposal rule (${AS_OF}).` : "" },
      design: { status: "needed", ...(s.design || {}) },
      submittedBy: owner,
    };
    const exists = await WorkItem.exists({ key: s.key });
    say(`  ${exists ? "update" : "insert"}  [${s.stage}] ${s.title}`);
    if (APPLY) {
      await WorkItem.updateOne({ key: s.key }, { $set: set, $setOnInsert: onInsert }, { upsert: true, runValidators: true });
    }
  }
  if (!APPLY) say("\nDry run. Re-run with --apply to write (this is the production database).");
}

async function propose() {
  if (!args.file) throw new Error("--file proposal.json is required");
  const p = JSON.parse(fs.readFileSync(args.file, "utf8"));
  const kind = p.kind || "feature";
  const missing = missingBusinessCase(kind, p.businessCase);
  if (!p.title) throw new Error("title is required");
  if (missing.length) {
    say(`Refused: a new ${kind} needs its business case first. Missing: ${missing.join(", ")}.`);
    process.exitCode = 2;
    return;
  }
  const by = String(args.by || process.env.RELEASE_GATE_OWNER_EMAIL || "admin@adlmstudio.net").toLowerCase();
  const doc = {
    key: p.key,
    title: p.title,
    summary: p.summary || "",
    products: p.products || [],
    kind,
    stage: needsApproval(kind) ? "proposed" : p.stage || "building",
    businessCase: p.businessCase || {},
    design: { status: "needed", ...(p.design || {}) },
    decision: { status: initialDecision(kind) },
    refs: p.refs || "",
    submittedBy: by,
  };
  say(`Proposal: ${doc.title} [${doc.kind}] -> stage ${doc.stage}, decision ${doc.decision.status}${APPLY ? "" : " (dry run)"}`);
  if (!APPLY) return say("Dry run. Re-run with --apply to file it and email the approver.");
  const item = await WorkItem.create(doc);
  const cfg = await getGateConfig();
  if (needsApproval(kind)) {
    await gateMail({
      to: [cfg.approverEmail],
      subject: `New proposal for your approval: ${item.title}`,
      title: "A new feature is waiting for your approval",
      lines: [`<strong>${esc(item.title)}</strong>`, `Proposed by ${esc(by)}.`, `<em>${esc(item.businessCase.problem)}</em>`],
      cta: { label: "Open the work board", href: `${String(process.env.PUBLIC_SITE_URL || "https://www.adlmstudio.net").replace(/\/+$/, "")}/admin/work` },
    });
  }
  say(`Filed ${item._id}. Nothing may be built until the approver approves it.`);
}

async function check() {
  const item = await WorkItem.findOne(args.key ? { key: args.key } : { _id: args.id }).lean();
  if (!item) {
    say("Not on the board. File a proposal first: node scripts/work-board.mjs propose --file proposal.json");
    process.exitCode = 3;
    return;
  }
  const block = stageBlock(item, "building");
  say(block ? `NOT cleared to build: ${block}` : `Cleared to build (decision: ${item.decision?.status}).`);
  if (block) process.exitCode = 1;
}

async function status() {
  const items = await WorkItem.find({}).sort({ sortOrder: 1 }).lean();
  for (const i of items) {
    say(`[${i.stage.padEnd(16)}] ${String(i.decision?.status || "").padEnd(13)} design:${String(i.design?.status || "").padEnd(11)} ${i.title}`);
  }
  say(`${items.length} items.`);
}

const COMMANDS = { seed, propose, check, status };
if (!COMMANDS[cmd]) {
  say("usage: node scripts/work-board.mjs status | seed [--apply] | propose --file f.json [--apply] | check --key k");
  process.exit(1);
}
try {
  await connect();
  await COMMANDS[cmd]();
} finally {
  await mongoose.disconnect().catch(() => {});
}
