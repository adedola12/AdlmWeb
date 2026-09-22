// robots.txt says the same thing the route table does.
//
// Two mistakes are easy to make here and both are expensive. Disallow a path
// that is in the sitemap and Search Console reports the contradiction and
// drops the page. Forget to disallow a signed-in path and a crawler spends its
// budget on routes that can only redirect it to /login, which costs the
// marketing pages their crawl rate.
//
// So this walks the real file against the real route list rather than trusting
// either to be remembered.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { STATIC_ROUTES, LANDING_ROUTES, SAMPLE_PRODUCT_ROUTES } from "../../scripts/seo-routes.mjs";
import { SSR_PATHS } from "./ssrPaths.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const TXT = fs.readFileSync(path.resolve(here, "../../public/robots.txt"), "utf8");

const rules = TXT.split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => /^Disallow:/i.test(l))
  .map((l) => l.replace(/^Disallow:\s*/i, ""))
  .filter(Boolean);

// The de-facto standard: a rule matches any path that STARTS with it, with "*"
// standing for any run of characters. That prefix rule is the whole reason
// "Disallow: /rategen" is safe next to a public "/product/rategen".
const matches = (rule, url) => {
  const re = new RegExp(
    "^" + rule.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*"),
  );
  return re.test(url);
};
const blocked = (url) => rules.filter((r) => matches(r, url));

describe("robots.txt does not contradict the sitemap", () => {
  const publicUrls = [
    ...STATIC_ROUTES.map(([loc]) => loc),
    ...LANDING_ROUTES.map(([loc]) => loc),
    ...SAMPLE_PRODUCT_ROUTES,
  ];

  for (const url of publicUrls) {
    it(`leaves ${url} crawlable`, () => {
      expect(blocked(url), `${url} is in the sitemap and Disallowed`).toEqual([]);
    });
  }
});

describe("robots.txt covers the signed-in app surfaces (rec-01)", () => {
  // One per surface, using a real route from main.jsx rather than the prefix,
  // so a rule that only covers the index page still fails here.
  const signedIn = [
    "/manage",
    "/manage/billing",
    "/manage/settings",
    "/work",
    "/work/projects",
    "/work/project/revit/abc123",
    "/work/library",
    "/work/programme",
    "/rategen",
    "/rategen/material-constants",
    "/dash-learning",
    "/dash-certificates",
    "/dash-assignments",
    "/dash-course/QS-101",
    "/fit",
    "/admin",
    "/admin/people",
    "/dashboard",
    "/profile",
    "/preview/work-home",
    // The index that links to every staged page: the trailing slash in
    // "Disallow: /preview/" used to leave this one crawlable.
    "/preview",
    // Both sit behind ProtectedRoute; only /portfolio-dashboard was listed.
    "/portfolio",
    "/portfolio-dashboard",
  ];

  for (const url of signedIn) {
    it(`keeps ${url} out of the crawl`, () => {
      expect(blocked(url).length, `${url} is not Disallowed`).toBeGreaterThan(0);
    });
  }
});

describe("the prefix rules stop where they should", () => {
  it("does not catch the public pages that merely look similar", () => {
    // /rategen must not take /product/rategen down with it, and /work must not
    // take /how-it-works.
    expect(blocked("/product/rategen")).toEqual([]);
    expect(blocked("/how-it-works")).toEqual([]);
  });

  it("leaves every server-rendered path crawlable", () => {
    // A blocked SSR path would be the worst version of this mistake: the page
    // would render its full metadata into the raw HTML and then forbid anyone
    // from fetching it.
    for (const p of SSR_PATHS) {
      const url = p.replace(/:[^/]+/g, "sample");
      expect(blocked(url), `${p} is server-rendered and Disallowed`).toEqual([]);
    }
  });

  it("still points crawlers at the sitemap", () => {
    expect(TXT).toMatch(/^Sitemap:\s*https:\/\/www\.adlmstudio\.net\/sitemap\.xml$/m);
  });
});
