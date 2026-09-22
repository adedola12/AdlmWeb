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

function stub({ overrides = [], customs = [], rates = [rate] } = {}) {
  apiAuthed.mockImplementation(async (path, init) => {
    if (path.includes("rates/sync")) return { items: rates };
    if (path.includes("custom-rates")) return { ok: true, customRatesVersion: 2 };
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

// ── S18 review, finding 1 ───────────────────────────────────────────────────
// A master rate whose stored net cost is larger than the sum of its itemised
// lines: 12,000 against the 10,000 the three components explain. The 2,000
// nobody itemised is the customer's money, and editing the rate used to throw
// it away.
const withRemainder = {
  ...rate,
  id: "a2",
  netCost: 12000,
  overheadValue: 1200,
  profitValue: 3000,
  totalCost: 16200,
};

describe("a rate whose net cost is more than its lines explain", () => {
  it("keeps the remainder in the net cost the customer's own copy is saved with", async () => {
    stub({ rates: [withRemainder] });
    const { findByText, getByLabelText, getByText } = mount("a2");
    await findByText("Blockwork 225mm in cement mortar");

    // Only the profit is touched. The cost of building the rate has not moved,
    // so the net cost saved has to be the net cost published.
    fireEvent.change(getByLabelText("Profit percentage"), { target: { value: "30" } });
    await waitFor(() => getByText("Save to my library"));
    fireEvent.click(getByText("Save to my library"));

    await waitFor(() => {
      const call = apiAuthed.mock.calls.find(([, i]) => i?.method === "PUT");
      expect(call).toBeTruthy();
      expect(call[1].body.netCost).toBe(12000);
    });
  });

  it("adds an edited line to the remainder instead of replacing it", async () => {
    stub({ rates: [withRemainder] });
    const { container, findByText, getByLabelText, getByText } = mount("a2");
    await findByText("Blockwork 225mm in cement mortar");

    // The mixer goes from 0.5 h to 1 h: 1,000 more of real cost, on top of the
    // 2,000 no component explains.
    fireEvent.change(getByLabelText("Quantity of Mixer"), { target: { value: "1" } });
    await waitFor(() =>
      expect(container.querySelector(".wk-sub .am").textContent).toContain("13,000"),
    );
    fireEvent.click(getByText("Save to my library"));

    await waitFor(() => {
      const call = apiAuthed.mock.calls.find(([, i]) => i?.method === "PUT");
      expect(call[1].body.netCost).toBe(13000);
    });
  });

  it("keeps the Not itemised line on screen while the rate is being edited", async () => {
    stub({ rates: [withRemainder] });
    const { container, findByText, getByLabelText } = mount("a2");
    await findByText("Blockwork 225mm in cement mortar");
    expect(container.textContent).toContain("Not itemised");

    fireEvent.change(getByLabelText("Profit percentage"), { target: { value: "30" } });
    await waitFor(() => expect(container.textContent).toContain("Edited — not saved"));
    expect(container.textContent).toContain("Not itemised");
  });

  it("states the rate as published and the rate as it would be saved", async () => {
    stub({ rates: [withRemainder] });
    const { container, findByText, getByLabelText } = mount("a2");
    await findByText("Blockwork 225mm in cement mortar");

    fireEvent.change(getByLabelText("Profit percentage"), { target: { value: "30" } });
    await waitFor(() => {
      const strip = container.querySelector(".wk-dirty").textContent;
      expect(strip).toContain("16,200"); // what the library says today
      expect(strip).toContain("16,800"); // 12,000 + 10% + 30%
    });
  });
});

// ── S18 review, findings 2 and 4 ────────────────────────────────────────────
describe("overhead and profit are saved exactly as they are shown", () => {
  it("saves 80% when the box says 80%", async () => {
    stub();
    const { container, findByText, getByLabelText, getByText } = mount();
    await findByText("Blockwork 225mm in cement mortar");

    fireEvent.change(getByLabelText("Profit percentage"), { target: { value: "80" } });
    await waitFor(() =>
      // 10,000 net at 80% is 8,000 — on screen, and in the payload.
      expect([...container.querySelectorAll(".wk-calc .am")][1].textContent).toContain("8,000"),
    );
    expect(getByLabelText("Profit percentage").value).toBe("80");

    fireEvent.click(getByText("Save to my library"));
    await waitFor(() => {
      const call = apiAuthed.mock.calls.find(([, i]) => i?.method === "PUT");
      expect(call[1].body.profitPercent).toBe(80);
      expect(call[1].body.totalCost).toBe(undefined); // the server derives it
      expect(call[1].body.netCost).toBe(10000);
    });
  });

  it("refuses a negative percentage rather than quietly turning it into 0", async () => {
    stub();
    const { findByText, getByLabelText, getByText } = mount();
    await findByText("Blockwork 225mm in cement mortar");

    fireEvent.change(getByLabelText("Overhead percentage"), { target: { value: "-5" } });
    await waitFor(() => getByText("Save to my library"));
    fireEvent.click(getByText("Save to my library"));

    await waitFor(() => expect(getByLabelText("Overhead percentage").value).toBe("-5"));
    expect(apiAuthed.mock.calls.some(([, i]) => i?.method === "PUT")).toBe(false);
  });
});

// A rate the customer built at 80% profit. Re-saving it from the build-up used
// to store 60% without a word, which is 2,000 off this rate every time.
const customRate = {
  customRateId: "tiling-x1",
  title: "Ceramic tiling 300x300",
  description: "Ceramic tiling 300x300",
  unit: "m2",
  netCost: 10000,
  overheadPercent: 10,
  profitPercent: 80,
  overheadValue: 1000,
  profitValue: 8000,
  totalCost: 19000,
  materials: [
    {
      rateType: "material",
      description: "Ceramic tile",
      quantity: 1.05,
      unit: "m2",
      unitPrice: 6000,
      totalCost: 6300,
      category: "Tiling",
      refSn: null,
      refName: "Ceramic tile",
    },
  ],
  labour: [
    {
      rateType: "labour",
      description: "Tiling gang",
      quantity: 0.1,
      unit: "day",
      unitPrice: 37000,
      totalCost: 3700,
      category: "Finishing",
      refSn: null,
      refName: "Tiling gang",
    },
  ],
  breakdown: [
    { componentName: "Ceramic tile", refKind: "material", quantity: 1.05, unit: "m2", unitPrice: 6000, lineTotal: 6300 },
    { componentName: "Tiling gang", refKind: "labour", quantity: 0.1, unit: "day", unitPrice: 37000, lineTotal: 3700 },
  ],
};

describe("a rate the customer built themselves", () => {
  it("re-saves the percentage it was built at, not a clamped one", async () => {
    stub({ customs: [customRate] });
    const { findByText, getByLabelText, getByText } = mount("custom:tiling-x1");
    await findByText("Ceramic tiling 300x300");

    // 80% is on screen, untouched, and 80% is what has to go back.
    expect(getByLabelText("Profit percentage").value).toBe("80");
    fireEvent.change(getByLabelText("Overhead percentage"), { target: { value: "12" } });
    await waitFor(() => getByText("Save to my library"));
    fireEvent.click(getByText("Save to my library"));

    await waitFor(() => {
      const call = apiAuthed.mock.calls.find(([, i]) => i?.method === "PUT");
      expect(call[0]).toBe("/rategen-v2/library/custom-rates/tiling-x1");
      expect(call[1].body.profitPercent).toBe(80);
      expect(call[1].body.overheadPercent).toBe(12);
      expect(call[1].body.netCost).toBe(10000);
    });
  });
});

// ── S18 review, finding 3, the other half ───────────────────────────────────
describe("a customer's own copy with no build-up of its own", () => {
  it("says the published rate's lines are not part of it, instead of showing them", async () => {
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
          breakdown: [],
        },
      ],
    });
    const { container, findByText } = mount();
    await findByText("Reset to published");

    // None of the published rate's components are listed against 11,000.
    expect(container.textContent).not.toContain("Sandcrete block");
    expect(container.textContent).toContain("no components stored against it");
    // And the published build-up is accounted for in words, with real figures.
    expect(container.textContent).toContain("3 components");
    expect(container.textContent).toContain("10,000");
  });
});
