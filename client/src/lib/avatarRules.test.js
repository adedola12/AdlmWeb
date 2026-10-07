import { describe, it, expect } from "vitest";
import { avatarSizeProblem } from "./avatarRules.js";

describe("profile photo size rule (R08, browser half)", () => {
  it("passes a square photo", () => {
    expect(avatarSizeProblem(800, 800)).toBeNull();
    expect(avatarSizeProblem(800, 790)).toBeNull();
  });
  it("says a wide photo must be square, and how big it is", () => {
    expect(avatarSizeProblem(1200, 800)).toMatch(/must be square.*1200 × 800/);
  });
  it("refuses a tiny one", () => {
    expect(avatarSizeProblem(150, 150)).toMatch(/at least 200/);
  });
});
