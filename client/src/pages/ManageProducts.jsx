// The /manage/products route: his app frame around his Products screen.
//
// Same split as ManageOverview — the frame and the screen stay independent, so
// the rail, the top bar and his dashboard CSS live in one place.

import React from "react";
import DsAppShell from "../ds/DsAppShell.jsx";
import DsProducts from "../ds/DsProducts.jsx";

export default function ManageProducts() {
  return (
    <DsAppShell title="Products" page="dash-products">
      <DsProducts />
    </DsAppShell>
  );
}
