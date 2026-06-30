// server/middleware/auditGod.js
//
// Global, best-effort logger for the break-glass God account. Mounted early so
// it sees every request. It decodes the bearer token (without gating — auth is
// still enforced per-route) and, when the caller is a God account performing a
// state-changing request, records it to the AuditLog. Read-only (GET/HEAD)
// traffic is skipped to keep the trail focused on actions that change data.
import { verifyAccess } from "../util/jwt.js";
import { isGodUser } from "../util/godAccount.js";
import { writeAudit, reqAuditContext } from "../util/audit.js";

const SKIP_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function auditGod(req, _res, next) {
  try {
    if (SKIP_METHODS.has(req.method)) return next();

    const auth = req.headers.authorization || "";
    if (!auth.startsWith("Bearer ")) return next();

    let decoded;
    try {
      decoded = verifyAccess(auth.slice(7).trim());
    } catch {
      return next(); // invalid/expired token — the route's auth will reject it
    }

    if (isGodUser(decoded)) {
      // Don't double-log the login itself (handled explicitly in auth.js).
      if (!String(req.originalUrl || "").startsWith("/auth/login")) {
        writeAudit({
          actorId: decoded._id,
          actorEmail: decoded.email,
          isGod: true,
          action: "god.request",
          ...reqAuditContext(req),
        });
      }
    }
  } catch {
    // Never let auditing break a request.
  }
  return next();
}
