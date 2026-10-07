// Is this a phone number at all?
//
// POST /auth/signup requires a whatsapp number and then accepted literally any
// non-empty string: normalizeWhatsApp strips everything but digits and `+` and
// hands back whatever is left, with no length check. Measured on production on
// 4 Oct 2026, the account list contained 15 accounts whose entire whatsapp
// number was ONE digit, 15 with two, 10 with three, 2 with four and 1 with six.
//
// WHERE THE THRESHOLD COMES FROM
//
// It is read off the real data rather than chosen. In that measurement the
// shortest length any plausible number used was 10, and the longest junk value
// was 6 — a clean gap with nothing in it. Among 493 confirmed accounts the digit
// lengths were 10 (221), 11 (163), 12 (16), 13 (85) and 14 (1); the only ones
// under 10 were seven legacy accounts whose number is EMPTY, from before the
// field was collected, and they are untouched because this only runs on new
// sign-ups.
//
// Nine is the floor, not ten: it sits inside the gap, so it refuses every junk
// value that was actually observed while leaving a digit of headroom for a short
// national number from somewhere this customer base has not reached yet. The
// point is to refuse "4", not to adjudicate international dialling plans.
//
// Fifteen is the ceiling because E.164 says so, and it is what stops a pasted
// paragraph being stored as a telephone number.

const MIN_DIGITS = Number.parseInt(process.env.PHONE_MIN_DIGITS || "", 10) || 9;
const MAX_DIGITS = 15; // E.164

/** Just the digits, so `+234 (0)803-000-0000` and `2348030000000` compare equal. */
export const phoneDigits = (value) => String(value || "").replace(/\D/g, "");

/**
 * Could this be somebody's number?
 *
 * Deliberately NOT a validity check. We do not know which countries this
 * customer base will reach next, and a library that thinks it does would refuse
 * real people. Three things are rejected, all of them things no telephone number
 * is: too short, too long, and a single digit repeated.
 */
export function isPlausiblePhone(value) {
  const d = phoneDigits(value);
  if (d.length < MIN_DIGITS || d.length > MAX_DIGITS) return false;
  // "0000000000", "1111111111" — the shape of a required field being got past
  // rather than answered.
  if (/^(\d)\1+$/.test(d)) return false;
  return true;
}

export default isPlausiblePhone;
