// Admin route wrapper — Storage, at /admin/storage.
//
// Was the last screen still rendering the old monolithic <Admin section="…" />.

import React from "react";
import DsAdminStorage from "../ds/DsAdminStorage.jsx";

export default function AdminStorage() {
  return <DsAdminStorage />;
}
