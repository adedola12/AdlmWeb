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
        const { products, bySlug } = await fetchChangelogs();
        // Only replace the bundled seed if the API actually returned products;
        // an empty DB shouldn't blank out the page.
        if (!cancelled && products.length) {
          setState({ products, bySlug, loading: false, source: "api" });
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
