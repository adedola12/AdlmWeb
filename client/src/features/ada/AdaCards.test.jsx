import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

const apiAuthed = vi.fn();
vi.mock("../../api.js", () => ({ apiAuthed: (...a) => apiAuthed(...a) }));

import { AdaPricingCard, AdaReportCard } from "./AdaCards.jsx";
import { PROJECT_UPDATED_EVENT } from "./adaCardsModel.js";

// The cards under Ada's reply. Nothing is written until Apply, and Apply
// posts only the ticked lines, by rate id, to price-many.

const card = {
  type: "price-proposal",
  project: { id: "65f0c0ffee", productKey: "planswift", name: "Lekki duplex" },
  unpricedCount: 3,
  unmatchedCount: 1,
  lines: [
    { code: "B1", description: "Concrete", qty: 2, unit: "m3", rateId: "r1", rateDescription: "RC columns", rateUnit: "m3", unitPrice: 100, amount: 200, why: "Close match in your own rate" },
    { code: "B2", description: "Blockwork", qty: 3, unit: "m2", rateId: "r3", rateDescription: "225mm block", rateUnit: "m2", unitPrice: 10, amount: 30, why: "Likely match in the ADLM library" },
  ],
};

afterEach(() => {
  cleanup();
  apiAuthed.mockReset();
});

describe("AdaPricingCard", () => {
  it("opens with every line ticked and the total it would add", () => {
    render(<AdaPricingCard card={card} token="t" />);
    expect(screen.getAllByRole("checkbox").every((c) => c.checked)).toBe(true);
    expect(screen.getByRole("button", { name: "Apply 2 rates" })).toBeTruthy();
    expect(apiAuthed).not.toHaveBeenCalled();
  });

  it("posts only the ticked lines, by rate, and reports the result", async () => {
    apiAuthed.mockResolvedValue({ _priced: ["B1"], _skipped: [], _rateWarnings: [] });
    const seen = vi.fn();
    window.addEventListener(PROJECT_UPDATED_EVENT, seen);
    render(<AdaPricingCard card={card} token="tok" />);
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    fireEvent.click(screen.getByRole("button", { name: "Apply 1 rate" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/1 line priced/));
    window.removeEventListener(PROJECT_UPDATED_EVENT, seen);

    const [path, init] = apiAuthed.mock.calls[0];
    expect(path).toBe("/projects/planswift/65f0c0ffee/bill/price-many");
    expect(init.method).toBe("POST");
    expect(init.token).toBe("tok");
    expect(init.body).toEqual({
      lines: [{ code: "B1", rateId: "r1", description: "RC columns", unit: "m3" }],
      via: "ada",
    });
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls[0][0].detail).toEqual({ id: "65f0c0ffee" });
  });

  it("says why a refused Apply failed and changes nothing on screen", async () => {
    apiAuthed.mockRejectedValue(Object.assign(new Error("x"), { status: 403, data: { code: "VIEW_ONLY" } }));
    render(<AdaPricingCard card={card} token="t" />);
    fireEvent.click(screen.getByRole("button", { name: "Apply 2 rates" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/view-only/));
    expect(screen.getByRole("button", { name: "Apply 2 rates" })).toBeTruthy();
  });
});

describe("AdaReportCard", () => {
  it("shows the range and opens the report for it", () => {
    const onOpen = vi.fn();
    render(
      <AdaReportCard
        card={{
          type: "project-report",
          label: "Open the report",
          project: { id: "65f", productKey: "revit", name: "Ikoyi" },
          from: "2026-09-01",
          to: "2026-09-30",
          summary: { valued: 1000, certified: 0, bought: 0, activity: 2 },
        }}
        onOpen={onOpen}
      />,
    );
    expect(screen.getByText("1 Sept 2026 to 30 Sept 2026")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Open the report/ }));
    expect(onOpen).toHaveBeenCalledWith({ productKey: "revit", projectId: "65f", from: "2026-09-01", to: "2026-09-30" });
  });

  it("hides money from a viewer who cannot see rates", () => {
    render(
      <AdaReportCard
        card={{ project: { id: "x" }, from: "2026-09-01", to: "2026-09-30", summary: { valued: 5, moneyMasked: true } }}
      />,
    );
    expect(screen.queryByText(/₦/)).toBeNull();
  });
});

describe("AdaPricingCard with a stated rate", () => {
  const stated = {
    type: "price-proposal",
    mode: "user-rate",
    basis: "area",
    category: "windows",
    ratePerM2: 88000,
    split: { material: 60, labour: 20, overheadProfit: 20 },
    repricedCount: 1,
    project: { id: "65f0c0ffee", productKey: "revit", name: "Lekki duplex" },
    lines: [
      { code: "W1", description: "Window W1 (1200×1500)", qty: 4, unit: "nr", sizeLabel: "1200×1500", areaM2: 1.8, ratePerM2: 88000, userRate: 158400, amount: 633600, split: { material: 60, labour: 20, overheadProfit: 20 }, splitAmounts: { material: 95040, labour: 31680, overheadProfit: 31680 } },
      { code: "W2", description: "Window W2 (600x600)", qty: 2, unit: "nr", sizeLabel: "600×600", areaM2: 0.36, ratePerM2: 88000, userRate: 31680, amount: 63360, currentRate: 30000, split: { material: 60, labour: 20, overheadProfit: 20 }, splitAmounts: { material: 19008, labour: 6336, overheadProfit: 6336 } },
    ],
  };

  it("shows the size, area, split and the rate a line has now", () => {
    render(<AdaPricingCard card={stated} token="t" />);
    const text = document.body.textContent;
    expect(text).toMatch(/Windows at .*88,000 per m²/);
    expect(text).toMatch(/60% material · 20% labour · 20% overhead & profit/);
    expect(text).toMatch(/1200×1500 mm · 1\.8 m²/);
    expect(text).toMatch(/now .*30,000/);
    expect(text).toMatch(/already has a rate/);
    expect(screen.getByRole("button", { name: "Apply 2 rates" })).toBeTruthy();
  });

  it("posts the rate per m2 for the ticked windows only", async () => {
    apiAuthed.mockResolvedValue({ _priced: ["W1"], _skipped: [], _rateWarnings: [] });
    render(<AdaPricingCard card={stated} token="tok" />);
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    fireEvent.click(screen.getByRole("button", { name: "Apply 1 rate" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/1 line priced/));
    const [path, init] = apiAuthed.mock.calls[0];
    expect(path).toBe("/projects/revit/65f0c0ffee/bill/price-many");
    expect(init.body).toEqual({
      lines: [{ code: "W1", ratePerM2: 88000, split: { material: 60, labour: 20, overheadProfit: 20 } }],
      via: "ada",
    });
  });
});
