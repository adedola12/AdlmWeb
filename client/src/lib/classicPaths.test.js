import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  CLASSIC_HOME,
  GATED_PREFIXES,
  classicFallbackFor,
  isGatedPath,
  storageKeyForSlug,
} from "./classicPaths.js";
import { SOURCES } from "./projectGallery.js";

// The new build's dashboard and workspace are held back until 1 Oct 2026. A
// customer who reaches one is redirected to the classic screen that does the
// same job, so these pin the two things a redirect can get wrong: sending
// somebody somewhere that does not exist, and sending them somewhere that sends
// them back.

const ROUTER = fs.readFileSync(
  path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "main.jsx"),
  "utf8",
);

const DECLARED = new Set(
  [...ROUTER.matchAll(/\bpath:\s*"([^"]+)"/g)].map((m) => m[1].replace(/^\/?/, "/")),
);

const EVERY_GATED_ROUTE = [
  "/manage",
  "/manage/products",
  "/manage/team",
  "/manage/billing",
  "/manage/downloads",
  "/manage/guides",
  "/manage/settings",
  "/manage/support",
  "/work",
  "/work/projects",
  "/work/tool/quiv",
  "/work/library",
  "/work/rate/r-771",
  "/work/project/planswift/ikoyi-tower",
  "/work/programme",
];

describe("which paths are gated", () => {
  it("gates the new build's dashboard and workspace", () => {
    expect(isGatedPath("/manage")).toBe(true);
    expect(isGatedPath("/manage/billing")).toBe(true);
    expect(isGatedPath("/work")).toBe(true);
    expect(isGatedPath("/work/project/revit/x")).toBe(true);
  });

  it("does NOT gate the learning screens", () => {
    // They are .ds screens, but they are the only learning surface there is:
    // classic /learn links straight to /dash-course/:sku (pages/Learn.jsx:69),
    // /learn/course/:sku — a URL in sent emails — redirects into it
    // (pages/LearnCourseRedirect.jsx), and there is no classic /certificates or
    // /assignments route at all. Gating them would loop that URL and take away
    // courses people have paid for.
    expect(isGatedPath("/dash-learning")).toBe(false);
    expect(isGatedPath("/dash-certificates")).toBe(false);
    expect(isGatedPath("/dash-assignments")).toBe(false);
    expect(isGatedPath("/dash-course/BIM-101")).toBe(false);
  });

  it("does not gate a classic route", () => {
    for (const p of [
      "/dashboard",
      "/learn",
      "/learn/course/BIM-101",
      "/profile",
      "/projects/planswift",
      "/rategen",
      "/archicad",
      "/portfolio",
      "/pm-tracker",
      "/time-management",
      "/support/request",
      "/freebies",
      "/purchase",
      "/",
    ]) {
      expect(isGatedPath(p), `${p} must stay open`).toBe(false);
    }
  });

  it("matches on a segment boundary, so a look-alike path is not caught", () => {
    // /workshop is not /work, and /managed-service is not /manage.
    expect(isGatedPath("/workshop")).toBe(false);
    expect(isGatedPath("/workshops/2026")).toBe(false);
    expect(isGatedPath("/managed-service")).toBe(false);
    expect(isGatedPath("/management")).toBe(false);
    // Neither is an admin route that merely contains the word.
    expect(isGatedPath("/admin/work-board")).toBe(false);
  });

  it("gates exactly two families and says so", () => {
    expect([...GATED_PREFIXES].sort()).toEqual(["/manage", "/work"]);
  });
});

describe("where a gated path lands", () => {
  it("never lands on a path that is itself gated", () => {
    // The invariant that makes a redirect loop impossible.
    for (const p of EVERY_GATED_ROUTE) {
      const to = classicFallbackFor(p);
      expect(isGatedPath(to), `${p} -> ${to} would bounce`).toBe(false);
    }
  });

  it("lands on a route the router actually declares", () => {
    // A typo in a fallback is a 404 for a customer, and nothing else would
    // catch it. Checked against main.jsx itself.
    for (const p of EVERY_GATED_ROUTE) {
      const to = classicFallbackFor(p).split("?")[0];
      // Reduce a concrete path to the pattern the router declares.
      const pattern = to
        .replace(/^\/projects\/[^/]+$/, "/projects/:tool")
        .replace(/^\/archicad\/[^/]+\/boq$/, "/archicad/:projectId/boq");
      expect(DECLARED.has(pattern), `${p} -> ${to} (${pattern}) is not a declared route`).toBe(true);
    }
  });

  it("sends the account screen to the classic account screen", () => {
    expect(classicFallbackFor("/manage/settings")).toBe("/profile");
  });

  it("sends support to the classic support desk", () => {
    expect(classicFallbackFor("/manage/support")).toBe("/support/request");
  });

  it("sends the rate library to classic RateGen", () => {
    expect(classicFallbackFor("/work/library")).toBe("/rategen");
    expect(classicFallbackFor("/work/rate/rg-771")).toBe("/rategen");
  });

  it("sends billing to the profile, which is where classic keeps it", () => {
    // Not the dashboard. Classic moved orders, invoices, the saved card and
    // per-product auto-renew onto the profile (Profile.jsx:517-521), and the
    // dashboard itself says so ("Orders, invoices & installations are on your
    // profile", Dashboard.jsx:559).
    //
    // This one is not cosmetic: the dunning email's "Update the card" button
    // links to /manage/billing (server/util/emailContent.js), so a customer sent
    // to a dashboard with no card form cannot do the single thing the email
    // asked them to do, at the moment their subscription is lapsing.
    expect(classicFallbackFor("/manage/billing")).toBe("/profile");
  });

  it("sends the project list to the classic project list", () => {
    // /portfolio is the same screen for the same job (pages/Portfolio.jsx), not a
    // generic landing.
    expect(classicFallbackFor("/work/projects")).toBe("/portfolio");
  });

  it("sends a capability classic does not have to the classic home", () => {
    // Team is new in the redesign, so there is nothing to map it onto. Downloads
    // and guides DO land on the dashboard because that is where classic keeps
    // them — the Installer Hub download at Dashboard.jsx:453 and the owned
    // guides at Dashboard.jsx:622 — not because nothing better was found.
    for (const p of ["/manage/team", "/manage/downloads"]) {
      expect(classicFallbackFor(p)).toBe(CLASSIC_HOME);
    }
  });

  it("sends guides to the page that actually lists them", () => {
    // Not the dashboard. /whats-new renders the same GUIDES array in full
    // (WhatsNew.jsx:206, from data/guides.js — the same import DsGuides uses),
    // whereas the dashboard only has the guides somebody owns and keeps them in
    // a Learning tab with no URL, so a customer lands on Subscriptions and sees
    // no guides at all.
    expect(classicFallbackFor("/manage/guides")).toBe("/whats-new");
  });

  it("sends the programme to the classic programme screen", () => {
    // main.jsx mounts /time-management with title="Programme" and
    // page="work-programme" — the rail's own alias for this item.
    expect(classicFallbackFor("/work/programme")).toBe("/time-management");
  });

  it("sends Time Pro to /time-management, because it has no /projects screen", () => {
    // storageKeyForSlug("timepro") is "qs-takeoff", and "qs-takeoff" appears
    // nowhere in server/routes/projects.js — /projects/qs-takeoff would load a
    // workspace with nothing behind it. The route PATTERN matches, so only
    // knowing the product catches this.
    expect(classicFallbackFor("/work/tool/timepro")).toBe("/time-management");
    expect(classicFallbackFor("/work/project/qs-takeoff/x")).not.toContain("qs-takeoff");
  });
});

describe("a tool keeps its place across the redirect", () => {
  it("translates every new-build slug to its classic storage key", () => {
    // /work/tool/:t takes the SLUG; classic /projects/:tool takes the STORAGE
    // KEY. Getting this wrong drops the customer on someone else's product.
    expect(classicFallbackFor("/work/tool/quiv")).toBe("/projects/revit");
    expect(classicFallbackFor("/work/tool/heron")).toBe("/projects/planswift");
    expect(classicFallbackFor("/work/tool/civiq")).toBe("/projects/civil3d");
    // timepro is asserted on its own below: it has no /projects screen.
    expect(classicFallbackFor("/work/tool/mep")).toBe("/projects/mep");
  });

  it("covers every product in SOURCES, so a new one cannot be missed", () => {
    for (const [key, s] of Object.entries(SOURCES)) {
      expect(storageKeyForSlug(s.slug), `slug ${s.slug}`).toBe(key);
    }
  });

  it("takes a storage key as well as a slug", () => {
    // The rail links /work/tool?t=mep, where "mep" is both.
    expect(storageKeyForSlug("mep")).toBe("mep");
    expect(storageKeyForSlug("planswift")).toBe("planswift");
  });

  it("sends ArchiCAD to its own route, not under /projects", () => {
    expect(classicFallbackFor("/work/tool/archicad")).toBe("/archicad");
    expect(classicFallbackFor("/work/project/archicad/ikoyi-tower")).toBe(
      "/archicad/ikoyi-tower/boq",
    );
  });

  it("opens the project the customer asked for, not a list", () => {
    // ?project=<slug> is what the classic workspace reads
    // (lib/projectLinks.js:101).
    expect(classicFallbackFor("/work/project/planswift/ikoyi-tower")).toBe(
      "/projects/planswift?project=ikoyi-tower",
    );
  });

  it("escapes a project slug that needs it", () => {
    expect(classicFallbackFor("/work/project/revit/a b&c")).toBe(
      "/projects/revit?project=a%20b%26c",
    );
  });

  it("does not guess at a product it does not recognise", () => {
    expect(classicFallbackFor("/work/tool/not-a-product")).toBe(CLASSIC_HOME);
    expect(classicFallbackFor("/work/project/not-a-product/x")).toBe(CLASSIC_HOME);
  });

  it("falls back to the tool's list when there is no project id", () => {
    expect(classicFallbackFor("/work/project/planswift")).toBe("/projects/planswift");
  });
});

describe("edges", () => {
  it("ignores a trailing slash", () => {
    expect(classicFallbackFor("/manage/")).toBe(CLASSIC_HOME);
    expect(classicFallbackFor("/work/tool/quiv/")).toBe("/projects/revit");
  });

  it("sends a new screen nobody has mapped yet to the classic home", () => {
    expect(classicFallbackFor("/manage/something-new")).toBe(CLASSIC_HOME);
    expect(classicFallbackFor("/work/something-new")).toBe(CLASSIC_HOME);
  });

  it("does not throw on junk", () => {
    expect(classicFallbackFor("")).toBe(CLASSIC_HOME);
    expect(classicFallbackFor(null)).toBe(CLASSIC_HOME);
    expect(classicFallbackFor(undefined)).toBe(CLASSIC_HOME);
    expect(isGatedPath(null)).toBe(false);
  });
});

// ── Where the transactional email links land ────────────────────────────────
//
// The server's mail points customers straight into gated paths: the welcome
// email's "Open your account" (/manage), the dunning email's "Update the card"
// (/manage/billing), "Open your products" (/manage/products) and the release
// mail's support link (/manage/support).
//
// Those URLs are deliberately NOT being changed. The gate redirects each one to
// the classic screen that answers it, which is the whole reason the fallbacks
// exist — and rewriting the emails would be one more edit to remember on 1
// October, which is the class of mistake newBuildGate.golive.test.js exists to
// stop. What has to hold instead is that every one of them lands somewhere that
// can actually do what the email asked.
describe("the links in transactional email", () => {
  const EMAIL_CTAS = [
    // [path in the email, what the customer came to do, where it must land]
    ["/manage", "open their account", "/dashboard"],
    // The card lives on the profile on classic. A dashboard has no card form, so
    // this is the one that would leave a lapsing subscription unfixable.
    ["/manage/billing", "update their card / see subscriptions", "/profile"],
    ["/manage/products", "open their products", "/dashboard"],
    ["/manage/support", "reply about a ticket", "/support/request"],
    ["/manage/downloads", "get the installer", "/dashboard"],
  ];

  it("every email CTA lands on a screen that answers it", () => {
    for (const [from, intent, to] of EMAIL_CTAS) {
      expect(classicFallbackFor(from), `email link for "${intent}"`).toBe(to);
    }
  });

  it("no email CTA lands anywhere still gated", () => {
    for (const [from] of EMAIL_CTAS) {
      expect(isGatedPath(classicFallbackFor(from)), `${from} would bounce`).toBe(false);
    }
  });
});
