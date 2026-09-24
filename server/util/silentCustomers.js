// server/util/silentCustomers.js
//
// Who is paying for ADLM desktop software and not using it.
//
// Y.S. Associates held 32 seats across QUIV, HERON, the MEP plugin and Rate
// Gen, and from 8 July 2026 none of their computers could reach ADLM. Nobody
// here noticed for two months: the website still worked for them, their
// licences were valid, and nothing in the system looked at whether licensed
// software was actually being used. A firm that has stopped using what it
// pays for is either stuck or about to leave, and both are a phone call worth
// making this week, not at renewal.
//
// Each product is judged on its own. Each is a separate paid licence, and when
// Y.S. Associates got Rate Gen working again in September, QUIV, HERON and MEP
// were still dark. An account-level check would have called them healthy.
//
// Two signals per product, because neither is complete on its own:
//   * devices[].lastSeenAt - written when a desktop product signs in or
//     activates. Every product sets it, but only at sign-in.
//   * UsageSession.lastPingAt - heartbeats while a product is open. Only newer
//     builds send them.
// A product is silent when BOTH are older than the threshold. A product that
// has never been used gets a grace period from when the account was last
// granted a licence, so a firm that bought yesterday is not on a call list
// today.
//
// Revoked devices still count as evidence of use: revoking a machine frees a
// seat, it does not change when that machine was last seen.

import dayjs from "dayjs";
import { User } from "../models/User.js";
import { Purchase } from "../models/Purchase.js";
import { UsageSession } from "../models/UsageSession.js";
import { effectiveStatus } from "./followUps.js";

export const DESKTOP_PRODUCTS = new Set([
  "revit",
  "planswift",
  "mep",
  "rategen",
  "civil3d",
  "qs-takeoff",
  "archicad",
]);

export const SILENT_AFTER_DAYS = 14;
export const NEW_LICENCE_GRACE_DAYS = 7;

const DAY = 24 * 60 * 60 * 1000;

function ms(value) {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

const keyOf = (v) => String(v || "").trim().toLowerCase();

/** A desktop licence the customer is currently paying for. */
export function isLiveDesktop(ent, now = new Date()) {
  if (!DESKTOP_PRODUCTS.has(keyOf(ent?.productKey))) return false;
  // Same status rule as the call desk's "expired" reason, so a licence is
  // never both lapsed and silent on the same screen.
  return effectiveStatus(ent, dayjs(now)) === "active";
}

/**
 * Last usage heartbeat for a product. Accepts a map keyed by product, or a
 * single date that applies to every product (older callers and tests).
 */
function usageFor(lastUsageAt, productKey) {
  if (!lastUsageAt) return 0;
  if (lastUsageAt instanceof Map) return ms(lastUsageAt.get(productKey));
  if (typeof lastUsageAt === "object" && !(lastUsageAt instanceof Date)) return ms(lastUsageAt[productKey]);
  return ms(lastUsageAt);
}

/**
 * Decide whether any of one account's paid desktop products has gone quiet.
 *
 * Pure: everything it needs is passed in, so the rule is testable without a
 * database. Returns null when every live product is in use (or there are
 * none), otherwise a snapshot of the SILENT products only:
 *   seats  - seats on the silent products
 *   days   - the shortest quiet spell among them, so "quiet for at least N days"
 *   neverUsed - true only when every silent product has never been used
 */
export function classifySilence({
  entitlements,
  lastUsageAt = null,
  grantedAt = null,
  now = new Date(),
  days = SILENT_AFTER_DAYS,
  graceDays = NEW_LICENCE_GRACE_DAYS,
}) {
  const t = ms(now);
  const live = (Array.isArray(entitlements) ? entitlements : []).filter((e) => isLiveDesktop(e, now));
  if (!live.length) return null;

  const granted = ms(grantedAt);
  const withinGrace = granted && t - granted < graceDays * DAY;

  const silentProducts = [];
  for (const e of live) {
    const productKey = keyOf(e.productKey);
    const seen = (e.devices || []).reduce((m, d) => Math.max(m, ms(d?.lastSeenAt)), 0);
    const last = Math.max(seen, usageFor(lastUsageAt, productKey));

    let quiet;
    if (last) {
      quiet = Math.floor((t - last) / DAY);
      if (quiet < days) continue;
    } else {
      if (withinGrace) continue;
      quiet = granted ? Math.floor((t - granted) / DAY) : null;
    }

    silentProducts.push({
      productKey,
      seats: Math.max(1, Number(e.seats) || 1),
      lastSeenAt: last ? new Date(last) : null,
      days: quiet,
      organizationName: String(e.organizationName || "").trim(),
    });
  }
  if (!silentProducts.length) return null;

  const known = silentProducts.map((p) => p.days).filter((d) => d != null);
  const lastActivity = silentProducts.reduce((m, p) => Math.max(m, ms(p.lastSeenAt)), 0);

  return {
    neverUsed: silentProducts.every((p) => !p.lastSeenAt),
    days: known.length ? Math.min(...known) : null,
    lastActivityAt: lastActivity ? new Date(lastActivity) : null,
    seats: silentProducts.reduce((n, p) => n + p.seats, 0),
    organizationName:
      silentProducts.find((p) => p.organizationName)?.organizationName ||
      String(live.find((e) => String(e.organizationName || "").trim())?.organizationName || "").trim(),
    products: silentProducts.map(({ productKey, seats, lastSeenAt }) => ({ productKey, seats, lastSeenAt })),
  };
}

/**
 * Staff and test accounts hold every licence and use them sporadically. They
 * are not customers, and a call list that opens with our own admin account is
 * a list people stop reading.
 */
export function isStaffAccount(u) {
  const role = String(u?.role || "").toLowerCase();
  if (role && role !== "user") return true;
  if (u?.isGod) return true;
  return /@adlmstudio\.(net|com)$/i.test(String(u?.email || "").trim());
}

/**
 * Every customer with at least one silent paid desktop product, largest first.
 * Returns [{ user, silence }].
 */
export async function collectSilentCustomers({
  now = new Date(),
  days = SILENT_AFTER_DAYS,
  graceDays = NEW_LICENCE_GRACE_DAYS,
} = {}) {
  const users = await User.find(
    { disabled: { $ne: true }, "entitlements.0": { $exists: true } },
    {
      email: 1,
      firstName: 1,
      lastName: 1,
      whatsapp: 1,
      firmName: 1,
      location: 1,
      role: 1,
      isGod: 1,
      createdAt: 1,
      entitlements: 1,
    },
  ).lean();

  const candidates = (users || []).filter(
    (u) => !isStaffAccount(u) && (u.entitlements || []).some((e) => isLiveDesktop(e, now)),
  );
  if (!candidates.length) return [];

  const ids = candidates.map((u) => u._id);
  const [usage, grants] = await Promise.all([
    UsageSession.aggregate([
      { $match: { userId: { $in: ids } } },
      { $group: { _id: { u: "$userId", p: "$productKey" }, last: { $max: "$lastPingAt" } } },
    ]),
    Purchase.aggregate([
      { $match: { userId: { $in: ids }, status: "approved" } },
      { $group: { _id: "$userId", last: { $max: { $ifNull: ["$decidedAt", "$createdAt"] } } } },
    ]),
  ]);

  const usageBy = new Map();
  for (const r of usage || []) {
    const uid = String(r._id?.u);
    if (!usageBy.has(uid)) usageBy.set(uid, new Map());
    usageBy.get(uid).set(keyOf(r._id?.p), r.last);
  }
  const grantBy = new Map((grants || []).map((r) => [String(r._id), r.last]));

  const out = [];
  for (const u of candidates) {
    const silence = classifySilence({
      entitlements: u.entitlements,
      lastUsageAt: usageBy.get(String(u._id)) || null,
      grantedAt: grantBy.get(String(u._id)) || u.createdAt || null,
      now,
      days,
      graceDays,
    });
    if (silence) out.push({ user: u, silence });
  }

  out.sort(
    (a, b) =>
      b.silence.seats - a.silence.seats || (b.silence.days ?? 0) - (a.silence.days ?? 0),
  );
  return out;
}
