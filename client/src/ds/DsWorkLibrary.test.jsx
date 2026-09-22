// The RateGen library, on stubbed data.
//
// The point of these is the two things that go wrong quietly: a figure read
// off the wrong field (which is what made every Amount NGN 0 on the build-up),
// and the user's own rate either vanishing from the list or appearing twice.

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { FeedbackProvider } from "./feedback/FeedbackProvider.jsx";

const masterRate = {
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
  zone: "south_west",
  updatedAt: "2026-09-01T00:00:00.000Z",
  composition: {
    components: [
      { name: "Sandcrete block", kind: "material", quantity: 10, unit: "no", unitPrice: 700, totalCost: 7000 },
      { name: "Mason gang", kind: "labour", quantity: 0.1, unit: "day", unitPrice: 20000, totalCost: 2000 },
      { name: "Mixer", kind: "plant", quantity: 0.5, unit: "h", unitPrice: 2000, totalCost: 1000 },
    ],
  },
};

const apiAuthed = vi.fn();
vi.mock("../api.js", () => ({
  apiAuthed: (...a) => apiAuthed(...a),
  api: vi.fn(),
}));
vi.mock("../store.jsx", () => ({
  useAuth: () => ({ accessToken: "t" }),
}));

const { default: DsWorkLibrary } = await import("./DsWorkLibrary.jsx");

function stub({ rates = [masterRate], overrides = [], customs = [] } = {}) {
  apiAuthed.mockImplementation(async (path) => {
    if (path.includes("rates/sync")) return { items: rates };
    if (path.includes("user-rates")) {
      return {
        rateOverrides: overrides,
        customRates: customs,
        meta: { ratesVersion: 2, customRatesVersion: 3 },
      };
    }
    if (path.includes("/rategen/master")) return { materials: [], labour: [], state: "lagos" };
    throw new Error(`unstubbed ${path}`);
  });
}

const mount = () =>
  render(
    <MemoryRouter initialEntries={["/work/library"]}>
      <DsWorkLibrary />
    </MemoryRouter>,
  );

beforeEach(() => {
  apiAuthed.mockReset();
});
afterEach(cleanup);

describe("the RateGen library", () => {
  it("shows his seven columns with the figures the server stored", async () => {
    stub();
    const { container, findByText } = mount();
    await findByText("Blockwork 225mm in cement mortar");

    const head = [...container.querySelectorAll(".wk-hd span")].map((s) => s.textContent);
    expect(head).toEqual([
      "Item of work",
      "Unit",
      "Net cost",
      "Overhead",
      "Profit",
      "Total",
      "",
    ]);

    const row = container.querySelector(".wk-row");
    const nums = [...row.querySelectorAll(".wk-n")].map((s) => s.textContent);
    // Net, then overhead and profit each carrying their percentage.
    expect(nums[0]).toContain("10,000");
    expect(nums[1]).toContain("1,000");
    expect(nums[1]).toContain("10%");
    expect(nums[2]).toContain("2,500");
    expect(nums[2]).toContain("25%");
    expect(row.querySelector(".wk-r").textContent).toContain("13,500");
  });

  it("marks the user's own copy of a rate and does not list it twice", async () => {
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
        },
      ],
    });
    const { container, findByText } = mount();
    await findByText("Blockwork 225mm in cement mortar");

    expect(container.querySelectorAll(".wk-row")).toHaveLength(1);
    expect(container.querySelector(".wk-own").textContent).toBe("yours · edited");
    expect(container.querySelector(".wk-r").textContent).toContain("14,850");
  });

  it("lists a rate the user built, marked yours", async () => {
    stub({
      customs: [
        {
          customRateId: "tiling-x1",
          description: "Ceramic tiling",
          unit: "m2",
          netCost: 8000,
          overheadPercent: 10,
          profitPercent: 10,
          overheadValue: 800,
          profitValue: 800,
          totalCost: 9600,
        },
      ],
    });
    const { container, findByText } = mount();
    await findByText("Ceramic tiling");
    expect(container.querySelectorAll(".wk-row")).toHaveLength(2);
    expect([...container.querySelectorAll(".wk-own")].map((e) => e.textContent)).toContain(
      "yours",
    );
  });

  it("says so honestly when the library is empty", async () => {
    stub({ rates: [] });
    const { findByText } = mount();
    await findByText(/Nothing in the library yet/);
  });

  it("offers the four tabs, and the Plant tab reads the machines out of the rates", async () => {
    stub();
    const { container, findByText, getByText } = mount();
    await findByText("Blockwork 225mm in cement mortar");

    const tabs = [...container.querySelectorAll(".wk-tabs button")].map((b) => b.textContent);
    expect(tabs).toEqual(["Item of works", "Materials", "Labour", "Plant"]);

    fireEvent.click(getByText("Plant"));
    await waitFor(() => expect(container.textContent).toContain("Mixer"));
    // Read off the build-ups, not invented.
    expect(container.textContent).toContain("1 rate");
  });

  it("does not offer Update prices until the catalogue is actually there", async () => {
    stub();
    const { container, findByText, getByText } = mount();
    await findByText("Blockwork 225mm in cement mortar");
    fireEvent.click(getByText("Materials"));
    await waitFor(() => expect(container.textContent).toContain("Market prices move"));
    const btn = getByText("Update prices");
    // The stub returns an empty catalogue, so there is nothing to update.
    expect(btn.disabled).toBe(true);
    // And the copy does not repeat the prototype's claim about rates moving.
    expect(container.textContent).not.toContain("every rate using it follows");
    expect(container.textContent).toContain("keep the cost they were built at");
  });
});

// ── S18 review, finding 3 ───────────────────────────────────────────────────
// The composition card reads whatever build-up the row carries. An override
// with none of its own used to carry the MASTER's, so the card itemised
// components adding to 10,000 under a net cost of 11,000 and read as if the
// customer's own price were broken down when it is not.
const mountWithCards = () =>
  render(
    <MemoryRouter initialEntries={["/work/library"]}>
      <FeedbackProvider>
        <DsWorkLibrary />
      </FeedbackProvider>
    </MemoryRouter>,
  );

describe("the composition card for a customer's own copy", () => {
  const bareOverride = {
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
  };

  it("does not list the published rate's components against the customer's figure", async () => {
    stub({ overrides: [bareOverride] });
    const { container, findByText } = mountWithCards();
    const row = await findByText("Blockwork 225mm in cement mortar");

    fireEvent.click(row.closest("a"));
    await waitFor(() => expect(container.textContent).toContain("14,850"));
    // No card, and above all no master lines under the customer's net cost.
    expect(document.querySelector(".fb-card")).toBe(null);
    expect(container.textContent).not.toContain("Sandcrete block");
  });

  it("still itemises a published rate the customer has not touched", async () => {
    stub();
    const { findByText } = mountWithCards();
    const row = await findByText("Blockwork 225mm in cement mortar");

    fireEvent.click(row.closest("a"));
    await waitFor(() => expect(document.querySelector(".fb-card")).toBeTruthy());
    expect(document.querySelector(".fb-card").textContent).toContain("Sandcrete block");
  });
});

// ── S18 review, finding 6 ───────────────────────────────────────────────────
describe("a library bigger than one page", () => {
  it("reads every page rather than the first 500 rows", async () => {
    const page2 = { ...masterRate, id: "a2", description: "Concrete 1:2:4 in foundations" };
    apiAuthed.mockImplementation(async (path, init) => {
      if (path.includes("rates/sync")) {
        const cursor = init?.params?.cursor;
        return cursor
          ? { items: [page2], location: { state: "lagos" }, nextCursor: null }
          : { items: [masterRate], location: { state: "lagos" }, nextCursor: "c1" };
      }
      if (path.includes("user-rates"))
        return { rateOverrides: [], customRates: [], meta: { ratesVersion: 1 } };
      if (path.includes("/rategen/master")) return { materials: [], labour: [] };
      throw new Error(`unstubbed ${path}`);
    });

    const { container, findByText } = mount();
    // The rate on the second page is a rate in this library.
    await findByText("Concrete 1:2:4 in foundations");
    expect(container.querySelectorAll(".wk-row")).toHaveLength(2);
    expect(container.querySelector(".wk-count").textContent).toContain("2 of 2 rates");
  });
});

// ── S18 review, finding 5 ───────────────────────────────────────────────────
// The server caps one bulk change and skips rows whose price does not move.
// The screen reported "N prices raised" either way, so a change that half
// happened read as a change that worked.
describe("what a bulk price change reports", () => {
  const catalogue = {
    materials: [
      { sn: 1, description: "Cement", unit: "bag", price: 9000, category: "Concrete" },
      { sn: 2, description: "Sharp sand", unit: "m3", price: 20000, category: "Concrete" },
    ],
    labour: [],
    state: "lagos",
  };

  function stubWithBulk(bulk) {
    apiAuthed.mockImplementation(async (path, init) => {
      if (path.includes("rates/sync")) return { items: [masterRate] };
      if (path.includes("user-rates"))
        return { rateOverrides: [], customRates: [], meta: { ratesVersion: 1 } };
      if (path.includes("price-overrides/bulk")) return bulk;
      if (path.includes("/rategen/master")) return catalogue;
      throw new Error(`unstubbed ${path} ${init?.method || ""}`);
    });
  }

  async function applyChange() {
    const r = render(
      <MemoryRouter initialEntries={["/work/library"]}>
        <FeedbackProvider>
          <DsWorkLibrary />
        </FeedbackProvider>
      </MemoryRouter>,
    );
    await r.findByText("Blockwork 225mm in cement mortar");
    fireEvent.click(r.getByText("Materials"));
    await waitFor(() => expect(r.getByText("Update prices").disabled).toBe(false));
    fireEvent.click(r.getByText("Update prices"));
    await waitFor(() => expect(document.querySelector(".fb-card")).toBeTruthy());
    fireEvent.click(document.querySelector(".fb-card .p"));
    await waitFor(() => expect(document.querySelector(".fb-toast")).toBeTruthy());
    return document.querySelector(".fb-toast").textContent;
  }

  it("says how many of the matched rows actually moved", async () => {
    stubWithBulk({ ok: true, changed: 800, matched: 1400, capped: true, limit: 1000, previous: [] });
    const said = await applyChange();
    expect(said).toContain("800 of 1400 prices raised");
    expect(said).toContain("1400 rows matched");
    expect(said).toContain("400 were not looked at");
  });

  it("does not claim a cap that did not happen", async () => {
    stubWithBulk({ ok: true, changed: 2, matched: 2, capped: false, limit: 1000, previous: [] });
    const said = await applyChange();
    expect(said).toContain("2 prices raised by 5%");
    expect(said).not.toContain("not looked at");
    expect(said).not.toContain("of 2 prices");
  });

  it("accounts for rows that matched but did not move", async () => {
    stubWithBulk({ ok: true, changed: 1, matched: 2, capped: false, limit: 1000, previous: [] });
    const said = await applyChange();
    expect(said).toContain("1 of 2 price");
    expect(said).toContain("1 came to the same figure once rounded");
  });
});
