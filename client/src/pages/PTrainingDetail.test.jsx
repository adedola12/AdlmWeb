// What a physical training's page actually emits, read back out of <head>.
//
// Two of the things checked here are only wrong when the page is rendered:
// the breadcrumb trail is built inline in the page, and the Event block is
// built from the record the page itself fetched. The third is the empty-value
// placeholder the page prints when the record has no description.

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("../store.jsx", async (orig) => ({
  ...(await orig()),
  useAuth: () => ({ accessToken: "", user: null }),
}));

const { default: PTrainingDetail } = await import("./PTrainingDetail.jsx");

const EVENT = {
  _id: "e1",
  slug: "lagos-5d-bim",
  title: "5D BIM intensive, Lagos",
  subtitle: "Four days, from model to priced bill.",
  startAt: "2026-11-02T09:00:00.000Z",
  endAt: "2026-11-05T16:00:00.000Z",
  status: "open",
  pricing: { normalNGN: 250000, groupOf3NGN: 600000, earlyBird: { priceNGN: 0, endsAt: null } },
  location: { name: "ADLM Studio", address: "12 Example Road", city: "Lagos", state: "Lagos" },
  capacityApproved: 20,
  approvedCount: 4,
};

const mount = (event) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: async () => event })),
  );
  return render(
    <MemoryRouter initialEntries={[`/ptrainings/${event.slug}`]}>
      <Routes>
        <Route path="/ptrainings/:key" element={<PTrainingDetail />} />
      </Routes>
    </MemoryRouter>,
  );
};

/** Every JSON-LD block the page wrote into <head>. */
const blocks = () =>
  [...document.head.querySelectorAll('script[type="application/ld+json"]')].map((s) =>
    JSON.parse(s.textContent),
  );

const blockOf = (type) => blocks().find((b) => b["@type"] === type);

beforeEach(() => {
  document.head.querySelectorAll('script[type="application/ld+json"]').forEach((n) => n.remove());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("a physical training page", () => {
  it("puts the event under a page that genuinely lists it", async () => {
    mount(EVENT);
    await screen.findByText("5D BIM intensive, Lagos");
    await waitFor(() => expect(blockOf("BreadcrumbList")).toBeTruthy());

    const trail = blockOf("BreadcrumbList").itemListElement.map((c) => [c.name, c.item]);
    expect(trail).toEqual([
      ["Home", "https://www.adlmstudio.net/"],
      ["Products", "https://www.adlmstudio.net/products"],
      ["5D BIM intensive, Lagos", "https://www.adlmstudio.net/ptrainings/lagos-5d-bim"],
    ]);
    // /trainings is the ONLINE course list and carries no physical training.
    expect(trail.some(([, url]) => url.endsWith("/trainings"))).toBe(false);
  });

  it("does not offer a seat the page says is gone", async () => {
    mount({ ...EVENT, approvedCount: 20 });
    await screen.findByText("Enrollment Closed");
    await waitFor(() => expect(blockOf("Event")).toBeTruthy());

    expect(blockOf("Event").offers.availability).toBe("https://schema.org/SoldOut");
  });

  it("offers the seat while the page is still taking registrations", async () => {
    mount(EVENT);
    await screen.findByText("Register Now");
    await waitFor(() => expect(blockOf("Event")).toBeTruthy());

    expect(blockOf("Event").offers.availability).toBe("https://schema.org/InStock");
    expect(blockOf("Event").offers.price).toBe("250000");
  });

  it("prints an en dash for a value the record does not have", async () => {
    mount({ ...EVENT, description: "", fullDescription: "" });
    await screen.findByText("Program Overview");

    // House rule: an empty value is "–", never "—".
    expect(document.body.textContent).toContain("–");
    expect(document.body.textContent).not.toContain("—");
  });
});
