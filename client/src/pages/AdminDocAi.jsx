// Admin route wrapper — AI spend, and what each account is allowed to spend.
// Its own component rather than a row in the SCREENS map, because it is the
// one of these that can be acted on: allowances are set from here.

import React from "react";
import DsAdminAiUsage from "../ds/DsAdminAiUsage.jsx";

export default function AdminDocAi() {
  return <DsAdminAiUsage />;
}
