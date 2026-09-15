// server/middleware/roles.js
export function requireRole(...roles) {
  return (req, res, next) => {
    // Read-only, masked demo sessions are admitted for viewing; demoModeGuard
    // has already blocked every mutating method upstream.
    if (req.demoMode) return next();

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
