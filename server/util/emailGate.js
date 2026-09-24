// Who must confirm their email before using the account (2026-09-18).
//
// Since 1 Sep a sign-up is sent a six-digit code, but nothing stopped an
// unconfirmed account from using everything except checkout, so fake and
// mistyped addresses sat on the platform as working accounts ("ghosts").
//
// The rule: an account that has not confirmed its address can sign in, but
// every signed-in request except the /auth ones (confirm the code, ask for a
// new one, change the address, refresh, sign out) is refused with
// EMAIL_NOT_VERIFIED, and the web shows the "confirm your email" screen.
//
// NOT gated, deliberately:
//   * staff (admin, super-admin, mini-admin, design, demo, god): created and
//     known by hand;
//   * an account holding a live licence: it has paid, so its address has
//     already worked; it is prompted, not locked out of software it owns.

function liveLicence(entitlements, now = Date.now()) {
  return (Array.isArray(entitlements) ? entitlements : []).some(
    (e) =>
      e &&
      String(e.status || "").toLowerCase() === "active" &&
      (!e.expiresAt || new Date(e.expiresAt).getTime() > now),
  );
}

/** True when this signed-in user must confirm their email first. */
export function mustVerifyEmail(u, now = Date.now()) {
  if (!u) return false;
  // Only a token that SAYS the address is unconfirmed is gated. Every token
  // the server issues carries the claim (buildAuthPayload); one without it
  // (an older format, a test) is left alone rather than locked out.
  if (u.emailVerified !== false) return false;
  if (u.isAdmin || u.isSuperAdmin || u.isGod || u.designAccess || u.demoMode) return false;
  // Roles are free-form (custom staff roles exist); anything but a plain
  // customer account is staff.
  if (String(u.role || "user").toLowerCase() !== "user") return false;
  if (Array.isArray(u.permissions) && u.permissions.length) return false;
  if (liveLicence(u.entitlements, now)) return false;
  return true;
}

/** Requests an unconfirmed account may still make. */
export function allowedWhileUnverified(url) {
  const path = String(url || "").split("?")[0];
  return /^\/auth(\/|$)/.test(path);
}

export const EMAIL_NOT_VERIFIED = {
  code: "EMAIL_NOT_VERIFIED",
  error:
    "Confirm your email address to use your account. We sent a six-digit code to your inbox; enter it on the website, or ask for a new one.",
};
