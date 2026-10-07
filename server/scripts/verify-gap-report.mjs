// server/scripts/verify-gap-report.mjs
//
// Why are there unverified accounts, and is mailing them a good idea?
//
// READ ONLY. There is no --apply and no write path in this file, deliberately:
// its entire job is to answer a question that was about to be answered by
// guessing, and the answer decides whether a bulk send happens at all.
//
// THE QUESTION IT EXISTS TO SETTLE
//
// On 4 Oct 2026, 272 of 765 accounts were unverified. util/emailGate.js refuses
// every signed-in request from an unconfirmed account, so all 272 are locked
// out of the product. The obvious fix — mail them a fresh code — is the single
// riskiest message the studio could send: 272 addresses nobody has ever
// confirmed, at a moment when the SES complaint rate was 0.39% against the 0.5%
// at which AWS pauses sending outright. A pause stops licence keys, password
// resets and receipts, so "send and see what happens" is not available.
//
// What decides it is whether those addresses were ever written to, and whether
// anyone opened the result:
//
//   * sent and opened       → the code arrived and was ignored. Mailing again is
//                             cold outreach to people who abandoned signup, and
//                             earns complaints rather than verifications.
//   * sent and never opened → a deliverability problem. Mailing the same way
//                             again reproduces it; the transport is the bug.
//   * never sent            → our bug, and the only case where a resend is both
//                             justified and likely to work.
//
// Those three look identical from the User collection alone, which is why this
// reads the EmailSend ledger (what left the building) and MailEvent (what the
// receiving servers said about it) rather than inferring from emailVerifySentAt
// — that field is written BEFORE the send in POST /auth/signup, so it is set
// whether the message went or not and proves nothing either way.
import "dotenv/config";
import mongoose from "mongoose";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { User } from "../models/User.js";
import { EmailSend, hashRecipient } from "../models/EmailSend.js";
import { MailEvent } from "../models/MailEvent.js";

const say = (...a) => console.log(...a);
const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(2)}%` : "–");
const mask = (e) => String(e || "").replace(/(.{2}).*(@.*)/, "$1***$2");

const UNVERIFIED = {
  $or: [{ emailVerified: { $ne: true } }, { emailVerified: { $exists: false } }],
};

/**
 * The connection string, read in-process.
 *
 * Same approach as backfill-social-verified.mjs and for the same reasons: it
 * goes from Parameter Store into this process and nowhere else, never into
 * shell history or a terminal scrollback, and the SDK can read this parameter
 * from environments where the CLI cannot. No fallback to a second variable —
 * that is how the first run of the backfill reported a clean bill of health for
 * the wrong cluster.
 */
async function connect() {
  let uri = process.env.MONGO_URI;
  if (!uri && process.argv.includes("--from-ssm")) {
    const region = process.env.AWS_REGION || "eu-west-1";
    const ssm = new SSMClient({ region });
    const r = await ssm.send(
      new GetParameterCommand({ Name: "/adlm/cloud/prod/MONGO_URI", WithDecryption: true }),
    );
    uri = r.Parameter?.Value || "";
    say(`connection string: read from SSM (${region})`);
    if (!process.env.AUTH_DB) {
      try {
        const a = await ssm.send(
          new GetParameterCommand({ Name: "/adlm/cloud/prod/AUTH_DB", WithDecryption: true }),
        );
        if (a.Parameter?.Value) process.env.AUTH_DB = a.Parameter.Value;
      } catch {
        // Not set in SSM: the default below is the one db.js uses.
      }
    }
  }
  if (!uri) {
    console.error("verify-gap-report: MONGO_URI is not set. Pass --from-ssm to read it.");
    process.exit(1);
  }
  // db.js connects with dbName: AUTH_DB || "adlmWeb", never the connection
  // string's default ("test"). Connecting without it lands in an empty database
  // and reports zero of everything, which is why the name is printed below.
  await mongoose.connect(uri, { dbName: process.env.AUTH_DB || "adlmWeb" });
  say(`database: ${mongoose.connection.name}`);
}

async function main() {
  await connect();

  const total = await User.countDocuments({});
  const unverified = await User.find(UNVERIFIED, {
    email: 1,
    createdAt: 1,
    signupMethod: 1,
    googleId: 1,
    microsoftId: 1,
    autodeskId: 1,
    emailVerifySentAt: 1,
    emailUndeliverable: 1,
    emailUndeliverableReason: 1,
    entitlements: 1,
  }).lean();

  say(`\n=== accounts ===`);
  say(`total                  : ${total}`);
  say(`unverified             : ${unverified.length}  (${pct(unverified.length, total)})`);

  // Were they ever actually written to? The ledger keeps 90 days, which covers
  // every one of these sign-ups.
  const hashes = unverified.map((u) => hashRecipient(u.email));

  const sends = await EmailSend.find(
    { toHash: { $in: hashes }, key: "account.verify" },
    { toHash: 1, ok: 1, via: 1, at: 1, firstOpenAt: 1, openCount: 1 },
  ).lean();

  const sentTo = new Set(sends.map((s) => s.toHash));
  const openedTo = new Set(sends.filter((s) => s.firstOpenAt).map((s) => s.toHash));
  const failedTo = new Set(sends.filter((s) => s.ok === false).map((s) => s.toHash));

  say(`\n=== was a verification code ever sent? (EmailSend, key=account.verify) ===`);
  say(`verify messages logged : ${sends.length}`);
  say(`accounts written to    : ${sentTo.size}  of ${unverified.length}`);
  say(`  ...that SES refused  : ${failedTo.size}`);
  say(`  ...that were OPENED  : ${openedTo.size}  (${pct(openedTo.size, sentTo.size)} of those mailed)`);
  say(`never written to       : ${unverified.length - sentTo.size}`);

  // Any send at all, not just the verification — an account that opened a
  // receipt proves the address works even if it never opened the code.
  const anySend = await EmailSend.find(
    { toHash: { $in: hashes } },
    { toHash: 1, key: 1, firstOpenAt: 1 },
  ).lean();
  const reachable = new Set(anySend.filter((s) => s.firstOpenAt).map((s) => s.toHash));
  say(`opened ANY mail from us: ${reachable.size}   (address demonstrably live)`);

  // What the receiving servers said. This is the evidence collection; the
  // decision lives on the User record.
  const emails = unverified.map((u) => String(u.email || "").toLowerCase());
  const events = await MailEvent.find(
    { email: { $in: emails } },
    { email: 1, type: 1, bounceType: 1, bounceSubType: 1, complaintType: 1, action: 1, at: 1 },
  ).lean();

  const hard = events.filter((e) => e.type === "bounce" && e.bounceType === "Permanent");
  const soft = events.filter((e) => e.type === "bounce" && e.bounceType !== "Permanent");
  const comp = events.filter((e) => e.type === "complaint");

  say(`\n=== what the receiving servers said about these addresses (MailEvent) ===`);
  say(`permanent bounces      : ${hard.length}   (dead addresses)`);
  say(`transient bounces      : ${soft.length}`);
  say(`complaints             : ${comp.length}`);
  say(`flagged undeliverable  : ${unverified.filter((u) => u.emailUndeliverable).length}`);

  // Account-wide reputation picture for the last 24h, which is what any
  // additional send would be added to.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [all24, hard24, comp24] = await Promise.all([
    EmailSend.countDocuments({ at: { $gte: since } }),
    MailEvent.countDocuments({ at: { $gte: since }, type: "bounce", bounceType: "Permanent" }),
    MailEvent.countDocuments({ at: { $gte: since }, type: "complaint" }),
  ]);
  say(`\n=== last 24h, all mail ===`);
  say(`sent                   : ${all24}`);
  say(`permanent bounces      : ${hard24}  (${pct(hard24, all24)})`);
  say(`complaints             : ${comp24}  (${pct(comp24, all24)})   AWS reviews at 0.1%, pauses at 0.5%`);

  // When did these sign-ups happen, and how were they made? A single large
  // cohort with no verifications is a different story from a steady trickle.
  const byMonth = {};
  const byMethod = {};
  for (const u of unverified) {
    const m = u.createdAt ? new Date(u.createdAt).toISOString().slice(0, 7) : "unknown";
    byMonth[m] = (byMonth[m] || 0) + 1;
    const social = u.googleId || u.microsoftId || u.autodeskId;
    const k = social ? "social (provider id present)" : u.signupMethod || "password / unrecorded";
    byMethod[k] = (byMethod[k] || 0) + 1;
  }
  say(`\n=== who they are ===`);
  for (const [m, n] of Object.entries(byMonth).sort()) say(`  ${m} : ${n}`);
  for (const [k, n] of Object.entries(byMethod)) say(`  ${k} : ${n}`);
  say(`holding entitlements   : ${unverified.filter((u) => (u.entitlements || []).length).length}`);

  // A handful of real rows, so the shape of the addresses is visible. Masked:
  // this prints to a terminal and gets pasted into messages.
  say(`\n=== sample (masked) ===`);
  for (const u of unverified.slice(0, 12)) {
    const h = hashRecipient(u.email);
    const state = !sentTo.has(h)
      ? "NEVER SENT"
      : openedTo.has(h)
        ? "sent, opened"
        : "sent, not opened";
    say(`  ${mask(u.email).padEnd(30)} ${String(u.createdAt).slice(0, 10)}  ${state}`);
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
