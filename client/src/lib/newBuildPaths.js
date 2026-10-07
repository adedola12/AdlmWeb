// The new build's own address for a page the classic site also has.
//
// WHY THE MAPPING ALREADY EXISTS, HALF-WRITTEN
//
// When Richard's pages were ported, the porter knew perfectly well which new
// page matched which classic route — it wrote the answer into a data attribute
// and then left the link pointing at the old one. client/src/ds/chrome/
// DsFooter.jsx is the clearest case:
//
//     <Link to="/product/revit" data-ds-page="quiv">
//
// `data-ds-page="quiv"` IS the new build's slug for that page. So a new-build
// footer, on a new-build page, sends the reader back to the classic product
// page — while carrying the name of the page it should have gone to.
//
// This turns those attributes into a real mapping, in one place, so a link does
// not have to know how the redesign is routed.
//
// WHERE THE NEW PAGES LIVE
//
// Every ported page is mounted at /preview/<slug> (main.jsx, the DS_PAGES.map),
// behind DsPreviewGate — staff only until the redesign is promoted. That gate
// is the reason this returns null rather than guessing: a link on a PUBLIC page
// must not be repointed at /preview, or a customer lands on a gate. Only a page
// that is itself behind the gate — /fit, or another /preview page — may use it.

/** Classic product key → the new build's page slug. From DsFooter's own attributes. */
export const PRODUCT_PAGE = Object.freeze({
  revit: "quiv",
  planswift: "heron",
  rategen: "rategen",
  mep: "mep",
  "qs-takeoff": "timepro",
  civil3d: "civiq",
});

/** Classic path → new build slug, for the pages that are not products. */
const PAGE = Object.freeze({
  "/": "home",
  "/about": "about",
  "/products": "products",
  "/pricing": "pricing",
  "/quote": "quote",
  "/cart": "cart",
  "/checkout": "checkout",
  "/customers": "customers",
  "/contact": "contact",
  "/how-it-works": "how-it-works",
  "/mobile": "mobile",
  "/careers": "careers",
  "/press": "press",
  "/privacy": "privacy",
  "/terms": "terms",
  "/licensing": "licensing",
  "/solutions/firms": "solutions-firms",
  "/solutions/professionals": "solutions-professionals",
  "/solutions/students": "solutions-students",
  "/solutions/institutions": "solutions-institutions",
  "/beyondbim": "beyondbim",
  "/whats-new": "whats-new",
  "/learn": "learn",
});

// An in-app path: one leading slash, and the next character is not another
// slash or a backslash (browsers treat "/\\" as protocol-relative too).
const IN_APP = /^\/(?![/\\])/;

/** Where a ported page is served. */
export const previewPath = (slug) => (slug ? `/preview/${slug}` : "");

/**
 * The new build's address for a classic path, or "" when it has none.
 *
 * Returns "" rather than the classic path, so a caller has to decide what to do
 * about a page the redesign has not reached — silently handing back the classic
 * route is how a link that looks converted stays exactly as it was.
 */
export function newBuildPath(classicPath) {
  const raw = String(classicPath || "").trim();
  // An in-app path, and "starts with /" is not enough: "//evil.example" passes
  // that and is a protocol-relative URL that leaves the site, as does "/\\".
  // The same hole was fixed in lib/agentActions.js; this file is now the single
  // funnel for every new-build chrome link, so it matters more here.
  if (!IN_APP.test(raw)) return "";
  // Drop any query or hash before matching; carry it through afterwards.
  const [path, rest] = [raw.replace(/[?#].*$/, ""), raw.slice(raw.replace(/[?#].*$/, "").length)];

  const product = path.match(/^\/product\/([^/]+)\/?$/);
  if (product) {
    const slug = PRODUCT_PAGE[product[1].toLowerCase()];
    return slug ? previewPath(slug) + rest : "";
  }

  const slug = PAGE[path.replace(/\/+$/, "") || "/"];
  return slug ? previewPath(slug) + rest : "";
}

/**
 * The address to use from a page that is ITSELF inside the redesign.
 *
 * Falls back to the classic path when the redesign has no counterpart, because
 * a dead link is worse than an old one.
 */
export const insideNewBuild = (classicPath) => {
  const mapped = newBuildPath(classicPath);
  if (mapped) return mapped;
  // The fallback has to re-check: newBuildPath answers "" both for a path the
  // redesign has not reached AND for something that is not an in-app path at
  // all, and handing the raw input back would put "//evil.example" straight
  // into a <Link to=…>.
  const raw = String(classicPath || "").trim();
  return IN_APP.test(raw) ? raw : "";
};

/**
 * Is this route itself inside the redesign?
 *
 * THE REASON THIS EXISTS
 *
 * The new-build chrome (DsShell's nav and footer) is NOT only used on gated
 * pages. main.jsx renders it on /certificate, /privacy, /terms and /licensing —
 * genuinely public routes — and the comment there spells out why it must not go
 * through DsPreview: "which would turn every link on them into a staff-only
 * /preview one."
 *
 * So a footer cannot decide once and for all where its links point. It has to
 * ask where IT is. On /fit or a /preview page the reader is already behind the
 * gate and should stay in the redesign; on /privacy they are a member of the
 * public and every link must stay on the classic, reachable site.
 */
export function isNewBuildRoute(pathname) {
  const p = String(pathname || "");
  return p === "/fit" || p.startsWith("/preview/");
}

/**
 * The address a link should use, given the page it is on.
 *
 * One call for the chrome: pass the current pathname and the classic target.
 */
export const linkFrom = (pathname, classicPath) => {
  if (isNewBuildRoute(pathname)) return insideNewBuild(classicPath);
  const raw = String(classicPath || "").trim();
  return IN_APP.test(raw) ? raw : "";
};
