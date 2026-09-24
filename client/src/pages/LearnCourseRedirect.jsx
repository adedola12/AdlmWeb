// /learn/course/:sku kept alive as a redirect.
//
// The player moved to /dash-course/:sku when public and signed-in learning
// were separated. This URL is in sent emails, in browser history, and in links
// the public catalogue has been handing out for as long as it has existed, so
// it resolves rather than 404s. The query string comes along because that is
// where ?m=<moduleCode> rides.

import React from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";

export default function LearnCourseRedirect() {
  const { sku } = useParams();
  const { search, hash } = useLocation();
  return (
    <Navigate
      replace
      to={`/dash-course/${encodeURIComponent(sku || "")}${search || ""}${hash || ""}`}
    />
  );
}
