// Which staged pages render bare, and which get the floating Ada.
//
// Both answers come from his build (site/build.js): a page with
// "nochrome": true in its meta block is emitted with no nav, footer or promo
// band, and adaFor() skips dash-, work-, doc-, admin- and plugin- pages — and,
// since 22 Sep 2026, every chromeless page. His nochrome set today is the 32
// admin-* screens, plugin-quiv and plugin-heron, and the five Windows-product
// designs he added on 22 September: hub and the four splash-* screens.
//
// We deliberately do NOT follow his adaFor() on the dash-/work- previews: Ada
// is ours, not his, and a reviewer walking the staged app screens should be
// able to open her. The desktop references — the plugins, the Hub and the
// splash screens — are the exception, and the tests below are what keep that
// exception deliberate rather than accidental.

import { describe, it, expect } from "vitest";
import { isBareScreen, hasFloatingAda } from "./previewShell.js";
import { DS_PAGES } from "./pages/manifest.js";
import { MAP } from "../lib/dsRoutes.js";

const slugs = DS_PAGES.map((p) => p.slug);

describe("staged pages that carry no shell of ours (PLG-02)", () => {
  it("treats both plugin references as bare", () => {
    expect(isBareScreen("plugin-quiv")).toBe(true);
    expect(isBareScreen("plugin-heron")).toBe(true);
  });

  it("still treats his admin screens as bare", () => {
    expect(isBareScreen("admin-home")).toBe(true);
    expect(isBareScreen("admin-invoices")).toBe(true);
  });

  it("treats the Hub and the four splash screens as bare", () => {
    expect(isBareScreen("hub")).toBe(true);
    for (const p of ["quiv", "heron", "rategen", "hub"]) {
      expect(isBareScreen(`splash-${p}`), `splash-${p} should render bare`).toBe(true);
    }
  });

  it("leaves every marketing and app page in a shell", () => {
    for (const slug of slugs) {
      if (/^(admin|plugin|splash)-/.test(slug) || slug === "hub") continue;
      expect(isBareScreen(slug), `${slug} should keep its shell`).toBe(false);
    }
  });

  it("is not fooled by a page whose name merely contains the word", () => {
    // "plugins" or "adminstrivia" would be a marketing page, not a bare one.
    expect(isBareScreen("plugins")).toBe(false);
    expect(isBareScreen("quiv-plugin-guide")).toBe(false);
    // `hub` is one page, anchored. A later "hub-pricing" would be marketing.
    expect(isBareScreen("hub-pricing")).toBe(false);
    expect(isBareScreen("installer-hub")).toBe(false);
  });
});

describe("the floating Ada on staged pages (CHR-4)", () => {
  it("is off on the plugin references, as his adaFor() is", () => {
    expect(hasFloatingAda("plugin-quiv")).toBe(false);
    expect(hasFloatingAda("plugin-heron")).toBe(false);
  });

  it("is off on the Hub and the splash screens — an installer is not a website", () => {
    expect(hasFloatingAda("hub")).toBe(false);
    for (const p of ["quiv", "heron", "rategen", "hub"]) {
      expect(hasFloatingAda(`splash-${p}`), `splash-${p} should have no Ada`).toBe(false);
    }
  });

  it("stays on everywhere else, including his app and admin screens", () => {
    for (const slug of slugs) {
      if (/^(plugin|splash)-/.test(slug) || slug === "hub") continue;
      expect(hasFloatingAda(slug), `${slug} should keep Ada`).toBe(true);
    }
  });
});

describe("the manifest holds every desktop design reference", () => {
  it("has each slug, so the preview index links resolve", () => {
    for (const slug of [
      "plugin-quiv",
      "plugin-heron",
      "hub",
      "splash-quiv",
      "splash-heron",
      "splash-rategen",
      "splash-hub",
      "work-tool",
    ]) {
      expect(slugs).toContain(slug);
    }
  });

  it("gives none of them a customer route", () => {
    for (const key of [
      "plugin-quiv",
      "plugin-heron",
      "hub",
      "splash-quiv",
      "splash-heron",
      "splash-rategen",
      "splash-hub",
    ]) {
      expect(MAP[key], `${key} must never become a route`).toBe(null);
    }
  });
});
