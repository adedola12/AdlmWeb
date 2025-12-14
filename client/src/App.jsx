import React from "react";
import { Outlet, useLocation } from "react-router-dom";
import Nav from "./components/Nav.jsx";
import Footer from "./components/Footer.jsx";
import YoutubeWelcomeModal from "./components/YoutubeWelcomeModal.jsx";

export default function App() {
  const [showVideo, setShowVideo] = React.useState(false);
  const location = useLocation();

  const VIDEO_ID = "UibPcyLIvHg";
  const MAX_SECONDS = 120;

  // Show modal whenever user lands on Home (/)
  React.useEffect(() => {
    if (location.pathname === "/") {
      setShowVideo(true);
    } else {
      setShowVideo(false); // close if they leave Home
    }
  }, [location.pathname]);

  function closeVideo() {
    setShowVideo(false);
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Nav />

      <main className="w-full flex-1">
        <Outlet />
      </main>

      <Footer />

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
