import React from "react";
import { Outlet, useLocation, ScrollRestoration } from "react-router-dom";
import Nav from "./components/Nav.jsx";
import Footer from "./components/Footer.jsx";
import DesignModeBanner from "./components/DesignModeBanner.jsx";
import YoutubeWelcomeModal from "./components/YoutubeWelcomeModal.jsx";
import CouponBanner from "./components/CouponBanner.jsx";
import AiAgent from "./components/AiAgent.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import AnalyticsTracker from "./components/AnalyticsTracker.jsx";

import { API_BASE } from "./config";
import { initGA } from "./ga";

export default function App() {
  const [showVideo, setShowVideo] = React.useState(false);
  const location = useLocation();

  // Screens that render inside his app frame — rail, app bar, own scroll
  // container. They supply their own chrome and their own padding, so the
  // marketing nav, the footer and the page gutter all step aside.
  //
  // /projects/* and /time-management are on this list because they are now
  // wrapped in the same frame (see pages/WorkShellRoute.jsx), even though they
  // are our screens rather than ported ones. Leaving them off put the
  // marketing nav and "Book a demo" above a signed-in rail.
  const appShellRoute = /^\/(manage|work|projects|time-management)(\/|$)/.test(
    location.pathname,
  );

  const [banner, setBanner] = React.useState(null);
  const [bannerDismissed, setBannerDismissed] = React.useState(false);

  const VIDEO_ID = "m3smR7ebia4";
  const MAX_SECONDS = 300;

  React.useEffect(() => {
    setShowVideo(location.pathname === "/");
  }, [location.pathname]);

  // Announce boot into the dataLayer once per load. GTM fires its own
  // gtm.js/gtm.dom/gtm.load, but nothing told it the app itself had started.
  React.useEffect(() => {
    initGA();
  }, []);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/coupons/banner`);
        const json = await res.json();
        if (json?.ok) setBanner(json.banner || null);
      } catch {
        // ignore banner failure
      }
    })();
  }, []);

  function closeVideo() {
    setShowVideo(false);
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-adlm-dark-bg text-slate-900 dark:text-adlm-dark-text transition-colors">
      {!bannerDismissed && (
        <CouponBanner
          banner={banner}
          onClose={() => setBannerDismissed(true)}
        />
      )}

      {/* Mounted in the root layout so it sees every route change.
          It existed before this and was never rendered anywhere, which meant
          GA recorded the first page of a session and nothing after it, in a
          single-page app, almost every pageview was missing. */}
      <AnalyticsTracker />

      {/* The signed-in app carries his rail and app bar instead. Leaving the
          marketing nav above it puts "Book a demo" over somebody's dashboard,
          and the two sets of navigation compete for the same job. His own
          build does exactly that; it is on the snag list for him rather than
          reproduced here. */}
      {!appShellRoute && <Nav />}

      {/* Only renders for Design Access sessions, and only on /admin. */}
      <DesignModeBanner />

      <main className={appShellRoute ? "w-full flex-1" : "w-full flex-1 px-4 md:px-8 py-4"}>
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
        
      {!appShellRoute && <Footer />}
      <AiAgent />

      {/* New-page navigations start at the top; the browser back/forward
          buttons still restore the previous scroll position. Without this,
          React Router keeps the old scroll offset so every new page opened
          mid-scroll appeared "starting from the bottom". */}
      <ScrollRestoration />

      <YoutubeWelcomeModal
        open={showVideo}
        onClose={closeVideo}
        videoId={VIDEO_ID}
        title="Welcome to ADLM, quick intro"
        maxSeconds={MAX_SECONDS}
        closeOnOutsideClick={true}
        hideControls={false}
      />
    </div>
    
  );
}
