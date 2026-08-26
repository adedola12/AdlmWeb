// The /work/rate/:id route — one rate and its build-up.

import React from "react";
import DsAppShell from "../ds/DsAppShell.jsx";
import DsWorkRate from "../ds/DsWorkRate.jsx";

export default function WorkRate() {
  return (
    <DsAppShell title="Rate" page="work-rate">
      <DsWorkRate />
    </DsAppShell>
  );
}
