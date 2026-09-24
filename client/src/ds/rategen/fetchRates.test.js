// S18 review, finding 6: the library was read one page deep.
//
// /library/rates/sync answers at most `limit` documents and hands back a
// cursor. The screens asked for 500 and dropped the cursor, so a practice with
// a bigger catalogue saw part of its own library and was told nothing about
// the rest.

import { describe, it, expect, vi } from "vitest";
import { fetchAllRates, narrowToLocation, RATE_PAGE } from "./fetchRates.js";

const rate = (id, extra = {}) => ({
  id,
  sectionKey: "blockwork",
  description: `Rate ${id}`,
  unit: "m2",
  ...extra,
});

/** A route that hands out `pages` pages of `size` rates each. */
function route(pages, size, location = { state: "lagos", zone: "south_west" }) {
  return vi.fn(async ({ cursor }) => {
    const page = cursor ? Number(cursor) : 0;
    const items = Array.from({ length: size }, (_, i) => rate(`p${page}-${i}`));
    return {
      items,
      location,
      nextCursor: page + 1 < pages ? String(page + 1) : null,
    };
  });
}

describe("fetchAllRates", () => {
  it("follows the cursor to the end instead of stopping at the first page", async () => {
    const fetchPage = route(3, 4);
    const out = await fetchAllRates(fetchPage, { limit: 4 });
    expect(out.items).toHaveLength(12);
    expect(out.pages).toBe(3);
    expect(out.truncated).toBe(false);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    // The first call carries no cursor; the rest carry the one they were given.
    expect(fetchPage.mock.calls[0][0].cursor).toBe(null);
    expect(fetchPage.mock.calls[1][0].cursor).toBe("1");
  });

  it("stops at one page when the route says there is no more", async () => {
    const fetchPage = route(1, 2);
    const out = await fetchAllRates(fetchPage);
    expect(out.items).toHaveLength(2);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage.mock.calls[0][0].limit).toBe(RATE_PAGE);
  });

  it("keeps reading while a page comes back short, because the route narrows after the limit", async () => {
    // The route applies its location filter AFTER the limit, so a page can be
    // shorter than `limit` while more pages exist. Page length is not a signal;
    // the cursor is.
    const fetchPage = vi.fn(async ({ cursor }) =>
      cursor
        ? { items: [rate("b")], nextCursor: null }
        : { items: [rate("a")], nextCursor: "1" },
    );
    const out = await fetchAllRates(fetchPage, { limit: 500 });
    expect(out.items.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("says so rather than cutting the library silently when the cursor never ends", async () => {
    const fetchPage = vi.fn(async () => ({ items: [rate(Math.random())], nextCursor: "more" }));
    const out = await fetchAllRates(fetchPage, { limit: 1, maxPages: 5 });
    expect(out.truncated).toBe(true);
    expect(out.pages).toBe(5);
    expect(fetchPage).toHaveBeenCalledTimes(5);
  });

  it("copes with a page that carries nothing", async () => {
    const out = await fetchAllRates(async () => ({}));
    expect(out.items).toEqual([]);
    expect(out.truncated).toBe(false);
  });
});

describe("narrowToLocation", () => {
  const loc = { state: "lagos", zone: "south_west" };

  it("shows one row per rate when the same rate arrives on two pages", () => {
    // The route picks the best row per page, so the Lagos row and the zone row
    // of one rate can arrive separately. Two rows, same name, two figures is
    // the one thing a rate library must never show.
    const rows = narrowToLocation(
      [
        { ...rate("z"), description: "Blockwork 225mm", zone: "south_west", state: null, totalCost: 1000 },
        { ...rate("l"), description: "Blockwork 225mm", state: "lagos", zone: "south_west", totalCost: 1200 },
      ],
      loc,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].totalCost).toBe(1200);
  });

  it("prefers the state row whichever page it arrived on", () => {
    const rows = narrowToLocation(
      [
        { ...rate("l"), description: "Blockwork 225mm", state: "lagos", totalCost: 1200 },
        { ...rate("z"), description: "Blockwork 225mm", zone: "south_west", state: null, totalCost: 1000 },
      ],
      loc,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].totalCost).toBe(1200);
  });

  it("keeps rates that are genuinely different", () => {
    const rows = narrowToLocation([rate("a"), { ...rate("b"), description: "Rate b" }], loc);
    expect(rows).toHaveLength(2);
  });

  it("keeps everything when the route reported no location", () => {
    const rows = narrowToLocation([rate("a"), { ...rate("b"), description: "Rate b" }], {});
    expect(rows).toHaveLength(2);
  });

  it("keeps the order the library was read in", () => {
    const rows = narrowToLocation(
      [
        { ...rate("a"), description: "A" },
        { ...rate("b"), description: "B" },
        { ...rate("c"), description: "C" },
      ],
      loc,
    );
    expect(rows.map((r) => r.description)).toEqual(["A", "B", "C"]);
  });
});
