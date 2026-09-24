// The /manage/guides route: his app frame around Guides & docs (R04).
import React from "react";
import DsAppShell from "../ds/DsAppShell.jsx";
import DsGuides from "../ds/DsGuides.jsx";

export default function ManageGuides() {
  return (
    <DsAppShell title="Guides & docs" page="dash-guides">
      <DsGuides />
    </DsAppShell>
  );
}
