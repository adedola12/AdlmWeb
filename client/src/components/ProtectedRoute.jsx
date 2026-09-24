// src/components/ProtectedRoute.jsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../store.jsx";
import { mustVerifyEmail } from "../lib/emailGate.js";

export default function ProtectedRoute({ children }) {
  const { user } = useAuth();
  const loc = useLocation();
  if (!user) {
    const next = encodeURIComponent(loc.pathname + loc.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  // An account that has not confirmed its email sees the confirm screen and
  // nothing else (lib/emailGate.js mirrors the server rule).
  if (mustVerifyEmail(user)) {
    const next = encodeURIComponent(loc.pathname + loc.search);
    return <Navigate to={`/verify-email?next=${next}`} replace />;
  }
  return children;
}
