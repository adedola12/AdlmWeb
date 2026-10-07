// The /dash-assignments route: his app frame around Assignments (R11).
import React from "react";
import DsAppShell from "../ds/DsAppShell.jsx";
import DsLearnStyles from "../ds/DsLearnStyles.jsx";
import DsAssignments from "../ds/DsAssignments.jsx";

export default function Assignments() {
  return (
    <DsAppShell title="Assignments" page="dash-assignments">
      <DsLearnStyles />
      <DsAssignments />
    </DsAppShell>
  );
}
