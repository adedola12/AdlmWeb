// server/middleware/adminKey.js
export function requireAdminKey(req, res, next) {
  const expected = process.env.ADMIN_API_KEY || "";

  if (!expected) {
    // Don't throw (throw causes 500 without a clean message sometimes)
    return res.status(500).json({ error: "ADMIN_KEY not configured" });
  }

  const key = req.headers["x-admin-key"];
  if (!key || key !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
}
