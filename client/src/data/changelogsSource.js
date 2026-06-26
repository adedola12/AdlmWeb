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

// Merge DB/API products OVER the bundled set, per slug. The bundled set (from
// markdown) is the floor: every site product keeps rendering even if only some
// are saved in the DB. This is the safety property that lets the admin editor
// persist one product without blanking the others.
//
// Tie-breaking rule: prefer whichever source has MORE releases. This means:
//   - DB wins when the admin has added releases the bundled file doesn't have yet.
//   - Bundled wins when changelogs.js has been updated with new releases that
//     haven't been pushed to the DB yet (e.g. a newly-live product or a new version
//     added directly to the file). Equal counts → DB wins (preserves admin edits).
function mergeBySlug(base, overrides) {
  const map = new Map((base || []).map((p) => [p.slug, p]));
  for (const p of overrides || []) {
    if (!p?.slug) continue;
    const bundled = map.get(p.slug);
    // Only let the DB override if it has at least as many releases as the bundle.
    if (bundled && (p.releases?.length || 0) < (bundled.releases?.length || 0)) continue;
    map.set(p.slug, p);
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
