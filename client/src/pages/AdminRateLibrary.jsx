// Admin route wrapper — the rate library.
//
// Replaces AdminRateGen, which was a material and labour price grid living
// under a "Rate library" label. Richard's Rate data screen is the prices; his
// Rate library is the rates. This route now shows what its name says.

import React from "react";
import DsAdminRateLibrary from "../ds/DsAdminRateLibrary.jsx";

export default function AdminRateLibrary() {
  return <DsAdminRateLibrary />;
}
