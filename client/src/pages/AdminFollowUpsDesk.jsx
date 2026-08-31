// The /admin/follow-ups route — the call desk in his design.
//
// Named ...Desk because pages/AdminFollowUps.jsx is the screen this replaces
// and is still in the tree. It keeps the call log; what it does not keep is
// the Notion push and the manual rebuild, which are noted in the handover.

import React from "react";
import DsAdminFollowUps from "../ds/DsAdminFollowUps.jsx";

export default function AdminFollowUpsDesk() {
  return <DsAdminFollowUps />;
}
