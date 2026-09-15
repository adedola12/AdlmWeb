// Admin route wrapper — one of the Documents screens. Templates is the one
// that is not a read-only register: it carries his "Ask for a template" form,
// so it has its own component rather than a row in the SCREENS map.

import React from "react";
import DsAdminTemplates from "../ds/DsAdminTemplates.jsx";

export default function AdminDocTemplates() {
  return <DsAdminTemplates />;
}
