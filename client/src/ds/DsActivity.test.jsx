// The full activity trail, in the new build rather than the classic one.
//
// WHAT BROKE, AND WHY A RENDER TEST
//
// "All activity" on the Manage overview, and the "Activity log" button in
// Settings, both pointed at /profile — the classic Profile page. The new build
// had two doors in it leading back to the old site, and the full log had no
// new-design page at all.
//
// This renders the real component rather than importing it, because a module
// that loads fine still white-screens the page if a JSX identifier is undefined
// — the failure mode the repo has already been bitten by once. A test that only
// imports passes straight through it.
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const api = vi.fn();

vi.mock("../store.jsx", async (orig) => ({
  ...(await orig()),
  useAuth: () => ({ accessToken: "test-token", user: { _id: "u1", email: "qs@example.com" } }),
}));
// api.js only re-exports from http.js, so http.js is the one to mock.
vi.mock("../http.js", async (orig) => ({
  ...(await orig()),
  apiAuthed: (...args) => api(...args),
}));

const { default: DsActivity } = await import("./DsActivity.jsx");

const ROW = (over = {}) => ({
  _id: "a1",
  action: "Budget updated",
  summary: "revised the concrete rates",
  projectName: "Lekki Tower",
  category: "commercial",
  createdAt: new Date("2026-10-03T09:15:00Z").toISOString(),
  ...over,
});

const page = (items, over = {}) => ({
  items,
  pagination: { page: 1, pages: 1, total: items.length, limit: 20, hasPrev: false, hasNext: false, ...over },
});

const mount = () =>
  render(
    <MemoryRouter>
      <DsActivity />
    </MemoryRouter>,
  );

// mockClear, not mockReset. Reset strips the implementation, so between tests
// the mock briefly answers `undefined` — and a component whose effect is still
// in flight from the previous test then chains onto a non-promise. Clearing the
// call record while leaving a benign default keeps every test starting from a
// mock that at least returns something awaitable.
beforeEach(() => {
  api.mockClear();
  api.mockResolvedValue(page([]));
});
afterEach(cleanup);

describe("the activity trail", () => {
  it("renders the real events", async () => {
    api.mockResolvedValue(page([ROW()]));
    mount();
    await waitFor(() => expect(screen.getByText("Budget updated")).toBeTruthy());
    // The project is what makes a line answerable in a dispute.
    expect(screen.getByText(/Lekki Tower/)).toBeTruthy();
  });

  it("asks the server for the page and limit, not for everything", async () => {
    api.mockResolvedValue(page([ROW()]));
    mount();
    await waitFor(() => expect(api).toHaveBeenCalled());
    const [path, opts] = api.mock.calls[0];
    expect(path).toBe("/me/activity");
    expect(opts.params.page).toBe(1);
    expect(opts.params.limit).toBe(20);
    // No category on the unfiltered read — sending category:"" would filter on
    // the empty string server-side and return nothing.
    expect(opts.params.category).toBeUndefined();
  });

  it("filters by category, and goes back to page one when it changes", async () => {
    api.mockResolvedValue(page([ROW()], { pages: 4, hasNext: true }));
    mount();
    await waitFor(() => expect(api).toHaveBeenCalled());

    fireEvent.click(screen.getByText("Next"));
    await waitFor(() => expect(api.mock.calls.at(-1)[1].params.page).toBe(2));

    fireEvent.click(screen.getByText("Valuation"));
    await waitFor(() => {
      const last = api.mock.calls.at(-1)[1].params;
      expect(last.category).toBe("valuation");
      // THE BUG THIS CATCHES: staying on page 2 of a filter with one page shows
      // an empty screen and tells the customer nothing happened when it did.
      expect(last.page).toBe(1);
    });
  });

  it("says nothing happened only when nothing happened", async () => {
    api.mockResolvedValue(page([]));
    mount();
    await waitFor(() => expect(screen.getByText(/Nothing has happened/)).toBeTruthy());
  });

  it("a failed read is not an empty log", async () => {
    // The same mistake the support screen made: catching to [] and then
    // rendering "nothing yet" tells somebody with a full history they have none.
    api.mockImplementation(() => {
      const p = Promise.reject(new Error("Network request failed"));
      // vi.fn keeps every return value in mock.results, and that recorded
      // reference is a rejected promise nobody awaits — which the runner
      // reports as an unhandled rejection and attributes to this test, even
      // though the component does catch its own copy. Marking it handled here
      // changes nothing about what the component sees.
      p.catch(() => {});
      return p;
    });
    mount();
    expect(await screen.findByText(/did not load/i)).toBeTruthy();
    expect(screen.queryByText(/Nothing has happened/)).toBeNull();
  });

  it("hides the pager when there is only one page", async () => {
    api.mockResolvedValue(page([ROW()]));
    mount();
    await waitFor(() => expect(screen.getByText("Budget updated")).toBeTruthy());
    expect(screen.queryByText("Next")).toBeNull();
    expect(screen.queryByText("Previous")).toBeNull();
  });

  it("offers the printable report the classic tab had", async () => {
    // A re-skin that drops the report button is a removal, not a re-skin.
    api.mockResolvedValue(page([ROW()]));
    mount();
    await waitFor(() => expect(screen.getByText("Printable report")).toBeTruthy());
  });
});
