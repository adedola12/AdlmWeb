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

// WHY THIS NO LONGER WRAPS THE CLASSIC PAGE
//
// It used to render pages/MaterialConstants.jsx inside DsAppShell. That page is
// written in the classic utility classes — card, input, btn, text-slate-500 —
// so the frame was his and everything inside it was not, which is the join
// showing on a screen a QS is meant to trust with their firm's own standards.
//
// ds/DsConstants.jsx is the same library and the same endpoints, built from his
// components. The classic page stays exactly where it is, still served at
// /rategen/material-constants, so the link the classic Budget tab has always
// used is untouched.
import React from "react";
import DsAppShell from "../ds/DsAppShell.jsx";
import DsConstants from "../ds/DsConstants.jsx";

export default function WorkConstants() {
  return (
    <DsAppShell title="Constants" page="work-constants">
      <DsConstants />
    </DsAppShell>
  );
}
