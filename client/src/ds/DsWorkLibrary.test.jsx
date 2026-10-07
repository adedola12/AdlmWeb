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
    if (path.includes("/library/plant")) return { items: plantItems, version: 1 };
    if (path.includes("/library/trade-margins")) return { trades: [], version: 1 };
    throw new Error(`unstubbed ${path}`);
  });
}

// The plant library as GET /rategen-v2/library/plant serves it: the worked
// mixer from server/util/plantCosting.test.js, and a machine that cannot be
// priced, which must never read ₦0.
const plantItems = [
  { sn: 1, key: "mixer", name: "Mixer", source: "adlm", category: "Concrete plant", dayCost: 54000, hoursPerDay: 8, hourlyRate: 6750, priced: true, problems: [], parts: [] },
  { sn: 2, key: "tipper", name: "Tipper", source: "adlm", category: "Haulage", dayCost: 0, hoursPerDay: 8, hourlyRate: null, priced: false, problems: ["Diesel has no price"], parts: [] },
];

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

  it("offers the four tabs, and the Plant tab is the plant library, priced by the hour", async () => {
    stub();
    const { container, findByText, getByText } = mount();
    await findByText("Blockwork 225mm in cement mortar");

    const tabs = [...container.querySelectorAll(".wk-tabs button")].map((b) => b.textContent);
    expect(tabs).toEqual(["Item of works", "Materials", "Labour", "Plant"]);

    fireEvent.click(getByText("Plant"));
    await waitFor(() => expect(container.textContent).toContain("Mixer"));
    // ₦54,000 a day over 8 hours, used by the hour
    expect(container.textContent).toContain("6,750");
    expect(container.textContent).toContain("8-hour day");
    // "Used in" is counted off the build-ups that name it, not invented.
    expect(container.textContent).toContain("1 rate");
    // A machine that cannot be priced says why, and is never shown at ₦0.
    const tipper = [...container.querySelectorAll(".wk-row")].find((r) => r.textContent.includes("Tipper"));
    expect(tipper.textContent).toContain("Diesel has no price");
    expect(tipper.textContent).not.toMatch(/₦\s?0\.00 ?per hr/);
  });

  // R2 trade margins are set in Rate Gen (owner's rule, 4 Oct 2026): the
  // website has no editor for them, and the plant library is read only.
  it("offers no trade-margin editor and no plant editing on the website", async () => {
    stub();
    const { container, findByText, queryByText } = mount();
    await findByText("Blockwork 225mm in cement mortar");
    expect(container.textContent).not.toContain("Default margins by trade");
    expect(queryByText("Add a machine of your own")).toBeNull();
  });

  // Owner's rule, 4 Oct 2026: rates are built and edited only in Rate Gen. The
  // builder and "Update prices" are gone, and the note says where to go.
  it("says rates are built in Rate Gen and offers no way to change them here", async () => {
    stub();
    const { container, findByText, getByText, queryByText } = mount();
    await findByText("Blockwork 225mm in cement mortar");
    expect(container.textContent).toContain("Build and edit rates in ADLM Rate Gen");
    expect(queryByText("Build a custom rate")).toBeNull();

    fireEvent.click(getByText("Materials"));
    await waitFor(() => expect(container.textContent).toContain("Build and edit rates in ADLM Rate Gen"));
    expect(queryByText("Update prices")).toBeNull();

    // Nothing on the screen writes to the library.
    for (const [, init] of apiAuthed.mock.calls) {
      expect(String(init?.method || "GET").toUpperCase()).toBe("GET");
    }
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
    const card = document.querySelector(".fb-card");
    expect(card.textContent).toContain("Sandcrete block");
    // 7,000 + 2,000 + 1,000 IS the 10,000 net, so there is nothing to carry.
    expect(card.textContent).not.toContain("Not itemised");
  });

  // ── S18 review, finding 3 ─────────────────────────────────────────────────
  // The card listed components adding to less than the Net cost printed under
  // them and said nothing about the difference, so a rate that adds up read as
  // a broken one — and the remainder the build-up carries was invisible here.
  it("shows what the net cost carries that no component explains", async () => {
    const withRemainder = {
      ...masterRate,
      composition: {
        components: [
          { name: "Sandcrete block", kind: "material", quantity: 10, unit: "no", unitPrice: 700, totalCost: 7000 },
          { name: "Mason gang", kind: "labour", quantity: 0.05, unit: "day", unitPrice: 20000, totalCost: 1000 },
        ],
      },
    };
    stub({ rates: [withRemainder] });
    const { findByText } = mountWithCards();
    const row = await findByText("Blockwork 225mm in cement mortar");

    fireEvent.click(row.closest("a"));
    await waitFor(() => expect(document.querySelector(".fb-card")).toBeTruthy());
    const card = document.querySelector(".fb-card");
    // 10,000 net, 8,000 of it itemised: the other 2,000 is said out loud, in
    // the build-up's words, above the net cost it is part of.
    expect(card.textContent).toContain("Not itemised");
    expect(card.textContent).toContain("2,000.00");
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

/* ──────── rates are built and edited in Rate Gen desktop ──────── */

// The owner's rule: a rate is built and edited in Rate Gen desktop and nowhere
// else. Two controls used to sit at the top of this screen — "Build a custom
// rate", which opened a builder and POSTed a new rate, and "Edit the library",
// which sent the reader to the classic editor.
//
// This is the guard, not a style preference. A button like that is exactly the
// kind of thing that comes back: somebody restores it from an older file, or
// re-adds it because the screen "looks empty" without an action. If it does,
// the website becomes a second place rates can be created, and the desktop
// library and the cloud copy start to disagree about what a rate is.
describe("building and editing rates is not offered here", () => {
  it("offers no way to build a rate", async () => {
    stub();
    const { findByText, queryByText } = mount();
    await findByText(/Blockwork 225mm/);
    expect(queryByText("Build a custom rate")).toBeNull();
    expect(queryByText(/Build a custom/i)).toBeNull();
  });

  it("offers no way to edit the library", async () => {
    stub();
    const { findByText, queryByText, container } = mount();
    await findByText(/Blockwork 225mm/);
    expect(queryByText("Edit the library")).toBeNull();
    // ...and no link out to the classic editor, which is where it went.
    expect(container.querySelector('a[href="/rategen"]')).toBeNull();
  });

  it("says where rates ARE built, so the screen does not just look broken", async () => {
    // Removing a control without saying where it went is how a screen reads as
    // missing a feature rather than as deliberate.
    stub();
    const { findByText } = mount();
    expect(await findByText(/Rate Gen desktop/)).toBeTruthy();
  });

  it("still shows the library, which is what the screen is for", async () => {
    stub();
    const { findByText } = mount();
    expect(await findByText(/Blockwork 225mm/)).toBeTruthy();
  });
});
