// "Leaving the studio" — his card, on our routes.
//
// His shell.js intercepts any click inside the app that heads for a public
// marketing page and, instead of navigating, explains where that link goes and
// why it is not part of the signed-in app. The rail's "Lessons & events" is the
// one people meet: it looks like another app screen and is actually the public
// library.
//
// The reasoning survives the port intact even though our two halves are one
// React app rather than two sites. Following one of these links still drops the
// rail, the app bar and the account context and lands you in marketing chrome —
// which is exactly the surprise the card exists to prevent. His copy says the
// same thing about our build that it said about his.
//
// Markup and classes are his: .wk-modal.sh-leave, .wk-modal-c, .wk-modal-x,
// .sh-k, .sh-leave-a — all already in the ported sheets.

import React from "react";
import { useLocation } from "react-router-dom";

/**
 * Public destinations, keyed by our path. His list is keyed by his file names;
 * the wording is his, adjusted only where our route differs from his.
 */
const OUT = {
  "/learn": [
    "Lessons & events, on the public site",
    "The free lesson library and the event calendar live on adlmstudio.net, because they are " +
      "open to people without an account. Your own courses stay here, under My learning.",
    "learn",
  ],
  "/products": [
    "The product pages",
    "Marketing pages for the six products — what each one does, who it is for and what it " +
      "costs. To add one to this account, use Products & seats instead.",
    "products",
  ],
  "/pricing": [
    "Plans and pricing",
    "The public price list. Changing what this account pays for is done under Billing & invoices.",
    "pricing",
  ],
  "/contact": [
    "Talk to us",
    "The public contact form. If this is about your account, Support raises a ticket against it " +
      "and reaches the same people faster.",
    "contact",
  ],
  "/how-it-works": [
    "How ADLM works",
    "The public walkthrough of the whole workflow, model to bill.",
    "how-it-works",
  ],
  "/ada": [
    "Ada, explained",
    "What Ada can and cannot do. She is already on this page — the button in the rail opens her " +
      "against your own library.",
    "ada",
  ],
  "/mobile": ["The mobile app", "What the phone app does away from a desk.", "mobile"],
  "/about": ["About ADLM Studio", "Who builds this.", "about"],
};

/**
 * Our product pages are one route with a key, where his are separate files.
 * The value is [display name, staged slug] — /product/revit is his quiv page.
 */
const PRODUCTS = {
  revit: ["QUIV", "quiv"],
  planswift: ["HERON", "heron"],
  rategen: ["RateGen", "rategen"],
  "qs-takeoff": ["Time Pro", "timepro"],
  civil3d: ["CIVIQ", "civiq"],
  mep: ["Revit MEP", "mep"],
};

function destinationFor(path) {
  if (OUT[path]) return OUT[path];
  const product = /^\/product\/([^/]+)$/.exec(path);
  if (product) {
    const [name, slug] = PRODUCTS[product[1]] || ["This product", ""];
    return [name, "The public product page.", slug];
  }
  return null;
}

/**
 * Where "Open in a new tab" actually goes.
 *
 * TEMPORARY, and meant to be deleted. Richard's marketing pages are staged at
 * /preview/<slug> and have not been promoted over the live ones yet, so
 * sending somebody to /learn from inside the studio would show them the old
 * design — the opposite of the point. Until those pages are ported, the card
 * opens the staged version.
 *
 * When a page goes live, drop its slug from the entry above and this falls
 * back to the real path on its own.
 */
const openTarget = (path, slug) => (slug ? `/preview/${slug}` : path);

export default function DsLeaveStudio() {
  const [leaving, setLeaving] = React.useState(null);
  const [shown, setShown] = React.useState(false);
  const location = useLocation();

  // A route change closes it. Without this, opening the link in a new tab and
  // then navigating in this one would leave the card behind over the new page.
  React.useEffect(() => setLeaving(null), [location.pathname]);

  // His card fades in on the next frame rather than appearing at full opacity:
  // .wk-modal is opacity 0 until .on is added.
  //
  // The timer is a fallback, not belt-and-braces for its own sake.
  // requestAnimationFrame does not fire in a tab that is not compositing — a
  // background tab, or a window the compositor has parked — and if it never
  // fires the card stays at opacity 0 while still covering the page. An
  // invisible thing that swallows every click is far worse than one that
  // appears without a transition.
  React.useEffect(() => {
    if (!leaving) {
      setShown(false);
      return undefined;
    }
    const frame = requestAnimationFrame(() => setShown(true));
    const fallback = setTimeout(() => setShown(true), 80);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(fallback);
    };
  }, [leaving]);

  React.useEffect(() => {
    if (!leaving) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setLeaving(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [leaving]);

  // Listened for on the document, as his shell.js does, rather than through a
  // wrapper element. The shell is a two-column grid and .dsh-rail has to stay a
  // direct child of it — a wrapper div here becomes the grid item instead and
  // collapses the rail. There is a comment in DsAppShell about exactly that.
  const onClick = React.useCallback((e) => {
    // Let the browser have anything it would treat as "not a plain navigation"
    // — a new tab, a download, a modified click. Intercepting those would be
    // taking something away rather than explaining it.
    if (e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const a = e.target.closest?.("a[href]");
    if (!a || a.target === "_blank" || a.hasAttribute("download")) return;

    const href = a.getAttribute("href") || "";
    // Only our own in-app paths; an absolute URL elsewhere is already explicit.
    if (!href.startsWith("/")) return;

    const dest = destinationFor(href.split(/[?#]/)[0]);
    if (!dest) return;

    e.preventDefault();
    const path = href.split(/[?#]/)[0];
    setLeaving({ href: openTarget(path, dest[2]), title: dest[0], body: dest[1] });
  }, []);

  React.useEffect(() => {
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [onClick]);

  if (!leaving) return null;

  return (
        <div
          className={`wk-modal sh-leave ${shown ? "on" : ""}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setLeaving(null);
          }}
        >
          <div className="wk-modal-c" role="dialog" aria-modal="true" aria-label={leaving.title}>
            <button
              type="button"
              className="wk-modal-x"
              aria-label="Close"
              onClick={() => setLeaving(null)}
            >
              <svg viewBox="0 0 24 24">
                <use href="#hi-close" />
              </svg>
            </button>
            <span className="sh-k">Leaving the studio</span>
            <h2>{leaving.title}</h2>
            <p>{leaving.body}</p>
            <div className="sh-leave-a">
              <a
                className="ds-btn btn-p ds-btn-sm"
                href={leaving.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setTimeout(() => setLeaving(null), 120)}
              >
                Open in a new tab
              </a>
              <button
                type="button"
                className="ds-btn btn-o ds-btn-sm"
                onClick={() => setLeaving(null)}
              >
                Stay here
              </button>
            </div>
          </div>
        </div>
  );
}
