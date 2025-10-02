// server/middleware/requireEntitlement.js
export function requireEntitlement(productKey) {
  return (req, res, next) => {
    const ent = (req.user?.entitlements || []).find(
      (e) => e.productKey === productKey
    );
    const ok =
      ent &&
      ent.status === "active" &&
      ent.expiresAt &&
      new Date(ent.expiresAt) > new Date();
    if (!ok)
      return res
        .status(403)
        .json({ error: `No active ${productKey} subscription` });
    next();
  };
}
