import { describe, expect, it } from "vitest";
import { isFolderMarker } from "./folderMarker.js";

describe("isFolderMarker", () => {
  it("spots the marker HERON saves ahead of each folder", () => {
    expect(isFolderMarker({ description: "--- GF ---", type: "section", code: "folder:GF", level: "GF", qty: 0 })).toBe(true);
    expect(isFolderMarker({ description: "--- Roof ---", type: "section", qty: 0 })).toBe(true);
  });

  it("leaves real bill lines alone", () => {
    expect(isFolderMarker({ description: "Wall Rendering", type: "item", code: "GF:Wall Rendering", qty: 469.02 })).toBe(false);
    expect(isFolderMarker({ description: "  Lintel Concrete", type: "breakdown", qty: 0.72 })).toBe(false);
    // A section row that carries a quantity is someone's line, whatever it is called.
    expect(isFolderMarker({ description: "--- GF ---", type: "section", code: "folder:GF", qty: 3 })).toBe(false);
    // Another tool's section heading that is not a HERON folder marker.
    expect(isFolderMarker({ description: "Substructure", type: "section", qty: 0 })).toBe(false);
    expect(isFolderMarker(null)).toBe(false);
  });
});
