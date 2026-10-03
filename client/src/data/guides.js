// PDF user guides, published with the frontend under public/docs.
//
// Adding or updating a guide: edit src/content/guides/<id>.md, run
// `node scripts/build-guide-pdfs.mjs`, and add or update its row here. A file
// whose name starts with "_" is a draft for software not yet released, and is
// skipped. `productKeys` lets a guide be matched to what a user owns —
// the dashboard shows the ones relevant to their subscriptions first.
// `changelogSlugs` maps a guide onto the What's New products it covers
// (src/data/changelogs/<slug>.md), so each product page can offer its guide.

export const GUIDES = [
  // Rebuilt in October 2026 from src/content/guides/*.md by
  // scripts/build-guide-pdfs.mjs. Each book keeps the file name of the
  // September book it replaces, so links already sent in emails still open.
  // `pages` is what the builder printed; update it when a guide is rebuilt.
  {
    id: "getting-started",
    title: "Getting started with ADLM Studio",
    blurb:
      "Your account, buying and renewing, the dashboard, licences and devices, team seats and getting help.",
    file: "/docs/ADLM-Getting-Started-Guide.pdf",
    pages: 25,
    productKeys: [],
    changelogSlugs: [],
  },
  {
    id: "installer-hub",
    title: "ADLM Installer Hub",
    blurb:
      "Signing in, installing your products, applying updates, freeing a machine, and fixing the things that go wrong.",
    file: "/docs/ADLM-Installer-Hub-User-Guide.pdf",
    pages: 19,
    productKeys: [],
    changelogSlugs: ["hub"],
    alwaysShow: true,
  },
  {
    id: "quiv",
    title: "QUIV for Revit",
    blurb:
      "The Model Checker, taking off every element, auto take-off, linked models, pricing with Rate Gen and saving to ADLM Cloud.",
    file: "/docs/ADLM-QUIV-Revit-User-Guide.pdf",
    pages: 18,
    productKeys: ["revit"],
    changelogSlugs: ["quiv"],
  },
  {
    id: "rategen",
    title: "ADLM Rate Gen",
    blurb:
      "Rate build-ups, the material, labour and plant libraries, custom rates, and how rates reach QUIV and HERON.",
    file: "/docs/ADLM-RateGen-User-Guide.pdf",
    pages: 22,
    productKeys: ["rategen"],
    changelogSlugs: ["rategen"],
  },
  {
    id: "heron",
    title: "ADLM HERON",
    blurb:
      "Scaling drawings, measuring with the ADLM templates, pricing, the budget, Excel export and the Excel Takeoff Link.",
    file: "/docs/ADLM-Heron-User-Guide.pdf",
    pages: 27,
    productKeys: ["planswift", "heron"],
    changelogSlugs: ["heron"],
  },
  {
    id: "mep",
    title: "SERVIQ for Revit MEP",
    blurb:
      "Taking off ducts, pipes, fittings, fixtures and cables in Revit, the take-off database, pricing and Excel export.",
    file: "/docs/ADLM-Revit-MEP-User-Guide.pdf",
    pages: 20,
    productKeys: ["mep"],
    changelogSlugs: ["mep"],
  },
  {
    id: "timepro",
    title: "ADLM Time Pro",
    blurb:
      "Logging daily gang output, turning bill quantities into durations and crew sizes, and exporting to Excel and Microsoft Project.",
    file: "/docs/ADLM-TimePro-User-Guide.pdf",
    pages: 20,
    productKeys: ["qs-takeoff"],
    changelogSlugs: ["timepro"],
  },
  {
    id: "cloud",
    title: "ADLM Cloud workspace",
    blurb:
      "Your projects on the website: the bill, budget, valuations, the PM dashboard, sharing, collaborators and sample projects.",
    file: "/docs/ADLM-Cloud-User-Guide.pdf",
    pages: 24,
    productKeys: [],
    changelogSlugs: ["cloud"],
  },
  // Every guide above in one book. productKeys is empty and alwaysShow is off
  // ON PURPOSE: either would put it into ownedGuidesFor, which feeds the
  // Dashboard and the user-guide mailshot (server/util/guideEmail.js).
  {
    id: "suite",
    title: "ADLM Complete User Guide",
    blurb:
      "Every guide above in one book: getting started, the Hub, QUIV, HERON, Rate Gen, SERVIQ, Time Pro and the ADLM Cloud.",
    file: "/docs/ADLM-Software-Complete-Guide.pdf",
    pages: 141,
    productKeys: [],
    changelogSlugs: [],
  },
];

/**
 * The guide covering a given What's New product slug, or null when that
 * product has no published guide yet (CIVIQ, Courses).
 */
export function guideForChangelogSlug(slug) {
  const key = String(slug || "").toLowerCase();
  if (!key) return null;
  return (
    GUIDES.find((g) => (g.changelogSlugs || []).includes(key)) || null
  );
}

/**
 * The guide covering a given product, or null.
 *
 * Unlike ownedGuidesFor this ignores entitlement on purpose: it backs the
 * product page, where letting someone read the manual before they buy is the
 * point. `alwaysShow` guides are not returned here — the Installer Hub book is
 * not what a visitor is asking about when they are looking at RateGen.
 */
export function guideForProductKey(productKey) {
  const key = String(productKey || "").toLowerCase();
  if (!key) return null;
  return GUIDES.find((g) => (g.productKeys || []).includes(key)) || null;
}

/**
 * Guides ordered for a given user: ones covering a product they own first,
 * then the rest. Never hides anything — a customer evaluating a product
 * should still be able to read its guide.
 */
/**
 * Only the guides a user has actually paid for.
 *
 * Different from orderGuidesFor, which shows everything and merely sorts the
 * relevant ones first. A guide for a product someone has not bought is an
 * advert dressed as documentation, and it also leaks the shape of products
 * they have no access to. This returns nothing they are not entitled to.
 *
 * `alwaysShow` survives the filter, but only once they own something: the
 * Installer Hub guide covers how to install and license whatever they bought,
 * so it is useless to a user with no products and necessary to everyone else.
 */
export function ownedGuidesFor(ownedProductKeys = []) {
  const owned = new Set(
    (ownedProductKeys || [])
      .map((k) => String(k || "").toLowerCase())
      .filter(Boolean),
  );
  if (!owned.size) return [];
  return GUIDES.filter(
    (g) => g.alwaysShow || g.productKeys.some((k) => owned.has(k)),
  );
}

export function orderGuidesFor(ownedProductKeys = []) {
  const owned = new Set(
    (ownedProductKeys || []).map((k) => String(k || "").toLowerCase()),
  );
  const relevant = (g) =>
    g.alwaysShow || g.productKeys.some((k) => owned.has(k));
  return [
    ...GUIDES.filter(relevant),
    ...GUIDES.filter((g) => !relevant(g)),
  ];
}
