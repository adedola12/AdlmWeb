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
  // The four tests that were here exercised the build-up editor, which this
  // page no longer has. What they were built on top of is still true and still
  // worth pinning: a rate whose components do not add up to its net says so,
  // rather than quietly showing a build-up that is short of the real figure.
  it("shows the unexplained part rather than a build-up that is short", async () => {
    stub({ rates: [withRemainder] });
    const { container, findByText } = mount("a2");
    await findByText("Blockwork 225mm in cement mortar");
    expect(container.textContent).toContain("Not itemised");
  });
});

// ── S18 review, findings 2 and 4 ────────────────────────────────────────────
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
    await findByText(/Rate Gen is where a copy is put back/);

    // None of the published rate's components are listed against 11,000.
    expect(container.textContent).not.toContain("Sandcrete block");
    expect(container.textContent).toContain("no components stored against it");
    // And the published build-up is accounted for in words, with real figures.
    expect(container.textContent).toContain("3 components");
    expect(container.textContent).toContain("10,000");
  });
});

// ── S18 review, finding 8 ───────────────────────────────────────────────────
/* ── The page reads; Rate Gen is where a rate is changed ─────────────────────
 *
 * RateGen's own Helpers/DeepLink.cs states the rule this pins: "rebuilding the
 * BUILD-UP editor in a browser is not [reasonable], because that is what this
 * application is for. So the website hands the rate over instead of growing a
 * second editor for the same job." This screen had grown exactly that editor.
 */
describe("nothing on this page is editable", () => {
  it("shows quantities as figures, not fields", async () => {
    stub();
    const { container, findByText } = mount();
    await findByText("The build-up");
    expect(container.querySelectorAll("input")).toHaveLength(0);
  });

  it("offers no way to save or reset a rate from here", async () => {
    stub();
    const { container, findByText } = mount();
    await findByText("The build-up");
    expect(container.textContent).not.toContain("Save to my library");
    expect(container.textContent).not.toContain("Discard");
    expect(container.textContent).not.toContain("Reset to published");
  });

  it("says where a rate is actually changed", async () => {
    stub();
    const { findByText } = mount();
    expect(await findByText(/changed in Rate Gen and published from there/)).toBeTruthy();
  });

  it("hands the rate to the desktop application, in the shape it parses", async () => {
    // adlm-rategen://rate/<id>?name=<description>&section=<key>, registered by
    // RateGen's Installer.iss. A real anchor: a click on an <a> that leaves the
    // DOM mid-navigation is cancelled, so the shell never sees it.
    stub();
    const { container, findByText } = mount();
    const link = await findByText("Open in Rate Gen");
    expect(link.tagName).toBe("A");
    const href = link.getAttribute("href");
    expect(href.startsWith("adlm-rategen://rate/")).toBe(true);
    expect(href).toContain("name=");
    expect(href).toContain("section=");
    expect(container.textContent).toContain("Rate Gen has to be installed on this machine");
  });
});
