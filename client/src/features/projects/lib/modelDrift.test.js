import { describe, expect, it } from "vitest";
import { driftChangeText, driftRowTitle, driftTitle } from "./modelDrift.js";

describe("model drift wording", () => {
  it("says what changed, and nothing when nothing did", () => {
    expect(driftChangeText({ counts: { added: 1, removed: 2, changed: 3 } })).toBe(
      "1 element added, 2 removed, 3 changed in size",
    );
    expect(driftChangeText({ counts: { added: 4 } })).toBe("4 elements added");
    expect(driftChangeText(null)).toBe("");
  });

  it("the header tooltip counts the bill lines and says what to do", () => {
    const t = driftTitle({ counts: { removed: 1, linesAffected: 1 } });
    expect(t).toContain("1 removed");
    expect(t).toContain("1 bill line may no longer match");
    expect(t).toContain("Re-take them in the plugin");
  });

  it("the gallery tooltip survives a missing date", () => {
    expect(driftRowTitle({})).toBe(
      "The model has changed since the last take-off. Open the project for details.",
    );
  });
});
