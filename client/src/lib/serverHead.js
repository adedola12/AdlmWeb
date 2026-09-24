// A collector that lets <Seo> report its tags during a server render.
//
// <Seo> writes into document.head from an effect. Effects do not run under
// renderToString, so on the server the same props are pushed here instead and
// the Vercel function stamps them into the HTML it sends. That is what puts
// JSON-LD in the raw response — the schemas in lib/schema.js were already
// correct, they were just being injected by JavaScript a crawler never ran.
//
// SAFETY OF MODULE-LEVEL STATE: renderToString is synchronous. The function
// calls resetHead(), renders, then collectHead(), with no await in between, so
// two requests cannot interleave into the same store. Nothing here is reachable
// in the browser bundle — every call site is behind an import.meta.env.SSR
// check, so the whole file tree-shakes out of the client build.

let store = null;

export function resetHead() {
  store = { title: null, description: null, canonical: null, jsonLd: [] };
}

/**
 * Called by <Seo> during a server render. Last writer wins for the scalar
 * fields; JSON-LD accumulates because a page may legitimately carry several
 * blocks (Organization + WebSite, or SoftwareApplication + BreadcrumbList).
 */
export function pushHead({ title, description, canonical, jsonLd }) {
  if (!store) return;
  if (title) store.title = title;
  if (description) store.description = description;
  if (canonical) store.canonical = canonical;
  if (jsonLd) {
    for (const block of Array.isArray(jsonLd) ? jsonLd : [jsonLd]) {
      if (block) store.jsonLd.push(block);
    }
  }
}

export function collectHead() {
  return store || { title: null, description: null, canonical: null, jsonLd: [] };
}
