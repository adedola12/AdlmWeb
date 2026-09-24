// Route table for the SEO landing pages.
//
// Kept beside the pages rather than inline in routes.marketing.jsx so the two
// route trees that need them — the server's marketing tree and the client's
// full tree in main.jsx — read from one list and cannot drift apart.
//
// The paths are also listed in src/lib/ssrPaths.js, which is what decides
// whether the Vercel function server-renders a request. A page added here but
// missing there still works; it just falls back to the empty client shell,
// which for pages that exist only to be found in a search is the same as not
// shipping it.
import React from "react";

import QuantitySurveyingSoftwareNigeria from "./QuantitySurveyingSoftwareNigeria.jsx";
import BimSoftwareNigeria from "./BimSoftwareNigeria.jsx";
import ConstructionTechnologyCompanyNigeria from "./ConstructionTechnologyCompanyNigeria.jsx";
import RevitQuantityTakeoffPlugin from "./RevitQuantityTakeoffPlugin.jsx";
import PlanswiftTakeoffSoftwareNigeria from "./PlanswiftTakeoffSoftwareNigeria.jsx";
import ConstructionRateDatabaseNigeria from "./ConstructionRateDatabaseNigeria.jsx";

export const landingRoutes = [
  {
    path: "quantity-surveying-software-nigeria",
    element: <QuantitySurveyingSoftwareNigeria />,
  },
  {
    path: "bim-software-nigeria",
    element: <BimSoftwareNigeria />,
  },
  {
    path: "construction-technology-company-nigeria",
    element: <ConstructionTechnologyCompanyNigeria />,
  },
  {
    path: "revit-quantity-takeoff-plugin",
    element: <RevitQuantityTakeoffPlugin />,
  },
  {
    path: "planswift-takeoff-software-nigeria",
    element: <PlanswiftTakeoffSoftwareNigeria />,
  },
  {
    path: "construction-rate-database-nigeria",
    element: <ConstructionRateDatabaseNigeria />,
  },
];

export default landingRoutes;
