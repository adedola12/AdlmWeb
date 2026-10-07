// The subset of the route tree that is rendered on the server.
//
// WHY A SUBSET
// The server only ever renders pages a crawler can reach. Everything behind
// ProtectedRoute or AdminRoute is Disallowed in robots.txt, so rendering it
// server-side would buy nothing and cost plenty: importing the admin tree pulls
// three.js, web-ifc, jspdf and html2canvas into the server bundle, and those
// touch `window` at module scope. Keeping them out is what makes the server
// bundle small enough to cold-start inside a request the visitor is waiting on.
//
// WHY HYDRATION STILL MATCHES
// The client keeps its own full route tree in main.jsx. React hydrates against
// the *rendered element tree*, not the route config, and for any path listed
// here both trees resolve to the same <App> wrapping the same page component.
// A route missing from this file is simply not server-rendered — it falls back
// to the client-only shell, which is what the whole site did before.
//
// ADDING A ROUTE HERE IS A COMMITMENT: the component must render without
// touching window/document outside an effect. See entry-server.jsx.
import React from "react";

import App from "./App.jsx";

// Richard's public pages, imported EAGERLY and deliberately so.
//
// main.jsx reaches these through ds/pages/manifest.js, which wraps each in
// React.lazy. That is right in the browser and wrong here: renderToString does
// not resolve a lazy component, it renders the Suspense FALLBACK. dsPublic()
// uses `fallback={null}`, so server-rendering these through the manifest would
// not throw and would not fall back to the client shell — it would return a
// 200 with the full chrome and an empty page body, to every crawler and every
// visitor on a slow first paint.
//
// So the server imports the components directly. They are safe to: none of the
// five touches window or document at module scope (scripts/check-render-safety
// .mjs enforces this for the whole server bundle at prebuild).
import DsShell from "./ds/DsShell.jsx";
import DsHome from "./ds/pages/DsHome.jsx";
import DsProducts from "./ds/pages/DsProducts.jsx";
import DsAbout from "./ds/pages/DsAbout.jsx";
import DsLearn from "./ds/custom/DsLearn.jsx";
import DsWhatsNew from "./ds/custom/DsWhatsNew.jsx";
import DsTrainings from "./ds/custom/DsTrainings.jsx";
import DsProductRoute from "./ds/DsProductRoute.jsx";
import DsQuiv from "./ds/custom/DsQuiv.jsx";
import DsHeron from "./ds/custom/DsHeron.jsx";
import DsRateGen from "./ds/custom/DsRateGen.jsx";
import DsMep from "./ds/custom/DsMep.jsx";
import DsTimePro from "./ds/custom/DsTimePro.jsx";
import DsCiviq from "./ds/custom/DsCiviq.jsx";

const DS_PRODUCT_PAGES = {
  quiv: DsQuiv,
  heron: DsHeron,
  rategen: DsRateGen,
  mep: DsMep,
  timepro: DsTimePro,
  civiq: DsCiviq,
};

// The same shape main.jsx mounts, minus the Suspense it does not need here.
const dsPublic = (Page) => (
  <DsShell>
    <Page />
  </DsShell>
);
import AppError from "./pages/AppError.jsx";

import Home from "./pages/Home.jsx";
import Products from "./pages/Products.jsx";
import AboutADLM from "./pages/About.jsx";
import Learn from "./pages/Learn.jsx";
import Trainings from "./pages/Trainings.jsx";
import Testimonials from "./pages/Testimonials.jsx";
import WhatsNew from "./pages/WhatsNew.jsx";
import WhatsNewProduct from "./pages/WhatsNewProduct.jsx";
import Support from "./pages/Support.jsx";
import Quote from "./pages/Quote.jsx";
import NotFound from "./pages/NotFound.jsx";

// SEO landing pages. Pure copy, no data fetching, no auth — the safest thing
// this file contains and the reason it exists.
import { landingRoutes } from "./pages/landing/routes.jsx";

// Which of these paths the server is actually allowed to render is decided by
// src/lib/ssrPaths.js. That list is plain JavaScript so the Vercel function can
// consult it without loading React. Adding a route here means adding it there.

export const marketingRoutes = [
  {
    path: "/",
    element: <App />,
    errorElement: <AppError />,
    children: [
      { index: true, element: dsPublic(DsHome) },

      { path: "products", element: dsPublic(DsProducts) },
      { path: "product/:key", element: <DsProductRoute pages={DS_PRODUCT_PAGES} wrap={(page) => <DsShell>{page}</DsShell>} /> },
      { path: "about", element: dsPublic(DsAbout) },
      { path: "learn", element: dsPublic(DsLearn) },
      { path: "trainings", element: dsPublic(DsTrainings) },
      { path: "testimonials", element: <Testimonials /> },
      { path: "whats-new", element: dsPublic(DsWhatsNew) },
      { path: "whats-new/:slug", element: <WhatsNewProduct /> },
      { path: "support", element: <Support /> },

      ...landingRoutes,

      { path: "*", element: <NotFound /> },
    ],
  },
];

export default marketingRoutes;
