// Who may use the new build before it launches.
//
// Richard's redesign ships 1 Oct 2026 10:00 WAT. Until then its dashboard and
// project workspace — /manage/* and /work/* — are staff only: a customer who
// reaches one is sent to the classic screen that does the same job
// (lib/classicPaths.js), because classic is still the site they are using.
//
// The learning screens (/dash-learning, /dash-certificates, /dash-assignments,
// /dash-course/:sku) are deliberately NOT behind this gate even though they are
// built from the same design system. classicPaths.js sets out why at length:
// they are the only learning surface there is, the classic catalogue links
// straight into them, and /learn/course/:sku — a URL in sent emails — redirects
// into /dash-course/:sku, so gating that target would loop the browser between
// the two and take away courses people have paid for.
//
// WHAT THIS IS AND IS NOT
//
// A courtesy gate, like DsPreviewGate. The screens are in the same bundle every
// visitor downloads, so a determined person with devtools can still render one.
// That is fine: everything behind them is customer data the API checks on every
// request, and this only stops somebody REACHING an unfinished screen by
// accident. It must never be relied on as though it were a permission.

import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../store.jsx";
import { canViewPreview } from "../utils/roles.js";
import { classicFallbackFor } from "../lib/classicPaths.js";

// The one switch. FLIPPED AT GO-LIVE, 1 October 2026: the gate is now a
// pass-through and the new build is the build. The file stays for one release
// so this line is a visible, revertible record of when customers were moved —
// put it back to true and the classic screens are serving again in one deploy.
//
// It had to move in the SAME change as the /dashboard redirect and
// AFTER_SIGN_IN. While it was true, those two made a customer's home an
// infinite loop: /dashboard -> /manage -> this gate -> /dashboard. That is the
// invariant newBuildGate.golive.test.js exists to hold, and it caught exactly
// that mistake being made here.
//
// Deliberately NOT derived from the launch date: this decides which dashboard a
// customer sees, and a browser with a wrong clock would switch them early or
// leave them behind. Go-live is a deploy either way (see docs/CLASSIC-BUILD.md),
// so the flip is a reviewed line rather than something nobody can see coming.
export const GATE_NEW_BUILD = false;

export default function NewBuildGate({ children }) {
  const { user } = useAuth();
  const loc = useLocation();

  if (!GATE_NEW_BUILD) return children;

  // NEVER decide while `user` is absent. Two different situations reach here
  // with no user, and rendering nothing is right for both:
  //
  //   * HYDRATING. AuthProvider withholds `user` for exactly one frame so the
  //     first client render agrees with the server-rendered HTML
  //     (store.jsx:145). On that frame a signed-in administrator looks signed
  //     out, so a gate that redirected here would bounce the studio's own staff
  //     onto /dashboard on every single load. ds/DsPreviewGate.jsx carries a
  //     comment about the same trap. `accessToken` is not withheld, so a token
  //     with no user is precisely "still hydrating".
  //   * SIGNED OUT. Not this gate's business. ProtectedRoute wraps it and has
  //     already sent them to sign in with a ?next back to here, so they land on
  //     the screen they asked for if they turn out to be staff. Redirecting as
  //     well would lose that ?next and have two gates fighting over one frame.
  //
  // One branch rather than two: the answer is the same either way, and a second
  // line that cannot change the outcome would only look load bearing.
  if (!user) return null;

  // canViewPreview, not isStaff: Tech Support holds only the "preview" area and
  // is deliberately not staff (utils/roles.js), and locking the people who
  // handle support tickets out of the screens customers ask about would defeat
  // the point of the role.
  if (canViewPreview(user)) return children;

  return <Navigate to={classicFallbackFor(loc.pathname)} replace />;
}
