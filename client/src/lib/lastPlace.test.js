import { describe, it, expect, beforeEach } from "vitest";
import { placeHref, readPlace, readPlaces, rememberPlace } from "./lastPlace.js";

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

  // S18/WH-05: his rebuilt overview lists three places, not one.
  it("keeps several projects, most recent first, one entry each", () => {
    rememberPlace({ productKey: "revit", key: "a", name: "Block A", tab: "bill" });
    rememberPlace({ productKey: "planswift", key: "b", name: "Block B", tab: "pm" });
    rememberPlace({ productKey: "revit", key: "a", name: "Block A", tab: "valuation" });

    const places = readPlaces(3);
    expect(places.map((p) => p.key)).toEqual(["a", "b"]);
    // The same project twice is one row, at the tab it was last left on.
    expect(places[0].tab).toBe("valuation");
    expect(readPlace().key).toBe("a");
  });

  it("caps the list so a busy browser cannot grow it forever", () => {
    for (let i = 0; i < 14; i += 1) rememberPlace({ productKey: "revit", key: `p${i}`, tab: "bill" });
    expect(readPlaces().length).toBe(10);
    expect(readPlaces(1)[0].key).toBe("p13");
  });

  it("still reads the single place written before the upgrade", () => {
    localStorage.setItem(
      "adlm-last-place",
      JSON.stringify({ productKey: "revit", key: "old", name: "Old one", tab: "bill", at: 5 }),
    );
    expect(readPlace().name).toBe("Old one");
    rememberPlace({ productKey: "planswift", key: "new", tab: "pm" });
    expect(readPlaces().map((p) => p.key)).toEqual(["new", "old"]);
  });
});
