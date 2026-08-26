// Route element for one staged redesign page.
//
// Takes a manifest entry rather than children so the router can be built by
// mapping over the generated manifest without destructuring a component out of
// it — which reads as an unused variable to eslint's no-unused-vars.
//
// DsShell and every page component are lazy, so the staged redesign costs
// nothing to visitors on the real pages: the page components come to several
// hundred KB of JSX across the 25 of them.

import React from "react";
import { ScrollRestoration, useNavigate } from "react-router-dom";
import { MAP } from "../lib/dsRoutes.js";
import { DS_PAGES } from "./pages/manifest.js";
import AiAgent from "../components/AiAgent.jsx";

const DsShell = React.lazy(() => import("./DsShell.jsx"));
const DsAppShell = React.lazy(() => import("./DsAppShell.jsx"));
const DsLearnStyles = React.lazy(() => import("./DsLearnStyles.jsx"));
const DsAuthStyles = React.lazy(() => import("./DsAuthStyles.jsx"));
const DsDocStyles = React.lazy(() => import("./DsDocStyles.jsx"));

// Which of his six stylesheets a page needs, read straight off the <link>
// tags in his source. Only site.css is global; the other five are loaded per
// page, and porting site.css alone left every app screen, both auth screens
// and the document renderer with no styling of their own whatsoever.
const APP_SCREEN = /^(dash|work)-/;

// His admin screens bring their own chrome — .adm-shell wraps an .adm-rail
// that is part of the page, not stamped around it. So they get no shell of
// ours at all: DsShell would put the marketing nav above an admin panel, and
// DsAppShell would put the Manage rail beside his admin rail.
const BARE_SCREEN = /^admin-/;
const NEEDS_LEARN = new Set(["dash-learning", "dash-course", "dash-certificates", "work-home"]);
const NEEDS_AUTH = new Set(["login", "signup", "verify"]);
const NEEDS_DOC = new Set(["doc-preview", "quote"]);

// Real app path -> staged slug, so the preview can navigate to itself.
//
// Links in the ported markup point at the REAL routes, which is correct for
// when these pages are promoted. While they are staged, though, following one
// drops you out of the redesign and onto the current page — click QUIV in the
// new nav and you land on the old product page, which makes the redesign
// impossible to review as a whole. Inside /preview/* those links are
// redirected to their staged counterpart; anything without one (trainings,
// support, the SEO landing pages) still goes to the real route.
const SLUG_TO_KEY = { home: "index" };

// His page name -> the staged route for it. index.html is served at
// /preview/home; everything else keeps his own file name as its slug.
const STAGED = new Map(
  DS_PAGES.map(({ slug }) => [SLUG_TO_KEY[slug] || slug, `/preview/${slug}`]),
);

// Fallback for links that carry no data-ds-page (hand-authored pages, and the
// preview index). Keyed on the resolved app route.
const PREVIEW_OF = new Map(
  DS_PAGES.map(({ slug }) => [MAP[SLUG_TO_KEY[slug] || slug], `/preview/${slug}`]).filter(
    ([real]) => typeof real === "string",
  ),
);

/**
 * @param {object} props
 * @param {{ Component: React.ComponentType }} props.page  entry from manifest.js
 */
export default function DsPreview({ page }) {
  const navigate = useNavigate();
  const Page = page.Component;

  const onClickCapture = React.useCallback(
    (e) => {
      // Leave modified clicks alone — they mean "open elsewhere".
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const a = e.target.closest?.("a[href]");
      if (!a || a.target === "_blank") return;

      const href = a.getAttribute("href");
      if (!href || !href.startsWith("/")) return;

      const [path, hash] = href.split("#");

      // His own page name, recorded by the porter. This is the authority: it
      // routes exactly where his site routes, with no judgement about which of
      // our pages a given page of his corresponds to. The route map is only a
      // fallback for links that predate the attribute.
      const hisPage = a.getAttribute("data-ds-page");
      const staged = (hisPage && STAGED.get(hisPage)) || PREVIEW_OF.get(path);
      if (!staged) return;

      e.preventDefault();
      navigate(hash ? `${staged}#${hash}` : staged);
    },
    [navigate],
  );

  // The mobile drawer is built by useDsBehaviours with a native click
  // listener, which fires before the React handler above — so the drawer needs
  // the same staged-route mapping handed to it directly.
  const mapHref = React.useCallback((href, hisPage) => {
    if (!href || !href.startsWith("/")) return href;
    const [path, hash] = href.split("#");
    const staged = (hisPage && STAGED.get(hisPage)) || PREVIEW_OF.get(path);
    if (!staged) return href;
    return hash ? `${staged}#${hash}` : staged;
  }, []);

  // His app screens are not marketing pages: they carry the rail and the app
  // bar instead of the nav and the footer. Rendering them inside DsShell put
  // "Book a demo" above a signed-in dashboard — which is what his own build
  // does, and is on the snag list for him rather than reproduced here.
  const isApp = APP_SCREEN.test(page.slug);
  const isBare = BARE_SCREEN.test(page.slug);
  const Shell = isBare ? React.Fragment : isApp ? DsAppShell : DsShell;
  const shellProps = isBare
    ? {}
    : isApp
      ? { title: page.title, page: page.slug }
      : { mapHref };

  return (
    <div onClickCapture={onClickCapture}>
      {/* App.jsx renders this for the real routes, but the preview routes are
          deliberately outside <App /> (see main.jsx) so they never inherited
          it. Without it a click from halfway down one long page opens the next
          one already scrolled to that offset. */}
      <ScrollRestoration />
      <React.Suspense fallback={null}>
        {NEEDS_LEARN.has(page.slug) && <DsLearnStyles />}
        {NEEDS_AUTH.has(page.slug) && <DsAuthStyles />}
        {NEEDS_DOC.has(page.slug) && <DsDocStyles />}
        <Shell {...shellProps}>
          <Page />
        </Shell>
        {/* Ada, for the same reason ScrollRestoration is here: App.jsx mounts
            her for the real routes, and the preview routes sit outside <App />
            so they never inherited her. Richard put a floating Ada on every
            page of his build and she was missing from all 53 ported ones —
            visible as an "Ask Ada" button on the live site and nothing at all
            on /preview/*.

            Ours, not his. His answers from keywords over published copy; this
            one is Claude-backed through /agent/chat, grounded in the
            catalogue, and already works signed out. */}
        <AiAgent />
      </React.Suspense>
    </div>
  );
}
