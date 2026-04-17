import crypto from "crypto";

// Timing-safe admin key check. Used only for server-to-server or trusted
// system calls. Most admin routes should prefer JWT-based requireAdmin
// from middleware/auth.js instead.
export function requireAdminKey(req, res, next) {
  const key = req.headers["x-admin-key"];
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) {
    return res.status(500).json({ error: "ADMIN_API_KEY not configured" });
  }
  if (!key) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const a = Buffer.from(String(key));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}
