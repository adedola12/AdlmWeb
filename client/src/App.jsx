import React from "react";
import { Outlet, useLocation, ScrollRestoration } from "react-router-dom";
import Nav from "./components/Nav.jsx";
import Footer from "./components/Footer.jsx";
import YoutubeWelcomeModal from "./components/YoutubeWelcomeModal.jsx";
import CouponBanner from "./components/CouponBanner.jsx";
import AiAgent from "./components/AiAgent.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

import { API_BASE } from "./config";

export default function App() {
  const [showVideo, setShowVideo] = React.useState(false);
  const location = useLocation();

  const [banner, setBanner] = React.useState(null);
  const [bannerDismissed, setBannerDismissed] = React.useState(false);

  const VIDEO_ID = "m3smR7ebia4";
  const MAX_SECONDS = 300;

  React.useEffect(() => {
    setShowVideo(location.pathname === "/");
  }, [location.pathname]);

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

      <Nav />

      <main className="w-full flex-1 px-4 md:px-8 py-4">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>

      <Footer />
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
        title="Welcome to ADLM — quick intro"
        maxSeconds={MAX_SECONDS}
        closeOnOutsideClick={true}
        hideControls={false}
      />
    </div>
    
  );
}
