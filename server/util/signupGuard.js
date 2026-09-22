// Sign-up protection (2026-09-22).
//
// From 14 Sep a steady trickle of sign-ups arrived that never signed in and
// never confirmed (134 by 22 Sep), with addresses that bounce or belong to
// people who then marked our verification email as spam. Every one of them
// cost a verification email through SES and a little of our sender reputation.
//
// Three checks, none of which needs a third-party key:
//
//   1. A hidden field (`company_website`) that people never see or fill. Form
//      bots fill every field they find.
//   2. A signed form ticket. The page asks GET /auth/signup-ticket when the
//      form opens; POST /auth/signup refuses one without a valid ticket, one
//      sent sooner than MIN_FILL_MS after it was issued, or one older than
//      MAX_AGE_MS. A script posting straight to the API has no ticket.
//   3. A cap per visitor, counted in the database so it holds across Lambda
//      instances, on the visitor address CloudFront saw (not one a bot can
//      forge), an IPv6 visitor by its /64 network. Only accounts actually
//      created count, and the counter is atomic, so neither junk requests nor
//      a burst in parallel gets round it. Generous enough for a training room.
//
// Every refusal answers the same way, so a bot learns nothing from it.
// SIGNUP_GUARD=off switches all three off (an emergency valve, logged).

import crypto from "node:crypto";

export const MIN_FILL_MS = 3000;
export const MAX_AGE_MS = 2 * 60 * 60 * 1000;
export const PER_IP_HOUR = 20;
export const PER_IP_DAY = 60;
export const HONEYPOT_FIELD = "company_website";
export const REFUSAL = "Sign-up could not be completed. Please refresh the page and try again.";

const secret = (env = process.env) =>
  String(env.SIGNUP_TICKET_SECRET || env.JWT_ACCESS_SECRET || "").trim();

const sign = (body, key) => crypto.createHmac("sha256", key).update(body).digest("base64url");

/** A ticket for the sign-up form: issued-at, a nonce, and a signature. */
export function issueTicket({ now = Date.now(), env = process.env } = {}) {
  const key = secret(env);
  if (!key) return "";
  const body = `${now}.${crypto.randomBytes(9).toString("base64url")}`;
  return `${body}.${sign(body, key)}`;
}

/** "" when the ticket is good, otherwise the reason (for our logs only). */
export function ticketProblem(ticket, { now = Date.now(), env = process.env } = {}) {
  const key = secret(env);
  if (!key) return ""; // nothing to sign with: do not lock everybody out
  const parts = String(ticket || "").split(".");
  if (parts.length !== 3) return "no-ticket";
  const [issued, nonce, mac] = parts;
  const expect = sign(`${issued}.${nonce}`, key);
  const a = Buffer.from(mac);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return "bad-ticket";
  const age = now - Number(issued);
  if (!Number.isFinite(age) || age < 0) return "bad-ticket";
  if (age < MIN_FILL_MS) return "too-fast";
  if (age > MAX_AGE_MS) return "expired";
  return "";
}

export function guardOff(env = process.env) {
  return /^(off|0|false|no)$/i.test(String(env.SIGNUP_GUARD || "").trim());
}

export function honeypotTripped(body) {
  return String(body?.[HONEYPOT_FIELD] ?? "").trim() !== "";
}

/**
 * The visitor's address. CloudFront appends the viewer it saw to
 * X-Forwarded-For, and API Gateway then appends CloudFront, so the viewer is
 * the second entry from the right. Anything to its left came from the client
 * and can be made up. CloudFront-Viewer-Address, when forwarded, is best.
 */
export function visitorIp(req) {
  const viewer = String(req?.headers?.["cloudfront-viewer-address"] || "").trim();
  if (viewer) return viewer.replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  const xff = String(req?.headers?.["x-forwarded-for"] || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (xff.length >= 2) return xff[xff.length - 2];
  return String(req?.ip || xff[0] || "").replace(/^::ffff:/, "");
}

/**
 * What the cap counts: an IPv4 address whole, an IPv6 address by its /64
 * network (one household or server gets a whole /64 and can rotate through
 * it freely).
 */
export function visitorNetwork(ip) {
  const s = String(ip || "").trim().replace(/%.*$/, "").replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, "");
  if (!s.includes(":")) return s || "unknown";
  const [head, tail] = s.split("::");
  const h = head ? head.split(":") : [];
  const t = tail === undefined ? null : tail ? tail.split(":") : [];
  const full = t === null ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t];
  return `${full
    .slice(0, 4)
    .map((x) => (x || "0").toLowerCase().replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}

/** The throttle key: a hash, so no visitor address is stored. */
export function ipKey(ip, env = process.env) {
  return crypto
    .createHash("sha256")
    .update(`${secret(env)}|${visitorNetwork(ip)}`)
    .digest("base64url")
    .slice(0, 32);
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

async function bump(SignupThrottle, key, bucket, by, expireAt) {
  const q = { key, bucket };
  const u = { $inc: { n: by }, ...(by > 0 ? { $setOnInsert: { expireAt } } : {}) };
  try {
    return await SignupThrottle.findOneAndUpdate(q, u, { upsert: by > 0, new: true, lean: true });
  } catch (err) {
    // Two first requests racing to create the same counter: one wins, the
    // other retries into it.
    if (err?.code === 11000) return SignupThrottle.findOneAndUpdate(q, u, { new: true, lean: true });
    throw err;
  }
}

/**
 * Reserve a sign-up for this visitor: an atomic count in an hour bucket and a
 * day bucket. Over either cap, the reservation is handed back and the answer
 * is "per-ip". Call it just before the account is created, and call
 * `release()` if creating it then fails, so only real accounts count.
 */
export async function reserveSignup(SignupThrottle, ip, { now = new Date() } = {}) {
  const key = ipKey(ip);
  const t = now.getTime();
  const buckets = [
    { bucket: `h${Math.floor(t / HOUR)}`, cap: PER_IP_HOUR, expireAt: new Date(t + 2 * HOUR) },
    { bucket: `d${Math.floor(t / DAY)}`, cap: PER_IP_DAY, expireAt: new Date(t + DAY + HOUR) },
  ];
  const taken = [];
  const release = () => Promise.all(taken.map((b) => bump(SignupThrottle, key, b, -1)));
  for (const b of buckets) {
    const doc = await bump(SignupThrottle, key, b.bucket, 1, b.expireAt);
    taken.push(b.bucket);
    if ((doc?.n || 0) > b.cap) {
      await release();
      return { problem: "per-ip", release: async () => {} };
    }
  }
  return { problem: "", release };
}
