// The /work/tool/:t route (P0.4): one tool's projects, his tool page.

import React from "react";
import { useParams } from "react-router-dom";
import DsAppShell from "../ds/DsAppShell.jsx";
import DsWorkTool from "../ds/DsWorkTool.jsx";
import { SOURCES } from "../lib/projectGallery.js";

export default function WorkTool() {
  const { t } = useParams();
  const name = Object.values(SOURCES).find((s) => s.slug === String(t || "").toLowerCase())?.name || "My tools";
  return (
    <DsAppShell title={name} page="work-tool">
      <DsWorkTool />
    </DsAppShell>
  );
}
