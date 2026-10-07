// A public page behind a launch flag (R21, config/flags.js), in Richard's
// chrome. Flag on: everyone sees the page. Flag off: staff still see the real
// page (so it can be checked on the live site) and everyone else sees the
// "Coming soon" state.

import React from "react";
import { useAuth } from "../store.jsx";
import { isStaff } from "../utils/roles.js";

const DsShell = React.lazy(() => import("./DsShell.jsx"));

export default function DsFlagRoute({ live, full, soon, styles = null }) {
  const { user } = useAuth();
  const open = live || isStaff(user);
  return (
    <React.Suspense fallback={null}>
      {open ? styles : null}
      <DsShell>{open ? full : soon}</DsShell>
    </React.Suspense>
  );
}
