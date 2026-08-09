import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackPageView } from "../ga";

/**
 * Sends one SPA pageview per route change.
 *
 * Mounted in the root layout (App.jsx). For a long time it was not mounted
 * anywhere at all, so GA saw the first page of a session and nothing after it.
 */
export default function AnalyticsTracker() {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname + location.search;

    // The de-duplication guard is claimed when the event is SENT, not when it
    // is scheduled. Claiming it up front interacted badly with the cleanup
    // below: StrictMode mounts, schedules, unmounts (cancelling the timer) and
    // remounts — and the remount then saw the guard already set for this path
    // and skipped it, so the first pageview of every session went missing in
    // development while looking fine in production.
    const send = () => {
      const last = window.__ADLM_LAST_PV || { path: "", ts: 0 };
      const ts = Date.now();
      if (last.path === path && ts - last.ts < 1200) return;
      window.__ADLM_LAST_PV = { path, ts };
      trackPageView(path);
    };

    // Deferred to the end of the current task rather than sent inline.
    //
    // This component is a sibling that sits above <Outlet> in the tree, so its
    // effect runs BEFORE the page's <Seo> effect sets document.title. Sending
    // immediately reported the *previous* page's title on every pageview —
    // /learn arriving in GA labelled "ADLM Studio", and so on down the funnel.
    //
    // A timer, not requestAnimationFrame: rAF does not run while the document
    // is hidden, so a link opened in a background tab would record no pageview
    // at all until the tab was focused, and none if it never was. Timers are
    // throttled in the background but they still fire.
    const id = setTimeout(send, 0);
    return () => clearTimeout(id);
  }, [location.pathname, location.search]);

  return null;
}
