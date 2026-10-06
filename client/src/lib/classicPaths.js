// Where a customer goes when a new-build screen is not open to them.
//
// SINCE GO-LIVE (1 October 2026) NOBODY IS SENT HERE. The redesign shipped and
// /manage/* and /work/* — /work/programme included — are open to everyone
// signed in; lib/newBuildAccess.js answers that once for the route gate, the
// rail, the project cards and the classic-project redirect. This table is what
// all four fall back on if GATE_NEW_BUILD is raised again: it held the new
// build's dashboard and project workspace back to staff before launch, sending
// a customer to the CLASSIC screen that does the same job rather than a wall.
// See components/NewBuildGate.jsx for the gate and GATED_PREFIXES below for
// exactly what it would hold back.
//
// WHAT IS DELIBERATELY *NOT* GATED: /dash-learning, /dash-certificates,
// /dash-assignments and /dash-course/:sku.
//
// They are built from the .ds design system, so they look like new-build
// screens, but they are the ONLY learning surface a signed-in customer has and
// the classic build already depends on them:
//
//   * pages/Learn.jsx:69 — the classic /learn catalogue links straight to
//     /dash-course/:sku.
//   * pages/LearnCourseRedirect.jsx — /learn/course/:sku, which is in sent
//     emails, in browser history, in the public catalogue and handed out by the
//     support agent (server/routes/helpbot.js:179), redirects INTO
//     /dash-course/:sku. Gating that target would bounce the browser between
//     the two forever.
//   * There is no classic /certificates and no classic /assignments route at
//     all — grep main.jsx. Gating those would take a paying customer's
//     certificates away with nowhere to send them.
//
// So gating the learning screens would lock customers out of courses they have
// paid for and loop the URL that reaches them. They stay open.

import { SOURCES } from "./projectGallery.js";

// The classic home for a signed-in customer. Used wherever the new-build screen
// has no specific classic counterpart, which is honest: /manage/team,
// /manage/billing, /manage/downloads and /manage/guides are capabilities the
// redesign introduces, and inventing a mapping onto an unrelated page would be
// worse than landing someone on their dashboard.
export const CLASSIC_HOME = "/dashboard";

// The two families the gate holds back WHEN IT IS UP. With GATE_NEW_BUILD false
// (since go-live) membership here restricts nobody: it only marks which routes
// main.jsx wraps in the pass-through gate and which rail links railGate.js
// would rewrite if the gate were raised. Matched on a path SEGMENT boundary, so
// "/workshop" or "/managed-thing" could never be caught by accident.
export const GATED_PREFIXES = Object.freeze(["/manage", "/work"]);

/** Is this path one of the new-build screens the gate holds back when it is up? */
export function isGatedPath(pathname) {
  const p = String(pathname || "");
  return GATED_PREFIXES.some((g) => p === g || p.startsWith(`${g}/`));
}

// A tool's slug in the new build is NOT its storage key. /work/tool/:t takes the
// slug ("quiv", "heron", "civiq", "timepro") while classic /projects/:tool takes
// the storage key ("revit", "planswift", "civil3d", "qs-takeoff"). Reversed from
// SOURCES rather than written out again, so the two cannot drift.
const KEY_BY_SLUG = Object.freeze(
  Object.fromEntries(Object.entries(SOURCES).map(([key, s]) => [s.slug, key])),
);

/** The storage key behind a new-build tool slug, or "" if it is not one. */
export function storageKeyForSlug(slug) {
  const s = String(slug || "").toLowerCase();
  // Accept a storage key too: the rail links /work/tool?t=mep, and "mep" is
  // both the slug and the key.
  if (KEY_BY_SLUG[s]) return KEY_BY_SLUG[s];
  return SOURCES[s] ? s : "";
}

// How one product's projects open on classic. ArchiCAD and RateGen are not
// under /projects/:tool at all — the same split projectLinks.js makes.
function classicToolPath(storageKey) {
  if (!storageKey) return CLASSIC_HOME;
  if (storageKey === "archicad") return "/archicad";
  if (storageKey === "rategen") return "/rategen";
  // Time Pro has no /projects/:tool screen — "qs-takeoff" appears nowhere in
  // server/routes/projects.js, so /projects/qs-takeoff would load a workspace
  // with nothing behind it. Its classic screen is /time-management, which
  // main.jsx mounts as the programme.
  if (storageKey === "qs-takeoff") return "/time-management";
  return `/projects/${storageKey}`;
}

// Fixed one-to-one moves. Everything not listed falls through to CLASSIC_HOME.
const EXACT = Object.freeze({
  // The Material Constants library. /work/constants is the same editor inside
  // the app frame; the classic route has always existed, is open to any signed
  // -in customer, and is what the Budget tab already links to. Without this the
  // rail entry falls through to the dashboard, which is the exact failure the
  // whole rewrite exists to prevent.
  "/work/constants": "/rategen/material-constants",
  "/manage": CLASSIC_HOME,
  "/manage/products": CLASSIC_HOME,
  "/manage/team": CLASSIC_HOME,
  // Classic keeps orders, invoices, the saved card and per-product auto-renew on
  // the profile — Profile.jsx:517-521, and Dashboard.jsx:559 points there itself
  // ("Orders, invoices & installations are on your profile"). This one matters
  // beyond tidiness: the dunning mail's "Update the card" button links to
  // /manage/billing (server/util/emailContent.js:182), and a customer sent to a
  // dashboard with no card form cannot do the one thing the email asked.
  "/manage/billing": "/profile",
  // The Installer Hub download is on the classic dashboard
  // (Dashboard.jsx:453-460). Known limit: that card is conditional on an active
  // licence, so an account whose subscription has lapsed sees no download there
  // — which is the same answer the new-build screen gives it (DsDownloads'
  // hubLocked state points at /products).
  "/manage/downloads": CLASSIC_HOME,
  // /whats-new, not the dashboard. It renders the very same GUIDES array in
  // full (WhatsNew.jsx:206 under a "User guides" heading, from data/guides.js —
  // the same import ds/DsGuides.jsx uses). The dashboard only has the guides
  // somebody OWNS, inside its Learning tab, and that tab has no URL: a customer
  // sent there arrives on Subscriptions and sees no guides at all.
  "/manage/guides": "/whats-new",
  // Classic's account screen.
  "/manage/settings": "/profile",
  // Classic's support desk. Signed-in, like the screen it replaces.
  "/manage/support": "/support/request",
  // The Work overview is the new build's home for the work surface. Classic's
  // /portfolio-dashboard is the closer match by content, but the rail's brand
  // mark points at /work, and a "take me home" affordance has to mean home.
  "/work": CLASSIC_HOME,
  // Classic's cross-product project list — the same job, screen for screen
  // (pages/Portfolio.jsx).
  "/work/projects": "/portfolio",
  // Titled "RateGen" in the new build (pages/WorkLibrary.jsx).
  "/work/library": "/rategen",
  // Classic's programme screen. main.jsx mounts /time-management with
  // title="Programme" and page="work-programme" — the rail's own alias for this
  // very item (railConfig.js PAGE_ALIAS) — so the config already treats the two
  // as the same destination.
  "/work/programme": "/time-management",
});

/**
 * The classic path a gated new-build path should land on.
 *
 * Takes the pathname only. The caller decides whether to carry a query string
 * or hash across — mostly it should not, because the classic screen does not
 * speak the new build's parameters.
 *
 * Always returns a path that exists and is never itself gated, so a redirect
 * can never bounce.
 */
export function classicFallbackFor(pathname) {
  const path = String(pathname || "").replace(/\/+$/, "") || "/";

  if (EXACT[path]) return EXACT[path];

  const seg = path.split("/").filter(Boolean);

  // /work/tool/:t → /projects/:storageKey
  if (seg[0] === "work" && seg[1] === "tool") {
    return classicToolPath(storageKeyForSlug(seg[2]));
  }

  // /work/project/:productKey/:id → /projects/:productKey?project=:id
  // The workspace reads ?project=<slug>, exactly as projectLinks.js:101 builds
  // it, so the customer lands on the project they asked for and not on a list.
  if (seg[0] === "work" && seg[1] === "project") {
    const key = String(seg[2] || "").toLowerCase();
    const id = seg[3] || "";
    if (key === "archicad") {
      return id ? `/archicad/${encodeURIComponent(id)}/boq` : "/archicad";
    }
    // A storage key we do not recognise is not worth guessing at.
    if (!SOURCES[key]) return CLASSIC_HOME;
    // RateGen's tool page is its rates library, but a RateGen project (a priced
    // bill) opens in the classic project workspace like the others.
    if (key === "rategen" && id) return `/projects/rategen?project=${encodeURIComponent(id)}`;
    // Products whose classic screen is not /projects/:tool at all go through the
    // same table as the tool pages — otherwise this branch quietly reinvents the
    // /projects/qs-takeoff dead end that classicToolPath exists to avoid. Those
    // screens take no project id, so it is dropped rather than tacked on.
    const toolPath = classicToolPath(key);
    if (toolPath !== `/projects/${key}`) return toolPath;
    return id
      ? `/projects/${key}?project=${encodeURIComponent(id)}`
      : `/projects/${key}`;
  }

  // /work/rate/:id → classic RateGen, which has no per-rate URL.
  if (seg[0] === "work" && seg[1] === "rate") return "/rategen";

  // Anything else under /manage or /work that is added later: home, rather
  // than a wall. A new screen that deserves better should be added to EXACT.
  return CLASSIC_HOME;
}

export default classicFallbackFor;
