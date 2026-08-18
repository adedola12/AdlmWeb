// server/middleware/demoMode.js
// The gate for demo roles — the roles handed to designers and other external
// collaborators who need to work the admin area without touching the business.
//
// Mounted once, on /admin, AHEAD of every admin router. It resolves the
// caller's role from the database, then runs the rest of the request inside a
// demo context (server/util/demoContext.js). From that point the tenancy plugin
// (server/models/demoTenancy.js) scopes every read and every write to demo
// rows, so the handlers themselves need no knowledge of any of this.
//
// A demo session is deliberately NOT read-only. Every button works: create,
// edit, save, delete, the lot — because the point is for a designer to walk the
// real routing and the real flows, not to look at frozen screens. What makes
// that safe is the tenancy, not a restriction on verbs. A demo write cannot
// reach a real row because the query it runs cannot match one.
import { User } from "../models/User.js";
import { getTokenFromReq, verifyAccess } from "./auth.js";
import { isDemoRole } from "../util/rbac.js";
import { runAsDemo, runWithoutDemo } from "../util/demoContext.js";

// Areas a demo role must not reach even though it may edit everything else.
//   roles      — the UAC. It is untenanted (the auth layer reads it on every
//                request), so an edit here would hit the REAL permission
//                matrix. That is the one write that could escalate privilege.
//   audit-log  — likewise untenanted, and it is the record that would show
//                tampering. Nothing to design here either.
const FORBIDDEN = [/^\/roles(\/|$)/i, /^\/audit-log(\/|$)/i];

export async function demoModeGuard(req, res, next) {
  try {
    // This guard sits AHEAD of the routers, each of which runs its own
    // requireAuth, so req.user does not exist yet — decode the token here. An
    // absent or invalid token is not this middleware's problem: fall through
    // and let the real auth gate answer with its own 401.
    let claims;
    try {
      const token = getTokenFromReq(req);
      if (!token) return next();
      claims = verifyAccess(token);
    } catch {
      return next();
    }

    const uid = String(claims?._id || claims?.id || claims?.sub || "");
    if (!uid) return next();

    // Deliberately outside any demo scope: this reads the caller's OWN user
    // row, which is a real record. It also means a role revocation takes effect
    // on the next request rather than whenever the token happens to expire.
    const doc = await runWithoutDemo(() => User.findById(uid).select("role").lean());
    const roleKey = doc?.role || claims?.role || "user";
    if (!isDemoRole(roleKey)) return next();

    if (FORBIDDEN.some((rx) => rx.test(req.path))) {
      return res.status(403).json({
        error: "This area is not available on a demo account.",
        code: "DEMO_AREA_FORBIDDEN",
      });
    }

    // Downstream gates (requireAdmin, requireRole) consult this. It lives on
    // req rather than req.user because each router's requireAuth re-decodes the
    // token and replaces req.user wholesale.
    req.demoMode = true;
    req.userRole = roleKey;

    // Everything from here — the routers, the handlers, every query they run —
    // executes inside the demo tenant.
    return runAsDemo(() => next());
  } catch (err) {
    console.error("[demoModeGuard] error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
