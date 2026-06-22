import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { verifyStepUp } from "../util/jwt.js";
import { roleHasArea } from "../util/rbac.js";

const ACCESS_COOKIE = "at";

function getTokenFromReq(req) {
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

export function requireAdmin(req, res, next) {
  try {
    const token = getTokenFromReq(req);
    if (!token) return safeJson(res, 401, "Unauthorized");

    const decoded = verifyAccess(token);
    req.user = decoded;

    const isAdmin =
      decoded?.role === "admin" ||
      decoded?.isAdmin === true ||
      decoded?.admin === true;

    if (!isAdmin) return safeJson(res, 403, "Forbidden");
    next();
  } catch {
    return safeJson(res, 401, "Unauthorized");
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

    const doc = await User.findById(uid).select("security").lean();
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

      const doc = await User.findById(uid).select("role").lean();
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
