// Holding on to a ?ref= until the person actually signs up.
//
// WHY IT HAS TO BE STORED AT ALL
//
// Somebody follows a referral link to the home page, reads for ten minutes,
// clicks Pricing, then Sign up. By then the query string is three navigations
// gone. Nothing in the app read query parameters on landing, so a referral code
// had no capture point whatsoever.
//
// AND WHY localStorage, NOT sessionStorage OR THE URL
//
// Google and Microsoft sign-in leaves the site entirely and comes back to
// /auth/callback with the provider's own ?code and ?state — our query string is
// gone, and so is anything held in memory. The only thing that survives that
// round trip today is a sessionStorage blob (lib/socialAuth.js), and even that
// is per-tab: a provider that opens its consent screen in a new tab loses it.
// localStorage survives both, and the cart already relies on exactly that to
// get through a login round trip (lib/cart.js).
//
// IT EXPIRES
//
// A code kept for ever would credit a referrer for somebody who signed up
// months later for unrelated reasons. Thirty days is long enough for a person
// to think about it and short enough to be a real attribution.

const KEY = "adlm.ref";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// The server's alphabet (util/referralCode.js): no O, I, 0 or 1. Matching it
// here means a mistyped or junk ?ref= is dropped at the door rather than
// travelling all the way to signup to be rejected.
const CODE = /^[A-HJ-NP-Z2-9]{4,32}$/;

/** Read what the address bar is offering, if it is a plausible code. */
export function refFromSearch(search) {
  try {
    const raw = new URLSearchParams(String(search || "")).get("ref") || "";
    const code = raw.trim().toUpperCase();
    return CODE.test(code) ? code : "";
  } catch {
    return "";
  }
}

/**
 * Remember a code seen on the way in.
 *
 * The FIRST one wins: somebody who arrives on Ada's link and later clicks a
 * different one was referred by the first person, and letting the last link
 * overwrite would make the credit a race between whoever sent the most.
 */
export function rememberRef(code) {
  const c = String(code || "").trim().toUpperCase();
  if (!CODE.test(c)) return false;
  try {
    if (readRef()) return false;
    localStorage.setItem(KEY, JSON.stringify({ code: c, at: Date.now() }));
    return true;
  } catch {
    // Private windows and blocked site data throw. A referral is not worth
    // breaking a page over.
    return false;
  }
}

/** The held code, or "" when there is none or it has gone stale. */
export function readRef() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return "";
    const v = JSON.parse(raw);
    const code = String(v?.code || "").toUpperCase();
    if (!CODE.test(code)) return "";
    if (!Number.isFinite(v?.at) || Date.now() - v.at > MAX_AGE_MS) {
      clearRef();
      return "";
    }
    return code;
  } catch {
    return "";
  }
}

/** Forget it, once it has been used or has expired. */
export function clearRef() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}

/** Capture on landing. Returns the code now held, if any. */
export function captureRef(search) {
  const seen = refFromSearch(search);
  if (seen) rememberRef(seen);
  return readRef();
}

export const REF_STORAGE_KEY = KEY;
export const REF_MAX_AGE_MS = MAX_AGE_MS;
