import { describe, it, expect, beforeEach } from "vitest";
import { placeHref, readPlace, rememberPlace } from "./lastPlace.js";

beforeEach(() => localStorage.clear());

describe("continue where you left off (P0.4)", () => {
  it("remembers the project, tab and line, and reopens exactly there", () => {
    rememberPlace({ productKey: "revit", key: "66f1a2b3c4d5e6f7a8b9c0d1", name: "Block A", tab: "bill", line: "k42", lineLabel: "line 42" });
    const p = readPlace();
    expect(p.name).toBe("Block A");
    expect(typeof p.at).toBe("number");
    expect(placeHref(p)).toBe("/projects/revit?project=66f1a2b3c4d5e6f7a8b9c0d1&tab=bill&line=k42");
  });

  it("only carries a line into the bill", () => {
    expect(placeHref({ productKey: "planswift", key: "block-b", tab: "budget", line: "k9" })).toBe(
      "/projects/planswift?project=block-b&tab=budget",
    );
  });

  it("ignores anything incomplete or unreadable", () => {
    rememberPlace({ key: "no-product" });
    expect(readPlace()).toBeNull();
    localStorage.setItem("adlm-last-place", "{not json");
    expect(readPlace()).toBeNull();
  });
});
