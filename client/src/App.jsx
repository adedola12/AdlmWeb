import React from "react";
import { Outlet } from "react-router-dom";
import Nav from "./components/Nav.jsx";
import Footer from "./components/Footer.jsx";
import YoutubeWelcomeModal from "./components/YoutubeWelcomeModal.jsx";

export default function App() {
  const [showVideo, setShowVideo] = React.useState(false);

  const VIDEO_ID = "UibPcyLIvHg";
  const MAX_SECONDS = 120; // ✅ change this (e.g. 15, 30, 60)

  React.useEffect(() => {
    const hasSeen = localStorage.getItem("adlm_seen_welcome_video");
    if (!hasSeen) setShowVideo(true);
  }, []);

  function closeVideo() {
    setShowVideo(false);
    localStorage.setItem("adlm_seen_welcome_video", "1");
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Nav />

      <main className="max-w-6xl mx-auto w-full px-6 py-8 flex-1">
        <Outlet />
      </main>

      <Footer />

      <YoutubeWelcomeModal
        open={showVideo}
        onClose={closeVideo}
        videoId={VIDEO_ID}
        title="Welcome to ADLM — quick intro"
        maxSeconds={MAX_SECONDS} // ✅ limit watch length
        closeOnOutsideClick={true} // ✅ clicking “body/backdrop” closes
      />
    </div>
  );
}
