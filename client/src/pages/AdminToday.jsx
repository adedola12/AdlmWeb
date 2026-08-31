// The /admin route — Today, the first of his admin screens to be ported.
//
// The hub it replaces is not gone: its queues are still their own routes
// (/admin/pending, /admin/active and the rest), and the rail links to them.
// What Today replaces is the hub's own front page, which was a tab strip over
// the same lists rather than a view of what needs doing.

import React from "react";
import DsAdminToday from "../ds/DsAdminToday.jsx";

export default function AdminToday() {
  return <DsAdminToday />;
}
