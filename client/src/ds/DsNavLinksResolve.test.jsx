// Every link in his nav has to go somewhere.
//
// His nav and footer were ported with links to his whole site — Pricing, the
// four Solutions pages, How it works, Ada, Mobile, Contact, Careers, Press —
// while those pages were mounted only at /preview/<slug>, behind the staff
// gate. On the live site each of those links fell through to the catch-all.
//
// It showed up as a MOBILE complaint because the drawer is built at runtime
// from the same desktop markup (useDsBehaviours.initMobileNav), so it
// inherited every dead end: a phone menu with new sections that did nothing
// when tapped. The drawer itself was never the bug, which is why this test
// checks the hrefs rather than the markup.
import React from "react";
import { describe, it, expect } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DsNav from "./chrome/DsNav.jsx";
import { useDsBehaviours } from "./useDsBehaviours.js";
import DS_PUBLIC_PATHS from "../lib/dsPublicPaths.js";

// jsdom has no matchMedia, and the behaviours ask it for reduced motion.
window.matchMedia =
  window.matchMedia ||
  ((q) => ({
    matches: false,
    media: q,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
  }));

// Classic routes his nav also points at. These are mounted in main.jsx outside
// dsPublicPaths (they are not his pages), so they are listed rather than
// inferred. A link to anything not here and not in DS_PUBLIC_PATHS is a link
// to the catch-all.
const CLASSIC_ROUTES = new Set([
  "/product/revit",
  "/product/planswift",
  "/product/rategen",
  "/product/mep",
  "/product/qs-takeoff",
  "/product/civil3d",
  "/testimonials",
  "/support",
]);

function Harness() {
  const ref = React.useRef(null);
  useDsBehaviours(ref, {});
  return (
    <div className="ds" ref={ref}>
      <DsNav />
    </div>
  );
}

/** Every href the nav offers, desktop and drawer, with hash/query dropped. */
function navTargets() {
  const { container } = render(
    <MemoryRouter>
      <Harness />
    </MemoryRouter>,
  );
  // Opening the burger is what builds the drawer, so it has to happen before
  // the drawer's links can be read.
  container.querySelector("#burger")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  const hrefs = [...container.querySelectorAll("a[href]")]
    .map((a) => a.getAttribute("href").replace(/[?#].*$/, ""))
    .filter((h) => h.startsWith("/"));
  const drawer = {
    sections: [...container.querySelectorAll("#mnav .mnav-sec")].map((s) => ({
      title: s.querySelector(".mnav-t span")?.textContent.trim(),
      links: s.querySelectorAll(".mnav-l").length,
    })),
    flats: [...container.querySelectorAll("#mnav .mnav-flat")].map((a) => a.textContent.trim()),
  };
  cleanup();
  return { hrefs: [...new Set(hrefs)], drawer };
}

describe("his nav only links to pages that are mounted", () => {
  it("leaves no link falling through to the catch-all", () => {
    const { hrefs } = navTargets();
    const dead = hrefs.filter((h) => !DS_PUBLIC_PATHS.has(h) && !CLASSIC_ROUTES.has(h));
    expect(dead).toEqual([]);
  });

  it("offers his whole site, not just the pages that were already live", () => {
    const { hrefs } = navTargets();
    // The eleven that had no public route until they were mounted.
    for (const p of [
      "/pricing",
      "/solutions/firms",
      "/solutions/professionals",
      "/solutions/students",
      "/solutions/institutions",
      "/how-it-works",
      "/ada",
      "/mobile",
      "/contact",
      "/careers",
      "/press",
    ]) {
      expect(hrefs, `nav should link to ${p}`).toContain(p);
      expect(DS_PUBLIC_PATHS.has(p), `${p} must be a mounted ds public path`).toBe(true);
    }
  });

  it("builds the phone drawer from his desktop panels, so the two cannot drift", () => {
    const { drawer } = navTargets();
    expect(drawer.sections.map((s) => s.title)).toEqual([
      "Products",
      "Solutions",
      "Learn",
      "Company",
    ]);
    // Each accordion carries the real links out of its mega-panel.
    for (const sec of drawer.sections) {
      expect(sec.links, `${sec.title} should not be empty`).toBeGreaterThan(0);
    }
    expect(drawer.flats).toContain("Pricing");
  });
});
