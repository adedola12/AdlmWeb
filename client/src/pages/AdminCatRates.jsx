// Admin route wrapper — his "Rate data" screen, at /admin/rategen-master.
//
// This used to render the catalogue's rates table, which made it a second copy
// of the Rate library: two nav entries, the same endpoint, the same rows. His
// split is the right one and this route now honours it — Rate data is the
// master material and labour prices, Rate library is the rates.
//
// The prices are read-only here by design. They are corrected in ADLM Rate Gen
// and published from there to every installation in a zone, so an edit control
// on this page would be a second way to change one number, and the two would
// eventually disagree.

import React from "react";
import DsAdminRateLibrary from "../ds/DsAdminRateLibrary.jsx";

export default function AdminCatRates() {
  return <DsAdminRateLibrary screen="data" />;
}
