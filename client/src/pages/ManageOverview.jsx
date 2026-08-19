// The /manage route: his app frame around his Manage overview.
//
// Kept separate from DsManageOverview so the shell and the screen stay
// independent — every other dash-* screen will hang off the same frame, and
// the frame is where the rail, the top bar and his dashboard CSS live.

import React from "react";
import DsAppShell from "../ds/DsAppShell.jsx";
import DsManageOverview from "../ds/DsManageOverview.jsx";

export default function ManageOverview() {
  return (
    <DsAppShell title="Overview" page="dash-home">
      <DsManageOverview />
    </DsAppShell>
  );
}
