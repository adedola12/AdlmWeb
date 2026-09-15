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

/**
 * The marketing unsubscribe link.
 *
 * On the API host, for the same reason the video one is — and this one was
 * ALREADY BROKEN in production rather than newly at risk. /unsubscribe is an
 * API route, and adlmstudio.net is the Vercel front end, whose config rewrites
 * `/(.*)` to index.html. Curling the live URL returns 200 and the React shell.
 *
 * It presumably worked when the API and the site were one Render process, and
 * broke silently in the move to Lambda — which means every campaign sent since
 * has carried an opt-out link that quietly did nothing. That is worse than the
 * video bug, because those messages have already gone out.
 *
 * Fixing it here cannot repair links already sitting in inboxes. What it does
 * is make the switch in account settings the honest route for anybody who has
 * given up on the link, and stop the next campaign repeating it.
 */
export const unsubscribeUrl = (userId) =>
  `${API_BASE()}/unsubscribe?t=${encodeURIComponent(unsubscribeToken(userId))}`;

/* ────────────────────────────────────────────────────── topic unsubscribe ── */

/**
 * The same idea, scoped to ONE kind of mail.
 *
 * The plain token above says "this is user X" and the route it opens turns off
 * marketing. As soon as there is more than one list, that is too blunt: a
 * token minted for the video list must not be usable to switch off everything
 * else, or a leaked link from a tutorial announcement quietly costs the
 * account its renewal notices too.
 *
 * So the topic is INSIDE the signed material rather than beside it. Changing
 * `videos` to `marketing` in the URL changes what is hashed, the MAC no longer
 * matches, and the link is refused. That is the whole mechanism — there is
 * nothing to look up and nothing to store.
 */
const signTopic = (topic, id) =>
  crypto
    .createHmac("sha256", SECRET)
    .update(`${topic}:${id}`)
    .digest("hex")
    .slice(0, 32);

export function topicUnsubscribeToken(topic, userId) {
  return `${topic}.${userId}.${signTopic(topic, userId)}`;
}

/**
 * Returns the user id, or null if the token is not one we issued FOR THIS
 * TOPIC. A well-formed token for a different topic is rejected, not accepted
 * as a general-purpose unsubscribe.
 */
export function readTopicUnsubscribeToken(topic, token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  const [gotTopic, id, mac] = parts;
  if (!gotTopic || !id || !mac) return null;
  // Compared before the MAC so a mismatched topic is refused on its own terms
  // rather than surfacing as a confusing signature failure.
  if (gotTopic !== topic) return null;

  const expect = Buffer.from(signTopic(topic, id));
  const got = Buffer.from(mac);
  // timingSafeEqual throws on a length mismatch, so the length is checked
  // first — a truncated token must be refused, not crash the request.
  if (expect.length !== got.length || !crypto.timingSafeEqual(expect, got)) return null;
  return id;
}

export const VIDEO_TOPIC = "videos";

/**
 * Where the "stop these" line in a video announcement points.
 *
 * BUILT FROM THE API HOST, NOT THE SITE HOST
 *
 * This was PUBLIC_SITE_URL and it was wrong, in the way that only shows up in
 * production. The route is served by the API, which lives on
 * api.adlmstudio.net; adlmstudio.net is the Vercel front end, whose config
 * rewrites `/(.*)` to index.html. So the link returned 200 and the React shell
 * rather than the unsubscribe page — every recipient who clicked "stop these"
 * would have landed on the marketing site and stayed subscribed.
 *
 * Worth being blunt about the severity: an unsubscribe link that silently does
 * nothing is not a broken link, it is a bulk mailing with no working opt-out,
 * and that is the one defect in this whole feature with a legal edge to it.
 *
 * Absolute, and taken from configuration rather than from a request, because
 * the only place this URL is ever read is an inbox — there is no request to
 * take a host from by the time somebody clicks it, possibly months later.
 */
const API_BASE = () =>
  String(process.env.API_BASE_URL || "").trim().replace(/\/+$/, "") ||
  `http://localhost:${process.env.PORT || 4000}`;

/**
 * Refuse to build unsubscribe links that cannot work.
 *
 * The localhost fallback above is right for a laptop and catastrophic in
 * production: unset on Lambda, every message in a mailshot would carry
 * http://localhost:4000/... as its opt-out. That is the same failure this file
 * just fixed — a link that resolves to nothing — only less visible, because at
 * least the front end returned a page.
 *
 * Checked ONCE before a run rather than per recipient, so the answer is "this
 * send did not start" rather than four hundred identical errors and some
 * unknown number of messages already gone.
 *
 * Throws rather than warns. A bulk send with no working opt-out is the one
 * outcome here worth stopping the world for.
 */
export function assertUnsubscribeLinksWork() {
  const configured = String(process.env.API_BASE_URL || "").trim();
  if (configured) return;

  // Anywhere that is not obviously a developer's machine.
  if (process.env.NODE_ENV === "production" || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    throw new Error(
      "API_BASE_URL is not set, so every unsubscribe link would point at localhost. " +
        "Refusing to send. Set it to the API host (https://api.adlmstudio.net).",
    );
  }
}

export const videoUnsubscribeUrl = (userId) =>
  `${API_BASE()}/api/email/unsubscribe/${encodeURIComponent(
    topicUnsubscribeToken(VIDEO_TOPIC, userId),
  )}`;

/* ─────────────────────────────────────────────────────────────── audiences ── */

/**
 * The people a campaign would go to.
 *
 * Note what is NOT filtered here: opting out and being unverified are counted
 * at send time instead, so the draft can honestly say "300 people, 40 of whom
 * have opted out" rather than quietly showing 260 and leaving somebody to
 * wonder where the rest went.
 */
// NOT async, deliberately: it returns the QUERY so callers can chain
// .select() or .countDocuments() onto it. Marked async, every branch would be
// wrapped in a promise and both of those calls would fail at runtime with
// "not a function" - which is exactly what happened.
export function resolveAudience(audience, productKey = "") {
  const base = {
    disabled: { $ne: true },
    email: { $exists: true, $ne: "" },
    // Excluded in the QUERY, unlike opting out and being unverified, which are
    // counted at send time so the draft can explain itself. An address that
    // bounced permanently is not a consent figure worth reporting — nobody is
    // there to have an opinion — and every send to it costs reputation that
    // belongs to the people who ARE reading.
    emailUndeliverable: { $ne: true },
  };

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
