// Can this address actually receive mail?
//
// WHY THIS EXISTS
//
// POST /auth/signup accepted anything matching /^[^\s@]+@[^\s@]+\.[^\s@]+$/, so
// it accepted addresses that can never receive anything. Measured on production
// on 4 Oct 2026, the account list held `gmail.ccom`, `gmail.comh` and
// `gmail.con` — domains that do not exist — plus a carrier SMS gateway and a
// Google Cloud IAM service-account address.
//
// The cost of that landed on real customers, not on us. Somebody who typed
// `gmail.con` was handed an account, sent a six-digit code that evaporated, and
// then met util/emailGate.js refusing every request until they entered a code
// they could not possibly have received. Three such accounts were sitting in the
// list marked verified. Telling them at the point of typing — "check that for a
// typo" — is the whole fix, and it happens to also refuse a slice of the
// automated registrations that were arriving daily.
//
// TWO CHECKS, AND THE ORDER MATTERS
//
// The shape check is free and certain. The DNS check costs a lookup and can be
// wrong for reasons that have nothing to do with the address, so it goes second
// and it FAILS OPEN: if DNS cannot be reached, a real person signing up must not
// be turned away because our resolver had a bad moment. Refusing a dead address
// is a courtesy; refusing a live customer is a lost sale.
import dns from "node:dns/promises";

/**
 * Addresses that are not a mailbox a person reads.
 *
 * Deliberately a list of KINDS rather than a blacklist of domains. Carrier
 * email-to-SMS gateways deliver a truncated text message and accept no replies,
 * so a verification code sent to one may arrive unreadable and a receipt is
 * useless; a cloud service-account address has no human owner at all. Neither is
 * somebody who can confirm an account or read an invoice.
 *
 * This is not an anti-abuse list and must not grow into one. A domain blacklist
 * is an arms race that punishes real customers on shared hosts; these entries
 * are here because of what the address IS, which does not change.
 */
const NOT_A_MAILBOX = [
  // Cloud service accounts — no human owner.
  /\.iam\.gserviceaccount\.com$/i,
  // Carrier email-to-SMS and email-to-MMS gateways.
  /^(vtext\.com|txt\.att\.net|mms\.att\.net|tmomail\.net|messaging\.sprintpcs\.com|pm\.sprint\.com|mymetropcs\.com|msg\.fi\.google\.com|vzwpix\.com)$/i,
];

/** The domain part, lowercased, or "" if the address has no usable one. */
export function domainOf(email) {
  const at = String(email || "").lastIndexOf("@");
  if (at < 0) return "";
  return String(email).slice(at + 1).trim().toLowerCase();
}

/**
 * Is this the kind of address a person actually reads mail at?
 *
 * Pure and synchronous, so it is cheap enough to run before anything else and
 * can be unit tested without a resolver.
 */
export function isMailboxShaped(email) {
  const domain = domainOf(email);
  if (!domain) return false;
  return !NOT_A_MAILBOX.some((rx) => rx.test(domain));
}

/* ── the DNS half ────────────────────────────────────────────────────────── */

// A domain's mail routing does not change between two people signing up, and
// `gmail.com` must not cost a lookup every time. Positives are cached longer
// than negatives: a domain that works will keep working, whereas a domain that
// failed may be newly registered, mid-delegation, or the victim of a resolver
// hiccup, and ought to get another chance soon.
const OK_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const BAD_TTL_MS = 10 * 60 * 1000; // 10 minutes
const cache = new Map(); // domain → { ok, at }

// DNS sits in the signup request's critical path, so it gets a short leash.
//
// This is a budget for the WHOLE check, not for each lookup. There are two
// lookups — MX, then A as the RFC 5321 fallback — and giving each its own
// two-second timeout means a resolver that simply never answers adds four
// seconds to somebody's sign-up. The deadline is computed once and both lookups
// race the same clock.
//
// Read at call time rather than at import, so it is configurable in the
// environment the Lambda actually runs in and can be driven by a test.
const dnsBudgetMs = () =>
  Number.parseInt(process.env.SIGNUP_DNS_TIMEOUT_MS || "", 10) || 2000;

/** Reject rather than hang, against a shared deadline. */
function byDeadline(promise, deadline) {
  const left = deadline - Date.now();
  if (left <= 0) return Promise.reject(new Error("dns-timeout"));
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("dns-timeout")), left);
    }),
  ]);
}

/**
 * Does this domain publish anywhere to deliver mail?
 *
 * An MX record is the normal answer. Falling back to A/AAAA is not sloppiness —
 * RFC 5321 says a domain with an address record and no MX accepts mail at that
 * host, and small self-hosted domains in this customer base do exactly that.
 * Skipping the fallback would refuse them.
 *
 * Returns true when it cannot tell. See the fail-open note at the top.
 */
export async function domainCanReceiveMail(domain, { log = console } = {}) {
  const d = String(domain || "").trim().toLowerCase();
  if (!d || !d.includes(".")) return false;

  const hit = cache.get(d);
  if (hit && Date.now() - hit.at < (hit.ok ? OK_TTL_MS : BAD_TTL_MS)) return hit.ok;

  const remember = (ok) => {
    cache.set(d, { ok, at: Date.now() });
    return ok;
  };

  // One clock for both lookups. See dnsBudgetMs above.
  const deadline = Date.now() + dnsBudgetMs();

  // "The domain told us nothing is there" and "we could not ask" look the same
  // from a catch block and mean opposite things. Only the first may refuse an
  // address, so the distinction is made explicitly rather than inferred from
  // whichever branch fell through.
  //
  // DEFINITIVE means the resolver answered and the answer was no such name or no
  // such record. A timeout is not an answer — it carries no .code at all — and
  // neither is SERVFAIL or a refused query.
  const DEFINITIVE = ["ENOTFOUND", "ENODATA", "NXDOMAIN"];
  const isAnswer = (err) => !!err?.code && DEFINITIVE.includes(err.code);

  let mxAnswered = false;
  try {
    const mx = await byDeadline(dns.resolveMx(d), deadline);
    // A single MX of "." is an explicit "this domain sends no mail" (RFC 7505).
    const usable = (mx || []).filter((r) => r?.exchange && r.exchange !== ".");
    if (usable.length) return remember(true);
    mxAnswered = true; // answered, with an empty or null-MX set
  } catch (err) {
    if (!isAnswer(err)) {
      log.warn?.(`[email-reachable] mx lookup for ${d} gave no answer: ${err?.code || err?.message}`);
      return true; // fail open, and deliberately NOT cached
    }
    mxAnswered = true;
  }

  try {
    const a = await byDeadline(dns.resolve(d), deadline);
    if (a?.length) return remember(true);
  } catch (err) {
    if (!isAnswer(err)) {
      log.warn?.(`[email-reachable] a lookup for ${d} gave no answer: ${err?.code || err?.message}`);
      return true; // fail open, not cached
    }
  }

  // Both lookups answered, and both said there is nothing there. This is the
  // only path that may refuse somebody, so it is the only one that caches a no.
  if (!mxAnswered) return true;
  return remember(false);
}

/**
 * The one call a route should make.
 *
 * Returns { ok: true } or { ok: false, reason, message } where `message` is
 * written for the person who typed the address, because that is where it is
 * shown. "Check it for a typo" is the useful thing to say to the only people
 * this ever refuses by accident.
 */
export async function checkAddressReachable(email, { log = console } = {}) {
  const domain = domainOf(email);
  if (!domain) {
    return { ok: false, reason: "no-domain", message: "Enter a valid email address." };
  }
  if (!isMailboxShaped(email)) {
    return {
      ok: false,
      reason: "not-a-mailbox",
      message:
        "That address is a messaging gateway rather than an email inbox, and cannot " +
        "receive your confirmation code. Please use an email address you can open.",
    };
  }
  if (!(await domainCanReceiveMail(domain, { log }))) {
    return {
      ok: false,
      reason: "domain-cannot-receive-mail",
      message: `We cannot send mail to "${domain}" — it does not accept email. Please check the address for a typo.`,
    };
  }
  return { ok: true };
}

/** Test seam: forget what we have learned about domains. */
export function _resetReachableCache() {
  cache.clear();
}
