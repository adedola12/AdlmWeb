import { describe, it, expect } from "vitest";
import {
  blankVariationDraft,
  strippedVariation,
  variationBodyFrom,
  variationDraftProblem,
  withVariationWrite,
} from "./variationDraft.js";
import { worksBaseFor } from "./valuationsModel.js";

// The stripping is the part that matters most here, and it is not tidiness: the
// routes answer with ENRICHED rows and the project payload carries raw stored
// ones, and the difference between them is the denominator of every cumulative
// percentage on the Valuations tab.

describe("what gets sent", () => {
  it("sends the four fields the classic form sends, and nothing else", () => {
    const body = variationBodyFrom({
      description: "  Additional windows to stair core  ",
      reference: " AI-012 ",
      kind: "addition",
      amount: "450000",
    });
    expect(Object.keys(body).sort()).toEqual(["amount", "description", "kind", "reference"]);
    expect(body.description).toBe("Additional windows to stair core");
    expect(body.reference).toBe("AI-012");
    expect(body.amount).toBe(450_000);
  });

  it("NEVER sends a qty or a rate", () => {
    // A rate is built in RateGen and never typed on the website. And the server's
    // qty/rate branch ignores `kind`, so an omission entered that way would be
    // stored as an addition — money added where somebody meant to take it away.
    const body = variationBodyFrom({ description: "x", amount: "1000", kind: "omission" });
    expect("qty" in body).toBe(false);
    expect("rate" in body).toBe(false);
    expect("unit" in body).toBe(false);
  });

  it("sends the direction as kind, and the value as a positive figure", () => {
    expect(variationBodyFrom({ description: "x", amount: "1000", kind: "omission" })).toMatchObject({
      kind: "omission",
      amount: 1000,
    });
    // Even if a sign slips through, the value goes positive and the kind decides.
    expect(variationBodyFrom({ description: "x", amount: "-1000", kind: "omission" }).amount).toBe(
      1000,
    );
  });

  it("defaults an unknown kind to an addition rather than inventing one", () => {
    expect(variationBodyFrom({ description: "x", amount: "1", kind: "nonsense" }).kind).toBe(
      "addition",
    );
    expect(variationBodyFrom({ description: "x", amount: "1" }).kind).toBe("addition");
  });

  it("trims to the lengths the server stores", () => {
    const body = variationBodyFrom({
      description: "d".repeat(900),
      reference: "r".repeat(300),
      amount: "1",
    });
    expect(body.description.length).toBe(500);
    expect(body.reference.length).toBe(120);
  });

  it("does not throw on a draft that is not there", () => {
    expect(() => variationBodyFrom(null)).not.toThrow();
    expect(variationBodyFrom(null).amount).toBe(0);
  });
});

describe("why it cannot be raised yet", () => {
  const ok = { description: "Extra manholes", reference: "", kind: "addition", amount: "225000" };

  it("lets a filled-in form through", () => {
    expect(variationDraftProblem(ok)).toBe("");
  });

  it("uses the server's own sentences, so the two builds agree", () => {
    expect(variationDraftProblem(blankVariationDraft())).toBe("Say what changed.");
    expect(variationDraftProblem({ ...ok, description: "   " })).toBe("Say what changed.");
    expect(variationDraftProblem({ ...ok, amount: "" })).toBe("Enter the value of the variation.");
    expect(variationDraftProblem({ ...ok, amount: "0" })).toBe("Enter the value of the variation.");
  });

  it("refuses a negative value rather than silently flipping its meaning", () => {
    // The server takes the absolute value and believes the kind, so a negative
    // typed against "addition" would be stored as money ADDED. The figure typed
    // and the figure stored would differ in sign with nothing saying so.
    expect(variationDraftProblem({ ...ok, amount: "-5" })).toMatch(/positive figure/);
  });

  it("complains about the description before the value", () => {
    expect(variationDraftProblem({ description: "", amount: "" })).toBe("Say what changed.");
  });
});

describe("stripping the server's enrichment off a row", () => {
  it("drops index, amount, no and the mask flag, and keeps everything stored", () => {
    const enriched = {
      description: "Extra manholes",
      qty: 4,
      unit: "nr",
      rate: 225_000,
      status: "approved",
      reference: "AI-014",
      issuedAt: "2026-08-14",
      index: 3,
      amount: 900_000,
      no: 4,
      _ratesMasked: true,
    };
    const out = strippedVariation(enriched);
    expect(out).toEqual({
      description: "Extra manholes",
      qty: 4,
      unit: "nr",
      rate: 225_000,
      status: "approved",
      reference: "AI-014",
      issuedAt: "2026-08-14",
    });
  });

  it("leaves a row that was already stored-shaped alone", () => {
    const stored = { description: "x", qty: 1, unit: "item", rate: 10, status: "pending" };
    expect(strippedVariation(stored)).toEqual(stored);
  });

  it("does not throw on a row that is not one", () => {
    expect(strippedVariation(null)).toBe(null);
    expect(strippedVariation("x")).toBe("x");
  });
});

describe("folding a variation write into the project", () => {
  const project = (over = {}) => ({
    _id: "p1",
    version: 7,
    variations: [],
    items: [],
    ...over,
  });

  const answer = {
    ok: true,
    index: 0,
    variations: [
      {
        description: "Extra manholes",
        qty: 1,
        unit: "item",
        rate: 900_000,
        status: "pending",
        index: 0,
        amount: 900_000,
      },
    ],
    version: 8,
  };

  it("adopts the whole list the route returned", () => {
    const out = withVariationWrite(project(), answer);
    expect(out.variations).toHaveLength(1);
    expect(out.variations[0].description).toBe("Extra manholes");
  });

  it("moves the version on, because the next bill save is checked against it", () => {
    expect(withVariationWrite(project(), answer).version).toBe(8);
    expect(withVariationWrite(project(), { variations: [] }).version).toBe(7);
  });

  it("STRIPS the enrichment, so the Valuations denominator cannot move", () => {
    const out = withVariationWrite(project(), answer);
    expect("index" in out.variations[0]).toBe(false);
    expect("amount" in out.variations[0]).toBe(false);
  });

  it("leaves the certificate base exactly where it was", () => {
    // The real consequence, asserted end to end. worksBaseFor sums each approved
    // variation's value into the base every cumulative percentage is taken
    // against. Adopt the enriched rows and that base moves silently — and reverts
    // on the next page load, which is the worst kind of wrong because it does not
    // reproduce.
    const locked = project({
      contract: {
        locked: true,
        measuredAtLock: 100_000_000,
        provisionalAtLock: 0,
        preliminaryAtLock: 0,
      },
    });
    const before = worksBaseFor(locked, { contractSum: 112_875_000 });

    const approved = {
      variations: [
        { description: "V1", qty: 1, unit: "item", rate: 10_000_000, status: "approved", index: 0, amount: 10_000_000 },
      ],
      version: 8,
    };
    const folded = withVariationWrite(locked, approved);
    // The base moves by the variation's real value — qty * rate — and by exactly
    // that, whether the row arrived enriched or not.
    expect(worksBaseFor(folded, { contractSum: 112_875_000 })).toBe(before + 10_000_000);

    // And the same row, stored-shaped, gives the identical answer. That equality
    // is the whole point: the screen must not read one number on the way in from a
    // write and a different one on the way in from a page load.
    const stored = withVariationWrite(locked, {
      variations: [{ description: "V1", qty: 1, unit: "item", rate: 10_000_000, status: "approved" }],
      version: 8,
    });
    expect(worksBaseFor(stored, { contractSum: 112_875_000 })).toBe(
      worksBaseFor(folded, { contractSum: 112_875_000 }),
    );
  });

  it("does not let a normalised status drag in the grandfathered rows", () => {
    // variationForClient normalises an absent status to "approved". Stripping
    // keeps whatever the row actually stored, so a legacy row is read the same way
    // before and after a write — by variationStatus, which also treats absent as
    // approved, and does so on BOTH paths.
    const locked = project({
      contract: { locked: true, measuredAtLock: 100_000_000, provisionalAtLock: 0, preliminaryAtLock: 0 },
      variations: [{ description: "old", qty: 1, unit: "item", rate: 5_000_000 }],
    });
    const base = worksBaseFor(locked, { contractSum: 1 });
    const folded = withVariationWrite(locked, {
      variations: [
        { description: "old", qty: 1, unit: "item", rate: 5_000_000, index: 0, amount: 5_000_000, status: "approved" },
      ],
      version: 8,
    });
    expect(worksBaseFor(folded, { contractSum: 1 })).toBe(base);
  });

  it("hands back the project untouched when there is nothing to fold in", () => {
    const p = project();
    expect(withVariationWrite(p, { ok: true })).toBe(p);
    expect(withVariationWrite(p, null)).toBe(p);
    expect(withVariationWrite(null, answer)).toBe(null);
  });
});
