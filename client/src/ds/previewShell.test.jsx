// Which staged pages render bare, and which get the floating Ada.
//
// Both answers come from his build (site/build.js): a page with
// "nochrome": true in its meta block is emitted with no nav, footer or promo
// band, and adaFor() skips dash-, work-, doc-, admin- and plugin- pages. His
// nochrome set today is exactly the 32 admin-* screens plus plugin-quiv and
// plugin-heron.
//
// We deliberately do NOT follow his adaFor() on the dash-/work- previews: Ada
// is ours, not his, and a reviewer walking the staged app screens should be
// able to open her. The plugin references are the exception, and the test
// below is what keeps that exception deliberate rather than accidental.

import { describe, it, expect } from "vitest";
import { isBareScreen, hasFloatingAda } from "./previewShell.js";
import { DS_PAGES } from "./pages/manifest.js";

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

  it("leaves every marketing and app page in a shell", () => {
    for (const slug of slugs) {
      if (/^(admin|plugin)-/.test(slug)) continue;
      expect(isBareScreen(slug), `${slug} should keep its shell`).toBe(false);
    }
  });

  it("is not fooled by a page whose name merely contains the word", () => {
    // "plugins" or "adminstrivia" would be a marketing page, not a bare one.
    expect(isBareScreen("plugins")).toBe(false);
    expect(isBareScreen("quiv-plugin-guide")).toBe(false);
  });
});

describe("the floating Ada on staged pages (CHR-4)", () => {
  it("is off on the plugin references, as his adaFor() is", () => {
    expect(hasFloatingAda("plugin-quiv")).toBe(false);
    expect(hasFloatingAda("plugin-heron")).toBe(false);
  });

  it("stays on everywhere else, including his app and admin screens", () => {
    for (const slug of slugs) {
      if (/^plugin-/.test(slug)) continue;
      expect(hasFloatingAda(slug), `${slug} should keep Ada`).toBe(true);
    }
  });
});

describe("the manifest still holds the two plugin references", () => {
  it("has both slugs, so the preview index links resolve", () => {
    expect(slugs).toContain("plugin-quiv");
    expect(slugs).toContain("plugin-heron");
    expect(slugs).toContain("work-tool");
  });
});
