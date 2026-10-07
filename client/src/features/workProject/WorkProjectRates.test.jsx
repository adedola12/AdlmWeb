import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render as rtlRender, cleanup, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import WorkProjectRates from "./WorkProjectRates.jsx";

// "Open in RateGen" is a Link now, because the library is a route and not a tab
// — it used to call onGo("library"), which resolveTab answered with Overview.
// So every render here needs a router around it.
const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>);

// His Rates & budget tab (work-proj.js:975-1040). WORK.md §13: it IS RateGen
// inside the project.

const project = (over = {}) => ({
  name: "Ikoyi Complex",
  preliminaryPercent: 7.5,
  contingencyPercent: 5,
  taxPercent: 7.5,
  provisionalSums: [],
  variations: [],
  budgetItems: [],
  items: [
    {
      code: "BQ-1",
      description: "Excavate foundation trench n.e. 1.5m deep",
      unit: "m3",
      qty: 120,
      rate: 2_500,
      appliedRateKey: "Excavation in firm soil n.e. 1.5m",
      rateLockedAt: "2026-09-20T10:00:00Z",
    },
    {
      code: "BQ-2",
      description: "Reinforced concrete grade 25 in columns",
      unit: "m3",
      qty: 32,
      rate: 72_000,
    },
    {
      code: "BQ-3",
      description: "Ceramic wall tiling 200x300 to toilets",
      takeoffLine: "First floor",
      unit: "m2",
      qty: 420,
      rate: 0,
    },
  ],
  ...over,
});

const draw = (props = {}) =>
  render(<WorkProjectRates project={project()} canEdit {...props} />).container;

afterEach(cleanup);

describe("his three views", () => {
  it("offers Rates, Budget and Buy schedule", () => {
    const c = draw();
    const seg = within(c).getByRole("group", { name: "View" });
    expect(within(seg).getByText("Rates").getAttribute("aria-pressed")).toBe("true");
    expect(within(seg).getByText("Budget")).toBeTruthy();
    expect(within(seg).getByText("Buy schedule")).toBeTruthy();
  });

  it("asks the caller to change view, so it can ride in the URL", () => {
    const onView = vi.fn();
    const c = render(
      <WorkProjectRates project={project()} canEdit onView={onView} />,
    ).container;
    fireEvent.click(within(c).getByText("Budget"));
    expect(onView).toHaveBeenCalledWith("budget");
  });

  it("hands Budget and Buy schedule to their own views", () => {
    // WorkProjectBudget.test.jsx pins what each of those shows; this only
    // checks the switch reaches them rather than an empty panel.
    const budget = draw({ view: "budget" });
    expect(budget.querySelector(".pj-bud, .pj-empty b")).toBeTruthy();
    expect(budget.textContent).not.toContain("not built here yet");
    cleanup();
    const buy = draw({ view: "buy" });
    expect(buy.textContent).not.toContain("not built here yet");
  });

  it("falls back to Rates for a view that does not exist", () => {
    const c = draw({ view: "nonsense" });
    expect(within(c).getByText("Priced")).toBeTruthy();
  });
});

describe("what still needs a rate", () => {
  it("lists the unpriced lines with their quantity and where they were measured", () => {
    const c = draw();
    const panel = within(c).getByText("Needs a rate").closest(".wk-panel");
    expect(within(panel).getByText("Ceramic wall tiling 200x300 to toilets")).toBeTruthy();
    expect(within(panel).getByText(/420 m2 · First floor/)).toBeTruthy();
  });

  it("counts them beside the heading", () => {
    const c = draw();
    expect(within(c).getByText("Needs a rate").textContent).toContain("1");
  });

  it("invents nothing while it has not been told what the server found", () => {
    // The rule that mattered when this slot was written still holds: nothing
    // here may put a figure in a QS's mouth. With no map it says it is looking
    // — it does NOT show a rate and does NOT claim there is none, because those
    // are different answers and only the server knows which.
    const c = draw();
    expect(within(c).getByText(/Checking your rate library/)).toBeTruthy();
    expect(within(c).queryByText("Use this rate")).toBe(null);
  });

  it("says there is no suggestion once the server has answered with none", () => {
    const c = draw({ rateMap: { byCode: {} } });
    expect(within(c).getByText(/No suggestion/)).toBeTruthy();
    expect(within(c).queryByText("Use this rate")).toBe(null);
  });

  it("shows the rate the server matched, and what it is", () => {
    // BQ-3 is the unpriced line in the fixture. The map is keyed lowercased,
    // as the server sends it.
    const c = draw({
      rateMap: {
        byCode: {
          "bq-3": {
          rateId: "r9",
          description: "Ceramic wall tiling 200x300",
          unit: "m2",
          unitPrice: 18_500,
          why: "Close match in your own rate",
          },
        },
      },
    });
    const panel = within(c).getByText("Needs a rate").closest(".wk-panel");
    expect(within(panel).getByText(/18,500/)).toBeTruthy();
    expect(within(panel).getByText(/Close match in your own rate/)).toBeTruthy();
  });

  it("applies the pick by the line's own code, which is what the endpoint wants", () => {
    const onApplyRate = vi.fn();
    const pick = {
      rateId: "r9",
      description: "Ceramic wall tiling 200x300",
      unit: "m2",
      unitPrice: 18_500,
      why: "Close match in your own rate",
    };
    const c = draw({ rateMap: { byCode: { "bq-3": pick } }, onApplyRate });
    fireEvent.click(within(c).getByText("Use this rate"));
    expect(onApplyRate).toHaveBeenCalledWith("BQ-3", pick);
  });

  it("offers no rate to a view-only reader", () => {
    const c = render(
      <WorkProjectRates
        project={project()}
        canEdit={false}
        rateMap={{ byCode: { "bq-3": { rateId: "r9", unit: "m2", unitPrice: 1, why: "x", description: "y" } } }}
      />,
    ).container;
    expect(within(c).queryByText("Use this rate")).toBe(null);
  });

  it("says what the build-up could not price rather than leaving a zero row unexplained", () => {
    const c = draw({ priceNotes: ["No price for cement in your constants library"] });
    expect(within(c).getByText(/No price for cement/)).toBeTruthy();
  });

  it("opens the line rather than offering an action that does nothing", () => {
    const onOpenLine = vi.fn();
    const c = render(
      <WorkProjectRates project={project()} canEdit onOpenLine={onOpenLine} />,
    ).container;
    fireEvent.click(within(c).getByText("Open the line"));
    expect(onOpenLine).toHaveBeenCalledWith(2);
  });

  it("offers no actions to somebody who may not edit", () => {
    const c = render(<WorkProjectRates project={project()} canEdit={false} />).container;
    expect(within(c).queryByText("Open the line")).toBe(null);
  });

  it("drops the whole section once everything is priced", () => {
    const all = project();
    all.items[2].rate = 9_000;
    const c = render(<WorkProjectRates project={all} canEdit />).container;
    expect(within(c).queryByText("Needs a rate")).toBe(null);
  });
});

describe("what is priced", () => {
  it("names a library rate by the description it was priced from", () => {
    const c = draw();
    expect(within(c).getByText("Excavation in firm soil n.e. 1.5m")).toBeTruthy();
  });

  it("tags where each rate came from", () => {
    const c = draw();
    const rows = c.querySelectorAll(".pj-rt .rr");
    expect(within(rows[0]).getByText("Library")).toBeTruthy();
    expect(within(rows[1]).getByText("Project rate")).toBeTruthy();
  });

  it("falls back to the line's description when there is no library name", () => {
    const c = draw();
    expect(within(c).getByText("Reinforced concrete grade 25 in columns")).toBeTruthy();
  });

  it("shows the rate and the amount", () => {
    const c = draw();
    const rows = c.querySelectorAll(".pj-rt .rr");
    expect(rows[0].textContent).toContain("₦2,500");
    expect(rows[0].textContent).toContain("₦300,000");
  });

  it("prints the estimated total beside the heading, from projectTotals", () => {
    const c = draw();
    const head = within(c).getByText("Priced").closest(".wk-ph");
    // 120 × 2,500 + 32 × 72,000 = 2,604,000 measured, then his cascade.
    expect(within(head).getByText(/Estimated total ₦/)).toBeTruthy();
  });

  it("opens a line's build-up in the side panel", () => {
    const onOpenLine = vi.fn();
    const c = render(
      <WorkProjectRates project={project()} canEdit onOpenLine={onOpenLine} />,
    ).container;
    fireEvent.click(within(c).getByText("Excavation in firm soil n.e. 1.5m"));
    expect(onOpenLine).toHaveBeenCalledWith(0);
  });

  it("says so when nothing is priced", () => {
    const none = project();
    none.items.forEach((it) => { it.rate = 0; });
    const c = render(<WorkProjectRates project={none} canEdit />).container;
    expect(within(c).getByText("Nothing priced yet")).toBeTruthy();
  });
});

describe("a rate that no longer agrees with its build-up", () => {
  const disagreeing = () =>
    project({
      budgetItems: [
        {
          billIdentity: "BQ-1",
          componentKind: "Material",
          qty: 120,
          rate: 3_000,
          overheadPercent: 0,
          profitPercent: 0,
        },
      ],
    });

  it("marks the row, in words for what was actually checked", () => {
    // His tag reads "Library changed". We do not track the library's history —
    // this compares the applied rate with the build-up that prices it.
    const c = render(<WorkProjectRates project={disagreeing()} canEdit />).container;
    expect(within(c).getByText("Differs from build-up")).toBeTruthy();
  });

  it("says how many at the top", () => {
    const c = render(<WorkProjectRates project={disagreeing()} canEdit />).container;
    expect(within(c).getByText(/1 rate no longer agrees/)).toBeTruthy();
  });

  it("says nothing at all when every rate agrees", () => {
    const c = draw();
    expect(within(c).queryByText(/no longer agree/)).toBe(null);
    expect(within(c).queryByText("Differs from build-up")).toBe(null);
  });
});

describe("a project that has not loaded", () => {
  it("does not throw", () => {
    expect(() => render(<WorkProjectRates project={null} />)).not.toThrow();
  });
});

describe("an absence that is not a fact", () => {
  // "No suggestion — price it from the build-up" is only true when the server
  // looked and found nothing. Three other states used to print it too.

  it("says a line was NOT CHECKED when the server stopped at its ceiling", () => {
    // A 900-line bill: the server matches the first 600 and says so. Printing
    // "no suggestion" against the other 300 sends a QS off to price by hand
    // work the library could have done.
    const items = Array.from({ length: 5 }, (_, i) => ({
      code: `BQ-${i}`,
      description: `Line ${i}`,
      unit: "m2",
      qty: 1,
      rate: 0,
      category: "Substructure",
    }));
    const c = render(
      <WorkProjectRates
        project={{ ...project(), items }}
        canEdit
        rateMap={{ byCode: {}, truncated: true, considered: 2, unpriced: 5 }}
      />,
    ).container;
    expect(within(c).getByText(/first 2 of 5 unpriced lines were looked at/)).toBeTruthy();
    expect(within(c).getAllByText(/Not checked yet/).length).toBeGreaterThan(0);
  });

  it("says rates are masked rather than claiming there are none", () => {
    const c = draw({ rateMap: { byCode: {}, masked: true } });
    expect(within(c).getByText(/Rates are not shown on this project for your account/)).toBeTruthy();
    expect(within(c).queryByText(/No suggestion/)).toBe(null);
  });

  it("says the library could not be read rather than claiming no match", () => {
    const c = draw({ rateMap: { byCode: {}, failed: true } });
    expect(within(c).getByText(/could not be read just now/)).toBeTruthy();
    expect(within(c).getByText(/not the same as having no matching rate/)).toBeTruthy();
    expect(within(c).queryByText(/No suggestion/)).toBe(null);
  });

  it("still says NO SUGGESTION when the server genuinely looked and found none", () => {
    const c = draw({ rateMap: { byCode: {}, truncated: false, considered: 1, unpriced: 1 } });
    expect(within(c).getByText(/No suggestion/)).toBeTruthy();
  });
});

describe("Open in RateGen", () => {
  it("sends Open in RateGen to the library, not to the project Overview", () => {
    // It called onGo("library"). "library" is not in tabsFor, so resolveTab
    // answered "overview" and the control quietly returned the reader to the
    // project summary — the third control on this page to fail that exact way.
    const c = render(<WorkProjectRates project={project()} canEdit />).container;
    const link = within(c).getByText("Open in RateGen");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/work/library");
  });

  it("does not ask the tab switcher for a tab that does not exist", () => {
    // The assertion that fails if somebody turns it back into a button.
    const onGo = vi.fn();
    const c = render(<WorkProjectRates project={project()} canEdit onGo={onGo} />).container;
    fireEvent.click(within(c).getByText("Open in RateGen"));
    expect(onGo).not.toHaveBeenCalledWith("library");
  });

});
