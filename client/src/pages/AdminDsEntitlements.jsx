// Admin route wrapper — one of the five Commerce registers.
// See ds/DsAdminCommerce.jsx: they are one screen with different columns.

import React from "react";
import DsAdminCommerce from "../ds/DsAdminCommerce.jsx";

export default function AdminDsEntitlements() {
  return <DsAdminCommerce screen="entitlements" />;
}
