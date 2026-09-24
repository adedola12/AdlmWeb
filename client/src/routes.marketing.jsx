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
import AppError from "./pages/AppError.jsx";

import Home from "./pages/Home.jsx";
import Products from "./pages/Products.jsx";
import ProductDetail from "./pages/ProductDetail.jsx";
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
      { index: true, element: <Home /> },

      { path: "products", element: <Products /> },
      { path: "product/:key", element: <ProductDetail /> },
      { path: "about", element: <AboutADLM /> },
      { path: "learn", element: <Learn /> },
      { path: "trainings", element: <Trainings /> },
      { path: "testimonials", element: <Testimonials /> },
      { path: "whats-new", element: <WhatsNew /> },
      { path: "whats-new/:slug", element: <WhatsNewProduct /> },
      { path: "support", element: <Support /> },
      { path: "quote", element: <Quote /> },

      ...landingRoutes,

      { path: "*", element: <NotFound /> },
    ],
  },
];

export default marketingRoutes;
