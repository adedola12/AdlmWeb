// The build-up screen. The first test is the regression guard for RG-04: the
// screen used to read `totalPrice`, a field the sync route has never sent, so
// every Amount printed NGN 0 and "Not itemised" always swallowed the whole net
// cost.

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// Deliberately the SYNC shape: lineTotal, no totalPrice anywhere.
const rate = {
  id: "a1",
  itemNo: 3,
  description: "Blockwork 225mm in cement mortar",
  sectionKey: "blockwork",
  sectionLabel: "Blockwork",
  unit: "m2",
  netCost: 10000,
  overheadPercent: 10,
  profitPercent: 25,
  overheadValue: 1000,
  profitValue: 2500,
  totalCost: 13500,
  updatedAt: "2026-09-01T00:00:00.000Z",
  breakdown: [
    { componentName: "Sandcrete block", refKind: "material", quantity: 10, unit: "no", unitPrice: 700, lineTotal: 7000 },
    { componentName: "Mason gang", refKind: "labour", quantity: 0.1, unit: "day", unitPrice: 20000, lineTotal: 2000 },
    { componentName: "Mixer", refKind: "plant", quantity: 0.5, unit: "h", unitPrice: 2000, lineTotal: 1000 },
  ],
};

const apiAuthed = vi.fn();
vi.mock("../api.js", () => ({
  apiAuthed: (...a) => apiAuthed(...a),
  api: vi.fn(),
}));
vi.mock("../store.jsx", () => ({ useAuth: () => ({ accessToken: "t" }) }));

const { default: DsWorkRate } = await import("./DsWorkRate.jsx");

function stub({ overrides = [], customs = [] } = {}) {
  apiAuthed.mockImplementation(async (path, init) => {
    if (path.includes("rates/sync")) return { items: [rate] };
    if (path.includes("user-rates/override")) return { ok: true, ratesVersion: 3 };
    if (path.includes("user-rates"))
      return {
        rateOverrides: overrides,
        customRates: customs,
        meta: { ratesVersion: 2, customRatesVersion: 1 },
      };
    throw new Error(`unstubbed ${path} ${init?.method || ""}`);
  });
}

const mount = (id = "a1") =>
  render(
    <MemoryRouter initialEntries={[`/work/rate/${id}`]}>
      <Routes>
        <Route path="/work/rate/:id" element={<DsWorkRate />} />
      </Routes>
    </MemoryRouter>,
  );

// A block body, not an expression: mockReset() returns the mock itself, and
// vitest treats a function returned from beforeEach as a teardown — which
// would call apiAuthed() with no arguments after every test.
beforeEach(() => {
  apiAuthed.mockReset();
});
afterEach(cleanup);

describe("the build-up", () => {
  it("prints each component's real amount, not NGN 0 (RG-04)", async () => {
    stub();
    const { container, findByText } = mount();
    await findByText("Blockwork 225mm in cement mortar");

    const amounts = [...container.querySelectorAll(".wk-bl .am")].map((s) => s.textContent);
    expect(amounts[0]).toContain("7,000");
    expect(amounts[1]).toContain("2,000");
    expect(amounts[2]).toContain("1,000");
    expect(amounts.some((a) => a === "₦0.00")).toBe(false);
  });

  it("does not show a Not itemised row when the lines add up", async () => {
    stub();
    const { container, findByText } = mount();
    await findByText("Blockwork 225mm in cement mortar");
    expect(container.textContent).not.toContain("Not itemised");
  });

  it("gives plant its own group, not a 'Plant and other' catch-all", async () => {
    stub();
    const { container, findByText } = mount();
    await findByText("Blockwork 225mm in cement mortar");
    const groups = [...container.querySelectorAll(".wk-grp")].map((g) => g.textContent);
    expect(groups).toEqual(["Materials", "Labour", "Plant"]);
  });

  it("shows the server's own net, overhead, profit and rate before anything is touched", async () => {
    stub();
    const { container, findByText } = mount();
    await findByText("Blockwork 225mm in cement mortar");
    expect(container.querySelector(".wk-sub .am").textContent).toContain("10,000");
    expect(container.querySelector(".wk-tot .am").textContent).toContain("13,500");
  });

  it("recalculates as a percentage is changed, and offers to save it", async () => {
    stub();
    const { container, findByText, getByLabelText } = mount();
    await findByText("Blockwork 225mm in cement mortar");

    fireEvent.change(getByLabelText("Profit percentage"), { target: { value: "30" } });
    await waitFor(() =>
      expect(container.querySelector(".wk-tot .am").textContent).toContain("14,000"),
    );
    expect(container.textContent).toContain("Edited — not saved");
    expect(container.textContent).toContain("Save to my library");
  });

  it("keeps a half-typed decimal quantity instead of coercing it away", async () => {
    stub();
    const { container, findByText, getByLabelText } = mount();
    await findByText("Blockwork 225mm in cement mortar");

    const input = getByLabelText("Quantity of Mixer");
    // "0." is the state a decimal passes through on its way to "0.75". The
    // old code ran Number() on every keystroke, which turned it back into 0
    // and made the rest of the number impossible to type.
    fireEvent.change(input, { target: { value: "0." } });
    fireEvent.change(input, { target: { value: "0.75" } });
    await waitFor(() =>
      // 0.75 h at 2,000 an hour: the plant line is 1,500, and net follows.
      expect([...container.querySelectorAll(".wk-bl .am")][2].textContent).toContain("1,500"),
    );
    expect(container.querySelector(".wk-sub .am").textContent).toContain("10,500");
  });

  it("writes the user's own copy, never the master rate", async () => {
    stub();
    const { findByText, getByLabelText, getByText } = mount();
    await findByText("Blockwork 225mm in cement mortar");

    fireEvent.change(getByLabelText("Overhead percentage"), { target: { value: "15" } });
    await waitFor(() => getByText("Save to my library"));
    fireEvent.click(getByText("Save to my library"));

    await waitFor(() => {
      const call = apiAuthed.mock.calls.find(([, i]) => i?.method === "PUT");
      expect(call).toBeTruthy();
      expect(call[0]).toBe("/rategen-v2/library/user-rates/override/a1");
      expect(call[1].body.overheadPercent).toBe(15);
      expect(call[1].body.ratesBaseVersion).toBe(2);
      // The lines go up with their real per-line totals, not zeroes.
      expect(call[1].body.breakdown[0].lineTotal).toBe(7000);
      expect(call[1].body.netCost).toBe(10000);
    });
  });

  it("shows the user's own copy when they have one, and offers to reset it", async () => {
    stub({
      overrides: [
        {
          rateId: "a1",
          description: "Blockwork 225mm in cement mortar",
          unit: "m2",
          netCost: 11000,
          overheadPercent: 10,
          profitPercent: 25,
          overheadValue: 1100,
          profitValue: 2750,
          totalCost: 14850,
          breakdown: rate.breakdown,
        },
      ],
    });
    const { container, findByText } = mount();
    await findByText("Reset to published");
    expect(container.querySelector(".wk-tot .am").textContent).toContain("14,850");
    expect(container.querySelector(".wk-ref").textContent).toContain("your own copy");
  });

  it("uses an en dash for an empty value", async () => {
    apiAuthed.mockImplementation(async (path) => {
      if (path.includes("rates/sync"))
        return { items: [{ ...rate, itemNo: null, sectionLabel: "", updatedAt: null }] };
      if (path.includes("user-rates"))
        return { rateOverrides: [], customRates: [], meta: { ratesVersion: 1 } };
      throw new Error("unstubbed");
    });
    const { container, findByText } = mount();
    await findByText("Blockwork 225mm in cement mortar");
    const kv = container.querySelector(".dsh-kv").textContent;
    expect(kv).toContain("–");
    expect(kv).not.toContain("—");
    expect(kv).not.toContain("N/A");
  });
});
