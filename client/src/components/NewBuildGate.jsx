// The new build is admin-only on the live site until go-live.
//
// Customers use the CLASSIC build: /dashboard, /projects/:tool, /learn,
// /profile. The new build's screens (/manage, /work, /dash-*) are still routed
// so staff can check them on real data, but a customer who reaches one (an old
// link, a bookmark, a typed URL) is sent to the classic page that does the same
// job instead of landing in a half-finished app.
//
// Same "courtesy gate" caveat as ds/DsPreviewGate.jsx: the screens ship in the
// bundle; customer data is protected by the server, not by this.

import React from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";
import { useAuth } from "../store.jsx";
import { isStaff } from "../utils/roles.js";
import { classicPathFor } from "../lib/classicPaths.js";

export default function NewBuildGate({ children }) {
  const { user, accessToken } = useAuth();
  const loc = useLocation();
  const params = useParams();

  // AuthProvider withholds `user` for one frame while hydrating; wait.
  if (accessToken && !user) return null;

  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  }
  if (!isStaff(user)) {
    return <Navigate to={classicPathFor(loc.pathname, params)} replace />;
  }
  return children;
}
