// The /dash-learning route — where somebody is up to, rather than what we teach.

import React from "react";
import DsAppShell from "../ds/DsAppShell.jsx";
// His .lx-* sheet. It is not in the app shell because the marketing pages,
// which are almost all the traffic, have no use for it.
import DsLearnStyles from "../ds/DsLearnStyles.jsx";
import DsLearning from "../ds/DsLearning.jsx";

export default function Learning() {
  return (
    <DsAppShell title="My learning" page="dash-learning">
      <DsLearnStyles />
      <DsLearning />
    </DsAppShell>
  );
}
