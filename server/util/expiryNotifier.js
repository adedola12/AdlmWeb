import dayjs from "dayjs";
import mongoose from "mongoose";
import { User } from "../models/User.js";
import { Product } from "../models/Product.js";
import { sendMail } from "./mailer.js";

const WEB_URL =
  String(
    process.env.PUBLIC_WEB_URL ||
      process.env.PUBLIC_SITE_URL ||
      process.env.PUBLIC_FRONTEND_URL ||
      process.env.PUBLIC_APP_URL || // fallback only
      "",
  ).trim() || "http://localhost:5173";

function joinUrl(base, path) {
  const b = String(base || "").replace(/\/+$/, "");
  const p = String(path || "").replace(/^\/+/, "");
  return `${b}/${p}`;
}

/**
 * Calendar-day style days left:
 * - Expiry on Mar 1 and today is Feb 24 => 5 days left
 * - Expired 5 days ago => -5
 *
 * This matches the wording users expect in emails.
 */
function getDaysLeft(expiresAt) {
  if (!expiresAt) return null;

  const expDay = dayjs(expiresAt).startOf("day");
  if (!expDay.isValid()) return null;

  const today = dayjs().startOf("day");
  return expDay.diff(today, "day"); // can be negative
}

function shouldSendForDays(daysLeft) {
  if (daysLeft == null) return { send: false };

  // Every 5 days BEFORE expiry: 5, 10, 15, ...
  if (daysLeft > 0 && daysLeft % 5 === 0) {
    return { send: true, kind: "pre", days: daysLeft };
  }

  // Every 5 days AFTER expiry: -5, -10, -15, ...
  if (daysLeft < 0 && Math.abs(daysLeft) % 5 === 0) {
    return { send: true, kind: "post", days: Math.abs(daysLeft) };
  }

  return { send: false };
}

function buildExpiryEmailHtml({
  firstName,
  productName,
  productKey,
  kind,
  days,
  expiresAt,
}) {
  const name = String(firstName || "").trim() || "there";
  const expiryDate = expiresAt ? dayjs(expiresAt).format("YYYY-MM-DD") : "—";

  const headline =
    kind === "pre"
      ? `Your access to <b>${productName}</b> will expire in <b>${days} days</b>.`
      : `Your access to <b>${productName}</b> expired <b>${days} days ago</b>.`;

  const sub =
    kind === "pre"
      ? `Expiry date: <b>${expiryDate}</b>`
      : `Expired on: <b>${expiryDate}</b>`;

  // ✅ match your actual frontend routes
const renewLink = joinUrl(
  WEB_URL,
  `/product/${encodeURIComponent(productKey)}`,
);
const dashboardLink = joinUrl(WEB_URL, `/dashboard`);

  const btn = (href, label, bg) => `
    <a href="${href}"
       style="display:inline-block;padding:12px 16px;border-radius:10px;
              background:${bg};color:#ffffff;text-decoration:none;font-weight:600;
              margin-right:10px;margin-top:8px">
      ${label}
    </a>
  `;

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a">
      <h2 style="margin:0 0 10px 0">ADLM Subscription Notice</h2>
      <p style="margin:0 0 12px 0">Hello ${name},</p>

      <p style="margin:0 0 10px 0">${headline}</p>
      <p style="margin:0 0 14px 0;color:#334155">${sub}</p>

      <div style="margin:10px 0 18px 0">
        ${btn(renewLink, "Renew now", "#2563eb")}
        ${btn(dashboardLink, "Open dashboard", "#0f172a")}
      </div>

      <p style="margin:0;color:#475569;font-size:13px">
        If you already renewed, please ignore this message (your access will update after activation).
      </p>

      <p style="margin:18px 0 0 0">Thank you,<br/>ADLM Studio</p>
    </div>
  `;
}

/**
 * ✅ Safe job lock:
 * - try update expired lock
 * - else try insert new lock
 * - if insert fails => lock held
 */
async function acquireJobLock(lockId, ttlMinutes = 10) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);
  const col = mongoose.connection.collection("job_locks");

  // 1) Update if expired
  const upd = await col.findOneAndUpdate(
    {
      _id: lockId,
      $or: [{ expiresAt: { $lt: now } }, { expiresAt: { $exists: false } }],
    },
    { $set: { expiresAt, lockedAt: now } },
    { returnDocument: "after" },
  );

  if (upd?.value) return true;

  // 2) If no lock exists, try insert
  try {
    await col.insertOne({ _id: lockId, expiresAt, lockedAt: now });
    return true;
  } catch {
    return false; // duplicate key => already locked
  }
}

async function releaseJobLock(lockId) {
  try {
    const col = mongoose.connection.collection("job_locks");
    await col.deleteOne({ _id: lockId });
  } catch {
    // ignore
  }
}

export async function runExpiryNotifier({ dryRun = false, limit = 0 } = {}) {
  const LOCK_ID = "expiry_notifier_v1";
  const gotLock = await acquireJobLock(LOCK_ID, 10);
  if (!gotLock) return { ok: false, skipped: true, reason: "lock-held" };

  try {
    // ✅ Your Product model has: key + name (no title)
    const products = await Product.find({}).select("key name").lean();

    // normalize keys to lowercase for lookup
    const productNameByKey = new Map(
      (products || []).map((p) => [
        String(p.key || "").toLowerCase(),
        String(p.name || p.key || "Product"),
      ]),
    );

    const query = {
      disabled: { $ne: true },
      entitlements: { $elemMatch: { expiresAt: { $exists: true, $ne: null } } },
    };

    const cursor = User.find(query)
      .select("email username firstName disabled refreshVersion entitlements")
      .batchSize(100)
      .cursor();

    let scannedUsers = 0;
    let sent = 0;
    let errors = 0;

    for await (const user of cursor) {
      if (!user?.email) continue;
      scannedUsers += 1;

      let touched = false;

      for (const ent of user.entitlements || []) {
        const st = String(ent?.status || "inactive").toLowerCase();

        // ✅ do not email disabled or inactive entitlements
        if (st === "disabled" || st === "inactive") continue;

        const daysLeft = getDaysLeft(ent?.expiresAt);
        const decision = shouldSendForDays(daysLeft);
        if (!decision.send) continue;

        const kind = decision.kind; // pre | post
        const days = decision.days; // positive integer

        // Prevent duplicates for the same day bucket
        const lastKind = ent?.notify?.lastSentKind || null;
        const lastDays = Number.isFinite(ent?.notify?.lastSentDays)
          ? ent.notify.lastSentDays
          : null;

        if (lastKind === kind && lastDays === days) continue;

        const productKeyRaw = String(ent?.productKey || "").trim();
        if (!productKeyRaw) continue;

        const productKey = productKeyRaw.toLowerCase();
        const productName = productNameByKey.get(productKey) || productKeyRaw;

        const subject =
          kind === "pre"
            ? `ADLM: ${productName} access expires in ${days} day${days === 1 ? "" : "s"}`
            : `ADLM: ${productName} access expired ${days} day${days === 1 ? "" : "s"} ago`;

        const html = buildExpiryEmailHtml({
          firstName: user.firstName || user.username || "",
          productName,
          productKey: productKeyRaw,
          kind,
          days,
          expiresAt: ent.expiresAt,
        });

        if (!dryRun) {
          try {
            await sendMail({ to: user.email, subject, html });
          } catch (e) {
            errors += 1;
            console.error(
              "[expiry-notifier] sendMail failed:",
              e?.message || e,
            );
            continue; // don’t update notify if email failed
          }

          // Persist notify marker
          ent.notify = ent.notify || {};
          ent.notify.lastSentAt = new Date();
          ent.notify.lastSentKind = kind;
          ent.notify.lastSentDays = days;

          touched = true;
          sent += 1;

          if (limit > 0 && sent >= limit) break;
        } else {
          sent += 1; // “would send”
          if (limit > 0 && sent >= limit) break;
        }
      }

      if (!dryRun && touched) {
        user.refreshVersion = (user.refreshVersion || 0) + 1;
        await user.save();
      }

      if (limit > 0 && sent >= limit) break;
    }

    return { ok: true, scannedUsers, sent, errors, dryRun };
  } finally {
    await releaseJobLock(LOCK_ID);
  }
}
