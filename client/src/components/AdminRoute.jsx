// src/components/AdminRoute.jsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../store.jsx";

export default function AdminRoute({ children }) {
  const { user } = useAuth();
  const loc = useLocation();
  if (!user)
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(loc.pathname)}`}
        replace
      />
    );
  if (user.role !== "admin") return <Navigate to="/" replace />;
  return children;
}
