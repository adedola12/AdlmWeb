// src/components/AdminRoute.jsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../store.jsx";
import { can } from "../utils/roles.js";

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

  const allowed = permission
    ? can(user, permission)
    : roles.includes(user.role) || (user.isSuperAdmin && roles.includes("admin"));

  if (!allowed) return <Navigate to="/dashboard" replace />;

  return children;
}
