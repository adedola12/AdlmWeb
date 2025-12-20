import React from "react";
import { Outlet, useLocation } from "react-router-dom";
import Nav from "./components/Nav.jsx";
import Footer from "./components/Footer.jsx";
import YoutubeWelcomeModal from "./components/YoutubeWelcomeModal.jsx";
import CouponBanner from "./components/CouponBanner.jsx";
import HelpBot from "./components/HelpBot.jsx";
import confetti from "canvas-confetti";
import LaunchCountdownBanner from "./components/LaunchCountdownBanner.jsx";

import { API_BASE } from "./config";

export default function App() {
  const [showVideo, setShowVideo] = React.useState(false);
  const location = useLocation();

  const [banner, setBanner] = React.useState(null);
  const [bannerDismissed, setBannerDismissed] = React.useState(false);

  const VIDEO_ID = "YX6vJTaAUXA";
  const MAX_SECONDS = 300; // 5 minutes

  // ✅ avoid double confetti in React.StrictMode
  const didConfetti = React.useRef(false);

  // set your launch time here (Africa/Lagos is +01:00)
  // Example: 24 hours from now is NOT stable, better use a real date/time:
  const LAUNCH_AT = "2025-12-20T11:00:00+01:00"; // <-- change this

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

  React.useEffect(() => {
    if (didConfetti.current) return;
    didConfetti.current = true;

    // quick burst
    confetti({
      particleCount: 120,
      spread: 70,
      origin: { y: 0.2 },
    });

    // small follow-up
    setTimeout(() => {
      confetti({
        particleCount: 80,
        spread: 55,
        origin: { y: 0.2 },
      });
    }, 350);
  }, []);

  function closeVideo() {
    setShowVideo(false);
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* ✅ Launch countdown banner on top */}
      <LaunchCountdownBanner targetIso={LAUNCH_AT} title="Full launch in" />
      {!bannerDismissed && (
        <CouponBanner
          banner={banner}
          onClose={() => setBannerDismissed(true)}
        />
      )}

      <Nav />

      <main className="w-full flex-1 px-4 md:px-8 py-4">
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
