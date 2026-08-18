// src/components/AdminRoute.jsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../store.jsx";
import { can, isDemo } from "../utils/roles.js";

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

  // A demo session may VIEW every admin route, including the admin-exclusive
  // ones gated by `roles`. It is read-only and placeholder-masked server-side,
  // so reaching the screen grants no authority over anything on it.
  const allowed =
    isDemo(user) ||
    (permission
      ? can(user, permission)
      : roles.includes(user.role) || (user.isSuperAdmin && roles.includes("admin")));

  if (!allowed) return <Navigate to="/dashboard" replace />;

  return children;
}
