// server/util/prospecting/guards.js
//
// The rules that decide whether a found company or contact may be added:
// deduplication, the suppression list and the daily cap. Pure functions that
// take what the database already holds as Sets, so every rule is tested
// without a database (guards.test.js). store.js does the reads and writes.
import { hashEmail, isNotACompanyDomain, normaliseDomain, normaliseEmail } from "./normalise.js";

export const DEFAULT_DAILY_CAP = 20;
export const MAX_DAILY_CAP = 200;

/**
 * New prospects allowed per Lagos day, from PROSPECT_DAILY_CAP. Anything that
 * is not a whole number in range falls back to the default rather than to
 * "unlimited": a typo in config must never turn the cap off.
 */
export function dailyCap(raw = process.env.PROSPECT_DAILY_CAP) {
  if (raw === undefined || raw === null || String(raw).trim() === "") return DEFAULT_DAILY_CAP;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > MAX_DAILY_CAP) return DEFAULT_DAILY_CAP;
  return n;
}

/** How many more may be added today, never below zero. */
export function remainingToday(cap, foundToday) {
  return Math.max(0, cap - Math.max(0, Number(foundToday) || 0));
}

/**
 * Filters the finder's candidate companies down to the ones that may be
 * added, in the order given, up to `remaining`.
 *
 * @param {object[]} candidates  each with at least `website` or `domain`
 * @param {Set<string>} existingDomains   normalised domains already in Prospect
 * @param {Set<string>} suppressedDomains normalised domains on the Suppression list
 * @returns {{ accepted: object[], skipped: {input: string, domain: string|null, reason: string}[] }}
 *          accepted rows carry their normalised `domain`.
 */
export function screenCandidates({ candidates = [], existingDomains = new Set(), suppressedDomains = new Set(), remaining = 0 }) {
  const accepted = [];
  const skipped = [];
  const seen = new Set();

  for (const c of candidates) {
    const input = String(c?.domain || c?.website || "");
    const domain = normaliseDomain(input);
    const skip = (reason) => skipped.push({ input, domain, reason });

    if (!domain) { skip("invalid_domain"); continue; }
    if (isNotACompanyDomain(domain)) { skip("not_a_company_domain"); continue; }
    if (suppressedDomains.has(domain)) { skip("suppressed"); continue; }
    if (existingDomains.has(domain)) { skip("already_a_prospect"); continue; }
    if (seen.has(domain)) { skip("duplicate_in_batch"); continue; }
    if (accepted.length >= remaining) { skip("daily_cap"); continue; }

    seen.add(domain);
    accepted.push({ ...c, domain });
  }
  return { accepted, skipped };
}

/**
 * Filters Hunter's contacts for one prospect down to the ones that may be
 * stored. Suppression is checked by email hash and by the email's domain, so
 * a firm that asked to be left alone stays alone even if Hunter finds a new
 * person there.
 */
export function screenContacts({
  contacts = [],
  existingEmails = new Set(),
  suppressedHashes = new Set(),
  suppressedDomains = new Set(),
}) {
  const accepted = [];
  const skipped = [];
  const seen = new Set();

  for (const c of contacts) {
    const input = String(c?.email || "");
    const email = normaliseEmail(input);
    const skip = (reason) => skipped.push({ input, email, reason });

    if (!email) { skip("invalid_email"); continue; }
    if (suppressedHashes.has(hashEmail(email))) { skip("suppressed"); continue; }
    if (suppressedDomains.has(normaliseDomain(email))) { skip("suppressed_domain"); continue; }
    if (existingEmails.has(email)) { skip("already_a_contact"); continue; }
    if (seen.has(email)) { skip("duplicate_in_batch"); continue; }

    seen.add(email);
    accepted.push({ ...c, email });
  }
  return { accepted, skipped };
}
