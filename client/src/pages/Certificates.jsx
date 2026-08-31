// The /dash-certificates route: his app frame around his Certificates screen.

import React from "react";
import DsAppShell from "../ds/DsAppShell.jsx";
// His .lx-* sheet. It is not in the app shell because the marketing pages,
// which are almost all the traffic, have no use for it.
import DsLearnStyles from "../ds/DsLearnStyles.jsx";
import DsCertificates from "../ds/DsCertificates.jsx";

export default function Certificates() {
  return (
    <DsAppShell title="Certificates" page="dash-certificates">
      <DsLearnStyles />
      <DsCertificates />
    </DsAppShell>
  );
}
