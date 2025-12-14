import jwt from "jsonwebtoken";

const ACCESS_COOKIE = "at";

function getTokenFromReq(req) {
  // 1) Authorization header (recommended for SPA)
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();

  // 2) Cookie fallback (if you also store access token in cookies)
  // adjust cookie names to match your project if needed
  const c = req.cookies || {};
  return c.accessToken || c.token || "";
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

// export function requireAuth(req, res, next) {
//   try {
//     const h = req.headers.authorization || "";
//     const bearer = h.startsWith("Bearer ") ? h.slice(7) : null;
//     const cookieToken = req.cookies?.[ACCESS_COOKIE] || null;
//     const token = bearer || cookieToken;
//     if (!token) return res.status(401).json({ error: "Unauthorized" });
//     req.user = verifyAccess(token);
//     next();
//   } catch {
//     return res.status(401).json({ error: "Unauthorized" });
//   }
// }

export function requireAuth(req, res, next) {
  try {
    const token = getTokenFromReq(req);
    if (!token) return safeJson(res, 401, "Unauthorized");

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, email, role, isAdmin, ... }
    next();
  } catch (err) {
    return safeJson(res, 401, "Unauthorized");
  }
}

export function requireAdmin(req, res, next) {
  try {
    const token = getTokenFromReq(req);
    if (!token) return safeJson(res, 401, "Unauthorized");

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    const isAdmin =
      decoded?.role === "admin" ||
      decoded?.isAdmin === true ||
      decoded?.admin === true;

    if (!isAdmin) return safeJson(res, 403, "Forbidden");
    next();
  } catch (err) {
    return safeJson(res, 401, "Unauthorized");
  }
}
