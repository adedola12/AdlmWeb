import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// What a sample card, the "Price with my RateGen rates" panel and the ICMS 3
// export entry put on screen. The API is stubbed: these pin what the pieces
// show, not the server's arithmetic (that is server/util/*.test.js).

vi.mock("../../http", () => ({ apiAuthed: vi.fn() }));
import { apiAuthed } from "../../http";
import SampleProjectsStrip from "./SampleProjectsStrip.jsx";
import PricePreviewPanel from "./PricePreviewPanel.jsx";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const sample = {
  id: "s1",
  name: "Sample: 4-Bedroom Duplex - Strip Foundation",
  productKey: "revit",
  sample: { foundation: "Strip", location: "Lekki, Lagos", stage: "Valuation 3" },
  itemCount: 65,
  contractSum: 94_200_000,
  certificateCount: 3,
  carbon: { carbonKg: 99_300, carbonLowKg: 80_000, carbonShare: 0.97 },
};

describe("sample card", () => {
  it("shows the bill's carbon footprint and how much of the cost it covers", () => {
    render(<SampleProjectsStrip samples={[sample]} onOpenProject={() => {}} productKey="revit" />);
    expect(screen.getByText("Carbon footprint")).toBeTruthy();
    expect(screen.getByText("99.3 tCO2e")).toBeTruthy();
    expect(screen.getByText("97% of cost")).toBeTruthy();
  });

  it("shows no carbon row when there is no figure", () => {
    render(
      <MemoryRouter>
        <SampleProjectsStrip samples={[{ ...sample, carbon: null }]} productKey="revit" />
      </MemoryRouter>,
    );
    expect(screen.queryByText("Carbon footprint")).toBeNull();
  });
});

describe("Price with my RateGen rates", () => {
  it("prices on request and shows the change, the coverage and each line's source", async () => {
    apiAuthed.mockResolvedValue({
      ok: true,
      state: "lagos",
      totals: { current: 94_200_000, preview: 100_100_000, currentOfPriced: 91_600_000, pricedLines: 59, lines: 65, pricedShare: 0.97 },
      lines: [
        { key: "1", description: "Columns – Concrete", unit: "m3", qty: 12, currentRate: 150000, newRate: 165000, source: "work", from: "Concrete (1:2:4)", assumed: "Concrete mix not stated: 1:2:4 (grade 20) assumed." },
        { key: "2", description: "Upstand", unit: "m", qty: 4, currentRate: 9000, newRate: null, source: "none" },
      ],
    });
    render(<PricePreviewPanel productKey="revit" projectId="s1" accessToken="t" />);
    fireEvent.click(screen.getByRole("button", { name: "Price with my rates" }));
    await waitFor(() => expect(screen.getByText("₦100,100,000")).toBeTruthy());
    expect(apiAuthed).toHaveBeenCalledWith("/projects/revit/s1/price-preview", { token: "t" });
    expect(screen.getByText("+9.3%")).toBeTruthy();
    expect(screen.getByText("59 of 65")).toBeTruthy();
    expect(screen.getByText("By the work · assumed")).toBeTruthy();
    expect(screen.getByText("Not priced")).toBeTruthy();
  });

  it("says plainly when RateGen has no rates for the bill's kind of work", async () => {
    apiAuthed.mockResolvedValue({ ok: true, unsupported: "RateGen has no civil works rates yet, so this bill cannot be priced from your RateGen rates.", lines: [], totals: {} });
    render(<PricePreviewPanel productKey="civil3d" projectId="r1" accessToken="t" />);
    fireEvent.click(screen.getByRole("button", { name: "Price with my rates" }));
    await waitFor(() => expect(screen.getByText(/no civil works rates yet/)).toBeTruthy());
  });
});
