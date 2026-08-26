// The /work/programme route — recorded work on a timeline.

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
