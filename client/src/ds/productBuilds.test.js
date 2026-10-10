import { describe, it, expect } from "vitest";
import { PRODUCT_BUILDS, buildNumber, latestLabel } from "./productBuilds.js";

describe("product build numbers (Major.Minor.YYMM.N)", () => {
  it("assembles the build from version, release month and number", () => {
    expect(buildNumber("4.0", "2026-10", 1)).toBe("4.0.2610.1");
    expect(buildNumber("4.0", "2026-10", 2)).toBe("4.0.2610.2");
    expect(buildNumber("2.0", "2026-11", 1)).toBe("2.0.2611.1");
  });

  it("refuses anything it cannot assemble rather than guessing", () => {
    expect(buildNumber("", "2026-10", 1)).toBe("");
    expect(buildNumber("4.0", "Oct 2026", 1)).toBe("");
    expect(buildNumber("4.0", "2026-10", 0)).toBe("");
  });

  it("writes the hero line as the rule spells it", () => {
    expect(latestLabel("quiv")).toBe("QUIV 4.0, build 4.0.2610.1");
    expect(latestLabel("mep")).toBe("SERVIQ 2.0, build 2.0.2610.1");
    expect(latestLabel("timepro")).toBe("Time Pro 1.0, build 1.0.2610.1");
  });

  it("keeps every version to two digits and every build under its own version", () => {
    for (const [slug, p] of Object.entries(PRODUCT_BUILDS)) {
      expect(p.version, slug).toMatch(/^\d+\.\d+$/);
      expect(buildNumber(p.version, p.released, p.n).startsWith(`${p.version}.`), slug).toBe(true);
    }
  });
});
