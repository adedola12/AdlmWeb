// The /work route: his app frame around his Work overview.

import React from "react";
import DsAppShell from "../ds/DsAppShell.jsx";
import DsWorkHome from "../ds/DsWorkHome.jsx";

export default function WorkHome() {
  return (
    <DsAppShell title="Your work" page="work-home">
      <DsWorkHome />
    </DsAppShell>
  );
}
