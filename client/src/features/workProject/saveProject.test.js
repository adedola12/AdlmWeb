import { describe, it, expect } from "vitest";
import {
  buildSavePayload,
  projectUrl,
  withLineElement,
  withLineProgress,
  writeIdFor,
} from "./saveProject.js";

// The PUT has two rules and they pull in opposite directions:
//
//   • an array the payload OMITS is left alone (every one is guarded by
//     Array.isArray in routes/projects.js);
//   • an array the payload SENDS is replaced wholesale, row for row.
//
// The same goes for the scalars: a field merely PRESENT is written. So these
// tests are as much about what must NOT be in a payload as what must.

const project = (over = {}) => ({
  version: 7,
  clientName: "Lagos State Development Co.",
  contract: { preliminaryPercent: 7.5, contingencyPercent: 5, taxPercent: 7.5 },
  valuationSettings: { retentionPct: 5, vatPct: 7.5, withholdingPct: 2.5 },
  items: [
    { code: "BQ-1", qty: 100, rate: 1_000, percentComplete: 0, category: "Substructure" },
    { code: "BQ-2", qty: 50, rate: 2_000, percentComplete: 40, category: "Frame" },
  ],
  provisionalSums: [{ description: "Lift installation", amount: 18_000_000, kind: "pc" }],
  variations: [{ description: "Extra manholes", qty: 1, rate: 900_000, status: "approved" }],
  preliminaryItems: [{ description: "Site office", allocation: 40, completed: true }],
  ...over,
});

describe("what a save carries", () => {
  it("carries the version, so a stale save can be refused", () => {
    expect(buildSavePayload(project(), {}).baseVersion).toBe(7);
  });

  it("sends only what the patch changes", () => {
    const body = buildSavePayload(project(), { items: [] });
    expect(Object.keys(body).sort()).toEqual(["baseVersion", "items"]);
  });

  it("does not touch the arrays it is not changing", () => {
    // Omitting them is what leaves them alone. Sending our copy back would
    // replace the stored one with whatever this page happened to be holding.
    const body = buildSavePayload(project(), { items: [] });
    expect("provisionalSums" in body).toBe(false);
    expect("variations" in body).toBe(false);
    expect("preliminaryItems" in body).toBe(false);
  });

  it("never sends the client name", () => {
    // `if (clientName !== undefined)` writes it. A progress tick that carried a
    // client name could rewrite the client name.
    const body = buildSavePayload(project(), { items: [] });
    expect("clientName" in body).toBe(false);
  });

  it("never sends the contract percentages or the valuation settings", () => {
    const body = buildSavePayload(project(), { items: [] });
    expect("preliminaryPercent" in body).toBe(false);
    expect("contingencyPercent" in body).toBe(false);
    expect("taxPercent" in body).toBe(false);
    expect("valuationSettings" in body).toBe(false);
  });

  it("refuses a patch whose array is not an array", () => {
    // The server's guard would skip it: the request succeeds, nothing changes,
    // and the page says "Saved".
    expect(() => buildSavePayload(project(), { items: null })).toThrow(/items must be an array/);
    expect(() => buildSavePayload(project(), { variations: "x" })).toThrow(
      /variations must be an array/,
    );
  });

  it("refuses rows that are not whole rows", () => {
    // The rule behind ProjectsGeneric's warning: a row rebuilt from a field
    // list loses what it left out, which is how a PC sum stopped being one.
    expect(() => buildSavePayload(project(), { items: ["BQ-1"] })).toThrow(
      /whole object/,
    );
  });

  it("lets a patch empty an array on purpose", () => {
    expect(buildSavePayload(project(), { variations: [] }).variations).toEqual([]);
  });
});

describe("changing one line's progress", () => {
  it("changes that line and no other", () => {
    const patch = withLineProgress(project(), 1, 75);
    expect(patch.items[1].percentComplete).toBe(75);
    expect(patch.items[0].percentComplete).toBe(0);
  });

  it("sends every line back, whole", () => {
    // items is replaced by what is sent, so the untouched rows must be in it
    // with all their fields.
    const patch = withLineProgress(project(), 1, 75);
    expect(patch.items).toHaveLength(2);
    expect(patch.items[0]).toMatchObject({ code: "BQ-1", qty: 100, rate: 1_000 });
    expect(patch.items[1]).toMatchObject({ code: "BQ-2", qty: 50, rate: 2_000, category: "Frame" });
  });

  it("does not mutate the project it was given", () => {
    const p = project();
    withLineProgress(p, 1, 75);
    expect(p.items[1].percentComplete).toBe(40);
  });

  it("clamps a figure outside 0-100", () => {
    expect(withLineProgress(project(), 0, 140).items[0].percentComplete).toBe(100);
    expect(withLineProgress(project(), 0, -5).items[0].percentComplete).toBe(0);
    expect(withLineProgress(project(), 0, "nonsense").items[0].percentComplete).toBe(0);
  });

  it("refuses an index that is not a line", () => {
    expect(withLineProgress(project(), 9, 50)).toBe(null);
    expect(withLineProgress(project(), -1, 50)).toBe(null);
  });

  it("produces a patch a save will accept", () => {
    const p = project();
    const body = buildSavePayload(p, withLineProgress(p, 0, 100));
    expect(body.items[0].percentComplete).toBe(100);
    expect(body.baseVersion).toBe(7);
  });
});

describe("moving a line to another section", () => {
  it("changes that line's category", () => {
    const patch = withLineElement(project(), 0, "Frame");
    expect(patch.items[0].category).toBe("Frame");
    expect(patch.items[1].category).toBe("Frame");
  });

  it("trims what it is given", () => {
    expect(withLineElement(project(), 0, "  Finishes  ").items[0].category).toBe("Finishes");
  });

  it("refuses to blank a section", () => {
    // A line with no section falls into "Uncategorised" on every screen, which
    // is a worse answer than refusing the change.
    expect(withLineElement(project(), 0, "")).toBe(null);
    expect(withLineElement(project(), 0, "   ")).toBe(null);
  });

  it("does not mutate the project it was given", () => {
    const p = project();
    withLineElement(p, 0, "Frame");
    expect(p.items[0].category).toBe("Substructure");
  });
});

describe("where it saves to", () => {
  it("is the address ProjectsGeneric uses, so there is one shape not two", () => {
    expect(projectUrl("planswift", "ikoyi-complex")).toBe("/projects/planswift/ikoyi-complex");
  });

  it("lowercases the product and escapes the id", () => {
    expect(projectUrl("PlanSwift", "a b&c")).toBe("/projects/planswift/a%20b%26c");
  });
});

// THE BUG THIS PINS
//
// The new project page's route carries a slug. Every write route validates its
// :id as an ObjectId, so passing the route param through made the server answer
// 400 "Invalid id" to every save from that page — and the only sign of it was
// the indicator reading "Not saved". Found on preview 29 Sep 2026 by watching
// the PUT: /projects/planswift/planswift-takeoff -> 400 {"error":"Invalid id"}.
describe("which id a write uses", () => {
  const SLUG = "planswift-takeoff";
  const OID = "68c9b1f2a4d3e5b7c1a20934";

  it("prefers the loaded document's _id over the slug in the address bar", () => {
    expect(writeIdFor({ _id: OID, slug: SLUG }, SLUG)).toBe(OID);
  });

  it("never sends a slug when a document is in hand", () => {
    expect(writeIdFor({ _id: OID }, SLUG)).not.toBe(SLUG);
  });

  it("accepts `id` as well as `_id` — the rollup spells it the other way", () => {
    expect(writeIdFor({ id: OID }, SLUG)).toBe(OID);
  });

  it("falls back to the route when nothing is loaded yet", () => {
    // The classic page's route param already IS the ObjectId, so this is the
    // right answer there rather than an empty request.
    expect(writeIdFor(null, OID)).toBe(OID);
  });

  it("builds a write URL that carries the ObjectId, not the slug", () => {
    const url = projectUrl("planswift", writeIdFor({ _id: OID, slug: SLUG }, SLUG));
    expect(url).toBe(`/projects/planswift/${OID}`);
    expect(url).not.toContain(SLUG);
  });
});
