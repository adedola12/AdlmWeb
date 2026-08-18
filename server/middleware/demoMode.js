// server/middleware/demoMode.js
// The gate for demo roles — the roles handed to designers and other external
// collaborators who need to see every admin screen without seeing the business.
//
// Mounted once, on /admin, AHEAD of every admin router. It does four things,
// in this order, and the order is the security argument:
//
//   1. Resolves the caller's CURRENT role from the database. A stale JWT can
//      therefore never keep demo powers alive after the role is revoked.
//   2. Blocks every mutating method. A demo session is strictly read-only, so
//      nothing downstream can write regardless of which gate it uses.
//   3. Blocks binary responses. The masker in step 4 only reaches JSON; the
//      invoice and proposal PDF endpoints stream real figures straight from a
//      buffer, so they are refused outright rather than leaked unmasked.
//   4. Marks the request so the per-area gates admit it, and wraps res.json so
//      every payload leaves through the placeholder layer.
//
// Step 2 is what makes step 4 safe. Elevating a read-only, masked request to
// see an admin screen grants visibility and nothing else; the same elevation on
// a writable request would be a privilege-escalation hole, which is why the
// method check cannot be moved below the elevation.
import { User } from "../models/User.js";
import { getTokenFromReq, verifyAccess } from "./auth.js";
import { isDemoRole } from "../util/rbac.js";
import { maskPayload } from "../util/demoData.js";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Endpoints a demo role must not reach even read-only.
//   roles      — the UAC. Reading it exposes the permission matrix, which is a
//                map of how to escalate. Never grantable, masked or not.
//   audit-log  — the break-glass trail: who did what, with real identities, and
//                the record that would show tampering.
const FORBIDDEN = [/^\/roles(\/|$)/i, /^\/audit-log(\/|$)/i];

function isJsonResponse(res) {
  const type = res.get("Content-Type");
  return !type || /json/i.test(type);
}

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

    const doc = await User.findById(uid).select("role").lean();
    const roleKey = doc?.role || claims?.role || "user";
    if (!isDemoRole(roleKey)) return next();

    if (!READ_METHODS.has(req.method)) {
      return res.status(403).json({
        error: "This is a demo account — it can view the admin area but cannot change anything.",
        code: "DEMO_READ_ONLY",
      });
    }

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

    const sendJson = res.json.bind(res);
    const sendRaw = res.send.bind(res);
    let leftAsJson = false;

    res.json = (body) => {
      leftAsJson = true;
      return sendJson(maskPayload(body));
    };

    // Express routes res.json through res.send, so `leftAsJson` distinguishes a
    // masked JSON payload from a handler streaming a PDF or spreadsheet.
    res.send = (body) => {
      if (!leftAsJson && (Buffer.isBuffer(body) || !isJsonResponse(res))) {
        leftAsJson = true; // the refusal below re-enters res.send; let it pass.
        res.status(403);
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.removeHeader("Content-Disposition");
        return sendJson({
          error: "File downloads are disabled on a demo account.",
          code: "DEMO_DOWNLOAD_BLOCKED",
        });
      }
      return sendRaw(body);
    };

    return next();
  } catch (err) {
    console.error("[demoModeGuard] error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
