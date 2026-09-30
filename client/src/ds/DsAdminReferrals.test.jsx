// Referrals, and whether the referred person subscribed.
//
// The screen exists because the Purchases queue cannot answer that question:
// somebody who signed up on a link and never bought has no order, so they never
// appear there at all, and their absence reads as "no referrals". These pin the
// three things that would make this screen lie in the same way — a failed read
// looking like an empty list, a filter tab that sends the wrong thing, and
// totals taken over the filtered page rather than all of them.

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

let answer = async () => ({ ok: true, items: [], totals: {} });
const calls = [];

vi.mock("../api.js", () => ({
  apiAuthed: vi.fn(async (path, opts) => {
    calls.push({ path, params: opts?.params });
    return answer(path, opts);
  }),
}));
vi.mock("../store.jsx", () => ({ useAuth: () => ({ accessToken: "t", user: {} }) }));

const { default: DsAdminReferrals } = await import("./DsAdminReferrals.jsx");

const mount = () =>
  render(
    <MemoryRouter>
      <DsAdminReferrals />
    </MemoryRouter>,
  );

const row = (extra) => ({
  id: "1",
  code: "AB7K2XQ9",
  referrer: "bola@firm.com",
  referred: "chidi@example.com",
  signupMethod: "password",
  signedUpAt: "2026-09-12T09:00:00Z",
  subscribed: false,
  convertedAt: null,
  convertedVia: "",
  amount: 0,
  currency: "",
  products: [],
  ...extra,
});

beforeEach(() => {
  calls.length = 0;
  answer = async () => ({ ok: true, items: [], totals: {} });
});
afterEach(cleanup);

describe("the list", () => {
  it("shows who was referred, by whom, and that they have not subscribed", async () => {
    answer = async () => ({
      ok: true,
      items: [row()],
      totals: { total: 1, converted: 0, waiting: 1, revenue: 0 },
    });
    mount();
    await waitFor(() => expect(screen.getByText("chidi@example.com")).toBeTruthy());
    expect(screen.getByText("bola@firm.com")).toBeTruthy();
    expect(screen.getByText(/code AB7K2XQ9/)).toBeTruthy();
    // Scoped to the table: "Not yet" is also a filter tab.
    expect(within(screen.getByRole("table")).getByText("Not yet")).toBeTruthy();
  });

  it("says what a conversion was worth and how it was credited", async () => {
    answer = async () => ({
      ok: true,
      items: [
        row({
          subscribed: true,
          convertedAt: "2026-09-20T09:00:00Z",
          convertedVia: "admin-approval",
          amount: 320_000,
          currency: "NGN",
          products: ["HERON"],
        }),
      ],
      totals: { total: 1, converted: 1, waiting: 0, revenue: 320_000 },
    });
    mount();
    // "20 Sept 2026" — en-GB short month, the same formatter every other admin
    // register uses.
    await waitFor(() => expect(screen.getByText(/20 Sept 2026/)).toBeTruthy());
    expect(screen.getByText(/HERON/)).toBeTruthy();
    expect(screen.getByText(/transfer approved here/)).toBeTruthy();
  });

  it("does NOT make a failed read look like nobody has referred anybody", async () => {
    // The whole reason this screen exists is that an absence reads as a fact.
    answer = async () => {
      throw new Error("500");
    };
    mount();
    await waitFor(() => expect(screen.getByText(/could not be read/)).toBeTruthy());
    expect(screen.queryByText(/No referrals yet/)).toBe(null);
  });

  it("tells a first-time reader what will appear here", async () => {
    mount();
    await waitFor(() => expect(screen.getByText("No referrals yet")).toBeTruthy());
  });
});

describe("the filter", () => {
  it("asks the SERVER, so the list and the counts cannot disagree", async () => {
    answer = async () => ({
      ok: true,
      items: [row()],
      totals: { total: 9, converted: 4, waiting: 5, revenue: 10 },
    });
    mount();
    await waitFor(() => expect(calls.length).toBe(1));
    // "All" sends no filter at all — sending "" would be a filter FOR "".
    expect(calls[0].params).toEqual({});

    fireEvent.click(screen.getByRole("tab", { name: /Subscribed/ }));
    await waitFor(() => expect(calls.length).toBe(2));
    expect(calls[1].params).toEqual({ converted: "1" });

    fireEvent.click(screen.getByRole("tab", { name: /Not yet/ }));
    await waitFor(() => expect(calls.length).toBe(3));
    expect(calls[2].params).toEqual({ converted: "0" });
  });

  it("counts the tabs from the totals over ALL referrals", async () => {
    // Counting the returned page instead would print "1 of 1 subscribed" the
    // moment the Subscribed filter was on.
    answer = async () => ({
      ok: true,
      items: [row()],
      totals: { total: 9, converted: 4, waiting: 5, revenue: 0 },
    });
    mount();
    await waitFor(() => expect(screen.getByText("9")).toBeTruthy());
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();
  });

  it("says when the list stopped short rather than implying it is all of them", async () => {
    answer = async () => ({
      ok: true,
      items: [row()],
      totals: { total: 900, converted: 1, waiting: 899, revenue: 0 },
      truncated: true,
      limit: 200,
    });
    mount();
    await waitFor(() => expect(screen.getByText(/newest 200 are shown/)).toBeTruthy());
  });
});

describe("what the referrals brought in", () => {
  it("prints the take in its own currency", async () => {
    answer = async () => ({
      ok: true,
      items: [],
      totals: {
        total: 12, converted: 5, waiting: 7,
        byCurrency: { NGN: 640_000 }, currencies: ["NGN"], revenue: 640_000, mixedCurrency: false,
      },
    });
    mount();
    await waitFor(() => expect(screen.getByText(/5 of 12 have subscribed/)).toBeTruthy());
    expect(screen.getByText(/₦640,000/)).toBeTruthy();
  });

  it("does NOT add naira to dollars", async () => {
    // Two ₦150,000 sales and one $400 sale summed into "₦300,400" understates
    // the take by roughly ₦600,000 while looking precise.
    answer = async () => ({
      ok: true,
      items: [],
      totals: {
        total: 3, converted: 3, waiting: 0,
        byCurrency: { NGN: 300_000, USD: 400 }, currencies: ["NGN", "USD"],
        revenue: null, mixedCurrency: true,
      },
    });
    mount();
    await waitFor(() => expect(screen.getByText(/₦300,000/)).toBeTruthy());
    expect(screen.getByText(/\$400/)).toBeTruthy();
    // The summed figure must appear nowhere.
    expect(screen.queryByText(/300,400/)).toBe(null);
  });

  it("says nothing about money before anything has converted", async () => {
    answer = async () => ({
      ok: true, items: [],
      totals: { total: 4, converted: 0, waiting: 4, byCurrency: {}, currencies: [], revenue: 0 },
    });
    mount();
    await waitFor(() => expect(screen.getByText(/0 of 4 have subscribed/)).toBeTruthy());
    expect(screen.queryByText(/worth/)).toBe(null);
  });
});
