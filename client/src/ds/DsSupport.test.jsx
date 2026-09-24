// A read that failed is not an empty list.
//
// The tickets panel caught its own failure to [] and then rendered the empty
// state: "None raised · Nothing raised yet. ... Use the form on this page to
// open the first one." A customer with three open tickets was being told they
// had none, and invited to raise a fourth.

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const api = vi.fn();

vi.mock("../store.jsx", async (orig) => ({
  ...(await orig()),
  useAuth: () => ({ accessToken: "test-token", user: { _id: "u1", email: "qs@example.com" } }),
}));
vi.mock("../http.js", async (orig) => ({
  ...(await orig()),
  apiAuthed: (...args) => api(...args),
}));

const { default: DsSupport } = await import("./DsSupport.jsx");

const TICKETS = "/api/support/tickets/mine";

const mount = () =>
  render(
    <MemoryRouter>
      <DsSupport />
    </MemoryRouter>,
  );

beforeEach(() => {
  api.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: async () => [] })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const base = (ticketsResult) => (path) => {
  const p = String(path);
  if (p === "/me/summary") return Promise.resolve({ entitlements: [] });
  if (p === "/me/devices") return Promise.resolve({ devices: [] });
  if (p === "/me/deployments") return Promise.resolve({ items: [] });
  if (p === TICKETS) return ticketsResult();
  return Promise.resolve({});
};

describe("the support screen when the ticket read fails", () => {
  it("says it could not be loaded rather than that none were raised", async () => {
    api.mockImplementation(base(() => Promise.reject(new Error("Network request failed"))));

    mount();

    expect(await screen.findByText(/could not be loaded just now/)).toBeTruthy();
    expect(screen.getByText("Not loaded")).toBeTruthy();
    expect(screen.queryByText("None raised")).toBeNull();
    expect(screen.queryByText(/Nothing raised yet/)).toBeNull();
  });

  it("offers a retry that shows the tickets once the read works", async () => {
    let fail = true;
    api.mockImplementation(
      base(() =>
        fail
          ? Promise.reject(new Error("Network request failed"))
          : Promise.resolve({
              tickets: [
                {
                  _id: "t1",
                  reference: "SUP-0042",
                  title: "QUIV will not activate",
                  status: "open",
                  createdAt: "2026-09-20T09:00:00.000Z",
                },
              ],
            }),
      ),
    );

    mount();
    await screen.findByText(/could not be loaded just now/);

    fail = false;
    fireEvent.click(screen.getByText("Try again"));

    await waitFor(() => expect(screen.getByText("QUIV will not activate")).toBeTruthy());
    expect(screen.getByText("1 raised")).toBeTruthy();
    expect(screen.queryByText(/could not be loaded just now/)).toBeNull();
  });

  it("still says nothing was raised when the read works and there is nothing", async () => {
    api.mockImplementation(base(() => Promise.resolve({ tickets: [] })));

    mount();

    expect(await screen.findByText(/Nothing raised yet/)).toBeTruthy();
    expect(screen.getByText("None raised")).toBeTruthy();
    expect(screen.queryByText(/could not be loaded just now/)).toBeNull();
  });
});
