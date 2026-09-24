// /products: the Physical Trainings section, and what either read says when
// it fails.
//
// The "View all" control used to navigate to /trainings — the ONLINE course
// list, which reads GET /trainings and links to /trainings/:id — so a reader
// who had just scrolled a row of physical trainings arrived at a page holding
// none of them. The button now opens the rest of the same list in place, on
// the page the detail view's breadcrumb already names as the parent (417e40b).
//
// The rest of the file is about telling the truth when something is missing:
// a session that has already run is not on offer, a read that failed is not an
// empty shelf, and whatever the exception said is for the console.

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

/** A date this many days from now, so these tests do not expire. */
const at = (days) => new Date(Date.now() + days * 86400000).toISOString();

/**
 * n published physical trainings, as GET /ptrainings/events returns them:
 * ascending by startAt, and with no regard to whether they have happened.
 */
const events = (n, { from = 1, number = 1 } = {}) =>
  Array.from({ length: n }, (_, i) => ({
    _id: `e${number + i}`,
    slug: `training-${number + i}`,
    title: `Physical training ${number + i}`,
    startAt: at(from + i),
    priceNGN: 250000,
  }));

/**
 * @param list what GET /ptrainings/events answers with
 * @param over whole Responses to use instead, per call, so the failure paths
 *             can be exercised: { trainings, products }
 */
const mount = (list, over = {}) => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url) => {
      const u = String(url);
      if (u.includes("/ptrainings/events") && over.trainings) return Promise.resolve(over.trainings);
      if (u.includes("/products?") && over.products) return Promise.resolve(over.products);
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

  // GET /ptrainings/events hands back every published event, oldest first and
  // never filtered, so without this the section opened on six workshops that
  // had already run — priced, and each with a button into the enrolment flow.
  it("shows the sessions that are still ahead, not the ones that have run", async () => {
    mount([...events(7, { from: -60 }), ...events(2, { from: 10, number: 8 })]);
    await waitFor(() => expect(cards()).toHaveLength(2));
    expect(screen.getByText("Physical training 8")).toBeTruthy();
    expect(screen.queryByText("Physical training 1")).toBeNull();
    expect(screen.queryByRole("button", { name: /View all/ })).toBeNull();
  });

  it("says nothing is scheduled rather than nothing is published, when a session has simply run", async () => {
    mount(events(3, { from: -60 }));
    await screen.findByText("No sessions are scheduled right now.");
    expect(screen.queryByText("No trainings published yet.")).toBeNull();
    expect(cards()).toHaveLength(0);
  });

  // A read that failed must not be reported as a shelf that is empty, and the
  // exception must not be what the visitor reads.
  describe("when the list cannot be read", () => {
    const failed = () => screen.findByText(/training dates could not be loaded/);

    it("does not call the section empty when the API answers 500", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      mount(null, { trainings: { ok: false, status: 500, json: async () => ({ error: "boom" }) } });
      await failed();
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("physical trainings"),
        expect.objectContaining({ message: "HTTP 500" }),
      );
      expect(screen.queryByText("No trainings published yet.")).toBeNull();
      expect(cards()).toHaveLength(0);
    });

    it("does not show the exception when the API answers with an HTML page", async () => {
      // What a CloudFront or gateway error page does to res.json().
      const thrown = new SyntaxError(`Unexpected token '<', "<!doctype "... is not valid JSON`);
      vi.spyOn(console, "error").mockImplementation(() => {});
      mount(null, {
        trainings: {
          ok: true,
          status: 200,
          json: async () => {
            throw thrown;
          },
        },
      });
      await failed();
      expect(screen.queryByText(/Unexpected token/)).toBeNull();
      expect(screen.queryByText(/doctype/)).toBeNull();
      // Still knowable by whoever has to diagnose it.
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining("physical trainings"), thrown);
    });
  });
});

// The catalogue read has the same two faults as the trainings read, on the
// page whose whole job is the catalogue.
describe("the product list on /products", () => {
  it("says the list could not be read instead of showing the exception", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mount([], {
      products: {
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError(`Unexpected token '<', "<!doctype "... is not valid JSON`);
        },
      },
    });

    await screen.findByText(/product list could not be loaded/);
    expect(screen.queryByText(/Unexpected token/)).toBeNull();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("catalogue"),
      expect.any(SyntaxError),
    );
  });

  it("does not turn a 500 into an empty catalogue", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mount([], { products: { ok: false, status: 500, json: async () => ({ error: "boom" }) } });

    await screen.findByText(/product list could not be loaded/);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("catalogue"),
      expect.objectContaining({ message: "HTTP 500" }),
    );
  });
});
