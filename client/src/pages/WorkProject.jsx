// The /work/project/:productKey/:id route.
//
// It used to be a bare redirect: every project opened in the full workspace at
// /projects/:tool, which is where the bill, budget, valuation, PM views and
// the Work area are. That is still true for everyone who is not staff, so old
// links and bookmarks keep working exactly as they did.
//
// For staff it now renders the new workspace instead — Richard's project view,
// being adopted a tab at a time (features/workProject/WorkProjectShell.jsx).
// Building it here rather than inside ProjectsGeneric.jsx is deliberate: that
// file is ~5,800 lines and is the screen customers price jobs from, and the
// adoption is a six-to-eight week programme. This route was free, and /work is
// already staff-only on adlmstudio.net, so the new one can be built in the
// open without a flag and without putting the working one at risk.
//
// Promote it by removing the isStaff branch, once the tabs are real.

import React from "react";
import { Navigate, useParams } from "react-router-dom";
import { useAuth } from "../store.jsx";
import { isStaff } from "../utils/roles.js";
import WorkProjectShell from "../features/workProject/WorkProjectShell.jsx";

export default function WorkProject() {
  const { productKey = "", id = "" } = useParams();
  const { user, accessToken } = useAuth();
  const key = String(productKey).toLowerCase();

  // AuthProvider withholds `user` for a frame while it hydrates. Redirecting
  // in that frame would bounce a staff member out of the page they asked for.
  if (accessToken && !user) return null;

  if (isStaff(user)) return <WorkProjectShell productKey={key} id={id} />;

  const to = key
    ? `/projects/${encodeURIComponent(key)}${id ? `?project=${encodeURIComponent(id)}` : ""}`
    : "/work/projects";
  return <Navigate to={to} replace />;
}
