// server/middleware/roles.js
export function requireRole(...roles) {
  return (req, res, next) => {
    const r = req.user?.role;
    if (!r) return res.status(401).json({ error: "Unauthorized" });
    if (!roles.includes(r)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

export const requireAdmin = requireRole("admin");
export const requireStaff = requireRole("admin", "mini_admin"); // ✅ mini admin + admin
