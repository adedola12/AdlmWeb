// The definitive list of paths the server renders, and nothing else.
//
// Deliberately plain JavaScript with no imports. The Vercel function has to ask
// "should I render this path?" before it loads React or the server bundle, and
// a route table full of JSX cannot answer that question cheaply.
//
// WHY A LIST RATHER THAN "ASK THE ROUTER"
// The server's route tree ends in a catch-all that renders <NotFound>. Asking
// it about /dashboard would get a confident match on that catch-all — so every
// signed-in route in the app would render the not-found page and, worse, be
// served with a 404. Gating on an explicit list makes the failure mode "this
// path is not server-rendered", which is exactly what the whole site did
// before and is safe by construction.
//
// Adding a public marketing route means adding it here AND to the route tree in
// src/routes.marketing.jsx. Miss this file and the page silently falls back to
// the empty shell.

export const SSR_PATHS = [
  "/",
  "/products",
  "/product/:key",
  "/about",
  "/learn",
  "/trainings",
  "/testimonials",
  "/whats-new",
  "/whats-new/:slug",
  "/support",
  "/quote",

  // Search landing pages
  "/quantity-surveying-software-nigeria",
  "/bim-software-nigeria",
  "/construction-technology-company-nigeria",
  "/revit-quantity-takeoff-plugin",
  "/planswift-takeoff-software-nigeria",
  "/construction-rate-database-nigeria",
];

/** ":key" matches one path segment; everything else is literal. */
function toRegExp(pattern) {
  const source = pattern
    .split("/")
    .map((segment) =>
      segment.startsWith(":")
        ? "[^/]+"
        : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    )
    .join("/");
  return new RegExp(`^${source}/?$`, "i");
}

const MATCHERS = SSR_PATHS.map(toRegExp);

export function isSsrPath(pathname) {
  const clean = String(pathname || "/").split("?")[0];
  return MATCHERS.some((re) => re.test(clean));
}

export default SSR_PATHS;
