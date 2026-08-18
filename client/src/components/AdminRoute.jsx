// src/components/AdminRoute.jsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../store.jsx";
import { can, isDesignAccess } from "../utils/roles.js";

// Gate a route by either a permission (preferred) or a legacy role list.
//   <AdminRoute permission="trainings">...   → allow if can(user, "trainings")
//   <AdminRoute roles={["admin"]}>...        → admin-exclusive (super-admin)
export default function AdminRoute({ roles = ["admin"], permission, children }) {
  const { user } = useAuth();
  const loc = useLocation();

  if (!user) {
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`}
        replace
      />
    );
  }

  // Design Access opens every admin route, including the role-gated ones — a
  // designer has to reach a screen to rebuild it. Everything behind these
  // routes is masked server-side (server/middleware/designMode.js).
  const allowed = isDesignAccess(user)
    ? true
    : permission
      ? can(user, permission)
      : roles.includes(user.role) || (user.isSuperAdmin && roles.includes("admin"));

  if (!allowed) return <Navigate to="/dashboard" replace />;

  return children;
}
