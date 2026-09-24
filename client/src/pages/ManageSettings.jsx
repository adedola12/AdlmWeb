// The /manage/settings route: his app frame around his Account settings screen.
//
// Same split as ManageOverview — the frame and the screen stay independent, so
// the rail, the top bar and his dashboard CSS live in one place.

import React from "react";
import DsAppShell from "../ds/DsAppShell.jsx";
import DsSettings from "../ds/DsSettings.jsx";

export default function ManageSettings() {
  return (
    <DsAppShell title="Account settings" page="dash-settings">
      <DsSettings />
    </DsAppShell>
  );
}
