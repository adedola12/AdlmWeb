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
  // `video` is the YouTube playlist for the product where one exists (the
  // same links the plugins open), otherwise a search of the ADLM channel.
  {
    id: "getting-started",
    title: "Getting started with ADLM Studio",
    blurb:
      "Your account, buying and renewing, the dashboard, licences and devices, team seats and getting help.",
    file: "/docs/ADLM-Getting-Started-Guide.pdf",
    pages: 25,
    productKeys: [],
    changelogSlugs: [],
    video: { url: "https://www.youtube.com/@ADLMStudio/search?query=Installer%20Hub", label: "Getting started videos" },
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
    video: { url: "https://www.youtube.com/@ADLMStudio/search?query=Installer%20Hub", label: "Installer Hub videos" },
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
    video: { url: "https://www.youtube.com/@ADLMStudio/search?query=QUIV", label: "QUIV videos" },
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
    video: { url: "https://www.youtube.com/playlist?list=PLk1KkUNE9ZrO5IPh7p3-5zxfDFs1Dl9b-", label: "RateGen playlist" },
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
    video: { url: "https://www.youtube.com/@ADLMStudio/search?query=HERON", label: "HERON videos" },
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
    video: { url: "https://www.youtube.com/playlist?list=PLk1KkUNE9ZrPCA0Xd0gc7SubdFKagRPog", label: "SERVIQ playlist" },
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
    video: { url: "https://www.youtube.com/@ADLMStudio/search?query=Time%20Pro", label: "Time Pro videos" },
  },
  {
    id: "cloud",
    title: "ADLM Cloud: overview",
    blurb:
      "Where everything is on the ADLM Cloud, what is new, and which of the five Cloud guides to read.",
    file: "/docs/ADLM-Cloud-User-Guide.pdf",
    pages: 5,
    productKeys: [],
    changelogSlugs: ["cloud"],
    video: { url: "https://www.youtube.com/@ADLMStudio/search?query=ADLM%20Cloud", label: "ADLM Cloud videos" },
  },
  {
    id: "cloud-projects",
    title: "ADLM Cloud: projects and your workspace",
    blurb:
      "Finding your way around, your project list, the project dashboard, the 3D model and the work area.",
    file: "/docs/ADLM-Cloud-Projects-Guide.pdf",
    pages: 11,
    productKeys: [],
    changelogSlugs: [],
  },
  {
    id: "cloud-bill-budget",
    title: "ADLM Cloud: the bill and the budget",
    blurb:
      "Pricing the Bill of Quantity, picking Rate Gen rates, the materials and labour budget, constants and exports.",
    file: "/docs/ADLM-Cloud-Bill-and-Budget-Guide.pdf",
    pages: 8,
    productKeys: [],
    changelogSlugs: [],
  },
  {
    id: "cloud-valuation",
    title: "ADLM Cloud: valuations and the contract",
    blurb:
      "Interim valuations, payment certificates, variations, the final account and the contract lock.",
    file: "/docs/ADLM-Cloud-Valuation-Guide.pdf",
    pages: 6,
    productKeys: [],
    changelogSlugs: [],
  },
  {
    id: "cloud-pm",
    title: "ADLM Cloud: programme and project management",
    blurb:
      "The PM Dashboard, the PM Tracker and the Portfolio dashboard.",
    file: "/docs/ADLM-Cloud-PM-Guide.pdf",
    pages: 6,
    productKeys: [],
    changelogSlugs: [],
  },
  {
    id: "cloud-sharing",
    title: "ADLM Cloud: sharing, team and Ada",
    blurb:
      "Sharing a dashboard with your client, collaborators and what they can see, your team, and Ada.",
    file: "/docs/ADLM-Cloud-Sharing-Guide.pdf",
    pages: 7,
    productKeys: [],
    changelogSlugs: [],
  },
  {
    id: "samples",
    title: "Sample projects",
    blurb:
      "All 20 read-only learning samples: what each one is, what it teaches, and five exercises to work through.",
    file: "/docs/ADLM-Sample-Projects-Guide.pdf",
    pages: 16,
    productKeys: [],
    changelogSlugs: [],
  },
  {
    id: "qs-handbook",
    title: "The ADLM QS handbook",
    blurb:
      "Key QS formulas with worked examples, a formula library, constants, grade and unit conversion, and use cases for every ADLM product.",
    file: "/docs/ADLM-QS-Handbook.pdf",
    pages: 47,
    productKeys: [],
    changelogSlugs: [],
  },
  // Every guide above in one book. productKeys is empty and alwaysShow is off
  // ON PURPOSE: either would put it into ownedGuidesFor, which feeds the
  // Dashboard and the user-guide mailshot (server/util/guideEmail.js).
  {
    id: "suite",
    title: "ADLM Complete User Guide",
    blurb:
      "Every guide above in one book: getting started, the Hub, QUIV, HERON, Rate Gen, SERVIQ, Time Pro, the ADLM Cloud, the sample projects and the QS handbook.",
    file: "/docs/ADLM-Software-Complete-Guide.pdf",
    pages: 186,
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
