// The rows the Bill edits must survive a save.
//
// The bug these tests are written against: the project save rebuilt each
// provisional sum, variation and preliminary item from a hand-written list of
// fields. The PUT replaces the whole array, so every field left off that list
// was erased — a PC sum came back as a provisional sum, an executed variation
// un-executed itself, a decided one lost who decided it and when, and the
// QS's recorded preliminary spend went back to zero. Each assertion below
// fails against that code.

import { describe, it, expect } from "vitest";
import {
  newPreliminaryItemRow,
  newProvisionalSumRow,
  newVariationRow,
  normalizeSumKind,
  preliminaryItemForSave,
  preliminaryItemRow,
  provisionalSumForSave,
  provisionalSumRow,
  toDateInput,
  variationForSave,
  variationRow,
} from "./projectRows.js";

// A sum exactly as the server stores and returns one: every field in
// ProvisionalSumSchema.
const STORED_SUM = {
  description: "Lift installation",
  amount: 5_000_000,
  completed: true,
  completedAt: "2026-09-10T09:00:00.000Z",
  kind: "pc",
};

// A variation with every field in VariationSchema filled in, including the
// S18 decision trail.
const STORED_VARIATION = {
  description: "Additional windows to stair core",
  qty: 4,
  unit: "no",
  rate: 180_000,
  reference: "AI-012",
  issuedAt: "2026-09-12T00:00:00.000Z",
  source: "post-lock-new-item",
  completed: true,
  completedAt: "2026-09-16T00:00:00.000Z",
  status: "rejected",
  decidedAt: "2026-09-17T14:30:00.000Z",
  decidedBy: "64b7f2a1c9e77b0012ab34cd",
};

const STORED_PRELIM = {
  name: "Site office",
  allocation: 40,
  completed: true,
  completedAt: "2026-09-01T00:00:00.000Z",
  notes: "Cabin hired for six months",
  actualAmount: 1_250_000,
};

// One save: load the stored row into the editor, then send it back.
const roundTripSum = (s) => provisionalSumForSave(provisionalSumRow(s));
const roundTripVariation = (v) => variationForSave(variationRow(v));
const roundTripPrelim = (p) => preliminaryItemForSave(preliminaryItemRow(p));

describe("a provisional sum survives a save", () => {
  it("keeps every field the model stores", () => {
    const out = roundTripSum(STORED_SUM);
    expect(out.description).toBe("Lift installation");
    expect(out.amount).toBe(5_000_000);
    // The whole point of the S18 split: a PC sum must not come back as a
    // provisional sum.
    expect(out.kind).toBe("pc");
    expect(out.completed).toBe(true);
    expect(out.completedAt).toBe(STORED_SUM.completedAt);
  });

  it("is unchanged by a second and third save", () => {
    expect(roundTripSum(roundTripSum(roundTripSum(STORED_SUM)))).toEqual(
      roundTripSum(STORED_SUM),
    );
  });

  it("reads a row written before `kind` existed as a provisional sum", () => {
    const legacy = { description: "Drainage allowance", amount: 750_000 };
    expect(roundTripSum(legacy).kind).toBe("provisional");
    expect(normalizeSumKind(undefined)).toBe("provisional");
    expect(normalizeSumKind("PC")).toBe("pc");
    expect(normalizeSumKind("nonsense")).toBe("provisional");
  });

  it("carries the merged-project source tag the server routes rows home by", () => {
    const merged = { ...STORED_SUM, sourceProjectId: "64b7f2a1c9e77b0012ab34cd" };
    expect(roundTripSum(merged).sourceProjectId).toBe("64b7f2a1c9e77b0012ab34cd");
  });
});

describe("a variation survives a save", () => {
  it("keeps every field the model stores, including the decision trail", () => {
    const out = roundTripVariation(STORED_VARIATION);
    expect(out.description).toBe("Additional windows to stair core");
    expect(out.qty).toBe(4);
    expect(out.unit).toBe("no");
    expect(out.rate).toBe(180_000);
    expect(out.reference).toBe("AI-012");
    expect(out.issuedAt).toBe("2026-09-12");
    // A rejected variation that kept its status but lost who rejected it and
    // when is a variation with no audit trail.
    expect(out.status).toBe("rejected");
    expect(out.decidedAt).toBe(STORED_VARIATION.decidedAt);
    expect(out.decidedBy).toBe(STORED_VARIATION.decidedBy);
    // Executed on site — the tick that earns it its value.
    expect(out.completed).toBe(true);
    expect(out.completedAt).toBe(STORED_VARIATION.completedAt);
    // Provenance: raised by the post-lock auto-add, not typed by hand.
    expect(out.source).toBe("post-lock-new-item");
  });

  it("is unchanged by a second and third save", () => {
    expect(
      roundTripVariation(roundTripVariation(roundTripVariation(STORED_VARIATION))),
    ).toEqual(roundTripVariation(STORED_VARIATION));
  });

  it("reads a row written before `status` existed as approved", () => {
    const legacy = { description: "Extra manholes", qty: 1, unit: "item", rate: 450_000 };
    const out = roundTripVariation(legacy);
    expect(out.status).toBe("approved");
    expect(out.source).toBe("manual");
    expect(out.completed).toBe(false);
  });

  it("carries the merged-project source tag the server routes rows home by", () => {
    const merged = { ...STORED_VARIATION, sourceProjectId: "64b7f2a1c9e77b0012ab34cd" };
    expect(roundTripVariation(merged).sourceProjectId).toBe(
      "64b7f2a1c9e77b0012ab34cd",
    );
  });

  it("sends an empty issue date as null, not an empty string", () => {
    expect(roundTripVariation({ description: "x", qty: 1, rate: 1 }).issuedAt).toBe(null);
  });
});

describe("a preliminary item survives a save", () => {
  it("keeps the QS's recorded spend", () => {
    const out = roundTripPrelim(STORED_PRELIM);
    expect(out.name).toBe("Site office");
    expect(out.allocation).toBe(40);
    expect(out.completed).toBe(true);
    expect(out.completedAt).toBe(STORED_PRELIM.completedAt);
    expect(out.notes).toBe("Cabin hired for six months");
    // It used to be dropped on load and sent back as 0.
    expect(out.actualAmount).toBe(1_250_000);
  });
});

describe("a variation raised from the Bill is not approved", () => {
  it("starts waiting for approval, like one raised on the Valuation tab", () => {
    expect(newVariationRow().status).toBe("pending");
    expect(newVariationRow().status).not.toBe("approved");
  });

  it("is still pending by the time it reaches the server", () => {
    expect(variationForSave(newVariationRow()).status).toBe("pending");
  });

  it("is worth nothing and has no decision behind it", () => {
    const row = newVariationRow();
    expect(row.qty * row.rate).toBe(0);
    expect(row.completed).toBe(false);
    expect(row.decidedAt).toBe(null);
    expect(row.decidedBy).toBe(null);
    expect(row.source).toBe("manual");
  });
});

describe("new rows", () => {
  it("adds a sum into the group the user asked for", () => {
    expect(newProvisionalSumRow("pc").kind).toBe("pc");
    expect(newProvisionalSumRow("pc").description).toBe("New PC sum");
    // The ribbon's plain "Add sum" still adds what it always added.
    expect(newProvisionalSumRow().kind).toBe("provisional");
    expect(newProvisionalSumRow("provisional").description).toBe(
      "New provisional sum",
    );
  });

  it("starts a preliminary item with no recorded spend", () => {
    expect(newPreliminaryItemRow()).toEqual({
      name: "",
      allocation: 0,
      completed: false,
      completedAt: null,
      notes: "",
      actualAmount: 0,
    });
  });
});

describe("date handling", () => {
  it("turns a stored date into what the date input wants", () => {
    expect(toDateInput("2026-09-12T10:11:12.000Z")).toBe("2026-09-12");
    expect(toDateInput(new Date("2026-09-12T10:11:12.000Z"))).toBe("2026-09-12");
  });

  it("leaves an editor value alone and never throws on rubbish", () => {
    expect(toDateInput("2026-09-12")).toBe("2026-09-12");
    expect(toDateInput("not a date")).toBe("");
    expect(toDateInput(null)).toBe("");
    expect(toDateInput("")).toBe("");
  });
});

describe("the row id survives the round trip", () => {
  // The server gives every row a lineId and pairs an incoming row to the
  // stored row it came from by that id (server/routes/projects.js,
  // preserveMaskedMoney). It only works if the id comes BACK, so these rows
  // must keep a field these helpers have never heard of.
  //
  // This is the same "a row travels whole" rule the rest of this file pins,
  // and it is why these helpers spread instead of listing fields. Rewrite one
  // of them as a field list and a rate-masked collaborator's save starts
  // guessing again — or gets refused, because a row that arrives unnamed in a
  // payload whose other rows are named reads as a brand-new row.
  const LINE_ID = "ln-aaaaaaaa-1111";

  it("keeps the id on a provisional sum", () => {
    const out = provisionalSumForSave(
      provisionalSumRow({ lineId: LINE_ID, description: "Lift installation", amount: 1 }),
    );
    expect(out.lineId).toBe(LINE_ID);
  });

  it("keeps the id on a variation", () => {
    const out = variationForSave(
      variationRow({ lineId: LINE_ID, description: "Extra soakaway", qty: 1, rate: 1 }),
    );
    expect(out.lineId).toBe(LINE_ID);
  });

  it("keeps the id on a preliminary item", () => {
    const out = preliminaryItemForSave(
      preliminaryItemRow({ lineId: LINE_ID, name: "Site security", allocation: 5 }),
    );
    expect(out.lineId).toBe(LINE_ID);
  });

  it("gives a brand-new row no id — the server is the one that names rows", () => {
    // A client-invented id would be a client-invented identity, and the row it
    // claimed to be is where the money is. New rows arrive unnamed and the
    // server mints one on write.
    expect(newProvisionalSumRow("pc").lineId).toBeUndefined();
    expect(newVariationRow().lineId).toBeUndefined();
    expect(newPreliminaryItemRow().lineId).toBeUndefined();
  });
});
