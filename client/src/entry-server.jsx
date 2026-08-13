// Server entry. Turns a URL into the HTML that goes inside <div id="root">.
//
// This is imported by the Vercel function in src/api/meta.js, which already
// owned per-route <head> tags. Body HTML is the half that was missing: the app
// shipped one empty shell for every URL, so a crawler that does not run
// JavaScript saw a page with no heading, no copy and no links. Bing indexed
// exactly that.
//
// THE ONE RULE FOR THIS FILE: it must never throw upward. A render failure has
// to degrade to the client-only shell, which is what every page was before, not
// to a 500 on a live page that takes payments. Every entry point here is
// wrapped, and the caller treats a null return as "serve the shell".
import React from "react";
import { renderToString } from "react-dom/server";
import {
  createStaticHandler,
  createStaticRouter,
  StaticRouterProvider,
} from "react-router";

import { ThemeProvider } from "./theme.jsx";
import { AuthProvider } from "./store.jsx";
import { StepUpProvider } from "./features/security/useStepUp.jsx";
import { marketingRoutes } from "./routes.marketing.jsx";
import { collectHead, resetHead } from "./lib/serverHead.js";
import { collectPreload, resetPreload, setPreloaded } from "./lib/preload.js";

const handler = createStaticHandler(marketingRoutes);

const API_BASE = String(process.env.VITE_API_BASE || "https://api.adlmstudio.net")
  .trim()
  .replace(/\/+$/, "");

/**
 * Fetch, with a hard ceiling.
 *
 * This runs inside a request a visitor is waiting on, and a crawler will not
 * wait long. A slow API has to lose: rendering the page without its data still
 * produces the heading, the copy and the links, which is most of what this
 * whole exercise is for.
 */
async function fetchJson(url, ms = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    // The status is carried out, not collapsed into null. "The API says this
    // product does not exist" and "the API did not answer in time" look
    // identical otherwise, and they call for opposite responses: one is a real
    // 404, the other must never be.
    if (!res.ok) return { data: null, status: res.status };
    return { data: await res.json(), status: res.status };
  } catch {
    return { data: null, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * List endpoints whose contents ARE the page.
 *
 * A course catalogue rendered from an effect is an empty <ul> on the server —
 * the page scores forty words and indexes as thin. Fetching the list here is
 * what turns those routes into pages about something. Each entry is
 * `path: [preloadKey, url]`, and all of them are fetched concurrently.
 */
const LIST_PRELOADS = {
  "/learn": ["learn:courses", `${API_BASE}/learn/courses`],
  "/trainings": ["trainings:list", `${API_BASE}/trainings`],
  "/quote": ["quote:products", `${API_BASE}/products?page=1&pageSize=200`],
  "/products": ["products:list", `${API_BASE}/products?page=1&pageSize=200`],
};

/**
 * Load the data a route needs before it renders.
 *
 * @returns {Promise<{gone: boolean}>} gone is true only when the API positively
 *          confirmed the record does not exist.
 */
async function preloadFor(pathname) {
  const clean = pathname.replace(/\/+$/, "") || "/";

  const list = LIST_PRELOADS[clean];
  if (list) {
    const [key, url] = list;
    const { data } = await fetchJson(url);
    if (data) setPreloaded(key, data);
    return { gone: false };
  }

  const match = clean.match(/^\/product\/([^/]+)$/i);
  if (!match) return { gone: false };

  const key = decodeURIComponent(match[1]).trim();
  const { data, status } = await fetchJson(
    `${API_BASE}/products/${encodeURIComponent(key)}`,
  );

  if (data?.name) {
    setPreloaded(`product:${key}`, data);
    return { gone: false };
  }

  // A timeout, a 500 or a network failure leaves the page at 200 rendering its
  // own empty state. Telling a crawler a real product is gone because the API
  // had a bad minute would cost the page its indexing for far longer than the
  // outage lasts.
  return { gone: status === 404 };
}

/**
 * Render one URL.
 *
 * @param {string} url absolute URL of the incoming request
 * @returns {Promise<{html: string, head: object}|null>} null if rendering
 *          failed or the router wanted to redirect — caller serves the shell.
 */
export async function render(url) {
  try {
    resetHead();
    resetPreload();

    const { gone } = await preloadFor(new URL(url).pathname);

    const context = await handler.query(new Request(url, { method: "GET" }));

    // A Response means the router redirected or errored out. Neither is
    // something we can usefully inline into a shell, so hand back to the
    // client router and let it decide.
    if (context instanceof Response) return null;

    const html = renderToString(
      <React.StrictMode>
        <ThemeProvider>
          <AuthProvider>
            <StepUpProvider>
              <StaticRouterProvider
                router={createStaticRouter(handler.dataRoutes, context)}
                context={context}
                hydrate={false}
              />
            </StepUpProvider>
          </AuthProvider>
        </ThemeProvider>
      </React.StrictMode>,
    );

    // Serving "page not found" under a 200 is a soft 404: search engines index
    // the URL, find nothing there, and lose confidence in the rest of the site.
    // Two ways to end up on one — the catch-all route matched, or the product
    // this URL names is confirmed absent — and both should carry a real status.
    const notFound =
      gone || (context.matches?.some((m) => m.route?.path === "*") ?? false);

    return {
      html,
      head: collectHead(),
      preload: collectPreload(),
      notFound,
    };
  } catch (err) {
    // Logged, not raised. Vercel captures this and the visitor still gets a
    // working page.
    console.error(`[ssr] render failed for ${url}:`, err?.stack || err);
    return null;
  }
}

export default render;
