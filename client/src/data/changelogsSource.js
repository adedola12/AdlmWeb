// src/data/changelogsSource.js
//
// Single access point for "What's New" changelog data. The public pages used to
// import the bundled `products` from changelogs.js directly; they now go through
// useChangelogs(), which:
//   1. renders immediately with the bundled, markdown-generated data (fast first
//      paint + works offline / before the DB is seeded), then
//   2. fetches the live data from the admin-managed API and swaps it in if the
//      request succeeds and returns at least one product.
//
// The API and the bundled file share an IDENTICAL product/release shape (the
// server's serializePublic() mirrors gen-changelogs.mjs), so consumers don't
// care which source won.
import React from "react";
import { API_BASE } from "../config";
import { products as seedProducts, bySlug as seedBySlug } from "./changelogs.js";

export { seedProducts, seedBySlug };

function indexBySlug(list) {
  return Object.fromEntries((list || []).map((p) => [p.slug, p]));
}

// Merge DB/API products with the bundled set, per slug.
//
// Strategy (two-tier):
//   1. Product METADATA (name, tagline, category, status, summary, compatibility,
//      accent, icon, order) — always taken from the BUNDLED file (changelogs.js).
//      These are code-managed fields; the DB should never override them, which
//      prevents stale DB records from e.g. showing a wrong category or keeping a
//      product as "coming-soon" after it goes live in the codebase.
//   2. RELEASES array — take whichever source has more entries. DB wins on a tie
//      so that admin-edited release text is preserved. Bundled wins when the
//      developer has added new releases that haven't been synced to the DB yet.
//
// Products that exist in the DB but not in the bundle are included as-is.
function mergeBySlug(base, overrides) {
  const map = new Map((base || []).map((p) => [p.slug, p]));
  for (const p of overrides || []) {
    if (!p?.slug) continue;
    const bundled = map.get(p.slug);
    if (bundled) {
      const dbReleases = p.releases?.length || 0;
      const bundledReleases = bundled.releases?.length || 0;
      const releases = dbReleases >= bundledReleases ? p.releases : bundled.releases;
      // Recompute derived display fields from the winning releases.
      const latest = releases.length ? (releases.find((r) => r.latest)?.version ?? releases[0]?.version ?? bundled.latest) : bundled.latest;
      const lastUpdated = releases.length ? (releases[0]?.date ?? bundled.lastUpdated) : bundled.lastUpdated;
      const itemCount = releases.reduce((n, r) => n + r.changes.reduce((m, c) => m + (c.items?.length || 0), 0), 0) || bundled.itemCount;
      map.set(p.slug, { ...bundled, releases, latest, lastUpdated, itemCount });
    } else {
      map.set(p.slug, p);
    }
  }
  return [...map.values()].sort(
    (a, b) => (a.order ?? 999) - (b.order ?? 999) || String(a.name).localeCompare(String(b.name)),
  );
}

// Fetch the live product list from the API. Throws on network / HTTP error.
export async function fetchChangelogs() {
  if (!API_BASE) throw new Error("API base not configured");
  const res = await fetch(`${API_BASE}/changelogs`, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const products = Array.isArray(data?.products) ? data.products : [];
  return { products, bySlug: indexBySlug(products) };
}

// Hook: bundled data first, live API data once it arrives.
//   { products, bySlug, loading, source }  — source is "seed" | "api".
export function useChangelogs() {
  const [state, setState] = React.useState(() => ({
    products: seedProducts,
    bySlug: seedBySlug,
    loading: true,
    source: "seed",
  }));

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { products } = await fetchChangelogs();
        // Merge DB products OVER the bundled seed per slug (don't replace the
        // whole set) so a partially-populated DB never hides bundled products.
        if (!cancelled && products.length) {
          const merged = mergeBySlug(seedProducts, products);
          setState({ products: merged, bySlug: indexBySlug(merged), loading: false, source: "api" });
        } else if (!cancelled) {
          setState((s) => ({ ...s, loading: false }));
        }
      } catch {
        // API down / not configured — keep the bundled data.
        if (!cancelled) setState((s) => ({ ...s, loading: false }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
