import jwt from "jsonwebtoken";

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
