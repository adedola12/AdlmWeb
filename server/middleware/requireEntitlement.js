import dayjs from "dayjs";
import { User } from "../models/User.js";
import { isGodUser } from "../util/godAccount.js";

function entitlementKeyFor(productKey) {
  const k = String(productKey || "")
    .trim()
    .toLowerCase();
  if (k === "revit-materials") return "revit";
  if (k === "planswift-materials") return "planswift";
  return k;
}

// Feature grants that stand in for a product licence. The admin-granted
// quiv-boq-import entitlement (Excel BoQ import projects) unlocks the Quiv
// (revit) projects area on the website, so a user who was granted the feature
// but never bought the plugin can still open/manage their imported projects.
const SATISFIED_BY = {
  revit: ["revit", "quiv-boq-import"],
};

function acceptableKeysFor(productKey) {
  return SATISFIED_BY[productKey] || [productKey];
}

function isEntActive(e) {
  if (!e || e.status !== "active") return false;
  if (e.expiresAt && dayjs(e.expiresAt).isBefore(dayjs())) return false;
  return true;
}

/** requireEntitlement("revit" | "revitmep" | "planswift" | "rategen") */
export function requireEntitlement(productKey) {
  return async (req, res, next) => {
    if (!req.user?._id) {
      return res.status(401).json({ error: "Authentication required" });
    }
    // Break-glass God account has every product on every machine.
    if (isGodUser(req.user)) return next();
    const u = await User.findById(req.user._id, { entitlements: 1 });
    if (!u) {
      return res.status(401).json({ error: "User not found" });
    }
    const keys = acceptableKeysFor(productKey);
    const ents = (u.entitlements || []).filter((x) =>
      keys.includes(x.productKey)
    );
    if (!ents.length) {
      return res.status(403).json({ error: "No active subscription" });
    }
    if (!ents.some(isEntActive)) {
      // Distinguish "expired" from "never had it" like the original check.
      const anyActiveStatus = ents.some((x) => x.status === "active");
      return res.status(403).json({
        error: anyActiveStatus ? "Subscription expired" : "No active subscription",
      });
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
