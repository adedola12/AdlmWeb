// Protected media players for ADLM.
//
//   <SecureVideo>  — wraps a self-hosted <video> (Cloudinary/Bunny direct src)
//   <SecureEmbed>  — wraps an <iframe> (YouTube / Bunny stream)
//
// What protection is realistic on the web:
//   • You CANNOT truly block OS-level screenshots/recording from a browser.
//   • So the real defense is a DYNAMIC, PER-USER WATERMARK tiled over the
//     video (the user's email/id). Any screenshot or screen-recording then
//     carries the leaker's identity — the same approach Udemy/Coursera use.
//   • On top of that we add deterrents: no right-click, no download button,
//     no Picture-in-Picture / remote playback, non-draggable, and a guard
//     overlay that blanks + pauses the video on PrintScreen or when the tab
//     is hidden (covers many capture/recording flows).
//
// Styling lives in index.css (.secure-media / .secure-watermark / .secure-guard).

import React from "react";
import { useAuth } from "../store.jsx";

/* Identity shown in the watermark. Falls back to brand text for logged-out
   viewers (e.g. free videos). */
function useWatermarkLabel() {
  const { user } = useAuth();
  return user?.email || user?.name || "ADLM Studio · adlmstudio.net";
}

/* Builds a faint, rotated, tiled SVG background of the label so the identity
   appears across the whole frame and survives cropping. */
function watermarkStyle(label) {
  const safe = String(label).replace(/[<>&"]/g, "");
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='360' height='200'>` +
    `<text x='18' y='115' font-family='Lexend, Arial, sans-serif' font-size='15' ` +
    `fill='rgba(255,255,255,0.12)' transform='rotate(-22 18 115)'>${safe}</text></svg>`;
  return {
    backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
    backgroundRepeat: "repeat",
  };
}

/* Blanks the player on PrintScreen and when the tab/window is hidden. */
function useScreenshotGuard() {
  const [guarded, setGuarded] = React.useState(false);

  React.useEffect(() => {
    let timer;
    const flash = () => {
      setGuarded(true);
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!document.hidden) setGuarded(false);
      }, 1000);
    };
    const onKey = (e) => {
      if (e.key === "PrintScreen") {
        flash();
        // Best-effort: clobber the clipboard so a captured frame isn't pasted.
        try { navigator.clipboard?.writeText(" "); } catch { /* ignore */ }
      }
    };
    const onVisibility = () => setGuarded(document.hidden);

    window.addEventListener("keyup", onKey);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keyup", onKey);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return guarded;
}

function Overlays({ label, guarded }) {
  return (
    <>
      <div className="secure-watermark" style={watermarkStyle(label)} aria-hidden="true" />
      <span className="secure-watermark__chip" aria-hidden="true">{label}</span>
      <div className={`secure-guard ${guarded ? "is-active" : ""}`} aria-hidden={!guarded}>
        <span className="secure-guard__msg">
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="10" rx="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
          Protected content — paused
        </span>
      </div>
    </>
  );
}

/* Self-hosted video (direct mp4 / Cloudinary / Bunny direct). */
export function SecureVideo({
  src,
  poster,
  className = "",
  videoClassName = "",
  ...rest
}) {
  const label = useWatermarkLabel();
  const guarded = useScreenshotGuard();
  const ref = React.useRef(null);

  // Pause when guarded; harden the element imperatively (props not all standard).
  React.useEffect(() => {
    const v = ref.current;
    if (!v) return;
    try { v.disableRemotePlayback = true; } catch { /* ignore */ }
    if (guarded) { try { v.pause(); } catch { /* ignore */ } }
  }, [guarded]);

  return (
    <div
      className={`secure-media relative overflow-hidden ${className}`}
      onContextMenu={(e) => e.preventDefault()}
    >
      <video
        ref={ref}
        src={src}
        poster={poster || undefined}
        controls
        controlsList="nodownload noremoteplayback noplaybackrate"
        disablePictureInPicture
        draggable={false}
        onContextMenu={(e) => e.preventDefault()}
        className={`w-full h-full ${videoClassName}`}
        {...rest}
      />
      <Overlays label={label} guarded={guarded} />
    </div>
  );
}

/* Embedded iframe (YouTube / Bunny stream). Note: screenshots of an iframe's
   content can't be blocked; the watermark + guard are the deterrents. */
export function SecureEmbed({
  src,
  title = "video",
  allow = "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture",
  allowFullScreen = true,
  className = "",
  iframeClassName = "",
}) {
  const label = useWatermarkLabel();
  const guarded = useScreenshotGuard();

  return (
    <div
      className={`secure-media relative overflow-hidden ${className}`}
      onContextMenu={(e) => e.preventDefault()}
    >
      <iframe
        src={src}
        title={title}
        allow={allow}
        allowFullScreen={allowFullScreen}
        className={`w-full h-full ${iframeClassName}`}
      />
      <Overlays label={label} guarded={guarded} />
    </div>
  );
}

export default { SecureVideo, SecureEmbed };
