// server/scripts/signup-cohort-report.mjs
//
// Are the unverified accounts people, or automated registrations?
//
// READ ONLY. No --apply, no write path.
//
// WHY THIS QUESTION COMES BEFORE ANY MAIL
//
// verify-gap-report.mjs found 278 unverified accounts, 273 of which WERE sent a
// code, and a cohort whose addresses do not look like ADLM customers: a German
// window manufacturer, a US paper merchant, a food company and several
// unrelated corporate domains, all registering within days of each other, for a
// Nigerian quantity-surveying product. 14 of them have since hard-bounced and 3
// complained.
//
// If they are automated registrations then "272 customers are locked out" is the
// wrong description of the problem, and mailing them is not a rescue — it is
// sending to a scraped list, which is precisely how a sending domain earns the
// complaint rate that gets it paused. If they are real, that is a different and
// much more urgent problem. The two cannot be told apart by looking at the User
// collection, so this reads the signals that were recorded at registration:
//
//   * the Refresh collection stores the ip and user-agent of the session created
//     at signup, so a single client registering many accounts is visible
//   * clustering in time — human signups arrive spread out; a script does not
//   * the shape of usernames and the spread of domains
//
// None of these is conclusive alone. Together they answer it.
import "dotenv/config";
import mongoose from "mongoose";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { User } from "../models/User.js";
import { Refresh } from "../models/Refresh.js";

const say = (...a) => console.log(...a);
const mask = (e) => String(e || "").replace(/(.{2}).*(@.*)/, "$1***$2");

const UNVERIFIED = {
  $or: [{ emailVerified: { $ne: true } }, { emailVerified: { $exists: false } }],
};

async function connect() {
  let uri = process.env.MONGO_URI;
  if (!uri && process.argv.includes("--from-ssm")) {
    const region = process.env.AWS_REGION || "eu-west-1";
    const ssm = new SSMClient({ region });
    const r = await ssm.send(
      new GetParameterCommand({ Name: "/adlm/cloud/prod/MONGO_URI", WithDecryption: true }),
    );
    uri = r.Parameter?.Value || "";
    if (!process.env.AUTH_DB) {
      try {
        const a = await ssm.send(
          new GetParameterCommand({ Name: "/adlm/cloud/prod/AUTH_DB", WithDecryption: true }),
        );
        if (a.Parameter?.Value) process.env.AUTH_DB = a.Parameter.Value;
      } catch {
        // default below matches db.js
      }
    }
  }
  if (!uri) {
    console.error("signup-cohort-report: MONGO_URI is not set. Pass --from-ssm.");
    process.exit(1);
  }
  await mongoose.connect(uri, { dbName: process.env.AUTH_DB || "adlmWeb" });
  say(`database: ${mongoose.connection.name}`);
}

/** Top n entries of a count map, as "value (n)" lines. */
function top(map, n = 12) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

async function main() {
  await connect();

  const unverified = await User.find(UNVERIFIED, {
    email: 1, username: 1, createdAt: 1, firstName: 1, lastName: 1,
    whatsapp: 1, zone: 1,
  })
    .sort({ createdAt: 1 })
    .lean();
  const verified = await User.find(
    { emailVerified: true },
    { email: 1, createdAt: 1 },
  ).lean();

  say(`\nunverified: ${unverified.length}   verified: ${verified.length}`);

  // ── 1. the clients that created them ───────────────────────────────────
  // Refresh holds one row per session, written at signup with ip and ua.
  const ids = unverified.map((u) => u._id);
  const sessions = await Refresh.find(
    { userId: { $in: ids } },
    { userId: 1, ip: 1, ua: 1, createdAt: 1 },
  ).lean();

  const byIp = {};
  const byUa = {};
  for (const s of sessions) {
    byIp[s.ip || "(none)"] = (byIp[s.ip || "(none)"] || 0) + 1;
    byUa[(s.ua || "(none)").slice(0, 70)] = (byUa[(s.ua || "(none)").slice(0, 70)] || 0) + 1;
  }
  say(`\n=== the client that registered them (Refresh: ip / user-agent) ===`);
  say(`sessions found : ${sessions.length} for ${unverified.length} accounts`);
  say(`distinct ips   : ${Object.keys(byIp).length}`);
  say(`distinct uas   : ${Object.keys(byUa).length}`);
  say(`\n  busiest ips:`);
  for (const [ip, n] of top(byIp)) say(`    ${String(ip).padEnd(42)} ${n}`);
  say(`\n  busiest user-agents:`);
  for (const [ua, n] of top(byUa, 8)) say(`    ${String(n).padStart(4)}  ${ua}`);

  // Compare against the verified cohort. If one ip registered 200 unverified
  // accounts and 2 verified ones, that is the answer.
  const vids = verified.map((u) => u._id);
  const vsessions = await Refresh.find({ userId: { $in: vids } }, { ip: 1 }).lean();
  const vByIp = {};
  for (const s of vsessions) vByIp[s.ip || "(none)"] = (vByIp[s.ip || "(none)"] || 0) + 1;
  say(`\n  for comparison, verified accounts: ${Object.keys(vByIp).length} distinct ips over ${vsessions.length} sessions`);

  // ── 2. clustering in time ──────────────────────────────────────────────
  // Humans arrive spread out. A script arrives in bursts. Count accounts per
  // calendar day, and the tightest minute-level bursts.
  const byDay = {};
  const byMinute = {};
  for (const u of unverified) {
    if (!u.createdAt) continue;
    const iso = new Date(u.createdAt).toISOString();
    byDay[iso.slice(0, 10)] = (byDay[iso.slice(0, 10)] || 0) + 1;
    byMinute[iso.slice(0, 16)] = (byMinute[iso.slice(0, 16)] || 0) + 1;
  }
  say(`\n=== when they arrived ===`);
  say(`  busiest days:`);
  for (const [d, n] of top(byDay, 10)) say(`    ${d}  ${"#".repeat(Math.min(n, 60))} ${n}`);
  const bursts = top(byMinute, 8).filter(([, n]) => n > 1);
  say(`  tightest bursts (accounts created in the SAME minute):`);
  if (!bursts.length) say(`    none — no two accounts share a minute`);
  for (const [m, n] of bursts) say(`    ${m}Z  ${n} accounts`);

  // ── 3. the shape of the registrations ──────────────────────────────────
  const byDomain = {};
  let noName = 0;
  let noWhatsapp = 0;
  let noZone = 0;
  for (const u of unverified) {
    const d = String(u.email || "").split("@")[1] || "(none)";
    byDomain[d] = (byDomain[d] || 0) + 1;
    if (!String(u.firstName || "").trim() && !String(u.lastName || "").trim()) noName += 1;
    if (!u.whatsapp) noWhatsapp += 1;
    if (!u.zone) noZone += 1;
  }
  say(`\n=== the shape of the registrations ===`);
  say(`no first OR last name  : ${noName} of ${unverified.length}`);
  say(`no whatsapp            : ${noWhatsapp}`);
  say(`no zone                : ${noZone}`);
  say(`distinct email domains : ${Object.keys(byDomain).length}`);
  say(`  commonest domains:`);
  for (const [d, n] of top(byDomain, 12)) say(`    ${d.padEnd(32)} ${n}`);

  // How many domains appear exactly once? A scraped list is mostly singletons
  // across unrelated companies; a real customer base clusters on free mail.
  const singles = Object.values(byDomain).filter((n) => n === 1).length;
  say(`  domains appearing exactly once: ${singles}`);

  // ── 4. the 5 that were never sent a code ───────────────────────────────
  // Called out separately: if any unverified account IS a real customer, it is
  // most likely one of these, and they are the only group a resend could help.
  say(`\n=== earliest 8, with what was captured ===`);
  for (const u of unverified.slice(0, 8)) {
    const nm = `${u.firstName || ""} ${u.lastName || ""}`.trim() || "(no name)";
    say(`  ${String(u.createdAt).slice(4, 15)}  ${mask(u.email).padEnd(30)} ${nm}`);
  }

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e?.message || e);
  try {
    await mongoose.disconnect();
  } catch {
    // already down
  }
  process.exitCode = 1;
});
