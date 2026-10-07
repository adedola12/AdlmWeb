import { describe, it, expect } from "vitest";
import { withContractWrite } from "./contractWrite.js";
import { stageIndex } from "./overviewModel.js";

// Three routes change the contract and all three answer { ok, contract, version }
// — a fragment, not the project. This is the third time that shape has turned up
// in this folder and the first two were both got wrong before they were got
// right, so it has its own tests.

const project = (over = {}) => ({
  _id: "p1",
  version: 7,
  name: "Ikoyi Complex",
  items: [{ code: "BQ-1", rate: 1000 }],
  contract: { locked: false, hasLockPin: true },
  ...over,
});

describe("folding a contract write in", () => {
  it("takes the contract the server returned", () => {
    const out = withContractWrite(project(), {
      ok: true,
      contract: { locked: false, tenderedAt: "2026-10-06T00:00:00.000Z" },
      version: 8,
    });
    expect(out.contract.tenderedAt).toBe("2026-10-06T00:00:00.000Z");
  });

  it("moves the version on, because the next bill save is checked against it", () => {
    expect(
      withContractWrite(project(), { contract: { locked: true }, version: 8 }).version,
    ).toBe(8);
    expect(withContractWrite(project(), { contract: { locked: true } }).version).toBe(7);
  });

  it("REPLACES the contract, so a key the server dropped is dropped here", () => {
    // This is the assertion that actually distinguishes replace from merge, and the
    // first version of it did not: a merge lets the response win for every key the
    // response CARRIES, so testing `locked: true -> false` passes either way. The
    // difference only shows on a key the response OMITS. Sabotage-testing a
    // field-by-field merge sailed straight through the old test.
    //
    // The server sends the whole subdocument today, so the two agree in practice.
    // Replace is chosen because it cannot go stale if that stops being true.
    const locked = project({
      contract: { locked: true, lockedAt: "2026-09-01T00:00:00.000Z", lockedBy: "u1", hasLockPin: true },
    });
    const out = withContractWrite(locked, { contract: { locked: false }, version: 9 });
    expect(out.contract.locked).toBe(false);
    expect("lockedAt" in out.contract).toBe(false);
    expect("lockedBy" in out.contract).toBe(false);
  });

  it("still takes every key the response does carry", () => {
    const out = withContractWrite(project(), {
      contract: { locked: true, contractSum: 80_000_000, measuredAtLock: 70_000_000 },
      version: 9,
    });
    expect(out.contract.contractSum).toBe(80_000_000);
    expect(out.contract.measuredAtLock).toBe(70_000_000);
  });

  it("carries hasLockPin over, because the responses do not send it", () => {
    // projectForClient derives it from the stored hash and these write responses
    // never include it. Dropped, a reader who had just locked would be told their
    // project has no PIN — and would be asked to set one again.
    const out = withContractWrite(project(), { contract: { locked: true }, version: 8 });
    expect(out.contract.hasLockPin).toBe(true);
  });

  it("lets the response win when it DOES say", () => {
    const out = withContractWrite(project(), {
      contract: { locked: true, hasLockPin: false },
      version: 8,
    });
    expect(out.contract.hasLockPin).toBe(false);
  });

  it("changes nothing else about the project", () => {
    const p = project();
    const out = withContractWrite(p, { contract: { locked: true }, version: 8 });
    expect(out.name).toBe("Ikoyi Complex");
    expect(out.items).toBe(p.items);
    expect(out._id).toBe("p1");
  });

  it("hands the project back untouched when there is nothing to fold in", () => {
    const p = project();
    expect(withContractWrite(p, { ok: true })).toBe(p);
    expect(withContractWrite(p, { contract: "nonsense" })).toBe(p);
    expect(withContractWrite(p, null)).toBe(p);
    expect(withContractWrite(null, { contract: {} })).toBe(null);
  });

  it("moves the stage, which is the whole visible point of it", () => {
    // A tender date is what takes a priced bill to Tendered, and that is the stage
    // at which the lock is offered at all.
    const priced = project();
    expect(stageIndex(priced)).toBe(1);
    const tendered = withContractWrite(priced, {
      contract: { locked: false, tenderedAt: "2026-10-06T00:00:00.000Z" },
      version: 8,
    });
    expect(stageIndex(tendered)).toBe(2);
    const locked = withContractWrite(tendered, {
      contract: { locked: true, tenderedAt: "2026-10-06T00:00:00.000Z" },
      version: 9,
    });
    expect(stageIndex(locked)).toBe(3);
  });
});
