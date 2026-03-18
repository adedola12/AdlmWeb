import crypto from "crypto";

export function requireAdminKey(req, res, next) {
  const key = req.headers["x-admin-key"];
  if (!process.env.ADMIN_KEY) {
    return res.status(500).json({ error: "ADMIN_KEY not configured" });
  }
  if (!key) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const a = Buffer.from(String(key));
  const b = Buffer.from(String(process.env.ADMIN_KEY));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}
