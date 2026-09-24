// The public route list, in one place.
//
// Three things read it: the sitemap generator, the acceptance test, and the
// IndexNow ping. Keeping them on one list is what stops the familiar failure
// where a new page is live, absent from the sitemap, and never submitted.
//
// Only publicly indexable URLs belong here. Anything Disallowed in
// public/robots.txt must stay out — listing a URL you also forbid is a
// contradiction Search Console reports as an error.

/** Marketing pages that exist regardless of what is in the database. */
export const STATIC_ROUTES = [
  ["/", "weekly", "1.0"],
  ["/products", "weekly", "0.9"],
  ["/learn", "weekly", "0.8"],
  ["/trainings", "weekly", "0.8"],
  ["/about", "monthly", "0.7"],
  ["/testimonials", "monthly", "0.6"],
  ["/whats-new", "weekly", "0.6"],
  ["/support", "monthly", "0.4"],
  ["/quote", "monthly", "0.4"],
];

/** The search landing pages. Each targets one phrase and links to its product. */
export const LANDING_ROUTES = [
  ["/quantity-surveying-software-nigeria", "monthly", "0.9"],
  ["/bim-software-nigeria", "monthly", "0.9"],
  ["/construction-technology-company-nigeria", "monthly", "0.8"],
  ["/revit-quantity-takeoff-plugin", "monthly", "0.9"],
  ["/planswift-takeoff-software-nigeria", "monthly", "0.9"],
  ["/construction-rate-database-nigeria", "monthly", "0.9"],
];

/** Product pages worth checking by hand. The sitemap still reads the live API. */
export const SAMPLE_PRODUCT_ROUTES = [
  "/product/revit",
  "/product/planswift",
  "/product/rategen",
];

/** Everything the acceptance test walks. */
export const ROUTES = [
  ...STATIC_ROUTES.map(([loc]) => loc),
  ...LANDING_ROUTES.map(([loc]) => loc),
  ...SAMPLE_PRODUCT_ROUTES,
];
