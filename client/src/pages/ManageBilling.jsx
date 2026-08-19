// The /manage/billing route: his app frame around his Billing & invoices screen.
//
// Same split as ManageOverview — the frame and the screen stay independent, so
// the rail, the top bar and his dashboard CSS live in one place.

import React from "react";
import DsAppShell from "../ds/DsAppShell.jsx";
import DsBilling from "../ds/DsBilling.jsx";

export default function ManageBilling() {
  return (
    <DsAppShell title="Billing & invoices" page="dash-billing">
      <DsBilling />
    </DsAppShell>
  );
}
