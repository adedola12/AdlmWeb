// The /work/project/:productKey/:id route — one project's bill.

import React from "react";
import DsAppShell from "../ds/DsAppShell.jsx";
import DsWorkProject from "../ds/DsWorkProject.jsx";

export default function WorkProject() {
  return (
    <DsAppShell title="Project" page="work-project">
      <DsWorkProject />
    </DsAppShell>
  );
}
