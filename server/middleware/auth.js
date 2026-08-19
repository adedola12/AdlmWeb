import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { verifyStepUp } from "../util/jwt.js";
import { roleHasArea } from "../util/rbac.js";
import { withoutDemo } from "../util/demoContext.js";

const ACCESS_COOKIE = "at";

export function getTokenFromReq(req) {
  // 1) Authorization header
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();

  // 2) Cookie fallback (your access token cookie)
  const c = req.cookies || {};
  return c[ACCESS_COOKIE] || c.accessToken || c.token || "";
}

function safeJson(res, status, error) {
  return res.status(status).json({ error });
}

export function signAccess(payload) {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET, { expiresIn: "15m" });
}

export function verifyAccess(token) {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
}

export function requireAuth(req, res, next) {
  try {
    const token = getTokenFromReq(req);
    if (!token) return safeJson(res, 401, "Unauthorized");
    req.user = verifyAccess(token); // { id, email, role, isAdmin, ... }
    next();
  } catch {
    return safeJson(res, 401, "Unauthorized");
  }
}

// Admin-only gate. Reads the acting user's CURRENT role from the database
// rather than trusting the role claim baked into their token.
//
// WHY THE DB READ: access tokens live for 15 minutes. Trusting the claim meant
// that revoking someone's admin left them able to hit every admin-only endpoint
// until their token happened to expire — a quarter-hour window, after the UI had
// already reported the revocation as done. requirePermission() has always read
// the DB for exactly this reason; this closes the same hole on the routes that
// are admin-exclusive, which are the most sensitive ones in the system.
//
// The cost is one indexed read per admin request. Admin endpoints are low
// volume, and an immediate revocation is worth more than the microseconds.
export async function requireAdmin(req, res, next) {
  try {
    // A demo session has already been authenticated, tenant-scoped and admitted
    // by demoModeGuard, so it reaches the admin-only routers for viewing. The
    // guard runs first and unconditionally — see server/middleware/demoMode.js.
    if (req.demoMode) return next();

    const token = getTokenFromReq(req);
    if (!token) return safeJson(res, 401, "Unauthorized");

    const decoded = verifyAccess(token);
    req.user = decoded;

    const uid = String(decoded?._id || decoded?.id || decoded?.sub || "");
    if (!uid) return safeJson(res, 401, "Unauthorized");

    // Outside demo scope: this is the caller's own row, which is always real.
    const doc = await withoutDemo(() =>
      User.findById(uid).select("role disabled").lean(),
    );

    // A deleted or disabled account loses admin the moment it is disabled,
    // without waiting for its token to lapse.
    if (!doc || doc.disabled) return safeJson(res, 403, "Forbidden");
    if (doc.role !== "admin") return safeJson(res, 403, "Forbidden");

    // Keep req.user in step with the database so handlers downstream that read
    // req.user.role cannot act on a stale value.
    req.user.role = doc.role;
    req.userRole = doc.role;
    return next();
  } catch (err) {
    // A DB failure must not read as "not an admin" — that would be an outage
    // silently downgrading everyone's access. Only token problems are 401.
    if (err?.name === "JsonWebTokenError" || err?.name === "TokenExpiredError") {
      return safeJson(res, 401, "Unauthorized");
    }
    console.error("[requireAdmin] error:", err);
    return safeJson(res, 500, "Server error");
  }
}

// Step-up (email-OTP) gate for sensitive actions. Runs AFTER requireAuth, so
// req.user is populated. Behaviour:
//   • If the acting user has NOT opted into step-up → pass straight through
//     (today's behaviour, no friction for everyone else).
//   • If they have → require a valid X-Step-Up token (from /auth/step-up/verify)
//     bound to their own id. Missing/invalid/expired → 428 STEP_UP_REQUIRED.
// 428 (Precondition Required) is used deliberately: it never collides with the
// client's 401-only token-refresh path, nor with 403 admin checks. The client
// keys off code:"STEP_UP_REQUIRED" to pop the verification modal.
export async function requireStepUp(req, res, next) {
  try {
    const uid = String(req.user?._id || req.user?.id || req.user?.sub || "");
    if (!uid) return safeJson(res, 401, "Unauthorized");

    // Outside demo scope: this is the caller's OWN row, which is real even
    // when their role is a demo one.
    const doc = await withoutDemo(() =>
      User.findById(uid).select("security").lean(),
    );
    if (!doc?.security?.stepUpEnabled) return next(); // feature off for this user

    const token =
      req.get("X-Step-Up") || req.get("x-step-up") || req.body?.stepUpToken || "";
    if (!token) {
      return res.status(428).json({
        error: "Email verification required for this action.",
        code: "STEP_UP_REQUIRED",
      });
    }

    let decoded;
    try {
      decoded = verifyStepUp(token);
    } catch {
      return res.status(428).json({
        error: "Verification expired. Request a new code.",
        code: "STEP_UP_REQUIRED",
      });
    }

    if (String(decoded.sub) !== uid) {
      return res.status(428).json({
        error: "Verification mismatch. Request a new code.",
        code: "STEP_UP_REQUIRED",
      });
    }

    // A valid OTP was presented. Handlers can treat this as identity proof —
    // e.g. lock/unlock skip the 4-digit PIN when the OTP gate is satisfied.
    req.stepUpVerified = true;
    return next();
  } catch (err) {
    console.error("[requireStepUp] error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

export function requireAdminOrMiniAdmin(req, res, next) {
  // requireAuth should have already populated req.user
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });

  const role = String(req.user.role || "")
    .toLowerCase()
    .trim();

  // accept both formats just in case you stored it differently
  const ok =
    role === "admin" ||
    role === "mini_admin" ||
    role === "mini-admin" ||
    role === "miniadmin";

  if (!ok) return res.status(403).json({ error: "Admin access required" });

  next();
}

// Permission gate for a specific admin area (see server/config/permissions.js).
// Runs AFTER requireAuth. Reads the user's CURRENT role from the DB so a role
// reassignment or a permission edit takes effect immediately (admin endpoints
// are low-volume, so one indexed read is fine), then resolves it against the
// in-memory role cache. Super-admins pass everything; otherwise the role must
// hold the area. 403 on denial.
export function requirePermission(area) {
  return async function (req, res, next) {
    try {
      const uid = String(req.user?._id || req.user?.id || req.user?.sub || "");
      if (!uid) return safeJson(res, 401, "Unauthorized");

      // Outside demo scope — see requireStepUp above. Without this a demo
      // session could not resolve its own role and would 403 everywhere.
      const doc = await withoutDemo(() =>
        User.findById(uid).select("role").lean(),
      );
      const roleKey = doc?.role || req.user?.role || "user";

      if (roleHasArea(roleKey, area)) {
        req.userRole = roleKey;
        return next();
      }
      return safeJson(res, 403, "You don't have permission for this area.");
    } catch (err) {
      console.error("[requirePermission] error:", err);
      return res.status(500).json({ error: "Server error" });
    }
  };
}
