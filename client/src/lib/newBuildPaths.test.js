import { describe, it, expect } from "vitest";
import {
  insideNewBuild,
  isNewBuildRoute,
  linkFrom,
  newBuildPath,
  PRODUCT_PAGE,
  previewPath,
} from "./newBuildPaths.js";

// The porter wrote the answer into a data attribute and left the link on the
// old route: <Link to="/product/revit" data-ds-page="quiv">. This is that
// mapping made real.

describe("the new build's address for a classic page", () => {
  it("maps a product key to its ported page", () => {
    expect(newBuildPath("/product/revit")).toBe("/preview/quiv");
    expect(newBuildPath("/product/planswift")).toBe("/preview/heron");
    expect(newBuildPath("/product/qs-takeoff")).toBe("/preview/timepro");
    expect(newBuildPath("/product/civil3d")).toBe("/preview/civiq");
  });

  it("maps the marketing pages", () => {
    expect(newBuildPath("/quote")).toBe("/preview/quote");
    expect(newBuildPath("/pricing")).toBe("/preview/pricing");
    expect(newBuildPath("/products")).toBe("/preview/products");
    expect(newBuildPath("/solutions/firms")).toBe("/preview/solutions-firms");
    expect(newBuildPath("/")).toBe("/preview/home");
  });

  it("carries a query or hash through", () => {
    expect(newBuildPath("/quote?from=fit")).toBe("/preview/quote?from=fit");
    expect(newBuildPath("/pricing#teams")).toBe("/preview/pricing#teams");
  });

  it("ignores a trailing slash", () => {
    expect(newBuildPath("/pricing/")).toBe("/preview/pricing");
    expect(newBuildPath("/product/revit/")).toBe("/preview/quiv");
  });

  it("answers EMPTY for a page the redesign has not reached", () => {
    // Handing back the classic path would make a link look converted while
    // leaving it exactly as it was.
    expect(newBuildPath("/projects/planswift")).toBe("");
    expect(newBuildPath("/product/nonexistent")).toBe("");
    expect(newBuildPath("/dashboard")).toBe("");
  });

  it("refuses anything that is not an in-app path", () => {
    expect(newBuildPath("https://example.com/quote")).toBe("");
    expect(newBuildPath("")).toBe("");
    expect(newBuildPath(null)).toBe("");
  });

  it("insideNewBuild falls back to the classic path, because a dead link is worse", () => {
    expect(insideNewBuild("/quote")).toBe("/preview/quote");
    expect(insideNewBuild("/projects/planswift")).toBe("/projects/planswift");
  });

  it("every product key maps to a real ported slug", () => {
    // If a key here had no page, the link would silently fall back to classic.
    for (const [key, slug] of Object.entries(PRODUCT_PAGE)) {
      expect(newBuildPath(`/product/${key}`)).toBe(previewPath(slug));
    }
  });
});

describe("chrome that is used on both gated and public pages", () => {
  it("knows which routes are inside the redesign", () => {
    expect(isNewBuildRoute("/fit")).toBe(true);
    expect(isNewBuildRoute("/preview/quote")).toBe(true);
    expect(isNewBuildRoute("/privacy")).toBe(false);
    expect(isNewBuildRoute("/certificate")).toBe(false);
    expect(isNewBuildRoute("/")).toBe(false);
    expect(isNewBuildRoute(null)).toBe(false);
  });

  it("keeps a reader inside the build they are already in", () => {
    expect(linkFrom("/fit", "/quote")).toBe("/preview/quote");
    expect(linkFrom("/preview/pricing", "/product/revit")).toBe("/preview/quiv");
  });

  it("NEVER sends a public visitor to the staff gate", () => {
    // main.jsx renders this chrome on /privacy, /terms, /licensing and
    // /certificate. Repointing their footers at /preview would put the public
    // in front of a gate — the comment at main.jsx:1291 says exactly this.
    for (const publicRoute of ["/privacy", "/terms", "/licensing", "/certificate", "/"]) {
      expect(linkFrom(publicRoute, "/quote")).toBe("/quote");
      expect(linkFrom(publicRoute, "/product/revit")).toBe("/product/revit");
    }
  });
});

describe("the hole the sweep found in this very file", () => {
  it("refuses a protocol-relative URL, which is not an in-app path", () => {
    // "starts with /" accepts //evil.example, which leaves the site. The same
    // bug was fixed in agentActions.js; the sweep found it still here, in the
    // file that is now the single funnel for every chrome link.
    const BS = String.fromCharCode(92); // a real backslash, unambiguously
    for (const bad of ["//evil.example", "//evil.example/quote", `/${BS}evil.example`, `/${BS}${BS}x`]) {
      expect(newBuildPath(bad)).toBe("");
      expect(insideNewBuild(bad)).toBe("");
      expect(linkFrom("/fit", bad)).toBe("");
      expect(linkFrom("/privacy", bad)).toBe("");
    }
  });

  it("still lets a real in-app path through", () => {
    expect(insideNewBuild("/quote")).toBe("/preview/quote");
    expect(insideNewBuild("/projects/planswift")).toBe("/projects/planswift");
    expect(linkFrom("/privacy", "/quote")).toBe("/quote");
  });
});
