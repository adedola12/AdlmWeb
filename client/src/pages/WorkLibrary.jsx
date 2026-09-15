// The /work/library route.

import React from "react";
import DsAppShell from "../ds/DsAppShell.jsx";
import DsWorkLibrary from "../ds/DsWorkLibrary.jsx";

export default function WorkLibrary() {
  return (
    <DsAppShell title="Rate library" page="work-library">
      <DsWorkLibrary />
    </DsAppShell>
  );
}
