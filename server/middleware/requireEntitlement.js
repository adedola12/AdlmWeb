import dayjs from "dayjs";
import { User } from "../models/User.js";

/** requireEntitlement("revit" | "revitmep" | "planswift" | "rategen") */
export function requireEntitlement(productKey) {
  return async (req, res, next) => {
    const u = await User.findById(req.user._id, { entitlements: 1 });
    const e = (u?.entitlements || []).find(
      (x) => x.productKey === productKey && x.status === "active"
    );
    if (!e) return res.status(403).json({ error: "No active subscription" });
    if (e.expiresAt && dayjs(e.expiresAt).isBefore(dayjs())) {
      return res.status(403).json({ error: "Subscription expired" });
    }
    next();
  };
}

/** Dynamic version: reads :productKey from route */
export async function requireEntitlementParam(req, res, next) {
  const productKey = req.params.productKey;
  if (!productKey) return res.status(400).json({ error: "productKey missing" });
  return requireEntitlement(productKey)(req, res, next);
}
