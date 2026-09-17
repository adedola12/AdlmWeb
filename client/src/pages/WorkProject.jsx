// The /work/project/:productKey/:id route.
//
// It used to show a read-only copy of one project's bill. Every project now
// opens in the full workspace (/projects/:tool), which is where the bill,
// budget, valuation, PM views and the Work area are, so this address forwards
// there. Old links and bookmarks keep working; the workspace replaces the id
// in the address with the project's slug once it loads.

import React from "react";
import { Navigate, useParams } from "react-router-dom";

export default function WorkProject() {
  const { productKey = "", id = "" } = useParams();
  const key = String(productKey).toLowerCase();
  const to = key
    ? `/projects/${encodeURIComponent(key)}${id ? `?project=${encodeURIComponent(id)}` : ""}`
    : "/work/projects";
  return <Navigate to={to} replace />;
}
