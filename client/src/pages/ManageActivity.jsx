// The /manage/activity route: his app frame around the full activity trail.
//
// Until this existed, "All activity" on the Manage overview pointed at
// /profile — the classic page — so the new build had a door straight back into
// the old one.
import React from "react";
import DsAppShell from "../ds/DsAppShell.jsx";
import DsActivity from "../ds/DsActivity.jsx";

export default function ManageActivity() {
  return (
    <DsAppShell title="Activity" page="dash-activity">
      <DsActivity />
    </DsAppShell>
  );
}
