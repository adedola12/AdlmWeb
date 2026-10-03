// A referral code, and the link it goes in.
//
// WHY THE ALPHABET IS WHAT IT IS
//
// The code is read aloud, typed from a WhatsApp message, and — the reason it
// matters most — printed inside Ada's reply. Her chat renders a BARE https URL
// as a real anchor (client/src/lib/chatMarkdown.jsx), and its inline formatter
// strips asterisks and stops the URL at the first punctuation, so a code
// containing anything but letters and digits would be silently truncated or
// mangled on the way to the person meant to copy it.
//
// So: upper-case letters and digits only, with the four characters that get
// misread out loud removed — O and 0, I and 1. Eight characters over that
// 32-letter alphabet is 32^8, about 1.1 x 10^12, which is not a namespace
// anybody exhausts or guesses.
//
// Pure, so it is tested without a database.

import crypto from "node:crypto";

// No O, 0, I or 1: a code is read down a phone line more often than pasted.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 8;

/**
 * A fresh code. Uses crypto, not Math.random: a guessable code lets somebody
 * take credit for a stranger's signups.
 */
export function newReferralCode(length = CODE_LENGTH) {
  const n = Math.max(4, Math.min(32, Number(length) || CODE_LENGTH));
  const bytes = crypto.randomBytes(n * 2);
  let out = "";
  for (let i = 0; out.length < n && i < bytes.length; i += 1) {
    // Rejection sampling: 256 is not a multiple of 32 in general, and taking a
    // plain modulo would make the first few letters fractionally likelier.
    const v = bytes[i];
    if (v >= 256 - (256 % ALPHABET.length)) continue;
    out += ALPHABET[v % ALPHABET.length];
  }
  // Astronomically unlikely, but a short code must never be returned quietly.
  return out.length === n ? out : newReferralCode(n);
}

/**
 * The code as stored and compared: upper-cased, with the characters people
 * substitute by eye folded onto the ones in the alphabet.
 *
 * Somebody who writes "l" for "1" or "o" for "0" has typed a code that cannot
 * exist, and refusing it teaches them nothing. O and Q both fold to nothing
 * useful, so only the unambiguous substitutions are made.
 */
export function normaliseReferralCode(raw) {
  const s = String(raw || "").trim().toUpperCase();
  if (!s) return "";
  const folded = s
    .replace(/[O]/g, "0")
    .replace(/[IL]/g, "1")
    // ...then back onto the alphabet, which has neither 0 nor 1.
    .replace(/0/g, "O")
    .replace(/1/g, "I");
  // Only keep what the alphabet could have produced; anything else is not a
  // code and must not half-match one.
  return /^[A-Z2-9]{4,32}$/.test(folded) ? folded : "";
}

/** True for a string that could be one of our codes. */
export const looksLikeReferralCode = (raw) => {
  const s = String(raw || "").trim().toUpperCase();
  return new RegExp(`^[${ALPHABET}]{4,32}$`).test(s);
};

/**
 * The link to hand out.
 *
 * The origin comes from configuration, NEVER from a request. A referral URL
 * built from a Host header is a URL an attacker chooses — they send a victim a
 * link pointing at their own copy of the site and harvest whatever is typed
 * into it. server/routes/meta.dynamic.js reads the header for its own reasons;
 * this must not copy that.
 */
export function referralLink(code, { origin } = {}) {
  const base = String(
    origin || process.env.PUBLIC_SITE_URL || process.env.PUBLIC_WEB_URL || "https://www.adlmstudio.net",
  ).replace(/\/+$/, "");
  const c = String(code || "").trim();
  if (!c) return "";
  return `${base}/?ref=${encodeURIComponent(c)}`;
}
