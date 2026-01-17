// src/components/RequireRole.jsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../store.jsx";

export default function RequireRole({ roles, children }) {
  const { user } = useAuth();
  const loc = useLocation();

  if (!user)
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`}
        replace
      />
    );
  if (!roles.includes(user.role)) return <Navigate to="/dashboard" replace />;

  return children;
}
