import React from "react";
import { Outlet, useLocation } from "react-router-dom";
import Nav from "./components/Nav.jsx";
import Footer from "./components/Footer.jsx";
import YoutubeWelcomeModal from "./components/YoutubeWelcomeModal.jsx";
import CouponBanner from "./components/CouponBanner.jsx";
import HelpBot from "./components/HelpBot.jsx";
import { API_BASE } from "./config";

export default function App() {
  const [showVideo, setShowVideo] = React.useState(false);
  const location = useLocation();

  const [banner, setBanner] = React.useState(null);
  const [bannerDismissed, setBannerDismissed] = React.useState(false);

  const VIDEO_ID = "UibPcyLIvHg";
  const MAX_SECONDS = 120;

  React.useEffect(() => {
    if (location.pathname === "/") setShowVideo(true);
    else setShowVideo(false);
  }, [location.pathname]);

  // load banner
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
    <div className="min-h-screen flex flex-col bg-slate-50">
      {!bannerDismissed && (
        <CouponBanner
          banner={banner}
          onClose={() => setBannerDismissed(true)}
        />
      )}

      <Nav />

      <main className="w-full flex-1 px-8 md:px-25 py-4">
        <Outlet />
      </main>

      <Footer />
      <HelpBot />
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
