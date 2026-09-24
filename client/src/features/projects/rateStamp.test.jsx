// Backspacing a rate cell used to lock the QS out of it and then revert the
// line.
//
// The sequence, on bill line C10, qty 100, with a Budget build-up worth ₦9,000:
// the QS types ₦12,000 and saves, so the line is his (rateLockedAt set). He
// backspaces the cell to retype the figure, and on that single keystroke the
// cell reported itself CLEARED, the page released the stamp, the line fell
// back into the Budget-driven set on the same render, and the input he was
// typing into was replaced by a read-only lock chip. The form was dirty, so
// Save was live, and the save sent the stored ₦12,000 with the lock stripped —
// which is exactly the shape deriveBillRatesFromBudget re-derives, so the
// stored rate became ₦9,000. One backspace, ₦300,000, no confirmation.
//
// Both halves are pinned here: what the cell REPORTS on a keystroke against
// what it reports on a commit, and what the page then DOES with it.

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import ProjectBillTable, { RateCell } from "./ProjectBillTable.jsx";
import {
  budgetDrivenCodes,
  nextRateStamp,
  rateEditState,
  rateFieldsForSave,
} from "./rateStamp.js";

afterEach(cleanup);

// The line as the database holds it: the QS's own ₦12,000.
const STORED = {
  code: "C10",
  description: "Concrete 1:2:4 in foundation",
  unit: "m3",
  qty: 100,
  rate: 12000,
  appliedRateKey: "",
  rateLockedAt: "2026-09-23T08:00:00.000Z",
};

// Its build-up: 100 × ₦9,000 net, so the Budget would price the line ₦9,000.
const BUDGET = [
  { billIdentity: "C10", componentKind: "Material", qty: 600, rate: 1200 },
  { billIdentity: "C10", componentKind: "Labour", qty: 100, rate: 2800 },
];

const driven = (item, stamp) =>
  budgetDrivenCodes([item], BUDGET, () => stamp).has("c10");

describe("nextRateStamp", () => {
  it("leaves the stamp alone while the QS is still typing", () => {
    expect(nextRateStamp({ source: "editing" })).toBe(null);
  });

  it("releases the lock on a committed empty cell, keeping the plugin's key", () => {
    expect(
      nextRateStamp({ source: "cleared" }, { keepRateKey: "Concrete 1:2:4" }),
    ).toEqual({ appliedRateKey: "Concrete 1:2:4", rateLockedAt: null });
  });

  it("stamps a typed figure and a Rate Gen pick", () => {
    const typed = nextRateStamp({ source: "typed" }, { now: "2026-09-23T09:00:00.000Z" });
    expect(typed).toEqual({ appliedRateKey: "", rateLockedAt: "2026-09-23T09:00:00.000Z" });

    const picked = nextRateStamp(
      { source: "rategen", rateKey: "Concrete 1:2:4 (RG)" },
      { now: "2026-09-23T09:00:00.000Z" },
    );
    expect(picked).toEqual({
      appliedRateKey: "Concrete 1:2:4 (RG)",
      rateLockedAt: "2026-09-23T09:00:00.000Z",
    });
  });
});

describe("what the page may do with a line mid-edit", () => {
  it("never turns a cell read-only under the QS", () => {
    // The stored line is his, so the cell is editable.
    expect(driven(STORED, { appliedRateKey: "", rateLockedAt: STORED.rateLockedAt })).toBe(false);
    // A release he has not saved does NOT put it back under the Budget: the
    // decision is taken from the line as stored, and a pending stamp may only
    // ever unlock.
    expect(driven(STORED, { appliedRateKey: "", rateLockedAt: null })).toBe(false);
  });

  it("still locks a line the Budget really does drive", () => {
    const derivedLine = { ...STORED, rateLockedAt: null, rate: 9000 };
    expect(driven(derivedLine, null)).toBe(true);
    // ...and a Rate Gen pick unlocks it on the spot, without waiting for a save.
    expect(
      driven(derivedLine, { appliedRateKey: "RG", rateLockedAt: "2026-09-23T09:00:00.000Z" }),
    ).toBe(false);
  });

  it("a line with nothing priced under it is nobody's business but the QS's", () => {
    expect(budgetDrivenCodes([{ ...STORED, rateLockedAt: null }], [], () => null).has("c10")).toBe(
      false,
    );
  });

  it("shows a committed release before the save writes it", () => {
    expect(rateEditState(STORED, { appliedRateKey: "", rateLockedAt: null }).released).toBe(true);
    expect(rateEditState(STORED, null).released).toBe(false);
    // Nothing to release on a line that was never the QS's.
    expect(
      rateEditState({ ...STORED, rateLockedAt: null }, { appliedRateKey: "", rateLockedAt: null })
        .released,
    ).toBe(false);
  });
});

describe("the backspace sequence, cell and page together", () => {
  function openCell(onChange) {
    render(
      <RateCell
        value="12000"
        placeholder="12000"
        onChange={onChange}
        canRateGenBoq={false}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    return screen.getByRole("textbox");
  }

  it("a backspace to empty does not release the lock, and the save keeps the rate", () => {
    const onChange = vi.fn();
    const input = openCell(onChange);

    fireEvent.change(input, { target: { value: "" } });

    expect(onChange).toHaveBeenCalledTimes(1);
    const [value, meta] = onChange.mock.calls[0];
    expect(value).toBe("");
    // The keystroke is not a decision.
    expect(meta.source).toBe("editing");

    // So the page's stamp does not move...
    const stamp = { appliedRateKey: "", rateLockedAt: STORED.rateLockedAt };
    const next = nextRateStamp(meta, { keepRateKey: STORED.appliedRateKey });
    expect(next).toBe(null);

    // ...the cell he is typing in stays editable...
    expect(driven(STORED, stamp)).toBe(false);
    expect(screen.getByRole("textbox")).toBeTruthy();

    // ...and a save right now writes the line back exactly as it stands. The
    // lock is what stops server/util/deriveBillRates.js re-deriving the line
    // down to the build-up's ₦9,000.
    expect(rateFieldsForSave(STORED, "", stamp)).toEqual({
      rate: 12000,
      appliedRateKey: "",
      rateLockedAt: STORED.rateLockedAt,
    });
  });

  it("retyping the figure replaces it without ever leaving the cell", () => {
    const onChange = vi.fn();
    const input = openCell(onChange);

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.change(input, { target: { value: "15000" } });

    const [value, meta] = onChange.mock.calls[1];
    expect(value).toBe("15000");
    expect(meta.source).toBe("typed");
    expect(nextRateStamp(meta, { now: "2026-09-23T09:00:00.000Z" })).toEqual({
      appliedRateKey: "",
      rateLockedAt: "2026-09-23T09:00:00.000Z",
    });
    expect(rateFieldsForSave(STORED, "15000", {
      appliedRateKey: "",
      rateLockedAt: "2026-09-23T09:00:00.000Z",
    }).rate).toBe(15000);
  });

  it("committing the empty cell is still the way back to the Budget", () => {
    const onChange = vi.fn();
    const input = openCell(onChange);

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);

    const [value, meta] = onChange.mock.calls.at(-1);
    expect(value).toBe("");
    expect(meta.source).toBe("cleared");

    const stamp = nextRateStamp(meta, { keepRateKey: STORED.appliedRateKey });
    expect(stamp).toEqual({ appliedRateKey: "", rateLockedAt: null });
    // The QS is told before he saves...
    expect(rateEditState(STORED, stamp).released).toBe(true);
    // ...the cell is still his to change his mind in...
    expect(driven(STORED, stamp)).toBe(false);
    // ...and the save hands the line to the Budget, which is the whole point.
    expect(rateFieldsForSave(STORED, "", stamp)).toEqual({
      rate: 12000,
      appliedRateKey: "",
      rateLockedAt: null,
    });
  });

  it("clicking into a cell and out of it again releases nothing", () => {
    // Every untouched cell's value is "" (the stored rate is the placeholder),
    // so a blur must not read as a clear or merely looking at a bill would
    // hand every line back to the Budget.
    const onChange = vi.fn();
    render(
      <RateCell value="" placeholder="12000" onChange={onChange} canRateGenBoq={false} />,
    );
    fireEvent.click(screen.getByRole("button"));
    fireEvent.blur(screen.getByRole("textbox"));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("the bill says a released line is going back to the Budget, before the save", () => {
    const shown = [
      {
        i: 0,
        key: "k0",
        code: "C10",
        description: STORED.description,
        unit: "m3",
        qty: 100,
        category: "Substructure",
      },
    ];
    render(
      <ProjectBillTable
        items={[STORED]}
        computedShown={shown}
        rates={{ k0: "" }}
        rateNotes={new Map([[0, { state: "released", budgetRate: 9000 }]])}
        grossAmount={0}
        measuredAmount={1_200_000}
        provisionalSums={[]}
        variations={[]}
      />,
    );
    expect(screen.getByText(/Rate released/)).toBeTruthy();
    expect(screen.getByText(/9,000/)).toBeTruthy();
  });

  it("a released line with nothing priced under it shows an en dash", () => {
    const shown = [
      { i: 0, key: "k0", code: "C10", description: STORED.description, unit: "m3", qty: 100 },
    ];
    render(
      <ProjectBillTable
        items={[STORED]}
        computedShown={shown}
        rates={{ k0: "" }}
        rateNotes={new Map([[0, { state: "released", budgetRate: null }]])}
        grossAmount={0}
        measuredAmount={1_200_000}
        provisionalSums={[]}
        variations={[]}
      />,
    );
    expect(screen.getByText(/Rate released.*–$/)).toBeTruthy();
  });

  it("an abandoned Rate Gen search releases nothing either", () => {
    // He emptied the cell meaning to look a rate up, typed a name, then
    // thought better of it. That is not "this line has no rate".
    const onChange = vi.fn();
    const input = openCell(onChange);

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.change(input, { target: { value: "concrete" } });
    fireEvent.blur(input);

    expect(onChange.mock.calls.every(([, meta]) => meta.source !== "cleared")).toBe(true);
  });

  it("Escape abandons the edit instead of committing the clear", () => {
    const onChange = vi.fn();
    const input = openCell(onChange);

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.blur(input);

    expect(onChange.mock.calls.every(([, meta]) => meta.source !== "cleared")).toBe(true);
  });
});
