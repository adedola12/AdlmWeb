import { verifyAccess } from "../util/jwt.js";
import { User } from "../models/User.js";

export async function requireAuth(req, res, next) {
  try {
    const hdr = req.headers.authorization || "";
    const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing access token" });
    const payload = verifyAccess(token);
    const user = await User.findById(payload.sub);
    if (!user || user.disabled)
      return res.status(401).json({ error: "User disabled or not found" });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid/expired token" });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role === "admin") return next();
  return res.status(403).json({ error: "Admin only" });
}
