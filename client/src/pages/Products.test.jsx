// The "View all" control under the Physical Trainings section on /products.
//
// It used to navigate to /trainings — the ONLINE course list, which reads GET
// /trainings and links to /trainings/:id — so a reader who had just scrolled a
// row of physical trainings arrived at a page holding none of them. The button
// now opens the rest of the same list in place, on the page the detail view's
// breadcrumb already names as the parent (417e40b).

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// framer-motion's whileInView (components/effects.jsx) needs an observer that
// jsdom does not ship. Nothing here depends on scroll, so a no-op is enough.
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
globalThis.IntersectionObserver = NoopObserver;

vi.mock("../store.jsx", async (orig) => ({
  ...(await orig()),
  useAuth: () => ({ accessToken: "", user: null }),
}));

const { default: Products } = await import("./Products.jsx");

/** n published physical trainings, as GET /ptrainings/events returns them. */
const events = (n) =>
  Array.from({ length: n }, (_, i) => ({
    _id: `e${i + 1}`,
    slug: `training-${i + 1}`,
    title: `Physical training ${i + 1}`,
    startAt: "2026-11-02T09:00:00.000Z",
    priceNGN: 250000,
  }));

const mount = (list) => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url) => {
      const u = String(url);
      const body = u.includes("/ptrainings/events")
        ? list
        : u.includes("/coupons/active")
          ? { items: [] }
          : { items: [], total: 0, page: 1, pageSize: 60 };
      return Promise.resolve({ ok: true, json: async () => body });
    }),
  );
  return render(
    <MemoryRouter initialEntries={["/products"]}>
      <Products />
    </MemoryRouter>,
  );
};

const cards = () => screen.queryAllByText(/^Physical training \d+$/);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the Physical Trainings section on /products", () => {
  it("keeps the reader on this page and opens the rest of the list", async () => {
    mount(events(9));
    await waitFor(() => expect(cards()).toHaveLength(6));

    const button = screen.getByRole("button", { name: "View all 9" });
    // The bug was that this was a link away to a list without these events.
    expect(button.closest("a")).toBeNull();
    expect(button.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(button);

    expect(cards()).toHaveLength(9);
    expect(screen.getByText("Physical training 9")).toBeTruthy();
    const back = screen.getByRole("button", { name: "Show fewer" });
    expect(back.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(back);
    expect(cards()).toHaveLength(6);
  });

  it("offers no 'View all' when the preview is already the whole list", async () => {
    mount(events(4));
    await waitFor(() => expect(cards()).toHaveLength(4));
    expect(screen.queryByRole("button", { name: /View all/ })).toBeNull();
  });

  it("offers no 'View all' when nothing is published", async () => {
    mount([]);
    await screen.findByText("No trainings published yet.");
    expect(screen.queryByRole("button", { name: /View all/ })).toBeNull();
  });
});
