import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import WorkProjectLinePanel from "./WorkProjectLinePanel.jsx";

// His line panel (work-proj.js:891). Reading it is most of the panel; the two
// edits — recording progress and moving a line to another section — are what
// these mostly pin, because they are the only writes on the whole page.

afterEach(cleanup);

const project = (over = {}) => ({
  items: [
    {
      code: "BQ-1",
      description: "Excavate for foundations",
      qty: 120,
      unit: "m3",
      rate: 4_500,
      percentComplete: 25,
      category: "Substructure",
      trade: "Earthworks",
      takeoffLine: "Foundation plan",
    },
    {
      code: "BQ-2",
      description: "Reinforced concrete columns",
      qty: 40,
      unit: "m3",
      rate: 0,
      percentComplete: 0,
      category: "Frame",
    },
  ],
  ...over,
});

const panel = (props = {}) =>
  render(<WorkProjectLinePanel project={project()} index={0} {...props} />).container;

describe("what the panel says about a line", () => {
  it("leads with the quantity and its unit", () => {
    const c = panel();
    expect(within(c).getByText(/120/)).toBeTruthy();
    expect(within(c).getByText("m3")).toBeTruthy();
  });

  it("names where it was measured", () => {
    expect(within(panel()).getByText(/BQ-1 · Foundation plan/)).toBeTruthy();
  });

  it("shows the rate and what the line comes to", () => {
    const c = panel();
    expect(within(c).getByText(/₦4,500/)).toBeTruthy();
    // 120 × 4,500.
    expect(within(c).getByText("₦540,000")).toBeTruthy();
  });

  it("says an unpriced line is not in the total, rather than showing ₦0", () => {
    const c = render(<WorkProjectLinePanel project={project()} index={1} />).container;
    expect(within(c).getByText(/No rate yet — it is not counted/)).toBeTruthy();
    expect(within(c).queryByText("₦0")).toBe(null);
  });

  it("says progress only counts once the contract is locked", () => {
    expect(within(panel()).getByText(/Progress counts once the contract is locked/)).toBeTruthy();
    const locked = panel({ contractLocked: true });
    expect(within(locked).getByText(/Feeds the next valuation/)).toBeTruthy();
  });

  it("renders nothing for an index that is not a line", () => {
    const c = render(<WorkProjectLinePanel project={project()} index={9} />).container;
    expect(c.textContent).toBe("");
  });

  it("does not throw on a project that has not loaded", () => {
    expect(() => render(<WorkProjectLinePanel project={null} index={0} />)).not.toThrow();
  });
});

describe("recording progress", () => {
  it("offers his five steps, with the line's own marked", () => {
    const c = panel({ canEdit: true });
    const steps = [...c.querySelectorAll(".pn-steps button")];
    expect(steps.map((b) => b.textContent)).toEqual(["0%", "25%", "50%", "75%", "100%"]);
    expect(steps[1].getAttribute("aria-pressed")).toBe("true");
  });

  it("saves the whole project with that one line changed", () => {
    const onSave = vi.fn();
    const c = panel({ canEdit: true, onSave });
    fireEvent.click(within(c).getByText("75%"));
    const patch = onSave.mock.calls[0][0];
    expect(patch.items[0].percentComplete).toBe(75);
    expect(patch.items[1].percentComplete).toBe(0);
  });

  it("sends every line, not just the one that changed", () => {
    // The PUT replaces items outright, so a patch holding one line would delete
    // the rest of the bill.
    const onSave = vi.fn();
    fireEvent.click(within(panel({ canEdit: true, onSave })).getByText("100%"));
    expect(onSave.mock.calls[0][0].items).toHaveLength(2);
  });

  it("offers no steps to a view-only reader", () => {
    expect(panel().querySelector(".pn-steps")).toBe(null);
  });

  it("does not let a second click in while a save is in flight", () => {
    const onSave = vi.fn();
    const c = panel({ canEdit: true, onSave, saving: true });
    expect([...c.querySelectorAll(".pn-steps button")].every((b) => b.disabled)).toBe(true);
    fireEvent.click(within(c).getByText("50%"));
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("moving a line to another section", () => {
  it("offers the sections this bill actually uses", () => {
    const sel = panel({ canEdit: true }).querySelector(".pn-sel");
    expect([...sel.options].map((o) => o.textContent)).toEqual(["Frame", "Substructure"]);
    expect(sel.value).toBe("Substructure");
  });

  it("saves the line into the section picked", () => {
    const onSave = vi.fn();
    const sel = panel({ canEdit: true, onSave }).querySelector(".pn-sel");
    fireEvent.change(sel, { target: { value: "Frame" } });
    expect(onSave.mock.calls[0][0].items[0].category).toBe("Frame");
  });

  it("keeps a line's own section on the list even when no other line shares it", () => {
    // Otherwise the only line in a section could never be put back.
    const one = project({ items: [{ code: "BQ-1", qty: 1, rate: 1, category: "Roofing" }] });
    const sel = render(
      <WorkProjectLinePanel project={one} index={0} canEdit />,
    ).container.querySelector(".pn-sel");
    expect([...sel.options].map((o) => o.textContent)).toEqual(["Roofing"]);
  });

  it("shows a view-only reader the section as text, not a picker", () => {
    const c = panel();
    expect(c.querySelector(".pn-sel")).toBe(null);
    expect(within(c).getByText("Substructure")).toBeTruthy();
  });
});

describe("getting to the next line", () => {
  it("steps forward and back by index", () => {
    const onGoToLine = vi.fn();
    const c = panel({ onGoToLine });
    fireEvent.click(within(c).getByText("Next line"));
    expect(onGoToLine).toHaveBeenCalledWith(1);
  });

  it("stops at each end of the bill", () => {
    const first = panel();
    expect(within(first).getByText("Previous line").disabled).toBe(true);
    const last = render(<WorkProjectLinePanel project={project()} index={1} />).container;
    expect(within(last).getByText("Next line").disabled).toBe(true);
  });
});

describe("pricing an unpriced line from a rate", () => {
  // THE LOOP THIS BROKE
  //
  // "Price it" used to open the Rates tab, and the Rates tab is read-only
  // because a rate is built in RateGen. So the two screens sent the reader to
  // each other and neither took a rate. A tester hit exactly that.

  const pick = {
    rateId: "r7",
    description: "Reinforced concrete grade 25 in columns",
    unit: "m3",
    unitPrice: 78_400,
    why: "Close match in your own rate",
  };

  it("asks for rates for an UNPRICED line and offers what comes back", async () => {
    const onFetchRates = vi.fn().mockResolvedValue([pick]);
    // index 1 is the rate-0 line in the fixture.
    const c = render(
      <WorkProjectLinePanel
        project={project()}
        index={1}
        canEdit
        onFetchRates={onFetchRates}
      />,
    ).container;
    expect(onFetchRates).toHaveBeenCalledWith("BQ-2");
    await vi.waitFor(() => expect(within(c).getByText(/78,400/)).toBeTruthy());
    expect(within(c).getByText(/Close match in your own rate/)).toBeTruthy();
  });

  it("does NOT ask for a line that already has a rate", () => {
    // Second-guessing a rate the QS applied is not this panel's business.
    const onFetchRates = vi.fn().mockResolvedValue([pick]);
    render(
      <WorkProjectLinePanel project={project()} index={0} canEdit onFetchRates={onFetchRates} />,
    );
    expect(onFetchRates).not.toHaveBeenCalled();
  });

  it("does NOT ask on behalf of a reader who cannot edit", () => {
    const onFetchRates = vi.fn().mockResolvedValue([pick]);
    render(<WorkProjectLinePanel project={project()} index={1} onFetchRates={onFetchRates} />);
    expect(onFetchRates).not.toHaveBeenCalled();
  });

  it("does NOT ask for a line with no code, which the endpoint cannot address", () => {
    const onFetchRates = vi.fn().mockResolvedValue([pick]);
    const p = project();
    p.items[1] = { ...p.items[1], code: "" };
    render(<WorkProjectLinePanel project={p} index={1} canEdit onFetchRates={onFetchRates} />);
    expect(onFetchRates).not.toHaveBeenCalled();
  });

  it("posts the pick with the line's code", async () => {
    const onApplyRate = vi.fn();
    const c = render(
      <WorkProjectLinePanel
        project={project()}
        index={1}
        canEdit
        onFetchRates={vi.fn().mockResolvedValue([pick])}
        onApplyRate={onApplyRate}
      />,
    ).container;
    await vi.waitFor(() => expect(within(c).getByText(/78,400/)).toBeTruthy());
    fireEvent.click(within(c).getByText(/78,400/).closest("button"));
    expect(onApplyRate).toHaveBeenCalledWith("BQ-2", pick);
  });

  it("names the unit when nothing in the library matches", async () => {
    // A unit mismatch is a hard exclusion server-side, so "nothing matched"
    // usually means "you have no rate in this unit" — worth saying.
    const c = render(
      <WorkProjectLinePanel
        project={project()}
        index={1}
        canEdit
        onFetchRates={vi.fn().mockResolvedValue([])}
      />,
    ).container;
    await vi.waitFor(() => expect(within(c).getByText(/Nothing in your rate library/)).toBeTruthy());
    expect(within(c).getByText(/in m3/)).toBeTruthy();
  });

  it("does not offer one line's rate on ANOTHER unpriced line", async () => {
    // The fetch is per line, and both lines here are unpriced — so nothing but
    // the in-flight guard stops a late answer for BQ-2 being offered as the
    // rate for BQ-3, at a different quantity and in a different unit. Moving to
    // a PRICED line would pass whether the guard existed or not, which is why
    // this moves to an unpriced one.
    const p = project();
    p.items.push({
      code: "BQ-3",
      description: "Ceramic wall tiling",
      qty: 420,
      unit: "m2",
      rate: 0,
      percentComplete: 0,
      category: "Finishes",
    });
    let answerForBq2;
    const onFetchRates = vi
      .fn()
      .mockImplementationOnce(() => new Promise((r) => (answerForBq2 = r)))
      .mockResolvedValue([]);

    const view = render(
      <WorkProjectLinePanel project={p} index={1} canEdit onFetchRates={onFetchRates} />,
    );
    // Move to the other unpriced line before BQ-2's answer lands, then answer.
    view.rerender(
      <WorkProjectLinePanel project={p} index={2} canEdit onFetchRates={onFetchRates} />,
    );
    answerForBq2([pick]);
    await vi.waitFor(() =>
      expect(within(view.container).getByText(/Nothing in your rate library/)).toBeTruthy(),
    );
    // BQ-2's rate must not be on BQ-3.
    expect(within(view.container).queryByText(/78,400/)).toBe(null);
    expect(onFetchRates).toHaveBeenNthCalledWith(2, "BQ-3");
  });

  it("says what the build-up could not price", () => {
    const c = render(
      <WorkProjectLinePanel
        project={project()}
        index={1}
        canEdit
        priceNotes={["No price for cement in your constants library"]}
      />,
    ).container;
    expect(within(c).getByText(/No price for cement/)).toBeTruthy();
  });
});

describe("recording what was measured on site", () => {
  const locked = (over = {}) => ({
    contract: { locked: true },
    valuationSettings: { showActualColumns: true },
    items: [
      { code: "BQ-1", description: "Excavate", qty: 120, unit: "m3", rate: 4_500 },
      { code: "BQ-2", description: "Columns", qty: 40, unit: "m3", rate: 72_000 },
    ],
    ...over,
  });

  const draw = (project, props = {}) =>
    render(
      <WorkProjectLinePanel project={project} index={0} canEdit contractLocked {...props} />,
    ).container;

  it("is not offered before the contract is locked", () => {
    // Before a lock there is one quantity and it IS the estimate — there is
    // nothing to compare against, so an "actual" box would be noise.
    const c = render(
      <WorkProjectLinePanel
        project={locked({ contract: {} })}
        index={0}
        canEdit
        contractLocked={false}
      />,
    ).container;
    expect(within(c).queryByText("Measured on site")).toBe(null);
  });

  it("is not offered when the columns are put away", () => {
    const c = draw(locked({ valuationSettings: { showActualColumns: false } }));
    expect(within(c).queryByText("Measured on site")).toBe(null);
  });

  it("does NOT appear on an unlocked project even if the prop says locked", () => {
    // Both the prop and the document have to agree. A stale prop showing these
    // columns on an unlocked bill would invite somebody to record a variation
    // against a contract that does not exist.
    const c = draw(locked({ contract: { locked: false } }));
    expect(within(c).queryByText("Measured on site")).toBe(null);
  });

  it("says a line is not measured rather than showing it as agreed", () => {
    const c = draw(locked());
    expect(within(c).getByText("Measured on site")).toBeTruthy();
    expect(within(c).getByText(/Not measured yet/)).toBeTruthy();
    // And the box is empty, not pre-filled with the contract quantity, which
    // would be a measurement nobody took.
    expect(within(c).getByLabelText?.("Actual quantity")?.value ?? "").toBe("");
  });

  it("records a measurement WITHOUT touching the contract quantity", () => {
    // The entire reason the actual columns exist. Overwriting qty would make the
    // variation vanish and the contract sum drift with no record of why.
    const onSave = vi.fn();
    const p = locked();
    const c = draw(p, { onSave });
    const box = within(c).getByPlaceholderText(/120 in the contract/);
    fireEvent.blur(box, { target: { value: "134" } });
    expect(onSave).toHaveBeenCalledTimes(1);
    const patch = onSave.mock.calls[0][0];
    expect(Object.keys(patch)).toEqual(["items"]);
    expect(patch.items[0].actualQty).toBe(134);
    expect(patch.items[0].qty).toBe(120);
    // Every other line goes back whole, because the PUT replaces the array.
    expect(patch.items[1]).toEqual(p.items[1]);
  });

  it("offers a box for the rate that was actually paid", () => {
    // withActualRate was exported and unit-tested from the day the actuals
    // shipped and called by nothing, so a QS could record that 100m3 was dug and
    // not that it cost more per cubic metre than the bill says — which is half of
    // what a measured variance is made of.
    const c = draw(locked());
    expect(within(c).getByText("Actual rate")).toBeTruthy();
  });

  it("leaves that box EMPTY on an unmeasured line, not filled with the contract rate", () => {
    // actualRateOf falls back to the contract rate when nothing is measured,
    // which is right for working out an amount and wrong for a box: pre-filled,
    // an unmeasured line reads as "measured, and it came in exactly on the rate".
    const c = draw(locked());
    const box = within(c).getByPlaceholderText(/4,500 in the contract/);
    expect(box.value).toBe("");
  });

  it("records the rate without touching the contract rate", () => {
    const onSave = vi.fn();
    const p = locked();
    const c = draw(p, { onSave });
    fireEvent.blur(within(c).getByPlaceholderText(/4,500 in the contract/), {
      target: { value: "4800" },
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    const patch = onSave.mock.calls[0][0];
    expect(patch.items[0].actualRate).toBe(4_800);
    expect(patch.items[0].rate).toBe(4_500);
    expect(patch.items[1]).toEqual(p.items[1]);
  });

  it("sends the recorded-at, so the server cannot promote the figure into rate", () => {
    // The trap: on an unpriced line, sanitizeItems moves actualRate into rate and
    // clears the actuals when nothing says when it was recorded. Recording what
    // an unpriced line actually cost is exactly when a QS would hit it.
    const onSave = vi.fn();
    const p = locked({
      items: [{ code: "BQ-1", description: "Excavate", qty: 120, unit: "m3", rate: 0 }],
    });
    const c = draw(p, { onSave });
    fireEvent.blur(within(c).getByLabelText("Actual rate"), { target: { value: "4800" } });
    const patch = onSave.mock.calls.at(-1)[0];
    expect(patch.items[0].actualRate).toBe(4_800);
    expect(patch.items[0].actualRecordedAt).toBeTruthy();
  });

  it("explains a refused negative rate instead of going quiet", () => {
    const onSave = vi.fn();
    const c = draw(locked(), { onSave });
    fireEvent.blur(within(c).getByPlaceholderText(/4,500 in the contract/), {
      target: { value: "-1" },
    });
    expect(onSave).not.toHaveBeenCalled();
    expect(within(c).getByText(/cannot be negative/)).toBeTruthy();
  });

  it("does not save when the rate is typed back to what it already was", () => {
    // Each save is a whole-project write. A blur that changed nothing must not be
    // one of them.
    const onSave = vi.fn();
    const p = locked({
      items: [
        { code: "BQ-1", description: "Excavate", qty: 120, unit: "m3", rate: 4_500, actualRate: 4_800 },
      ],
    });
    const c = draw(p, { onSave });
    fireEvent.blur(within(c).getByPlaceholderText(/4,500 in the contract/), {
      target: { value: "4800" },
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows the variance once a line is measured", () => {
    const c = draw(
      locked({
        items: [
          { code: "BQ-1", description: "Excavate", qty: 120, unit: "m3", rate: 4_500, actualQty: 134 },
        ],
      }),
    );
    // 134 x 4,500 = 603,000 against 540,000.
    expect(within(c).getByText(/603,000/)).toBeTruthy();
    expect(within(c).getByText(/63,000/)).toBeTruthy();
  });

  it("says a measured line AGREES rather than showing a variance of nothing", () => {
    const c = draw(
      locked({
        items: [
          { code: "BQ-1", description: "Excavate", qty: 120, unit: "m3", rate: 4_500, actualQty: 120 },
        ],
      }),
    );
    expect(within(c).getByText(/agrees with the contract/)).toBeTruthy();
  });

  it("does not save when the figure has not changed", () => {
    // Blur fires on every click away. A save per blur is a whole-project write
    // per glance.
    const onSave = vi.fn();
    const c = draw(
      locked({
        items: [
          { code: "BQ-1", description: "Excavate", qty: 120, unit: "m3", rate: 4_500, actualQty: 134 },
        ],
      }),
      { onSave },
    );
    const box = within(c).getByPlaceholderText(/120 in the contract/);
    fireEvent.blur(box, { target: { value: "134" } });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("clears a measurement back to not-measured", () => {
    const onSave = vi.fn();
    const c = draw(
      locked({
        items: [
          { code: "BQ-1", description: "Excavate", qty: 120, unit: "m3", rate: 4_500, actualQty: 134 },
        ],
      }),
      { onSave },
    );
    fireEvent.blur(within(c).getByPlaceholderText(/120 in the contract/), {
      target: { value: "" },
    });
    expect(onSave.mock.calls[0][0].items[0].actualQty).toBe(null);
  });

  it("is read-only for a viewer", () => {
    const c = render(
      <WorkProjectLinePanel project={locked()} index={0} canEdit={false} contractLocked />,
    ).container;
    // They still SEE it — a view-only collaborator is reading the same contract.
    expect(within(c).getByText("Measured on site")).toBeTruthy();
    expect(within(c).getByPlaceholderText(/120 in the contract/).disabled).toBe(true);
  });
});

describe("when a measurement was taken", () => {
  const withStamps = (extra) => ({
    contract: { locked: true },
    valuationSettings: { showActualColumns: true },
    items: [{ code: "BQ-1", description: "Excavate", qty: 120, unit: "m3", rate: 4_500, ...extra }],
  });

  const draw = (project) =>
    render(<WorkProjectLinePanel project={project} index={0} canEdit contractLocked />).container;

  it("shows when the line was measured", () => {
    // The server has stamped this since the field existed and nothing showed it.
    // For a QS it is the provenance that makes a variation defensible.
    const c = draw(
      withStamps({
        actualQty: 134,
        actualRecordedAt: "2026-09-28T09:00:00Z",
        actualUpdatedAt: "2026-09-28T09:00:00Z",
      }),
    );
    expect(within(c).getByText(/Measured on 28 Sept 2026/)).toBeTruthy();
    // A first measurement is not a revision.
    expect(within(c).queryByText(/revised/)).toBe(null);
  });

  it("says when a figure was revised later", () => {
    const c = draw(
      withStamps({
        actualQty: 134,
        actualRecordedAt: "2026-09-28T09:00:00Z",
        actualUpdatedAt: "2026-09-30T14:00:00Z",
      }),
    );
    expect(within(c).getByText(/Measured on 28 Sept 2026, revised on 30 Sept 2026/)).toBeTruthy();
  });

  it("says nothing at all for a line nobody has measured", () => {
    const c = draw(withStamps({}));
    // Anchored on a DATE: the section's own heading is "Measured on site", so a
    // bare /Measured on/ matches the heading and passes whatever the code does.
    expect(within(c).queryByText(/Measured on \d/)).toBe(null);
    expect(within(c).getByText(/Not measured yet/)).toBeTruthy();
  });
});

describe("a measurement the system will not take", () => {
  const locked = (items) => ({
    contract: { locked: true },
    valuationSettings: { showActualColumns: true },
    items,
  });
  const LINE = { code: "BQ-1", description: "Excavate", qty: 120, unit: "m3", rate: 4_500 };

  it("says why a negative quantity was refused instead of doing nothing", () => {
    // withActualQty returns null for a negative and the `if (patch)` guard
    // skipped the save — so the box sat showing -5, nothing was written, and no
    // message appeared. That reads as a broken screen.
    const onSave = vi.fn();
    const c = render(
      <WorkProjectLinePanel
        project={locked([LINE])}
        index={0}
        canEdit
        contractLocked
        onSave={onSave}
      />,
    ).container;
    fireEvent.blur(within(c).getByPlaceholderText(/120 in the contract/), {
      target: { value: "-5" },
    });
    expect(onSave).not.toHaveBeenCalled();
    expect(within(c).getByText(/cannot be negative/)).toBeTruthy();
    // And it tells them what to do instead.
    expect(within(c).getByText(/smaller quantity, or 0/)).toBeTruthy();
  });

  it("clears the complaint once a real figure is entered", () => {
    const onSave = vi.fn();
    const c = render(
      <WorkProjectLinePanel
        project={locked([LINE])}
        index={0}
        canEdit
        contractLocked
        onSave={onSave}
      />,
    ).container;
    const box = within(c).getByPlaceholderText(/120 in the contract/);
    fireEvent.blur(box, { target: { value: "-5" } });
    expect(within(c).getByText(/cannot be negative/)).toBeTruthy();
    fireEvent.blur(box, { target: { value: "134" } });
    expect(within(c).queryByText(/cannot be negative/)).toBe(null);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("does NOT carry one line's measurement into another", () => {
    // The panel keeps its place in the tree, so React reuses the input and
    // defaultValue is read on mount only. Without a key, moving from a line
    // measured at 134 to an unmeasured one left 134 in the box — which reads as
    // that line's measurement and is one blur away from being saved as one.
    const p = locked([
      { ...LINE, actualQty: 134 },
      { code: "BQ-2", description: "Columns", qty: 40, unit: "m3", rate: 72_000 },
    ]);
    const view = render(
      <WorkProjectLinePanel project={p} index={0} canEdit contractLocked />,
    );
    expect(view.container.querySelector("input[type=number]").value).toBe("134");

    view.rerender(<WorkProjectLinePanel project={p} index={1} canEdit contractLocked />);
    // BQ-2 has never been measured, so its box must be empty.
    expect(view.container.querySelector("input[type=number]").value).toBe("");
  });
});

describe("pricing a line by searching for a rate by name", () => {
  // The scored suggestions need an endpoint that is not on every server yet.
  // This path uses two that ARE deployed everywhere — the merged library and
  // the apply endpoint — so a QS can always price a line, and can always find a
  // rate they already have in mind by name.

  const LIBRARY = [
    { id: "m1", rateId: "m1", source: "master", description: "Reinforced concrete grade 25 in columns", unit: "m3", totalCost: 72_000 },
    { id: "c1", rateId: null, customRateId: "c1", source: "user-custom", description: "Reinforced concrete grade 25 in columns", unit: "m3", totalCost: 78_400 },
    { id: "m2", rateId: "m2", source: "master", description: "Reinforced concrete in slabs", unit: "m2", totalCost: 9_000 },
    { id: "k1", rateId: "k1", source: "master", description: "High yield bars", unit: "kg", totalCost: 1_200 },
  ];

  const draw = (props = {}) =>
    render(
      <WorkProjectLinePanel
        project={project()}
        index={1}
        canEdit
        onSearchRates={vi.fn().mockResolvedValue(LIBRARY)}
        {...props}
      />,
    ).container;

  const box = (c) => within(c).getByPlaceholderText(/Search your rates in m3/);

  it("offers the search even when no suggestions came back", async () => {
    // The state every server is in until the suggestions endpoint ships.
    const c = draw({ onFetchRates: vi.fn().mockResolvedValue([]) });
    expect(box(c)).toBeTruthy();
  });

  it("does not read the library until somebody types", async () => {
    // Most lines are never priced from this box and the library is the whole
    // rate set.
    const onSearchRates = vi.fn().mockResolvedValue(LIBRARY);
    draw({ onSearchRates });
    expect(onSearchRates).not.toHaveBeenCalled();
  });

  it("finds a rate by name and offers the QS's own one first", async () => {
    const c = draw();
    fireEvent.change(box(c), { target: { value: "concrete" } });
    await waitFor(() => expect(within(c).getByText(/78,400/)).toBeTruthy());
    const picks = c.querySelectorAll(".pn-find .pn-rate");
    expect(picks[0].textContent).toMatch(/78,400/);
    expect(picks[0].textContent).toMatch(/Your own rate/);
  });

  it("applies the pick by the line's code, and the budget follows", async () => {
    // price-from-rate writes the material, labour and plant rows as it goes —
    // that is what "the budget is autofilled" means.
    const onApplyRate = vi.fn();
    const c = draw({ onApplyRate });
    fireEvent.change(box(c), { target: { value: "concrete grade 25" } });
    await waitFor(() => expect(within(c).getByText(/78,400/)).toBeTruthy());
    fireEvent.click(within(c).getByText(/78,400/).closest("button"));
    expect(onApplyRate).toHaveBeenCalledTimes(1);
    expect(onApplyRate.mock.calls[0][0]).toBe("BQ-2");
    expect(onApplyRate.mock.calls[0][1].rateId).toBe("c1");
  });

  it("a rate in another unit asks for the dimension, shows the figure, then applies", async () => {
    // An m2 slab rate on an m3 line converts by thickness. Nothing in "Reinforced
    // concrete columns" names one, so the QS types it; nothing applies until then.
    const onApplyRate = vi.fn();
    const c = draw({ onApplyRate });
    fireEvent.change(box(c), { target: { value: "reinforced concrete" } });
    await waitFor(() => expect(within(c).getByText(/9,000/)).toBeTruthy());
    const other = within(c).getByText(/9,000/).closest("button");
    expect(other.disabled).toBe(false);
    expect(other.textContent).toMatch(/Converts to m3/);
    fireEvent.click(other);
    expect(onApplyRate).not.toHaveBeenCalled();
    const conv = c.querySelector(".pn-conv");
    const apply = within(conv).getByText("Apply");
    expect(apply.disabled).toBe(true);
    fireEvent.change(within(conv).getByLabelText("Thickness (mm)"), { target: { value: "150" } });
    // 9,000 per m2 at 150 mm is 60,000 per m3.
    expect(conv.textContent).toMatch(/60,000/);
    fireEvent.click(within(conv).getByText("Apply"));
    expect(onApplyRate).toHaveBeenCalledTimes(1);
    expect(onApplyRate.mock.calls[0][1]).toMatchObject({ rateId: "m2", convert: { thickness: 0.15 } });
  });

  it("still refuses a unit nothing converts to, and says so", async () => {
    const onApplyRate = vi.fn();
    const c = draw({ onApplyRate });
    fireEvent.change(box(c), { target: { value: "scaffolding" } });
    await waitFor(() => expect(within(c).getByText(/Nothing in your library matches/)).toBeTruthy());

    // A rate per kg cannot price a line in m3: no single dimension links them.
    fireEvent.change(box(c), { target: { value: "bars" } });
    await waitFor(() => expect(within(c).getByText(/None of these is in m3/)).toBeTruthy());
    const wrong = within(c).getByText(/1,200/).closest("button");
    expect(wrong.disabled).toBe(true);
    expect(wrong.textContent).toMatch(/Measured in kg — this line is m3/);
  });

  it("does NOT claim there are no rates when the library could not be read", async () => {
    const c = draw({ onSearchRates: vi.fn().mockResolvedValue(null), libraryFailed: true });
    fireEvent.change(box(c), { target: { value: "concrete" } });
    await waitFor(() =>
      expect(within(c).getByText(/could not be read just now/)).toBeTruthy(),
    );
    expect(within(c).queryByText(/Nothing in your library matches/)).toBe(null);
  });

  it("is not offered on a line that already has a rate", async () => {
    const c = render(
      <WorkProjectLinePanel project={project()} index={0} canEdit onSearchRates={vi.fn()} />,
    ).container;
    expect(within(c).queryByPlaceholderText(/Search your rates/)).toBe(null);
  });

  it("is not offered to a viewer", async () => {
    const c = render(
      <WorkProjectLinePanel project={project()} index={1} canEdit={false} onSearchRates={vi.fn()} />,
    ).container;
    expect(within(c).queryByPlaceholderText(/Search your rates/)).toBe(null);
  });
});

describe("pricing the same item on every level at once", () => {
  const lintel = (lv, over = {}) => ({
    code: `L${lv}`,
    description: `Blockwork - Lintel Concrete [L:0${lv} FLOOR ${lv} | T:Generic - 230mm]`,
    qty: lv,
    unit: "m3",
    rate: 0,
    category: "Frames",
    ...over,
  });
  const bill = {
    items: [lintel(1), lintel(2), lintel(3), lintel(4, { rate: 9000 }), lintel(5, { unit: "m2" })],
  };
  const pick = { rateId: "c20", description: "Concrete grade 20", unit: "m3", unitPrice: 154916, why: "You used this on 3 lines" };

  it("lists the unpriced lines of the same item, all ticked", async () => {
    const c = render(
      <WorkProjectLinePanel project={bill} index={0} canEdit onFetchRates={vi.fn().mockResolvedValue([pick])} onPriceMany={vi.fn()} />,
    ).container;
    const boxes = [...c.querySelectorAll(".pn-similar input[type=checkbox]")];
    // L2 and L3: L4 is priced and L5 is in m2.
    expect(boxes).toHaveLength(2);
    expect(boxes.every((b) => b.checked)).toBe(true);
  });

  it("prices this line and the ticked ones in one call", async () => {
    const onPriceMany = vi.fn();
    const onApplyRate = vi.fn();
    const c = render(
      <WorkProjectLinePanel
        project={bill}
        index={0}
        canEdit
        onFetchRates={vi.fn().mockResolvedValue([pick])}
        onApplyRate={onApplyRate}
        onPriceMany={onPriceMany}
      />,
    ).container;
    // Untick L3.
    fireEvent.click(c.querySelectorAll(".pn-similar input")[1]);
    await waitFor(() => expect(c.querySelector(".pn-rate")).toBeTruthy());
    fireEvent.click(c.querySelector(".pn-rate"));
    expect(onApplyRate).not.toHaveBeenCalled();
    const [lines, via] = onPriceMany.mock.calls[0];
    expect(via).toBe("similar");
    expect(lines.map((l) => l.code)).toEqual(["L1", "L2"]);
    expect(lines[1]).toMatchObject({ rateId: "c20", unit: "m3" });
  });

  it("falls back to the single-line call when every line is unticked", async () => {
    const onPriceMany = vi.fn();
    const onApplyRate = vi.fn();
    const c = render(
      <WorkProjectLinePanel project={bill} index={0} canEdit onFetchRates={vi.fn().mockResolvedValue([pick])} onApplyRate={onApplyRate} onPriceMany={onPriceMany} />,
    ).container;
    c.querySelectorAll(".pn-similar input").forEach((b) => fireEvent.click(b));
    await waitFor(() => expect(c.querySelector(".pn-rate")).toBeTruthy());
    fireEvent.click(c.querySelector(".pn-rate"));
    expect(onPriceMany).not.toHaveBeenCalled();
    expect(onApplyRate).toHaveBeenCalledWith("L1", pick);
  });

  it("copies a priced line's rate to the rest with one button", () => {
    const onPriceMany = vi.fn();
    const priced = { items: [lintel(1, { rate: 154916 }), lintel(2), lintel(3)] };
    const c = render(<WorkProjectLinePanel project={priced} index={0} canEdit onPriceMany={onPriceMany} />).container;
    fireEvent.click(within(c).getByText("Price 2 similar lines at this rate"));
    expect(onPriceMany).toHaveBeenCalledWith(
      [
        { code: "L2", sameAs: "L1" },
        { code: "L3", sameAs: "L1" },
      ],
      "similar",
    );
  });

  it("says how many were priced and why any were skipped", () => {
    const c = render(
      <WorkProjectLinePanel
        project={bill}
        index={0}
        canEdit
        onPriceMany={vi.fn()}
        pricedNote={{ priced: ["L1", "L2"], skipped: [{ code: "L3", reason: "That rate is not in your Rate Gen library" }] }}
      />,
    ).container;
    expect(within(c).getByText("Priced 2 lines. 1 line skipped.")).toBeTruthy();
    expect(within(c).getByText("That rate is not in your Rate Gen library")).toBeTruthy();
  });

  it("offers a view-only reader nothing to tick", () => {
    const c = render(<WorkProjectLinePanel project={bill} index={0} />).container;
    expect(c.querySelector(".pn-similar")).toBe(null);
  });
});

describe("a suggested rate in another unit", () => {
  it("opens the conversion pre-filled from the description, and shows the line's unit on the card", async () => {
    const onApplyRate = vi.fn();
    const wall = {
      items: [{ code: "W1", description: "Wall [L:01 | T:Generic - 230mm]", qty: 10, unit: "m2", rate: 0, category: "Frames" }],
    };
    const pick = {
      rateId: "c20",
      description: "Concrete grade 20",
      unit: "m3",
      unitPrice: 35630.68,
      why: "per m3, converted to m2 at 230 mm thick",
      conversion: { rateUnit: "m3", ratePrice: 154916, factor: 0.23, dims: { thickness: 0.23 }, note: "at 230 mm thick" },
    };
    const c = render(
      <WorkProjectLinePanel project={wall} index={0} canEdit onFetchRates={vi.fn().mockResolvedValue([pick])} onApplyRate={onApplyRate} />,
    ).container;
    await waitFor(() => expect(c.querySelector(".pn-rate")).toBeTruthy());
    expect(c.querySelector(".pn-rate").textContent).toMatch(/per m2/);
    fireEvent.click(c.querySelector(".pn-rate"));
    const conv = c.querySelector(".pn-conv");
    expect(within(conv).getByLabelText("Thickness (mm)").value).toBe("230");
    fireEvent.click(within(conv).getByText("Apply"));
    expect(onApplyRate.mock.calls[0][1]).toMatchObject({ rateId: "c20", unit: "m3", convert: { thickness: 0.23 } });
  });
});

describe("typing a measured percentage", () => {
  const job = (over = {}) => ({
    contract: { locked: true },
    valuationSettings: { showActualColumns: true },
    items: [
      { code: "BQ-1", description: "Excavate", qty: 120, unit: "m3", rate: 4_500, percentComplete: 50 },
      { code: "BQ-2", description: "Columns", qty: 40, unit: "m3", rate: 72_000 },
    ],
    ...over,
  });

  const draw = (project, props = {}) =>
    render(
      <WorkProjectLinePanel project={project} index={0} canEdit contractLocked {...props} />,
    ).container;

  const box = (c) => within(c).getByLabelText("Or type the measured figure");

  it("offers a box beside the five steps", () => {
    // His five steps cannot say 60, and this figure is the multiplier in
    // valuationFactor — so it is the basis of the interim certificate and EVM.
    // Rounding a measured 60 to 50 or 75 changes what the client is asked to pay.
    const c = draw(job());
    expect(box(c)).toBeTruthy();
    expect(box(c).value).toBe("50");
    // And the steps are still there.
    expect(within(c).getByText("75%")).toBeTruthy();
  });

  it("records a figure the steps cannot express", () => {
    const onSave = vi.fn();
    const c = draw(job(), { onSave });
    fireEvent.blur(box(c), { target: { value: "60" } });
    expect(onSave).toHaveBeenCalledTimes(1);
    const patch = onSave.mock.calls[0][0];
    expect(patch.items[0].percentComplete).toBe(60);
    // Every other line goes back whole, because the PUT replaces the array.
    expect(patch.items[1]).toEqual(job().items[1]);
  });

  it("takes a part figure, which is the whole point", () => {
    const onSave = vi.fn();
    const c = draw(job(), { onSave });
    fireEvent.blur(box(c), { target: { value: "62.5" } });
    expect(onSave.mock.calls[0][0].items[0].percentComplete).toBe(62.5);
  });

  it("HOLDS a figure outside 0-100 rather than clamping it quietly", () => {
    // Clamped, the box would show 150 while the line stood at 100 — one figure on
    // screen and another in the valuation.
    const onSave = vi.fn();
    const c = draw(job(), { onSave });
    fireEvent.blur(box(c), { target: { value: "150" } });
    expect(onSave).not.toHaveBeenCalled();
    expect(within(c).getByText("Progress is a percentage between 0 and 100.")).toBeTruthy();

    fireEvent.blur(box(c), { target: { value: "-5" } });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("does not read an emptied box as 0% built", () => {
    // withLineProgress reads a blank as 0, and 0% is a CLAIM — it drops the line
    // out of the next valuation. "I cleared the box" is not that claim.
    const onSave = vi.fn();
    const c = draw(job(), { onSave });
    fireEvent.blur(box(c), { target: { value: "" } });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("does not save a figure typed back to what it already was", () => {
    const onSave = vi.fn();
    const c = draw(job(), { onSave });
    fireEvent.blur(box(c), { target: { value: "50" } });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("says so where the reader is looking, on an UNLOCKED project too", () => {
    // The shared `refused` line lives in the "Measured on site" section, which is
    // not rendered at all before the contract is locked — while this box still is.
    const c = render(
      <WorkProjectLinePanel
        project={job({ contract: {} })}
        index={0}
        canEdit
        contractLocked={false}
      />,
    ).container;
    expect(within(c).queryByText("Measured on site")).toBe(null);
    fireEvent.blur(box(c), { target: { value: "150" } });
    expect(within(c).getByText("Progress is a percentage between 0 and 100.")).toBeTruthy();
  });

  it("is not offered to a reader who cannot edit", () => {
    const c = draw(job(), { canEdit: false });
    expect(within(c).queryByLabelText("Or type the measured figure")).toBe(null);
  });
});

describe("the three measured boxes, when the value changes from elsewhere", () => {
  // All three are uncontrolled, with defaultValue — which React reads on mount
  // only, and which it ignores entirely once the reader has typed (the HTML
  // dirty-value flag). Two bugs followed, and neither had a test.
  const job = (over = {}) => ({
    contract: { locked: true },
    valuationSettings: { showActualColumns: true },
    items: [
      { code: "BQ-1", description: "Excavate", qty: 120, unit: "m3", rate: 4_500, percentComplete: 50 },
      { code: "BQ-2", description: "Columns", qty: 40, unit: "m3", rate: 72_000 },
    ],
    ...over,
  });

  const draw = (project, props = {}) =>
    render(
      <WorkProjectLinePanel project={project} index={0} canEdit contractLocked {...props} />,
    );

  it("DOES NOT keep a typed percentage after a step button writes a new one", () => {
    // The data-loss case. Type 60, blur, save. The line completes, so tap 100%.
    // The box kept reading 60, and the next blur compared that stale 60 against
    // the fresh 100 and saved 60 back over it.
    const typed = job();
    const view = draw(typed);
    const box = () => within(view.container).getByLabelText("Or type the measured figure");
    fireEvent.change(box(), { target: { value: "60" } });
    fireEvent.blur(box(), { target: { value: "60" } });

    // The step button's save comes back as a new project, which is how the shell
    // feeds this panel.
    const after = job({
      items: [{ ...typed.items[0], percentComplete: 100 }, typed.items[1]],
    });
    view.rerender(
      <WorkProjectLinePanel project={after} index={0} canEdit contractLocked />,
    );
    expect(box().value).toBe("100");
  });

  it("does not carry one line's figures onto the next when neither has a code", () => {
    // code defaults to "" in the schema and code-less lines are a real case this
    // file handles elsewhere, so two consecutive ones shared a key and
    // Previous/Next reused the same input.
    const codeless = job({
      items: [
        { code: "", description: "First", qty: 10, unit: "m3", rate: 100, actualQty: 7 },
        { code: "", description: "Second", qty: 20, unit: "m3", rate: 200 },
      ],
    });
    const view = draw(codeless);
    expect(within(view.container).getByLabelText("Actual quantity").value).toBe("7");
    view.rerender(
      <WorkProjectLinePanel project={codeless} index={1} canEdit contractLocked />,
    );
    // The second line is unmeasured, so its box must be empty — not showing 7.
    expect(within(view.container).getByLabelText("Actual quantity").value).toBe("");
  });

  it("refreshes the rate box when the stored rate changes under it", () => {
    const before = job();
    const view = draw(before);
    expect(within(view.container).getByLabelText("Actual rate").value).toBe("");
    const after = job({
      items: [{ ...before.items[0], actualRate: 4_800 }, before.items[1]],
    });
    view.rerender(
      <WorkProjectLinePanel project={after} index={0} canEdit contractLocked />,
    );
    expect(within(view.container).getByLabelText("Actual rate").value).toBe("4800");
  });
});

describe("a reader whose rates are hidden", () => {
  // Shared at "full" without RateGen: canEdit TRUE, canSeeRates FALSE. They may
  // measure and may not price. actualRate is in MASKED_MONEY_BLANKS, so the server
  // restores the stored value and answers 200 — the box took a figure, the
  // indicator said "Saved", and nothing was recorded.
  const job = () => ({
    contract: { locked: true },
    valuationSettings: { showActualColumns: true },
    items: [{ code: "BQ-1", description: "Excavate", qty: 120, unit: "m3", rate: 0 }],
  });

  const draw = (props = {}) =>
    render(
      <WorkProjectLinePanel project={job()} index={0} canEdit contractLocked {...props} />,
    ).container;

  it("is not offered the rate box, and is told why", () => {
    const c = draw({ ratesMasked: true });
    expect(within(c).queryByLabelText("Actual rate")).toBe(null);
    expect(within(c).getByText(/rate paid cannot be recorded here/)).toBeTruthy();
  });

  it("keeps the measured QUANTITY box, which is not masked and does save", () => {
    // actualQty is not in MASKED_MONEY_BLANKS, so it is recorded normally. Taking
    // it away would remove a capability the reader actually has.
    const c = draw({ ratesMasked: true });
    expect(within(c).getByLabelText("Actual quantity")).toBeTruthy();
  });

  it("still offers the rate box to everybody else", () => {
    expect(within(draw()).getByLabelText("Actual rate")).toBeTruthy();
  });
});
