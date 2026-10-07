import { describe, it, expect } from "vitest";
import { seedNotes } from "./releaseNotes.js";

// The approver's note is the only part of his verdict that is his own words.
// The screen that replaced the old card started every box empty, which lost it
// twice over: the stored note was invisible, and because the note rides along
// with each verdict POST, changing his mind sent "" and the server wrote that
// over what he had written.

describe("seeding the approver's notes", () => {
  const items = [
    { key: "gate-down", note: "the spacing is off above the rail" },
    { key: "nav-overview", note: "" },
    { key: "old-links" },
  ];

  it("puts a stored note back in its box", () => {
    expect(seedNotes({}, items)["item:gate-down"]).toBe("the spacing is off above the rail");
  });

  it("keys exactly as the rows do, or the seed silently does nothing", () => {
    // The rows read note("item:<key>"). A seed under any other prefix leaves
    // every box empty and looks like it worked.
    expect(Object.keys(seedNotes({}, items))).toEqual(["item:gate-down"]);
  });

  it("never overwrites what he is in the middle of typing", () => {
    // A reload after a failed save must not take the text out from under him.
    const typing = { "item:gate-down": "half a sent" };
    expect(seedNotes(typing, items)["item:gate-down"]).toBe("half a sent");
  });

  it("leaves a box he has deliberately emptied empty", () => {
    // "" is a decision, not an absence: he cleared it on purpose.
    const cleared = { "item:gate-down": "" };
    expect(seedNotes(cleared, items)["item:gate-down"]).toBe("");
  });

  it("adds nothing for an item with no note", () => {
    const out = seedNotes({}, items);
    expect("item:nav-overview" in out).toBe(false);
    expect("item:old-links" in out).toBe(false);
  });

  it("survives the shapes a failed read produces", () => {
    expect(seedNotes(undefined, undefined)).toEqual({});
    expect(seedNotes(null, null)).toEqual({});
    expect(seedNotes({}, [null, {}, { note: "no key" }])).toEqual({});
  });

  it("does not mutate the state it was given", () => {
    const before = {};
    seedNotes(before, items);
    expect(before).toEqual({});
  });
});
