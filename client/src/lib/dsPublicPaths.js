// The public marketing pages that render Richard's design.
//
// ONE LIST, TWO READERS. main.jsx mounts these paths on his ported pages
// (ds/pages/manifest.js) inside his shell; App.jsx reads the same list to
// suppress the classic nav, footer, launch strip and coupon banner, and to
// drop <main>'s padding so his full-bleed layouts are not boxed in.
//
// Keeping it in one place is the point: the two decisions have to agree. A
// path mounted on his page but missing here renders his nav UNDER the classic
// one — two navigations stacked, which is what the signed-in app already had
// to fix. A path listed here but not mounted there loses its chrome entirely
// and renders the classic page with no way out of it.
//
// EXACT MATCHES, NOT PREFIXES
//
// /learn is his page; /learn/course/:sku and /learn/free/:id are still the
// classic player and still want the classic chrome. /whats-new is his;
// /whats-new/:slug is still the classic per-product changelog. A prefix test
// would strip the nav off those children and strand the reader.
//
// WHAT IS NOT HERE, AND WHY
//
// /trainings — Richard's build has no trainings page (his site/ has no
// trainings.html and the manifest has no such slug), so there is nothing to
// switch it to. It stays classic until he designs one.
//
// /product/:key, /quote's thank-you, the course player, checkout and every
// signed-in screen are out of scope: this list is only the public marketing
// pages that had a classic page AND have a ported replacement.

export const DS_PUBLIC_PATHS = new Set([
  "/",
  "/products",
  "/about",
  "/learn",
  "/whats-new",
  "/quote",

  // Sign in and create account. These are not marketing pages, but they take
  // the same treatment for the same reason: his auth2 layout is a full-height
  // split with its own logo and art panel, so the classic nav above it and the
  // footer below would frame a page built to fill the window.
  "/login",
  "/signup",
]);

/** The slug in ds/pages/manifest.js that serves a given public path. */
export const DS_PUBLIC_SLUGS = Object.freeze({
  "/": "home",
  "/products": "products",
  "/about": "about",
  "/learn": "learn",
  "/whats-new": "whats-new",
  "/quote": "quote",
  // login/signup are served by the WIRED pages in ds/custom, not by the
  // generated ones in ds/pages, so they have no manifest slug here.
});

/** Does this pathname render Richard's design? Trailing slashes ignored. */
export function isDsPublicPath(pathname) {
  const p = String(pathname || "").replace(/\/+$/, "") || "/";
  return DS_PUBLIC_PATHS.has(p);
}

export default DS_PUBLIC_PATHS;
