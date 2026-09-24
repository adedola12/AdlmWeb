// The /manage/support route: his signed-in support screen.
//
// Deliberately not at /support, which is the existing public page and keeps
// working. This one is fed by the account, which is what makes the promise in
// its own subheading true.

import React from "react";
import DsAppShell from "../ds/DsAppShell.jsx";
import DsSupport from "../ds/DsSupport.jsx";

export default function ManageSupport() {
  return (
    <DsAppShell title="Support" page="dash-support">
      <DsSupport />
    </DsAppShell>
  );
}
