// server/util/prospecting/normalise.js
//
// The one place outbound prospecting turns a messy website, host or email
// into the form it is stored and compared in. Deduplication and suppression
// are only as good as this: "https://www.FirmQS.com.ng/about" and
// "info@firmqs.com.ng" must both come out as "firmqs.com.ng", or the same
// firm gets added twice and an opt-out misses.
import crypto from "node:crypto";

const LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const HOST_RE = new RegExp(`^(?=.{1,253}$)(?:${LABEL}\\.)+[a-z]{2,63}$`);

/**
 * Bare lowercase host with no scheme, path, port or leading "www.", or null
 * if the input is not a usable domain. Accepts a URL, a host or an email.
 */
export function normaliseDomain(input) {
  let s = String(input ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s.includes("@") && !s.includes("/")) s = s.slice(s.lastIndexOf("@") + 1);
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  s = s.split(/[/?#]/, 1)[0];
  s = s.slice(s.lastIndexOf("@") + 1); // userinfo
  s = s.replace(/:\d+$/, "").replace(/\.$/, "");
  s = s.replace(/^www\d*\./, "");
  return HOST_RE.test(s) ? s : null;
}

/** Lowercased, trimmed address, or null if it is not an email. */
export function normaliseEmail(input) {
  const s = String(input ?? "").trim().toLowerCase();
  const at = s.lastIndexOf("@");
  if (at < 1 || /\s/.test(s)) return null;
  const domain = s.slice(at + 1);
  return HOST_RE.test(domain) ? s : null;
}

/** Hex SHA-256 of the normalised address, as stored on the Suppression list. */
export function hashEmail(input) {
  const email = normaliseEmail(input);
  return email ? crypto.createHash("sha256").update(email).digest("hex") : null;
}

// Domains that are never a prospect company's own: free mailboxes, social
// networks and business directories. Deduplicating by domain would otherwise
// collapse every firm that uses Gmail, or lists itself on LinkedIn, into one.
export const NOT_A_COMPANY_DOMAIN = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "ymail.com", "rocketmail.com",
  "hotmail.com", "outlook.com", "live.com", "msn.com", "icloud.com", "me.com", "aol.com",
  "proton.me", "protonmail.com", "mail.com", "gmx.com", "zoho.com", "yandex.com",
  "linkedin.com", "facebook.com", "instagram.com", "twitter.com", "x.com", "youtube.com",
  "tiktok.com", "google.com", "wikipedia.org", "medium.com", "nairaland.com",
  "vconnect.com", "finelib.com", "businesslist.com.ng", "ngcontacts.com", "nigeriagalleria.com",
]);

/** Is this normalised domain (or a subdomain of one) on the list above? */
export function isNotACompanyDomain(domain) {
  if (!domain) return true;
  if (NOT_A_COMPANY_DOMAIN.has(domain)) return true;
  for (const d of NOT_A_COMPANY_DOMAIN) if (domain.endsWith(`.${d}`)) return true;
  return false;
}

const LAGOS_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Lagos",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "YYYY-MM-DD" in Africa/Lagos. The daily cap counts by this. */
export function lagosDay(date = new Date()) {
  return LAGOS_DAY.format(date);
}
