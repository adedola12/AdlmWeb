import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import CouponBanner from "./CouponBanner.jsx";

// The launch countdown strip is position:fixed, top:0, z-index 120. This banner
// is in normal flow and is first in App.jsx's tree, so it sat at y=0 underneath
// the strip and was completely covered: from the day the countdown went up,
// every promo code the studio ran was invisible on every public page while the
// admin screen showed it as live.
//
// jsdom does no layout, so what is pinned here is the CONTRACT the fix rests on:
// the banner offsets itself by the strip's published height, and publishes its
// own height for the navs to clear. The arithmetic itself is CSS calc().

const banner = {
  code: "LAUNCH25",
  type: "percent",
  value: 25,
  currency: "NGN",
  startsAt: "2026-09-27",
  endsAt: "2026-10-31",
};

describe("the coupon banner", () => {
  afterEach(() => {
    cleanup();
    document.documentElement.style.removeProperty("--coupon-banner-h");
  });

  it("starts below the fixed launch strip instead of underneath it", () => {
    const { container } = render(<CouponBanner banner={banner} onClose={() => {}} />);
    const el = container.firstChild;
    expect(el.style.marginTop).toBe("var(--launch-strip-h, 0px)");
  });

  it("publishes its height so the navs can clear it", () => {
    render(<CouponBanner banner={banner} onClose={() => {}} />);
    const published = document.documentElement.style.getPropertyValue("--coupon-banner-h");
    expect(published).toMatch(/^\d+px$/);
  });

  it("takes the height back down when it unmounts, so no gap is left", () => {
    const { unmount } = render(<CouponBanner banner={banner} onClose={() => {}} />);
    expect(document.documentElement.style.getPropertyValue("--coupon-banner-h")).toMatch(/px$/);
    unmount();
    expect(document.documentElement.style.getPropertyValue("--coupon-banner-h")).toBe("");
  });

  it("publishes nothing when there is no banner to show", () => {
    render(<CouponBanner banner={null} onClose={() => {}} />);
    expect(document.documentElement.style.getPropertyValue("--coupon-banner-h")).toBe("");
  });

  it("still shows the code and what it is worth", () => {
    const { container } = render(<CouponBanner banner={banner} onClose={() => {}} />);
    expect(container.textContent).toContain("LAUNCH25");
    expect(container.textContent).toContain("25% off");
  });
});
