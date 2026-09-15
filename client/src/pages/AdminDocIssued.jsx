// Admin route wrapper — one of the Documents screens. Issued is not a
// read-only register any more: every row opens the document it stands for and
// can put it back in the post, so it has its own component rather than a row
// in the SCREENS map.

import React from "react";
import DsAdminIssued from "../ds/DsAdminIssued.jsx";

export default function AdminDocIssued() {
  return <DsAdminIssued />;
}
