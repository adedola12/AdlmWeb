// src/components/AdminRoute.jsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../store.jsx";
import { can, isDesignAccess, isStaff } from "../utils/roles.js";
import DsAdminShell from "../ds/DsAdminShell.jsx";

// Gate a route by either a permission (preferred) or a legacy role list.
//   <AdminRoute permission="trainings">...   → allow if can(user, "trainings")
//   <AdminRoute roles={["admin"]}>...        → admin-exclusive (super-admin)
export default function AdminRoute({ roles = ["admin"], permission, children }) {
  const { user } = useAuth();
  const loc = useLocation();

  // Somebody heading for an admin screen with no session is sent to the ADMIN
  // sign-in, not the customer one. They are two doors on purpose, and landing
  // on the customer form is how a person ends up signing in as themselves and
  // wondering why /admin bounced them.
  if (!user) {
    return (
      <Navigate
        to={`/admin/login?next=${encodeURIComponent(loc.pathname + loc.search)}`}
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

  // Signed in, but as somebody with no admin rights. Sending them to the
  // dashboard is right for a customer who wandered in; for staff who signed in
  // on the wrong account it looks like the screen simply does not exist, so
  // the admin door gets a reason to show.
  if (!allowed) {
    return isStaff(user) ? (
      <Navigate to="/manage" replace />
    ) : (
      <Navigate
        to={`/admin/login?next=${encodeURIComponent(loc.pathname + loc.search)}&denied=1`}
        replace
      />
    );
  }

  // The admin chrome goes on here rather than around each of the thirty-odd
  // admin routes: this component already IS the boundary of the admin section,
  // so a screen cannot be added inside it and quietly come up without a rail.
  return <DsAdminShell>{children}</DsAdminShell>;
}
