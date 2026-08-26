// Route map: Richard's static-site pages -> this app's routes.
//
// The brief was "merge — keep all your routes", so nothing here removes an
// existing route. Each of his pages either lands on the route that already
// serves that purpose, or takes a new one. Pages of ours with no counterpart
// of his are untouched and keep working; they are listed at the bottom so the
// nav rebuild does not quietly drop them.
//
// Used by scripts/port-ds-html.mjs to rewrite his <a href="quiv"> into the
// router's <Link to="/product/quiv">. A page name missing from MAP is a build
// error rather than a silent broken link.

// His page -> our path. `null` means "deliberately not a route" (fragments of
// chrome, or a screen we already own and are only restyling).
export const MAP = {
  // ── straight matches ────────────────────────────────────────────────────
  index: "/",
  products: "/products",
  about: "/about",
  learn: "/learn",
  "whats-new": "/whats-new",

  // His "customers" page is our testimonials page under a different name.
  customers: "/testimonials",

  // ── product pages ───────────────────────────────────────────────────────
  // Ours are data-driven at /product/:key, and the keys are LEGACY — they name
  // the host CAD application, not the product it became. QUIV is the Revit
  // plugin, so its key is "revit"; HERON is the PlanSwift one, so "planswift".
  // Taking his file names as keys gave /product/quiv, which is not a product
  // and renders "product not found". Verified against GET /products on the
  // live API — see PRODUCT_KEY below, which is the single source of truth.
  quiv: "/product/revit",
  heron: "/product/planswift",
  rategen: "/product/rategen",
  mep: "/product/mep",
  timepro: "/product/qs-takeoff",
  civiq: "/product/civil3d",
  // The mobile companion app is not a catalogue product — nothing to buy, so
  // no /product/:key row exists for it. His page is pure marketing.
  mobile: "/mobile",

  // ── new marketing routes (no counterpart today) ─────────────────────────
  pricing: "/pricing",
  contact: "/contact",
  // His self-service quotation page, added upstream 2026-08-18. We already
  // have a /quote route, so it lands there.
  quote: "/quote",
  "how-it-works": "/how-it-works",
  careers: "/careers",
  press: "/press",
  privacy: "/privacy",
  terms: "/terms",
  licensing: "/licensing",
  "solutions-firms": "/solutions/firms",
  "solutions-professionals": "/solutions/professionals",
  "solutions-students": "/solutions/students",
  "solutions-institutions": "/solutions/institutions",

  // ── auth + commerce: our routes exist and own the behaviour ─────────────
  login: "/login",
  signup: "/signup",
  verify: "/verify",
  cart: "/purchase",
  checkout: "/purchase",
  thanks: "/checkout/thanks",
  account: "/profile",

  // ── the signed-in app ───────────────────────────────────────────────────
  // These were pointed at our three big pages — /dashboard, /learn, /profile —
  // which collapsed 16 of his rail items onto 3 routes and made half the rail
  // navigate to the page it was already on. His app is not one dashboard: it
  // is a Work surface and a Manage surface, each with its own screens, and the
  // rail only makes sense if they exist. They do now.
  //
  // Nothing was taken away to do it. /dashboard, /profile and /learn keep
  // working exactly as before and keep their own data; the new routes are
  // additional. Which of the two becomes canonical is a decision for when the
  // redesign is promoted off /preview, not one to make by breaking a URL.
  "dash-home": "/manage",
  "dash-products": "/manage/products",
  "dash-product": "/product/:key",
  "dash-billing": "/manage/billing",
  "dash-downloads": "/manage/downloads",
  "dash-settings": "/manage/settings",
  "dash-team": "/manage/team",
  // His signed-in support screen, not the public /support page, which still
  // exists and still works.
  "dash-support": "/manage/support",
  // The Learn group is not built yet; these point at where the same things
  // live today rather than at routes that do not exist.
  "dash-learning": "/learn",
  "dash-certificates": "/dashboard",
  "dash-course": "/learn/course/:sku",
  "dash-emails": null, // an internal email preview harness, not a public route
  "work-home": "/work",
  "work-projects": "/work/projects",
  "work-project": "/projects/:tool",
  // Rate library and Programme are RateGen and Time Pro under his names — the
  // screens exist, so these keep pointing at the real ones rather than growing
  // a second copy.
  "work-library": "/rategen",
  "work-rate": "/rategen",
  "work-programme": "/time-management",
  // Ada is a component inside this app, but his nav links a marketing page
  // explaining what she does — "Part of the studio". It needs its own route.
  ada: "/ada",
  "doc-preview": null, // covered by the existing report/proposal previews
  "quiv-legacy": null, // orphan in his repo; nothing links to it
};

// Ours with no page of his. These must survive the nav rebuild — several are
// the SEO landing pages the marketing routes were just server-rendered for.
export const KEEP = [
  "/trainings",
  "/ptrainings/:key",
  "/support",
  "/support/request",
  "/quote",
  "/freebies",
  "/portfolio",
  "/portfolio-dashboard",
  "/pm-tracker",
  "/archicad",
  "/rategen/material-constants",
  "/rategen/services-constants",
  "/rategen/updates",
  "/whats-new/:slug",
  // SEO landing pages — server-rendered, do not drop from the sitemap.
  "/quantity-surveying-software-nigeria",
  "/bim-software-nigeria",
  "/construction-technology-company-nigeria",
  "/revit-quantity-takeoff-plugin",
  "/planswift-takeoff-software-nigeria",
  "/construction-rate-database-nigeria",
];

// His product slug -> our catalogue key, as returned by GET /products.
// The keys are historical: they name the CAD host each plugin was written for,
// which is why none of them match the product names customers actually see.
//
//   revit      QUIV: 3D Model QS Software
//   planswift  HERON: PlanSwift / 2D Drawings QS Software
//   mep        Revit MEP Plugin
//   rategen    RateGen
//   qs-takeoff ADLM Time Pro
//   civil3d    CIVIQ: Civil3D TakeOff Software
//
// If a product is ever re-keyed, this table is the only thing to change.
export const PRODUCT_KEY = {
  quiv: "revit",
  heron: "planswift",
  rategen: "rategen",
  mep: "mep",
  timepro: "qs-takeoff",
  civiq: "civil3d",
};

// Where his asset folders land in this app. His images were copied wholesale
// to public/ds; the four PDFs already existed in public/docs, so those keep
// the path they have here rather than gaining a duplicate copy.
const ASSET_PREFIX = [
  [/^assets\/img\//, "/ds/"],
  [/^docs\//, "/docs/"],
];

// Asset folders with no meaning in this app: his CSS is ported by
// port-ds-css.mjs, and his "five weights" of Lexend are one byte-identical
// file (the app loads real Lexend 100..900 from Google Fonts).
const ASSET_DROP = [/^assets\/css\//, /^assets\/fonts\//, /^assets\/js\//];

// Resolve one of his hrefs. Handles "quiv", "quiv#pricing", "pricing#compare",
// "dash-product?p=mep", asset paths, and absolute/mailto/tel which pass through.
// Returns null for a link that should not be emitted at all.
export function resolveHref(href) {
  if (!href) return href;
  if (/^(https?:|mailto:|tel:|#|\/)/.test(href)) return href;

  for (const re of ASSET_DROP) if (re.test(href)) return null;
  for (const [re, prefix] of ASSET_PREFIX) {
    if (re.test(href)) return href.replace(re, prefix);
  }

  // Split off the hash first, then the query — his internal links use both
  // (`dash-product?p=mep`), and the page name is what MAP is keyed on.
  const [beforeHash, hash] = href.split("#");
  const [name, query] = beforeHash.split("?");
  const clean = name.replace(/\.html$/, "").replace(/\/$/, "");
  if (!clean) return hash ? `#${hash}` : "/";

  if (!Object.prototype.hasOwnProperty.call(MAP, clean)) {
    throw new Error(`[dsRoutes] no mapping for "${href}" — add it to MAP`);
  }
  let path = MAP[clean];
  if (path === null) return "/";

  // `dash-product?p=quiv` is his way of parameterising one page; ours puts the
  // key in the path, so fold the query into the `:key` segment — translating
  // his slug to our catalogue key on the way through.
  if (query && path.includes(":key")) {
    const value = new URLSearchParams(query).get("p");
    if (value) path = path.replace(":key", PRODUCT_KEY[value] || value);
  } else if (query) {
    path = `${path}?${query}`;
  }

  return hash ? `${path}#${hash}` : path;
}

export default MAP;
