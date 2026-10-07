// The browser half of the confirm-your-email rule. The server decides
// (server/util/emailGate.js); this mirrors it so the site can show the
// confirm screen instead of letting requests fail one by one.

function liveLicence(entitlements, now = Date.now()) {
  return (Array.isArray(entitlements) ? entitlements : []).some(
    (e) =>
      e &&
      String(e.status || "").toLowerCase() === "active" &&
      (!e.expiresAt || new Date(e.expiresAt).getTime() > now),
  );
}

export function mustVerifyEmail(u, now = Date.now()) {
  if (!u || u.emailVerified !== false) return false;
  if (u.isAdmin || u.isSuperAdmin || u.isGod || u.designAccess || u.demoMode) return false;
  if (String(u.role || "user").toLowerCase() !== "user") return false;
  if (Array.isArray(u.permissions) && u.permissions.length) return false;
  if (liveLicence(u.entitlements, now)) return false;
  return true;
}
