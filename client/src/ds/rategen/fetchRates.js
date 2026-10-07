// Every rate in the library, not the first page of it.
//
// /rategen-v2/library/rates/sync is a cursor route: it answers at most `limit`
// documents and hands back `nextCursor` when more exist. Both RateGen screens
// asked for 500 and threw the cursor away, so a practice with a bigger
// catalogue quietly saw part of its own library — and the build-up screen
// could not open a rate that happened to sit past the first page, answering
// "that rate is not in this library" about a rate that is.
//
// TWO THINGS THE PAGING HAS TO GET RIGHT THAT ONE PAGE HID
//
//  - The route narrows each page to the best row per rate for the caller's
//    location AFTER the limit is applied (pickBestByLocation in
//    server/routes/rategen.library.js), so a page can come back shorter than
//    `limit` while more pages exist. `nextCursor` is the only honest signal of
//    "there is more", and it is what this follows.
//
//  - That narrowing is per page, so the state row and the zone row of the same
//    rate can arrive on different pages. Two rows with the same name carrying
//    two different figures is the one thing a rate library must never show, so
//    the pages are narrowed once more here, by the same rule and against the
//    location the route itself reports.
//
// Nothing is dropped that the server did not already choose to send: a row
// whose name has not been seen is always kept, and a second row for a name is
// only preferred when it is a closer match for the location.

/** One page's worth. The route's own default is 250 and its ceiling 1,000. */
export const RATE_PAGE = 500;

/**
 * A stop, so a runaway cursor cannot spin forever. 40 pages of 500 is 20,000
 * rates; a library past that is reported as truncated rather than silently cut.
 */
export const MAX_RATE_PAGES = 40;

const identity = (r) =>
  `${r?.sectionKey || ""}|${r?.description || ""}|${r?.unit || ""}`;

const rank = (r, loc = {}) => {
  if (r?.state && loc.state && r.state === loc.state) return 3;
  if (r?.zone && loc.zone && r.zone === loc.zone) return 2;
  if (!r?.state && !r?.zone) return 1;
  return 0;
};

/** One row per rate: the closest match for where the caller works. */
export function narrowToLocation(items = [], location = {}) {
  const best = new Map();
  const order = [];
  for (const r of items) {
    const k = identity(r);
    const cur = best.get(k);
    if (!cur) {
      best.set(k, r);
      order.push(k);
      continue;
    }
    if (rank(r, location) > rank(cur, location)) best.set(k, r);
  }
  return order.map((k) => best.get(k));
}

/**
 * Follow the cursor to the end of the library.
 *
 * `fetchPage({ limit, cursor })` is the caller's own request — kept out of here
 * so this stays testable without a network or a token.
 *
 * Returns { items, truncated, pages }. `truncated` means the route still had a
 * cursor when the page stop was reached, and the screen must say so rather
 * than presenting a partial library as the whole one.
 */
export async function fetchAllRates(fetchPage, { limit = RATE_PAGE, maxPages = MAX_RATE_PAGES } = {}) {
  const items = [];
  let location = {};
  let cursor = null;
  let pages = 0;
  let truncated = false;

  for (;;) {
    const page = await fetchPage({ limit, cursor });
    const batch = Array.isArray(page?.items) ? page.items : [];
    items.push(...batch);
    if (page?.location) location = page.location;
    pages += 1;
    cursor = page?.nextCursor || null;
    if (!cursor) break;
    if (pages >= maxPages) {
      truncated = true;
      break;
    }
  }

  return { items: narrowToLocation(items, location), truncated, pages };
}
