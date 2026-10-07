// Same shape as the support screen: a read that failed is not an empty list.
//
// The Machines panel caught GET /me/devices to [] and then said "0 activated"
// and "No machine has activated a licence yet". To a firm with QUIV running on
// four workstations that reads as four lost activations, and the sentence it
// was shown next invites them to go and buy a licence they already own.

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const api = vi.fn();

vi.mock("../store.jsx", async (orig) => ({
  ...(await orig()),
  useAuth: () => ({
    accessToken: "test-token",
    user: { _id: "u1", firstName: "Ada", lastName: "Obi", email: "ada@example.com" },
  }),
}));
vi.mock("../http.js", async (orig) => ({
  ...(await orig()),
  apiAuthed: (...args) => api(...args),
}));

const { default: DsTeam } = await import("./DsTeam.jsx");

const CATALOGUE = [{ key: "revit", name: "QUIV" }];
const SUMMARY = {
  entitlements: [
    { productKey: "revit", seats: 3, seatsUsed: 2, status: "active", isCourse: false },
  ],
};

const mount = () =>
  render(
    <MemoryRouter>
      <DsTeam />
    </MemoryRouter>,
  );

beforeEach(() => {
  api.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: async () => CATALOGUE })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const base = (devicesResult) => (path) => {
  const p = String(path);
  if (p === "/me/summary") return Promise.resolve(SUMMARY);
  if (p === "/me/devices") return devicesResult();
  return Promise.resolve({});
};

describe("the team screen when the device read fails", () => {
  it("says it could not be loaded rather than that nothing has activated", async () => {
    api.mockImplementation(base(() => Promise.reject(new Error("Network request failed"))));

    mount();

    expect(await screen.findByText(/could not be loaded just now/)).toBeTruthy();
    expect(screen.getByText("Not loaded")).toBeTruthy();
    expect(screen.queryByText(/No machine has activated a licence yet/)).toBeNull();
    expect(screen.queryByText("0 activated")).toBeNull();
  });

  it("offers a retry that shows the machines once the read works", async () => {
    let fail = true;
    api.mockImplementation(
      base(() =>
        fail
          ? Promise.reject(new Error("Network request failed"))
          : Promise.resolve({
              devices: [
                {
                  fingerprint: "fp-1",
                  name: "TUNDE-WS02",
                  products: ["revit"],
                  lastSeenAt: new Date().toISOString(),
                },
              ],
            }),
      ),
    );

    mount();
    await screen.findByText(/could not be loaded just now/);

    fail = false;
    fireEvent.click(screen.getByText("Try again"));

    await waitFor(() => expect(screen.getByText("TUNDE-WS02")).toBeTruthy());
    expect(screen.getByText("1 activated")).toBeTruthy();
    expect(screen.queryByText(/could not be loaded just now/)).toBeNull();
  });

  it("still says nothing has activated when the read works and nothing has", async () => {
    api.mockImplementation(base(() => Promise.resolve({ devices: [] })));

    mount();

    expect(await screen.findByText(/No machine has activated a licence yet/)).toBeTruthy();
    expect(screen.getByText("0 activated")).toBeTruthy();
    expect(screen.queryByText(/could not be loaded just now/)).toBeNull();
  });
});
