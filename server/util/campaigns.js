// Who a campaign goes to, and how somebody gets off the list.
//
// THE UNSUBSCRIBE LINK CARRIES NO SESSION
//
// It has to work from an email, on a phone, in a browser nobody is signed in
// to, months later. So the link carries a signed token rather than requiring
// a login: the user id plus an HMAC of it. That means it cannot be guessed,
// cannot be edited into somebody else's id, and needs nothing stored.
//
// It is deliberately NOT reversible into anything else. The token unsubscribes
// and does nothing more — it is not a session, it cannot read the account, and
// if it leaks the worst somebody can do is stop that person's newsletter.

import crypto from "crypto";
import { User } from "../models/User.js";

const SITE = process.env.PUBLIC_SITE_URL || "https://adlmstudio.net";

/**
 * The secret the token is signed with.
 *
 * Falls back to the JWT secret so this works without new configuration, but
 * a dedicated one is better: it means an unsubscribe token can never be
 * confused with, or become useful against, an auth token.
 */
const SECRET =
  process.env.UNSUBSCRIBE_SECRET || process.env.JWT_SECRET || "adlm-unsubscribe";

const sign = (id) =>
  crypto.createHmac("sha256", SECRET).update(String(id)).digest("hex").slice(0, 32);

export function unsubscribeToken(userId) {
  return `${userId}.${sign(userId)}`;
}

/** Returns the user id, or null if the token is not one we issued. */
export function readUnsubscribeToken(token) {
  const [id, mac] = String(token || "").split(".");
  if (!id || !mac) return null;
  const expect = Buffer.from(sign(id));
  const got = Buffer.from(mac);
  if (expect.length !== got.length || !crypto.timingSafeEqual(expect, got)) return null;
  return id;
}

export const unsubscribeUrl = (userId) =>
  `${SITE}/unsubscribe?t=${encodeURIComponent(unsubscribeToken(userId))}`;

/* ─────────────────────────────────────────────────────────────── audiences ── */

/**
 * The people a campaign would go to.
 *
 * Note what is NOT filtered here: opting out and being unverified are counted
 * at send time instead, so the draft can honestly say "300 people, 40 of whom
 * have opted out" rather than quietly showing 260 and leaving somebody to
 * wonder where the rest went.
 */
export async function resolveAudience(audience, productKey = "") {
  const base = { disabled: { $ne: true }, email: { $exists: true, $ne: "" } };

  const ACTIVE = { $elemMatch: { status: "active" } };

  if (audience === "customers") {
    return User.find({ ...base, entitlements: ACTIVE });
  }

  if (audience === "lapsed") {
    // Has entitlements, but none of them active. "Had one once and let it go"
    // is a different conversation from "never bought anything".
    return User.find({
      ...base,
      "entitlements.0": { $exists: true },
      entitlements: { $not: ACTIVE },
    });
  }

  if (audience === "never-bought") {
    return User.find({ ...base, "entitlements.0": { $exists: false } });
  }

  if (audience === "product") {
    const key = String(productKey || "").toLowerCase();
    // A query that matches nobody, rather than an empty array: every caller
    // treats the return value as a query, and one branch handing back a plain
    // array is how .countDocuments() becomes "not a function" at the worst
    // possible moment.
    if (!key) return User.find({ _id: null });
    return User.find({
      ...base,
      entitlements: { $elemMatch: { productKey: key, status: "active" } },
    });
  }

  return User.find(base);
}

export const AUDIENCES = [
  {
    key: "everyone",
    name: "Everyone with an account",
    note: "Every account that is not disabled.",
  },
  {
    key: "customers",
    name: "Current customers",
    note: "Holds at least one product that is active today.",
  },
  {
    key: "lapsed",
    name: "Lapsed customers",
    note: "Bought something once and holds nothing active now.",
  },
  {
    key: "never-bought",
    name: "Signed up, never bought",
    note: "Has an account and has never held a product.",
  },
  {
    key: "product",
    name: "Holders of one product",
    note: "Everybody whose licence for a chosen product is active.",
  },
];

/**
 * A count per audience, for the drafting screen.
 *
 * Counted in the database rather than by loading everybody and taking the
 * length — this runs every time the drafting screen opens, and pulling a few
 * hundred full user documents to display a number is work nobody sees.
 */
export async function audienceSizes() {
  const out = {};
  for (const a of AUDIENCES) {
    if (a.key === "product") continue;
    out[a.key] = await resolveAudience(a.key).countDocuments();
  }
  return out;
}
