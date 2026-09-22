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
//      forge). Generous enough for a training room signing up together.
//
// Every refusal answers the same way, so a bot learns nothing from it.

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

/** The throttle key: a hash, so no visitor address is stored. */
export function ipKey(ip, env = process.env) {
  return crypto
    .createHash("sha256")
    .update(`${secret(env)}|${String(ip || "unknown")}`)
    .digest("base64url")
    .slice(0, 32);
}

/**
 * "" when this visitor may sign up now, otherwise "per-ip". Records the
 * attempt. `SignupThrottle` holds one short-lived row per accepted sign-up.
 */
export async function throttleProblem(SignupThrottle, ip, { now = new Date() } = {}) {
  const key = ipKey(ip);
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [hour, day] = await Promise.all([
    SignupThrottle.countDocuments({ key, at: { $gte: hourAgo } }),
    SignupThrottle.countDocuments({ key, at: { $gte: dayAgo } }),
  ]);
  if (hour >= PER_IP_HOUR || day >= PER_IP_DAY) return "per-ip";
  await SignupThrottle.create({ key, at: now });
  return "";
}
