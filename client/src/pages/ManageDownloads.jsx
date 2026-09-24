// The /manage/downloads route: his app frame around his Downloads screen.
//
// Same split as ManageOverview — the frame and the screen stay independent, so
// the rail, the top bar and his dashboard CSS live in one place.

import React from "react";
import DsAppShell from "../ds/DsAppShell.jsx";
import DsDownloads from "../ds/DsDownloads.jsx";

export default function ManageDownloads() {
  return (
    <DsAppShell title="Downloads" page="dash-downloads">
      <DsDownloads />
    </DsAppShell>
  );
}
