// Who may look at the staged redesign.
//
// Every page of Richard's rebuild is staged under /preview/<slug> and none of
// it has replaced the live site yet. It is work in progress: half-finished
// copy, placeholder figures, pages whose behaviour is not ported. Showing that
// to a customer who wandered in would be showing them a building site and
// calling it the shop.
//
// So it is staff only — today that is the four accounts with a role other than
// "user": the studio's own admin, Richard on Design Access, and the two
// mini-admins. Anybody else gets sent to sign in, and a signed-in customer is
// sent home rather than told what they are missing.
//
// WHAT THIS IS AND IS NOT
//
// It is a courtesy gate, not a secret-keeper. The pages themselves are built
// into the same bundle every visitor downloads, so a determined person with
// devtools can read the markup — and that is fine, because there is nothing
// confidential in a marketing page that is going public anyway. What the gate
// buys is that nobody REACHES it by accident, is confused by it, or links to
// it from somewhere real.
//
// Anything genuinely private — the admin screens, customer data — is gated on
// the SERVER, where it cannot be walked around. This is not that, and must
// never be relied on as though it were.

import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../store.jsx";
import { isStaff } from "../utils/roles.js";

export default function DsPreviewGate({ children }) {
  const { user, accessToken } = useAuth();
  const loc = useLocation();

  // AuthProvider withholds `user` for exactly one frame so the first client
  // render agrees with the server-rendered HTML (store.jsx:145). During that
  // frame a signed-in administrator looks signed out, and redirecting on it
  // would bounce the studio's own admin to the sign-in page on every load.
  //
  // `accessToken` is deliberately NOT withheld, so a token with no user yet is
  // precisely "hydrating" — wait rather than decide.
  if (accessToken && !user) return null;

  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  }

  if (!isStaff(user)) return <Navigate to="/" replace />;

  return children;
}
