// The /work/programme route — the bill, sequenced.

import React from "react";
import DsAppShell from "../ds/DsAppShell.jsx";
import DsWorkProgramme from "../ds/DsWorkProgramme.jsx";

export default function WorkProgramme() {
  return (
    <DsAppShell title="Programme" page="work-programme">
      <DsWorkProgramme />
    </DsAppShell>
  );
}
