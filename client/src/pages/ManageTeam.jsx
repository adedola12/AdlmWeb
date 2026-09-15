// The /manage/team route: his app frame around his Team & seats screen.
//
// Same split as ManageOverview — the frame and the screen stay independent, so
// the rail, the top bar and his dashboard CSS live in one place.

import React from "react";
import DsAppShell from "../ds/DsAppShell.jsx";
import DsTeam from "../ds/DsTeam.jsx";

export default function ManageTeam() {
  return (
    <DsAppShell title="Team & seats" page="dash-team">
      <DsTeam />
    </DsAppShell>
  );
}
