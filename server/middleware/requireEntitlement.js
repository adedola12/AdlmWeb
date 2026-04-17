import dayjs from "dayjs";
import { User } from "../models/User.js";

function entitlementKeyFor(productKey) {
  const k = String(productKey || "")
    .trim()
    .toLowerCase();
  if (k === "revit-materials") return "revit";
  if (k === "planswift-materials") return "planswift";
  // Revit MEP plugin projects live under the "revitmep" productKey in the
  // dashboard URL and DB, but the subscription/entitlement is issued as "mep".
  if (k === "revitmep") return "mep";
  return k;
}

/** requireEntitlement("revit" | "revitmep" | "planswift" | "rategen") */
export function requireEntitlement(productKey) {
  return async (req, res, next) => {
    if (!req.user?._id) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const u = await User.findById(req.user._id, { entitlements: 1 });
    if (!u) {
      return res.status(401).json({ error: "User not found" });
    }
    const e = (u.entitlements || []).find(
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
// export async function requireEntitlementParam(req, res, next) {
//   const productKey = req.params.productKey;
//   if (!productKey) return res.status(400).json({ error: "productKey missing" });
//   return requireEntitlement(productKey)(req, res, next);
// }
/** Dynamic version: reads :productKey from route */
export async function requireEntitlementParam(req, res, next) {
  const raw = req.params.productKey;
  if (!raw) return res.status(400).json({ error: "productKey missing" });

  // revitmep projects are stored under productKey "revitmep" in the DB so
  // they appear at /dashboard/projects/revitmep. Only rewrite the route
  // param for the *-materials aliases that genuinely reuse an existing
  // storage bucket. For everything else, leave req.params.productKey alone
  // and only normalize the key used for the entitlement lookup.
  const rawLower = String(raw).trim().toLowerCase();
  const isMaterialsAlias =
    rawLower === "revit-materials" || rawLower === "planswift-materials";

  const entitlementKey = entitlementKeyFor(raw);
  if (isMaterialsAlias) {
    req.params.productKey = entitlementKey; // legacy behaviour
  }

  return requireEntitlement(entitlementKey)(req, res, next);
}
