// server/util/opsDigest.js
//
// The morning report: what went wrong for customers that nobody told us about.
//
// Written after September 2026, when two things sat unnoticed for weeks:
//   * Y.S. Associates, 24 seats, could not use any ADLM desktop software from
//     8 July. Their support ticket was marked resolved on 21 July while the
//     software stayed dark. We found out by phoning them in September.
//   * Their dashboard read "Failed to fetch", and the server logged nothing,
//     because the requests never arrived.
//
// Every morning this rebuilds the call desk, then emails the people who act on
// it:
//   1. customers whose paid desktop software has gone quiet
//   2. support tickets marked fixed where the software never came back
//   3. tickets nobody has picked up
//   4. customers whose browser could not reach ADLM
//   5. whether SES can reach customers at all
//
// It is sent even when every section is empty. The report arriving IS the
// signal that the daily job is alive; infra/lib/adlm-ops-alerts-stack.ts
// alarms when it stops, by watching for the "[ops-digest] sent" log line.
//
// Mail goes through SES directly, never through a reseller. Each recipient is
// a separate send, so one address SES will not accept (an unverified address
// while the account is in the sandbox) cannot stop the others.

import mongoose from "mongoose";
import dayjs from "dayjs";
import { SESv2Client, GetAccountCommand } from "@aws-sdk/client-sesv2";
import { FollowUp } from "../models/FollowUp.js";
import { SupportTicket } from "../models/SupportTicket.js";
import { UsageSession } from "../models/UsageSession.js";
import { User } from "../models/User.js";
import { ClientNetError } from "../models/ClientNetError.js";
import { rebuildFollowUps } from "./followUps.js";
import { sendViaSes } from "./sesTransport.js";
import { wrapEmail } from "./emailLayout.js";

const SITE = process.env.PUBLIC_SITE_URL || "https://www.adlmstudio.net";
const DEFAULT_TO = "dolapo836@gmail.com";

// A licence crossing into "quiet" today, not one that has been quiet for months.
const NEW_WINDOW_DAYS = 2;
const SILENT_AFTER_DAYS = 14;
const NEVER_USED_GRACE_DAYS = 7;
// A fix is only confirmed when the software is seen again. Give it this long.
const CONFIRM_WITHIN_DAYS = 3;
const CONFIRM_LOOKBACK_DAYS = 30;
const WAITING_AFTER_DAYS = 2;
const LIST_LIMIT = 15;

/** OPS_DIGEST_TO, comma or space separated. */
export function recipients(raw = process.env.OPS_DIGEST_TO) {
  const list = String(raw || DEFAULT_TO)
    .split(/[\s,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  return [...new Set(list)];
}

/* ───────────────────────────────────────────────────────────── lock ── */

async function acquireLock(id, ttlMinutes) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);
  const col = mongoose.connection.collection("job_locks");
  const upd = await col.findOneAndUpdate(
    { _id: id, $or: [{ expiresAt: { $lt: now } }, { expiresAt: { $exists: false } }] },
    { $set: { expiresAt, lockedAt: now } },
    { returnDocument: "after" },
  );
  if (upd) return true;
  try {
    await col.insertOne({ _id: id, expiresAt, lockedAt: now });
    return true;
  } catch {
    return false;
  }
}

async function releaseLock(id) {
  try {
    await mongoose.connection.collection("job_locks").deleteOne({ _id: id });
  } catch {
    // an expired lock is taken over on the next run anyway
  }
}

/* ─────────────────────────────────────────────────────────── gather ── */

const nameOf = (r) =>
  [r.firstName, r.lastName].map((s) => String(s || "").trim()).filter(Boolean).join(" ") ||
  String(r.email || "").split("@")[0];

export function isNewlySilent(silence) {
  if (!silence) return false;
  const d = Number(silence.days);
  if (!Number.isFinite(d)) return false;
  const start = silence.neverUsed ? NEVER_USED_GRACE_DAYS : SILENT_AFTER_DAYS;
  return d >= start && d < start + NEW_WINDOW_DAYS;
}

async function sesState() {
  try {
    const region = process.env.SES_REGION || process.env.AWS_REGION || "eu-west-1";
    const a = await new SESv2Client({ region }).send(new GetAccountCommand({}));
    return {
      production: !!a.ProductionAccessEnabled,
      review: String(a.Details?.ReviewDetails?.Status || ""),
      sent24h: Number(a.SendQuota?.SentLast24Hours || 0),
      max24h: Number(a.SendQuota?.Max24HourSend || 0),
    };
  } catch (e) {
    return { error: String(e?.name || e?.message || "unavailable") };
  }
}

export async function gatherDigest({ now = new Date() } = {}) {
  const t = dayjs(now);

  // 1) quiet paid software, from the call desk the caller just rebuilt
  const silentRows = await FollowUp.find(
    { active: true, reasons: "silent" },
    { firstName: 1, lastName: 1, email: 1, phone: 1, firmName: 1, status: 1, callCount: 1, silence: 1 },
  ).lean();
  const silent = (silentRows || [])
    .map((r) => ({
      name: nameOf(r),
      firm: String(r.firmName || r.silence?.organizationName || "").trim(),
      email: r.email,
      phone: String(r.phone || "").trim(),
      status: r.status || "to_call",
      calls: Number(r.callCount || 0),
      seats: Number(r.silence?.seats || 0),
      days: r.silence?.days ?? null,
      neverUsed: !!r.silence?.neverUsed,
      products: (r.silence?.products || []).map((p) => p.productName || p.productKey),
      isNew: isNewlySilent(r.silence),
    }))
    .sort((a, b) => b.seats - a.seats || (b.days ?? 0) - (a.days ?? 0));

  // 2) tickets marked fixed where the software never checked in again
  const tickets = await SupportTicket.find(
    {
      status: { $in: ["resolved", "closed"] },
      resolvedAt: {
        $gte: t.subtract(CONFIRM_LOOKBACK_DAYS, "day").toDate(),
        $lte: t.subtract(CONFIRM_WITHIN_DAYS, "day").toDate(),
      },
      productKey: { $nin: ["", null] },
      userId: { $ne: null },
    },
    { userId: 1, userFullName: 1, userEmail: 1, whatsapp: 1, title: 1, productKey: 1, resolvedAt: 1 },
  ).lean();

  const unconfirmed = [];
  for (const tk of tickets || []) {
    const u = await User.findById(tk.userId, { entitlements: 1 }).lean();
    const ent = (u?.entitlements || []).find(
      (e) => String(e.productKey || "").toLowerCase() === String(tk.productKey).toLowerCase(),
    );
    if (!ent) continue;
    const after = new Date(tk.resolvedAt).getTime();
    const seen = (ent.devices || []).some((d) => d?.lastSeenAt && new Date(d.lastSeenAt).getTime() > after);
    if (seen) continue;
    const used = await UsageSession.exists({
      userId: tk.userId,
      productKey: tk.productKey,
      lastPingAt: { $gt: tk.resolvedAt },
    });
    if (used) continue;
    unconfirmed.push({
      name: String(tk.userFullName || "").trim() || String(tk.userEmail || "").split("@")[0],
      email: tk.userEmail,
      phone: String(tk.whatsapp || "").trim(),
      title: tk.title,
      productKey: tk.productKey,
      resolvedAt: tk.resolvedAt,
      daysSince: t.diff(dayjs(tk.resolvedAt), "day"),
    });
  }

  // 3) tickets nobody has picked up
  const waitingDocs = await SupportTicket.find(
    { status: "open", createdAt: { $lte: t.subtract(WAITING_AFTER_DAYS, "day").toDate() } },
    { userFullName: 1, userEmail: 1, title: 1, productKey: 1, createdAt: 1 },
  )
    .sort({ createdAt: 1 })
    .lean();
  const waiting = (waitingDocs || []).map((tk) => ({
    name: String(tk.userFullName || "").trim() || String(tk.userEmail || "").split("@")[0],
    email: tk.userEmail,
    title: tk.title,
    productKey: tk.productKey || "",
    ageDays: t.diff(dayjs(tk.createdAt), "day"),
  }));

  // 4) browsers that could not reach the API in the last day
  const netFails = await ClientNetError.aggregate([
    { $match: { at: { $gte: t.subtract(1, "day").toDate() } } },
    {
      $group: {
        _id: { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ["$email", ""] } }, 0] }, "$email", "(not signed in)"] },
        count: { $sum: 1 },
        paths: { $addToSet: "$path" },
        last: { $max: "$at" },
      },
    },
    { $sort: { count: -1 } },
    { $limit: LIST_LIMIT },
  ]);

  // 5) can SES reach customers?
  const ses = await sesState();

  return {
    at: now,
    silent,
    unconfirmed,
    waiting,
    netFails: (netFails || []).map((r) => ({
      who: r._id,
      count: r.count,
      paths: (r.paths || []).slice(0, 4),
      last: r.last,
    })),
    ses,
  };
}

/* ──────────────────────────────────────────────────────────── build ── */

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const FONT = "font-family:Arial,Helvetica,sans-serif;";
const h2 = (t) =>
  `<h2 style="margin:24px 0 8px;${FONT}font-size:16px;color:#0E1620;font-weight:bold">${t}</h2>`;
const p = (html) => `<p style="margin:0 0 10px;${FONT}font-size:14px;line-height:1.55;color:#0E1620">${html}</p>`;
const muted = (html) => `<p style="margin:0 0 10px;${FONT}font-size:13px;line-height:1.5;color:#4A5A6B">${html}</p>`;

function table(headers, rows) {
  const th = headers
    .map((h) => `<th align="left" style="padding:6px 8px;border-bottom:1px solid #E2E8F0;${FONT}font-size:12px;color:#4A5A6B">${h}</th>`)
    .join("");
  const tr = rows
    .map(
      (r) =>
        `<tr>${r
          .map((c) => `<td valign="top" style="padding:6px 8px;border-bottom:1px solid #F0F3F7;${FONT}font-size:13px;color:#0E1620">${c}</td>`)
          .join("")}</tr>`,
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0 0 6px">${th ? `<tr>${th}</tr>` : ""}${tr}</table>`;
}

const fmt = (d) => (d ? dayjs(d).format("D MMM") : "");
const quietFor = (s) => (s.neverUsed ? "never used" : s.days == null ? "unknown" : `${s.days} days`);

export function buildDigest(data) {
  const silent = data.silent || [];
  const fresh = silent.filter((s) => s.isNew);
  const unconfirmed = data.unconfirmed || [];
  const waiting = data.waiting || [];
  const netFails = data.netFails || [];
  const ses = data.ses || {};
  const sesBlocked = ses.production === false;

  const parts = [
    `${silent.length} quiet customer${silent.length === 1 ? "" : "s"}${fresh.length ? ` (${fresh.length} new)` : ""}`,
  ];
  if (unconfirmed.length) parts.push(`${unconfirmed.length} unconfirmed fix${unconfirmed.length === 1 ? "" : "es"}`);
  if (waiting.length) parts.push(`${waiting.length} ticket${waiting.length === 1 ? "" : "s"} waiting`);
  if (netFails.length) parts.push(`${netFails.length} blocked browser${netFails.length === 1 ? "" : "s"}`);
  if (sesBlocked) parts.push("SES sandbox");
  const subject = `ADLM daily watch: ${parts.join(", ")}`;

  let body = p(
    `Good morning. This is what needs a person today, as of ${esc(dayjs(data.at).format("ddd D MMM YYYY, HH:mm"))} UTC.`,
  );

  // 1
  body += h2(`Customers whose software has gone quiet (${silent.length})`);
  if (!silent.length) {
    body += muted("Every paid desktop licence has been used in the last two weeks.");
  } else {
    body += muted(
      "Paid desktop licences with no sign-in or usage for 14 days or more, largest first. " +
        "A firm in this list is either stuck or drifting away, so it is worth a call this week. " +
        (fresh.length ? `<b>${fresh.length}</b> crossed the line in the last two days, marked NEW.` : ""),
    );
    body += table(
      ["Customer", "Seats", "Quiet for", "Software", "Call desk"],
      silent.slice(0, LIST_LIMIT).map((s) => [
        `${s.isNew ? "<b>NEW</b> " : ""}<b>${esc(s.firm || s.name)}</b><br><span style="color:#4A5A6B">${esc(s.firm ? s.name : "")}${s.firm ? " · " : ""}${esc(s.phone || s.email)}</span>`,
        esc(s.seats),
        esc(quietFor(s)),
        esc(s.products.join(", ")),
        esc(s.calls ? `${s.calls} call${s.calls === 1 ? "" : "s"}` : "not called"),
      ]),
    );
    if (silent.length > LIST_LIMIT) body += muted(`And ${silent.length - LIST_LIMIT} more on the call desk.`);
  }

  // 2
  body += h2(`Fixes nobody has confirmed (${unconfirmed.length})`);
  if (!unconfirmed.length) {
    body += muted("Every ticket marked fixed in the last month has seen its software used again.");
  } else {
    body += muted(
      "Tickets marked resolved at least three days ago where the customer's software has not been used since. " +
        "The fix may not have worked. Ring them.",
    );
    body += table(
      ["Customer", "Ticket", "Software", "Marked fixed"],
      unconfirmed.slice(0, LIST_LIMIT).map((u) => [
        `<b>${esc(u.name)}</b><br><span style="color:#4A5A6B">${esc(u.phone || u.email)}</span>`,
        esc(u.title),
        esc(u.productKey),
        `${esc(fmt(u.resolvedAt))} (${esc(u.daysSince)} days ago)`,
      ]),
    );
  }

  // 3
  body += h2(`Tickets waiting on us (${waiting.length})`);
  body += waiting.length
    ? table(
        ["Customer", "Ticket", "Open for"],
        waiting.slice(0, LIST_LIMIT).map((w) => [esc(w.name), esc(w.title), `${esc(w.ageDays)} days`]),
      )
    : muted("No ticket has been left open for more than two days.");

  // 4
  body += h2(`Customers whose browser could not reach ADLM (${netFails.length})`);
  body += netFails.length
    ? muted(
        "In the last 24 hours these browsers reported requests that never arrived. " +
          "Usually a firewall, proxy or antivirus at the customer's end. Send them to " +
          `<a href="${SITE}/network-check">${SITE.replace(/^https?:\/\//, "")}/network-check</a>.`,
      ) +
      table(
        ["Who", "Failures", "What failed", "Last"],
        netFails.map((n) => [esc(n.who), esc(n.count), esc(n.paths.join(", ")), esc(dayjs(n.last).format("HH:mm"))]),
      )
    : muted("No browser reported a failed request.");

  // 5
  body += h2("Email to customers");
  if (ses.error) {
    body += muted(`Could not read the SES account (${esc(ses.error)}).`);
  } else if (sesBlocked) {
    body += p(
      `<b>SES is still in the sandbox.</b> It can only deliver to verified addresses, so it cannot reach customers. ` +
        `Production access review status: ${esc(ses.review || "none")}.`,
    );
  } else {
    body += muted(`SES is in production. ${esc(ses.sent24h)} of ${esc(ses.max24h)} daily messages used.`);
  }

  body += `<div style="height:6px"></div>`;
  body += muted(
    "This report arrives every morning, even when there is nothing to do. If it stops arriving, the daily job has " +
      "failed, and an AWS alarm will say so after two days.",
  );

  const html = wrapEmail({
    title: "Daily watch",
    preheader: subject.replace(/^ADLM daily watch: /, ""),
    body,
    cta: { label: "Open the call desk", href: `${SITE}/admin/follow-ups` },
    footNote: "Sent to ADLM staff only.",
  });

  const text = [
    subject,
    "",
    `Quiet customers: ${silent.length}`,
    ...silent.slice(0, LIST_LIMIT).map((s) => `  ${s.isNew ? "NEW " : ""}${s.firm || s.name} - ${s.seats} seats - ${quietFor(s)} - ${s.phone || s.email}`),
    `Unconfirmed fixes: ${unconfirmed.length}`,
    ...unconfirmed.map((u) => `  ${u.name} - ${u.title} - ${u.productKey}`),
    `Tickets waiting: ${waiting.length}`,
    ...waiting.map((w) => `  ${w.name} - ${w.title} - ${w.ageDays} days`),
    `Blocked browsers: ${netFails.length}`,
    ...netFails.map((n) => `  ${n.who} - ${n.count} failures`),
    sesBlocked ? "SES is still in the sandbox: customers cannot be reached." : "",
    "",
    `${SITE}/admin/follow-ups`,
  ].join("\n");

  return { subject, html, text };
}

/* ────────────────────────────────────────────────────────────── run ── */

export async function runOpsDigest({ now = new Date(), dryRun = false } = {}) {
  const LOCK = "ops_digest_v1";
  if (!(await acquireLock(LOCK, 15))) return { ok: false, skipped: true, reason: "lock-held" };

  try {
    const rebuilt = await rebuildFollowUps();
    const data = await gatherDigest({ now });
    const mail = buildDigest(data);
    const to = recipients();

    const summary = {
      rebuilt: { total: rebuilt.total, created: rebuilt.created, retired: rebuilt.retired },
      silent: data.silent.length,
      newlySilent: data.silent.filter((s) => s.isNew).length,
      unconfirmed: data.unconfirmed.length,
      waiting: data.waiting.length,
      netFails: data.netFails.length,
      sesProduction: data.ses.production ?? null,
    };
    if (dryRun) return { ok: true, dryRun: true, to, subject: mail.subject, ...summary };

    const sent = [];
    const failed = [];
    for (const addr of to) {
      try {
        await sendViaSes({
          from: process.env.EMAIL_FROM || "ADLM Studio <admin@adlmstudio.net>",
          to: [addr],
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
        });
        sent.push(addr);
      } catch (e) {
        failed.push({ to: addr, error: String(e?.name || e?.message || e) });
        console.error(`[ops-digest] not sent to ${addr}: ${e?.name || ""} ${e?.message || e}`);
      }
    }

    // The watchdog alarm counts this exact phrase. Keep it.
    if (sent.length) console.log(`[ops-digest] sent to ${sent.length} of ${to.length}: ${mail.subject}`);

    return { ok: sent.length > 0, sent, failed, subject: mail.subject, ...summary };
  } finally {
    await releaseLock(LOCK);
  }
}

export default runOpsDigest;
