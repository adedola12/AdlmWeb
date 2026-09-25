// Which rail item is current (R04).
//
// Exactly one, or none. The rule is an EXACT route match against the rail
// config: the pathname equals an item's `to` (or one of its `also` routes,
// where :params match one segment), and any `query` the item names is present
// with that value. No prefix matching and no stored state — prefix matching is
// how Guides and Downloads both lit up when they shared a route.
//
// Only when nothing matches does the screen's own `page` name decide, through
// PAGE_ALIAS (the course player is part of "My learning").

import { PAGE_ALIAS, RAIL, railItems } from "../ds/railConfig.js";

function samePath(pattern, pathname) {
  const a = String(pattern || "").replace(/\/+$/, "") || "/";
  const b = String(pathname || "").replace(/\/+$/, "") || "/";
  const pa = a.split("/");
  const pb = b.split("/");
  if (pa.length !== pb.length) return false;
  return pa.every((seg, i) => (seg.startsWith(":") ? pb[i] !== "" : seg === pb[i]));
}

function queryMatches(query, search) {
  if (!query) return true;
  const params = new URLSearchParams(search || "");
  return Object.entries(query).every(([k, v]) => params.get(k) === v);
}

/**
 * @param {{pathname: string, search?: string, page?: string}} where
 * @returns {string|null} the id of the current item
 */
export function activeRailId({ pathname, search = "", page = "" }, rail = RAIL) {
  const items = railItems(rail).filter((it) => !it.action && !it.aliasOnly);

  // Items that carry a query are the more specific match, so they go first.
  const ordered = [...items.filter((it) => it.query), ...items.filter((it) => !it.query)];
  for (const it of ordered) {
    if (!queryMatches(it.query, search)) continue;
    if (samePath(it.to, pathname)) return it.id;
    if ((it.also || []).some((p) => samePath(p, pathname))) return it.id;
  }

  const alias = PAGE_ALIAS[page];
  if (alias && items.some((it) => it.id === alias)) return alias;
  if (page && items.some((it) => it.id === page)) return page;
  return null;
}

// The tabs a group offers: its own items, with a folded group (My tools)
// opened out in place, minus anything not built, not owned or not a page.
export function sectionTabs(rail, activeId, owned) {
  for (const g of rail) {
    if (!g.group) continue;
    const flat = g.items.flatMap((it) => (it.items ? it.items : [it]));
    if (!flat.some((it) => it.id === activeId)) continue;
    return flat.filter(
      (it) =>
        !it.action &&
        !it.aliasOnly &&
        it.ready !== false &&
        !(it.product && owned && !owned.has(it.product)),
    );
  }
  return [];
}
