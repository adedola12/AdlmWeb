// server/util/godAccount.js
//
// Single source of truth for the break-glass "God" support account.
//
// A God account is a tightly-controlled super-admin used by the ADLM technical
// team to sign in to ANY machine, with ANY ADLM product, bypassing the normal
// device/seat/entitlement binding — so they can reproduce and fix user issues.
//
// Because it is so powerful, God status requires TWO independent things to be
// true at once (belt-and-suspenders, so neither a stray DB edit NOR a leaked
// deploy config alone is enough):
//   1. `user.isGod === true`               (a flag in the database)
//   2. the email is in GOD_ACCOUNT_EMAILS  (a comma-separated deploy env var)
//
// Removing the email from GOD_ACCOUNT_EMAILS (or flipping isGod / disabling the
// account) instantly and completely revokes the powers — the kill switch.
//
// On top of this, every God login is OTP-gated (email code) and every God
// action is written to the AuditLog.

/** Parse GOD_ACCOUNT_EMAILS ("a@x.com, b@y.com") into a lowercased Set. */
function godEmailSet() {
  const raw = String(process.env.GOD_ACCOUNT_EMAILS || "");
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** Is this email allow-listed for God powers at the deploy level? */
export function isGodEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return false;
  return godEmailSet().has(e);
}

/**
 * Is this a fully-activated God account? Requires BOTH the DB flag and the env
 * allowlist. Accepts either a Mongoose User doc or a decoded token payload —
 * both expose `email` and `isGod`.
 */
export function isGodUser(userOrPayload) {
  if (!userOrPayload) return false;
  return userOrPayload.isGod === true && isGodEmail(userOrPayload.email);
}

/** True if the deploy has any God emails configured at all (for diagnostics). */
export function godAccountsConfigured() {
  return godEmailSet().size > 0;
}
