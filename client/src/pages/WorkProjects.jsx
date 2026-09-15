// The /work/projects route.

import React from "react";
import DsAppShell from "../ds/DsAppShell.jsx";
import DsWorkProjects from "../ds/DsWorkProjects.jsx";

export default function WorkProjects() {
  return (
    <DsAppShell title="Projects" page="work-projects">
      <DsWorkProjects />
    </DsAppShell>
  );
}
