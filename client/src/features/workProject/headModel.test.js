import { describe, it, expect } from "vitest";
import {
  accessName,
  jumpList,
  keepTabOnJump,
  overflowActions,
  projectIdLabel,
  syncFailed,
  syncLabel,
} from "./headModel.js";

// His header (work-proj.js:342-346). The overflow's contents are a rule about
// who is reading, so they are pinned here rather than left to the markup.

describe("the sync indicator", () => {
  it("reads as his does at rest and while saving", () => {
    expect(syncLabel("idle")).toBe("Saved");
    expect(syncLabel("saving")).toBe("Saving…");
    expect(syncLabel("saved")).toBe("Saved just now");
  });

  it("says a failed save was not saved, rather than going quiet", () => {
    // Ours is a network PUT; his is localStorage. A failure that still reads
    // "Saved" is how somebody believes a progress figure was recorded.
    expect(syncLabel("failed")).toBe("Not saved");
    expect(syncFailed("failed")).toBe(true);
    expect(syncFailed("saved")).toBe(false);
  });
});

describe("jumping to another project", () => {
  const list = [
    { _id: "a1", slug: "ikoyi-complex", name: "Ikoyi Complex", client: "Lagos State" },
    { _id: "b2", slug: "lekki-mall", name: "Lekki Mall", client: "Pinnacle Ltd" },
    { _id: "c3", slug: "abuja-towers", name: "Abuja Towers", client: "Lagos State" },
  ];

  it("leaves out the project being read, found by id or by slug", () => {
    expect(jumpList(list, "a1").map((p) => p._id)).toEqual(["b2", "c3"]);
    expect(jumpList(list, "ikoyi-complex").map((p) => p._id)).toEqual(["b2", "c3"]);
  });

  it("matches on the name", () => {
    expect(jumpList(list, "a1", "lekki").map((p) => p._id)).toEqual(["b2"]);
  });

  it("matches on the client too — a QS remembers whose job it was", () => {
    expect(jumpList(list, "b2", "lagos state").map((p) => p._id)).toEqual(["a1", "c3"]);
  });

  it("ignores case and surrounding space", () => {
    expect(jumpList(list, "a1", "  LEKKI  ")).toHaveLength(1);
  });

  it("caps a long list, so the popover does not become the page", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ _id: `p${i}`, name: `Job ${i}` }));
    expect(jumpList(many, "p0")).toHaveLength(40);
  });

  it("is empty rather than throwing before the list has loaded", () => {
    expect(jumpList(null, "a1")).toEqual([]);
  });
});

describe("which tab survives a jump", () => {
  it("keeps the five tabs every project has", () => {
    expect(keepTabOnJump("bill")).toBe("bill");
    expect(keepTabOnJump("valuations")).toBe("valuations");
  });

  it("drops Model, Drawings and Services — the next project may not have them", () => {
    expect(keepTabOnJump("model")).toBe("");
    expect(keepTabOnJump("drawings")).toBe("");
    expect(keepTabOnJump("services")).toBe("");
  });

  it("sends Overview as no tab at all, as his URLs do", () => {
    expect(keepTabOnJump("overview")).toBe("");
  });
});

describe("the project id", () => {
  it("is his ADLM-PRJ- form", () => {
    expect(projectIdLabel({ _id: "64f0ab" })).toBe("ADLM-PRJ-64F0AB");
  });

  it("is empty for a project with no id, so nothing offers to copy nothing", () => {
    expect(projectIdLabel({})).toBe("");
    expect(projectIdLabel(null)).toBe("");
  });
});

describe("what the overflow offers", () => {
  it("offers Collaborators only to the owner", () => {
    const owner = overflowActions({ isOwner: true }).map((a) => a.key);
    const shared = overflowActions({ isOwner: false }).map((a) => a.key);
    expect(owner).toContain("people");
    expect(shared).not.toContain("people");
  });

  it("offers both reports and the full workspace to everyone", () => {
    const keys = overflowActions({ isOwner: false }).map((a) => a.key);
    expect(keys).toEqual(["id", "report", "pm-report", "full"]);
  });

  it("leaves out the PM report on a project with no PM tab", () => {
    expect(overflowActions({ canSeePm: false }).map((a) => a.key)).not.toContain("pm-report");
  });

  it("never offers Delete — not from a menu on a page for reading", () => {
    const keys = overflowActions({ isOwner: true }).map((a) => a.key);
    expect(keys).not.toContain("delete");
  });
});

describe("what a share level lets somebody do", () => {
  it("says it in words, not as a level name", () => {
    expect(accessName("full")).toBe("Can edit and export");
    expect(accessName("view")).toBe("Can view");
  });

  it("treats anything unrecognised as view — the safer of the two", () => {
    expect(accessName(undefined)).toBe("Can view");
    expect(accessName("owner")).toBe("Can view");
  });
});
