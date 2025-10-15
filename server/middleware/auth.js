import jwt from "jsonwebtoken";

const ACCESS_COOKIE = "at";

export function signAccess(payload) {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET, { expiresIn: "15m" });
}
export function verifyAccess(token) {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
}

export function requireAuth(req, res, next) {
  try {
    const h = req.headers.authorization || "";
    const bearer = h.startsWith("Bearer ") ? h.slice(7) : null;
    const cookieToken = req.cookies?.[ACCESS_COOKIE] || null;
    const token = bearer || cookieToken;
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    req.user = verifyAccess(token);
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  if ((req.user.role || "user") !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}
