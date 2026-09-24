// Carries data the server already fetched through to the browser.
//
// WHY IT IS NEEDED
// Server-rendering a page that loads its content in an effect is only half a
// fix. The server produces the full page, then the browser's first render runs
// with empty state and produces a loading skeleton instead. React sees two
// different trees, throws the server HTML away, and the visitor watches the
// finished page get replaced by a spinner. The crawler is happy; everyone else
// is worse off than before.
//
// So the data has to travel with the HTML. The server stashes what it fetched,
// the function serialises it into the page, and the component seeds its initial
// state from it on both sides. Same input, same first render, clean hydration.
//
// The store is read-only in the browser — nothing writes to it after boot, so
// there is no cache to invalidate. Once a component has seeded its state, the
// normal effects take over and refresh as they always did.

let serverStore = null;

/** Server-side: start a fresh store for one request. */
export function resetPreload() {
  serverStore = {};
}

/** Server-side: record a fetched payload under a stable key. */
export function setPreloaded(key, value) {
  if (serverStore) serverStore[key] = value;
}

/** Server-side: everything gathered, for serialising into the response. */
export function collectPreload() {
  return serverStore || {};
}

/**
 * Both sides: read a payload seeded by the server.
 *
 * Returns undefined when there is nothing — which is the normal case for every
 * route that is not server-rendered, and the signal for a component to fetch
 * the way it always has.
 */
export function readPreloaded(key) {
  if (import.meta.env.SSR) return serverStore ? serverStore[key] : undefined;
  if (typeof window === "undefined") return undefined;
  return window.__ADLM_PRELOAD__ ? window.__ADLM_PRELOAD__[key] : undefined;
}
