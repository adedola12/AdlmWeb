// Who may use the new build — held back before launch, open since.
//
// Richard's redesign shipped 1 Oct 2026, and since then this gate is a
// pass-through. Before that, its dashboard and project workspace — /manage/*
// and /work/* — were staff only: a customer who reached one was sent to the
// classic screen that does the same job (lib/classicPaths.js). Raising
// GATE_NEW_BUILD (lib/newBuildAccess.js) brings that back, for this gate and
// for every link that points through it.
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
import { GATE_NEW_BUILD, seesNewBuild } from "../lib/newBuildAccess.js";
import { classicFallbackFor } from "../lib/classicPaths.js";

// The switch itself, GATE_NEW_BUILD, and the reasoning for it live in
// lib/newBuildAccess.js: the rail, the project cards and the classic-project
// redirect have to give the same answer as this gate, and at go-live they did
// not (the gate came down, they kept sending customers to classic).

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

  // Same answer the rail and the project links give (lib/newBuildAccess.js).
  if (seesNewBuild(user)) return children;

  return <Navigate to={classicFallbackFor(loc.pathname)} replace />;
}
