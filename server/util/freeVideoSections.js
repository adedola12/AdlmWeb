// server/util/freeVideoSections.js
//
// The shelves of the free video library, and the rules for filing a video on
// one and for picking the handful a product page recommends.
//
// The library is the ADLM Studio YouTube channel: a hundred-odd walkthroughs
// that, listed newest-first, read as one long undifferentiated wall. Grouped
// by the software they are about — QUIV, HERON, the MEP plugin, RateGen, and
// the generic PlanSwift and Revit teaching behind them — the same list is
// something a person can navigate.
//
// A section is a plain string slug on the FreeVideo record, resolved here.
// The table lives in code rather than in a collection because adding a shelf
// is a product decision that lands with a deploy, and because the product
// pages need `productKey` to be a stable, reviewable mapping rather than a
// value somebody typed into a form.
//
// `productKey` is the catalogue key (Product.key) whose page should recommend
// videos from this section: "revit" is QUIV, "planswift" is HERON — the
// catalogue keeps the legacy CAD-host slugs. "*" means every product page,
// which is what the install-and-sign-in walkthroughs are for.

export const FREE_VIDEO_SECTIONS = [
  {
    slug: "getting-started",
    filter: "Getting started",
    label: "Getting started",
    productKey: "*",
    blurb: "Installing, signing in and applying updates through the Hub.",
  },
  {
    slug: "quiv",
    filter: "Revit",
    label: "QUIV for Revit",
    productKey: "revit",
    blurb: "From a coordinated Revit model to a priced bill of quantities.",
  },
  {
    slug: "heron",
    filter: "PlanSwift",
    label: "HERON for PlanSwift",
    productKey: "planswift",
    blurb: "2D drawings to BoQ, valuation, variation and final account.",
  },
  {
    slug: "mep",
    filter: "Revit",
    label: "Revit MEP plugin",
    productKey: "mep",
    blurb: "HVAC, plumbing and electrical takeoff from the services model.",
  },
  {
    slug: "rategen",
    filter: "Rates",
    label: "RateGen",
    productKey: "rategen",
    blurb: "Building defensible rates from materials, waste and labour output.",
  },
  {
    slug: "timepro",
    filter: "Other software",
    label: "Programme & MS Project",
    productKey: "qs-takeoff",
    blurb: "Turning the bill into a programme of work.",
  },
  {
    slug: "planswift-basics",
    filter: "PlanSwift",
    label: "PlanSwift fundamentals",
    productKey: "planswift",
    blurb: "Measuring in PlanSwift itself, before any plugin.",
  },
  {
    slug: "revit-basics",
    filter: "Revit",
    label: "Autodesk Revit basics",
    productKey: "revit",
    blurb: "Modelling a building in Revit, lesson by lesson.",
  },
  {
    slug: "bim-course",
    filter: "Revit",
    label: "BIM course & classes",
    productKey: "bimbld",
    blurb: "Recorded classes and previews from the ADLM BIM courses.",
  },
  {
    slug: "costx",
    filter: "Other software",
    label: "CostX",
    productKey: "",
    blurb: "Takeoff in CostX, and how it compares.",
  },
  {
    slug: "bluebeam",
    filter: "Other software",
    label: "Bluebeam Revu",
    productKey: "",
    blurb: "The complete Bluebeam lectures.",
  },
  {
    slug: "mybuildcost",
    filter: "Other software",
    label: "MyBuildCost",
    productKey: "",
    blurb: "Rate libraries and takeoff in MyBuildCost.",
  },
  {
    slug: "qs-practice",
    filter: "Practice & news",
    label: "QS practice & career",
    productKey: "",
    blurb: "Valuations, interim payments and finding your way in the industry.",
  },
  {
    slug: "marketplace",
    filter: "Practice & news",
    label: "ADLM Marketplace",
    productKey: "",
    blurb: "Listing and buying materials on the marketplace.",
  },
  {
    slug: "adlm-news",
    filter: "Practice & news",
    label: "ADLM news & events",
    productKey: "",
    blurb: "Launches, roadmaps and recaps from the studio.",
  },
];

// A video whose section is blank, or names a shelf that no longer exists, is
// still a published video. It goes on a last shelf rather than vanishing.
export const UNFILED_SECTION = {
  slug: "",
  filter: "",
  label: "More lessons",
  productKey: "",
  blurb: "",
};

const BY_SLUG = new Map(FREE_VIDEO_SECTIONS.map((s) => [s.slug, s]));

// The filter row on Richard's Learn page (R02, R10): his four chips plus two
// for the shelves his demo never had. A shelf's `filter` above names its chip;
// "All" is implied. One place, so the page and the shelves cannot disagree.
export const LESSON_FILTERS = ["Revit", "PlanSwift", "Rates", "Getting started", "Other software", "Practice & news"];

// Filing a video nobody has filed by hand (R10): a new upload found by the
// feed, or a catalogue entry with no section. First match wins.
//
//   1. a hand-set section always wins (the catalogue, or an admin's edit);
//   2. a starter title goes to Getting started, whatever it is about;
//   3. otherwise the playlist it sits in;
//   4. otherwise words in the title;
//   5. otherwise unfiled, which the page shows under "More lessons".
export const STARTER_TITLE = /\b(getting started|introduction to|how to install|installing|installation|first project|set ?up guide)\b/i;

export const PLAYLIST_RULES = [
  [/\bquiv\b|revit plugin|theqscalculator/i, "quiv"],
  [/\bheron\b|planswift plugin|bill of quanti/i, "heron"],
  [/\bmep\b|hvac/i, "mep"],
  [/rate ?gen/i, "rategen"],
  [/ms project|project management/i, "timepro"],
  [/planswift/i, "planswift-basics"],
  [/revit/i, "revit-basics"],
  [/bim course|qs software training/i, "bim-course"],
  [/cost ?x/i, "costx"],
  [/bluebeam/i, "bluebeam"],
  [/mybuildcost/i, "mybuildcost"],
  [/marketplace/i, "marketplace"],
];

export const TITLE_RULES = [
  [/\bquiv\b/i, "quiv"],
  [/\bheron\b/i, "heron"],
  [/launch|webinar|roadmap|recap|announc|what to expect|welcome to|we built/i, "adlm-news"],
  [/\bcourse\b|\bclass\b/i, "bim-course"],
  [/cost ?x/i, "costx"],
  [/bluebeam/i, "bluebeam"],
  [/mybuildcost/i, "mybuildcost"],
  [/marketplace/i, "marketplace"],
  [/\bmep\b|hvac|plumbing|electrical/i, "mep"],
  [/rate ?gen|rate build/i, "rategen"],
  [/ms project|programme of work|time ?pro/i, "timepro"],
  [/adlm .*plugin.*revit|revit plugin/i, "quiv"],
  [/adlm .*plugin.*planswift|planswift plugin/i, "heron"],
  [/planswift/i, "planswift-basics"],
  [/\bbim\b/i, "bim-course"],
  [/revit/i, "revit-basics"],
  [/valuation|interim|career|quantity survey/i, "qs-practice"],
];

/**
 * The shelf a video belongs on.
 * @param {{ title?: string, playlists?: Array<string|{title?: string}>, section?: string }} v
 */
export function fileVideo(v = {}) {
  const hand = String(v.section || "").trim();
  if (hand && BY_SLUG.has(hand)) return hand;
  const title = String(v.title || "");
  if (STARTER_TITLE.test(title)) return "getting-started";
  for (const p of v.playlists || []) {
    const name = typeof p === "string" ? p : p?.title || p?.name || "";
    for (const [re, slug] of PLAYLIST_RULES) if (re.test(name)) return slug;
  }
  for (const [re, slug] of TITLE_RULES) if (re.test(title)) return slug;
  return "";
}

export function sectionOf(slug) {
  return BY_SLUG.get(String(slug || "").trim()) || null;
}

export function isSectionSlug(slug) {
  return BY_SLUG.has(String(slug || "").trim());
}

const time = (d) => {
  const t = d ? new Date(d).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
};

// Within a shelf: the editor's `sort` first (higher first, the convention the
// library already used), then newest by YouTube publish date, then newest by
// when it was added here. A numbered series is given descending `sort` by the
// sync script so lesson 1 leads.
export function compareVideos(a, b) {
  const s = (Number(b.sort) || 0) - (Number(a.sort) || 0);
  if (s) return s;
  const p = time(b.publishedAt) - time(a.publishedAt);
  if (p) return p;
  return time(b.createdAt) - time(a.createdAt);
}

/**
 * Group published videos onto the shelves, in shelf order, dropping empty
 * shelves. Unfiled videos come last under UNFILED_SECTION.
 */
export function groupBySection(videos) {
  const buckets = new Map(FREE_VIDEO_SECTIONS.map((s) => [s.slug, []]));
  const unfiled = [];
  for (const v of videos || []) {
    const slug = String(v.section || "").trim();
    (buckets.get(slug) || unfiled).push(v);
  }
  const out = [];
  for (const s of FREE_VIDEO_SECTIONS) {
    const list = buckets.get(s.slug);
    if (list.length) out.push({ ...s, count: list.length, videos: list.sort(compareVideos) });
  }
  if (unfiled.length) {
    out.push({ ...UNFILED_SECTION, count: unfiled.length, videos: unfiled.sort(compareVideos) });
  }
  return out;
}

const norm = (k) => String(k || "").trim().toLowerCase();

/**
 * The videos a product page should recommend: flagged `recommended`, on a
 * shelf that belongs to that product — or on the "every product" shelf.
 * Product-specific ones come before the shared getting-started ones, so the
 * install walkthrough never outranks the product's own demo.
 */
export function recommendedFor(videos, productKey, limit = 6) {
  const want = norm(productKey);
  if (!want) return [];
  const own = [];
  const shared = [];
  for (const v of videos || []) {
    if (!v.recommended || v.isPublished === false) continue;
    const s = sectionOf(v.section);
    if (!s) continue;
    if (norm(s.productKey) === want) own.push(v);
    else if (s.productKey === "*") shared.push(v);
  }
  own.sort(compareVideos);
  shared.sort(compareVideos);
  const n = Math.max(1, Number(limit) || 6);
  return [...own, ...shared].slice(0, n);
}
