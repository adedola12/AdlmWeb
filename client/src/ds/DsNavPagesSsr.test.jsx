// @vitest-environment node
//
// The pages his nav links to render on the server, not just in the browser.
//
// WHY THIS TEST EXISTS
//
// Mounting a page on a public path is only half of making it live. The other
// half is lib/ssrPaths.js, and its own header says what happens when you miss
// it: "the page silently falls back to the empty shell". Silently is the
// problem. A crawler stores that shell, the page indexes with no heading and
// no copy, and nothing in the app looks wrong while it happens.
//
// /quote is the cautionary case already in the tree. It was listed as
// server-rendered, threw under renderToString, and so failed and fell back on
// every single request: the visitor got the page a moment later and the Lambda
// did the work twice to get there. A render that throws costs more than one
// that was never attempted, which is why these eleven are asserted rather
// than assumed.
//
// THE ENVIRONMENT IS node, DELIBERATELY. The Vercel function has no window and
// no document. Rendering these in jsdom would pass for a page that reads
// window during render and then throws in production, which is the exact
// failure this file is here to catch. scripts/check-render-safety.mjs covers
// module scope; this covers render.
//
// WHAT IT DOES NOT GO THROUGH. entry-server's render() cannot be called from
// vitest: App imports useLocation from "react-router-dom", whose package
// exports resolve to CJS under the node condition and pull in a SECOND copy of
// react-router, while entry-server's createStaticRouter comes from the ESM
// one. Two copies means two React contexts, so useLocation throws "may be used
// only in the context of a <Router>" for every path, /about and the landing
// pages included. The production SSR build bundles both into one chunk and
// does not have this. So the router is built here from react-router-dom — one
// copy, the same one App uses — and the route table is checked as the data it
// is.
import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import { ThemeProvider } from "../theme.jsx";
import { AuthProvider } from "../store.jsx";
import { StepUpProvider } from "../features/security/useStepUp.jsx";
import DsShell from "./DsShell.jsx";
import { marketingRoutes } from "../routes.marketing.jsx";
import { LIST_PRELOADS } from "../entry-server.jsx";
import { SSR_PATHS } from "../lib/ssrPaths.js";
import { PAGE_META } from "../lib/pageMeta.js";
import { DS_PUBLIC_PATHS } from "../lib/dsPublicPaths.js";
import { STATIC_ROUTES } from "../../scripts/seo-routes.mjs";

import DsPricing from "./custom/DsPricing.jsx";
import DsHowItWorks from "./pages/DsHowItWorks.jsx";
import DsAda from "./pages/DsAda.jsx";
import DsMobile from "./pages/DsMobile.jsx";
import DsContact from "./pages/DsContact.jsx";
import DsCareers from "./pages/DsCareers.jsx";
import DsPress from "./pages/DsPress.jsx";
import DsSolutionsFirms from "./pages/DsSolutionsFirms.jsx";
import DsSolutionsProfessionals from "./pages/DsSolutionsProfessionals.jsx";
import DsSolutionsStudents from "./pages/DsSolutionsStudents.jsx";
import DsSolutionsInstitutions from "./pages/DsSolutionsInstitutions.jsx";

/** The eleven paths mounted for his nav, and the page behind each. */
const NAV_PAGES = [
  // The one that needed more than a route. DsPricing states a figure for every
  // plan, so `preload` marks it as a page whose numbers must come from the
  // catalogue the server fetches first, not from its fallback table.
  { path: "/pricing", Page: DsPricing, preload: "pricing:products" },
  { path: "/solutions/firms", Page: DsSolutionsFirms },
  { path: "/solutions/professionals", Page: DsSolutionsProfessionals },
  { path: "/solutions/students", Page: DsSolutionsStudents },
  { path: "/solutions/institutions", Page: DsSolutionsInstitutions },
  { path: "/how-it-works", Page: DsHowItWorks },
  { path: "/ada", Page: DsAda },
  { path: "/mobile", Page: DsMobile },
  { path: "/contact", Page: DsContact },
  { path: "/careers", Page: DsCareers },
  { path: "/press", Page: DsPress },
];

const SSR_PAGES = NAV_PAGES;

const text = (html) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

/** Every path the marketing route tree mounts, relative children resolved. */
const marketingPaths = () => {
  const [root] = marketingRoutes;
  return (root.children || []).map((c) => (c.index ? "/" : `/${c.path}`));
};

describe("the pages his nav links to render without a browser", () => {
  for (const { path, Page } of SSR_PAGES) {
    it(`${path} renders a heading and copy under renderToString`, () => {
      const html = renderToString(
        <ThemeProvider>
          <AuthProvider>
            <StepUpProvider>
              <MemoryRouter initialEntries={[path]}>
                <DsShell>
                  <Page />
                </DsShell>
              </MemoryRouter>
            </StepUpProvider>
          </AuthProvider>
        </ThemeProvider>,
      );

      const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      expect(h1, `${path} rendered no <h1>`).not.toBeNull();
      expect(text(h1[1]).length, `${path} has an empty <h1>`).toBeGreaterThan(2);

      // The bar scripts/seo-check.mjs applies to a live deployment: enough
      // body copy that the page is about something rather than being chrome
      // with a title on it.
      expect(text(html).split(" ").length).toBeGreaterThan(250);
    });
  }
});

describe("the server is told to render them", () => {
  it("mounts each one in the marketing route tree", () => {
    const mounted = marketingPaths();
    expect(SSR_PAGES.map((e) => e.path).filter((p) => !mounted.includes(p))).toEqual([]);
  });

  it("lists each one in ssrPaths, which is what the function reads", () => {
    // Two files, one decision. A route in the tree but missing here is not
    // rendered at all; listed here but missing from the tree renders the
    // catch-all, which serves "page not found" under a 200.
    expect(SSR_PAGES.map((e) => e.path).filter((p) => !SSR_PATHS.includes(p))).toEqual([]);
  });

  it("fetches the catalogue before rendering any page that states a price", () => {
    // The coupling that makes /pricing safe to render at all. Drop the preload
    // and the server would publish DsPricing's fallback figures as the price
    // list; drop it quietly and nothing else in the tree would complain.
    for (const { path, preload } of SSR_PAGES.filter((e) => e.preload)) {
      const entry = LIST_PRELOADS[path];
      expect(entry, `${path} renders prices with no preload`).toBeTruthy();
      expect(entry[0]).toBe(preload);
      expect(entry[1]).toMatch(/\/products/);
    }
  });
});

describe("every one of them is a complete public page", () => {
  for (const { path } of NAV_PAGES) {
    it(`${path} is mounted, described and in the sitemap`, () => {
      expect(DS_PUBLIC_PATHS.has(path), `${path} is not a ds public path`).toBe(true);
      // Without an entry the page takes the house title and the house
      // sentence, so eleven pages would share one search result.
      expect(PAGE_META[path], `${path} has no title or description`).toBeTruthy();
      expect(
        STATIC_ROUTES.some(([loc]) => loc === path),
        `${path} is live but missing from the sitemap`,
      ).toBe(true);
    });
  }
});

describe("the new entries obey the length rules in pageMeta.js", () => {
  for (const { path } of NAV_PAGES) {
    it(`${path} has a title and description a search result can show whole`, () => {
      const { title, description } = PAGE_META[path];
      // Under 60 INCLUDING the brand suffix fullTitle() adds, because Google
      // truncates past roughly that and takes the specific words with it.
      expect(`${title} | ADLM Studio`.length).toBeLessThan(60);
      expect(description.length).toBeGreaterThanOrEqual(140);
      expect(description.length).toBeLessThanOrEqual(155);
    });
  }
});
