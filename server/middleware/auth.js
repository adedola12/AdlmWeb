// import { verifyAccess } from "../util/jwt.js";
import { User } from "../models/User.js";
import jwt from "jsonwebtoken";

// export async function requireAuth(req, res, next) {
//   try {
//     const hdr = req.headers.authorization || "";
//     const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
//     if (!token) return res.status(401).json({ error: "Missing access token" });
//     const payload = verifyAccess(token);
//     const user = await User.findById(payload.sub);
//     if (!user || user.disabled)
//       return res.status(401).json({ error: "User disabled or not found" });
//     req.user = user;
//     next();
//   } catch (e) {
//     return res.status(401).json({ error: "Invalid/expired token" });
//   }
// }

export function requireAdmin(req, res, next) {
  if (req.user?.role === "admin") return next();
  return res.status(403).json({ error: "Admin only" });
}



const ACCESS_COOKIE = "at"; // optional if you also set access in a cookie

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

    const payload = verifyAccess(token);
    req.user = payload; // { _id, email, role, zone, entitlements?, ... }
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}
