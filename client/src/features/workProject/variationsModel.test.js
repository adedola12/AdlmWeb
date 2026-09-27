import { describe, it, expect } from "vitest";
import {
  accountClosed,
  againstContract,
  finalAccountRows,
  variationAmount,
  variationKpis,
  variationRows,
  variationStatus,
} from "./variationsModel.js";

// His variations() (work-proj.js:1608) and finalView() (:1672) against our
// VariationSchema, whose `status` and `completed` are two different things.

const project = (over = {}) => ({
  variations: [
    // Approved and built.
    {
      description: "Extra manholes",
      reference: "AI-014",
      qty: 4,
      unit: "nr",
      rate: 225_000,
      status: "approved",
      completed: true,
      issuedAt: "2026-08-14",
    },
    // Approved, not yet built.
    { description: "Upgrade to granite sills", qty: 30, unit: "m", rate: 18_000, status: "approved" },
    // An omission.
    { description: "Omit the rear canopy", qty: 1, rate: -1_400_000, status: "approved" },
    // Not counted yet.
    { description: "Additional car park bays", qty: 12, rate: 95_000, status: "pending" },
    { description: "Client-requested lift upgrade", qty: 1, rate: 8_000_000, status: "rejected" },
  ],
  ...over,
});

describe("what a variation is worth", () => {
  it("is measured, not a figure typed once", () => {
    expect(variationAmount({ qty: 4, rate: 225_000 })).toBe(900_000);
  });

  it("is negative for an omission", () => {
    expect(variationAmount({ qty: 1, rate: -1_400_000 })).toBe(-1_400_000);
  });

  it("is 0, not NaN, on a row with nothing on it", () => {
    expect(variationAmount({})).toBe(0);
  });
});

describe("a variation's status", () => {
  it("reads the three the server allows", () => {
    expect(variationStatus({ status: "pending" })).toBe("pending");
    expect(variationStatus({ status: "rejected" })).toBe("rejected");
    expect(variationStatus({ status: "approved" })).toBe("approved");
  });

  it("is approved when there is none — the server's own default", () => {
    // Every row written before the field existed reads back approved. Treating
    // a missing status as pending would drop it out of the contract value.
    expect(variationStatus({})).toBe("approved");
    expect(variationStatus({ status: "" })).toBe("approved");
  });
});

describe("the list", () => {
  const rows = variationRows(project());

  it("is newest first, as his is", () => {
    expect(rows[0].title).toBe("Client-requested lift upgrade");
  });

  it("numbers each one by its position, and keeps its index", () => {
    const first = rows.find((r) => r.title === "Extra manholes");
    expect(first.no).toBe(1);
    expect(first.index).toBe(0);
  });

  it("carries the reference and the date", () => {
    const v = rows.find((r) => r.no === 1);
    expect(v.reference).toBe("AI-014");
    expect(v.issuedAt).toBe("2026-08-14");
  });

  it("says nothing rather than guessing when there is no reference", () => {
    expect(rows.find((r) => r.no === 2).reference).toBe("");
  });

  it("keeps approved and completed apart", () => {
    // approved = it counts toward the contract value; completed = it has been
    // executed on site.
    const built = rows.find((r) => r.no === 1);
    const not = rows.find((r) => r.no === 2);
    expect(built.status).toBe("approved");
    expect(built.completed).toBe(true);
    expect(not.status).toBe("approved");
    expect(not.completed).toBe(false);
  });

  it("marks a row the post-lock flow raised itself", () => {
    const auto = variationRows({
      variations: [{ description: "New item after lock", source: "post-lock-new-item" }],
    });
    expect(auto[0].automatic).toBe(true);
    expect(variationRows(project())[0].automatic).toBe(false);
  });

  it("names an untitled row rather than showing a blank", () => {
    expect(variationRows({ variations: [{ qty: 1, rate: 1 }] })[0].title).toBe(
      "Untitled variation",
    );
  });

  it("is empty on a project with none", () => {
    expect(variationRows({})).toEqual([]);
    expect(variationRows(null)).toEqual([]);
  });
});

describe("the four figures above the list", () => {
  const k = variationKpis(project());

  it("counts additions and omissions from approved rows only", () => {
    expect(k.additions).toBe(4 * 225_000 + 30 * 18_000);
    expect(k.additionCount).toBe(2);
    expect(k.omissions).toBe(-1_400_000);
    expect(k.omissionCount).toBe(1);
  });

  it("nets them, which is what moves the contract value", () => {
    expect(k.net).toBe(4 * 225_000 + 30 * 18_000 - 1_400_000);
  });

  it("leaves a pending variation out of the net and says what it would add", () => {
    expect(k.pendingCount).toBe(1);
    expect(k.pendingValue).toBe(12 * 95_000);
    // The pending figure is not in the net.
    expect(k.net).toBe(k.additions + k.omissions);
  });

  it("leaves a rejected variation out of everything but the count", () => {
    expect(k.count).toBe(5);
    expect(k.pendingCount).toBe(1);
    expect(k.additionCount + k.omissionCount).toBe(3);
  });

  it("counts the approved rows not yet executed", () => {
    // Money owed eventually, not money earned now.
    expect(k.awaitingExecution).toBe(2);
  });

  it("is zeros on a project with no variations", () => {
    const none = variationKpis({});
    expect(none.count).toBe(0);
    expect(none.net).toBe(0);
    expect(none.pendingCount).toBe(0);
  });
});

describe("the final account breakdown", () => {
  const totals = {
    measured: 120_000_000,
    prelims: 9_000_000,
    pc: 18_000_000,
    provisional: 4_000_000,
    linked: 24_500_000,
    contingency: 6_000_000,
    variations: 2_500_000,
    tax: 13_000_000,
    total: 172_500_000,
  };

  it("lists his rows in his order", () => {
    expect(finalAccountRows(totals).map((r) => r.key)).toEqual([
      "measured",
      "prelims",
      "pc",
      "provisional",
      "linked",
      "contingency",
      "variations",
      "tax",
    ]);
  });

  it("marks linked services as sitting outside the cascade", () => {
    // projectTotals keeps them out of `total`, so the breakdown has to say so
    // or it reads as arithmetic that does not add up.
    expect(finalAccountRows(totals).find((r) => r.key === "linked").outside).toBe(true);
  });

  it("drops the rows worth nothing", () => {
    const bare = finalAccountRows({ measured: 100, total: 100 });
    expect(bare.map((r) => r.key)).toEqual(["measured"]);
  });

  it("keeps measured work even at zero — that is itself worth seeing", () => {
    expect(finalAccountRows({}).map((r) => r.key)).toEqual(["measured"]);
  });
});

describe("the final account against the contract", () => {
  it("calls a higher final account an over-run", () => {
    const c = againstContract({ total: 110, contractSum: 100 });
    expect(c.over).toBe(true);
    expect(c.label).toBe("Over-run");
    expect(c.difference).toBe(10);
    expect(c.percentOfContract).toBe(10);
  });

  it("calls a lower one a saving", () => {
    const c = againstContract({ total: 90, contractSum: 100 });
    expect(c.over).toBe(false);
    expect(c.label).toBe("Saving");
    expect(c.difference).toBe(10);
  });

  it("says so when it lands exactly on the contract sum", () => {
    expect(againstContract({ total: 100, contractSum: 100 }).label).toBe(
      "On the contract sum",
    );
  });

  it("reports what share has been certified", () => {
    expect(againstContract({ total: 200, certified: 50 }).certifiedShare).toBe(25);
  });

  it("does not divide by a contract sum of zero", () => {
    const c = againstContract({ total: 100, contractSum: 0 });
    expect(c.percentOfContract).toBe(0);
    expect(Number.isFinite(c.percentOfContract)).toBe(true);
  });
});

describe("whether the account is closed", () => {
  it("is closed at his final stage", () => {
    expect(accountClosed({ stage: "final" })).toBe(true);
    expect(accountClosed({ stage: "Final" })).toBe(true);
  });

  it("is live at any other stage", () => {
    expect(accountClosed({ stage: "valuing" })).toBe(false);
    expect(accountClosed({})).toBe(false);
  });
});
