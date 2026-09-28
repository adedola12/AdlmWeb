// /products shows the Physical Trainings section only when there is something
// in it, or when the read failed and says so. With nothing published it was an
// empty shelf on the catalogue page (owner, 27 Sep 2026).

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// jsdom has no IntersectionObserver; the page's reveal animations use it.
globalThis.IntersectionObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
};

vi.mock("../store.jsx", async (orig) => ({
  ...(await orig()),
  useAuth: () => ({ accessToken: null, user: null }),
}));

const { default: Products } = await import("./Products.jsx");

function serve(events) {
  globalThis.fetch = vi.fn(async (url) => {
    const u = String(url);
    if (u.includes("/ptrainings/events")) {
      if (events === "fail") return new Response("<!doctype html>", { status: 500 });
      return new Response(JSON.stringify(events), { status: 200 });
    }
    return new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 });
  });
}

const mount = () =>
  render(
    <MemoryRouter initialEntries={["/products"]}>
      <Products />
    </MemoryRouter>,
  );

const trainingsAsked = () =>
  globalThis.fetch.mock.calls.some(([u]) => String(u).includes("/ptrainings/events"));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Products: Physical Trainings section", () => {
  it("is not on the page when nothing is published", async () => {
    serve([]);
    mount();
    await waitFor(() => expect(trainingsAsked()).toBe(true));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText("Physical Trainings")).toBeNull();
    expect(screen.queryByText(/No trainings published yet/)).toBeNull();
  });

  it("shows when there is an event", async () => {
    serve([{ _id: "e1", key: "lagos-oct", title: "Revit QS Bootcamp", priceNGN: 50000, startAt: "2099-10-01T09:00:00Z" }]);
    mount();
    expect(await screen.findByText("Physical Trainings")).toBeTruthy();
  });

  it("shows when the read failed, so a failure is not mistaken for an empty shelf", async () => {
    serve("fail");
    mount();
    expect(await screen.findByText("Physical Trainings")).toBeTruthy();
  });
});
