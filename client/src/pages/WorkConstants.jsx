// The Material Constants library, inside the signed-in app frame.
//
// WHY THERE ARE TWO ROUTES TO THE SAME SCREEN
//
// /rategen/material-constants has existed all along and the classic Budget tab
// links to it; that route is left exactly as it is, so nothing that works today
// changes. This one is the same editor inside DsAppShell, so it keeps the rail.
//
// That matters because the rail is the point. The library is 122 keys — waste
// factors, the concrete and mortar mixes, formwork re-use, and the
// Labour.*.Per* and Plant.*.Per* outputs that decide what a budget costs — and
// until now it was reachable from ONE link buried in a project's Budget tab. A
// QS who had never opened that tab did not know their firm's own standards were
// theirs to set, priced on defaults calibrated from other firms' bills, and
// then had no reason to trust the budget it produced.
//
// Routing the rail at the bare page instead would have dropped the reader out
// of the app frame with no way back, which is how a link becomes a dead end.

import React from "react";
import DsAppShell from "../ds/DsAppShell.jsx";
import MaterialConstants from "./MaterialConstants.jsx";

export default function WorkConstants() {
  return (
    <DsAppShell title="Constants" page="work-constants">
      <div className="dsh-in">
        <MaterialConstants />
      </div>
    </DsAppShell>
  );
}
