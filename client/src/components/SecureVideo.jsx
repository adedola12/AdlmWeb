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
   viewers (e.g. free videos).

   The label carries three things, and each one does a different job if a
   recording leaks: WHO (the account), WHEN (a clock that reprints every 30s,
   so a clip can be placed in time even after it is cropped or re-encoded) and
   WHICH SESSION (the ref from /playback/start, which resolves to a row holding
   the IP and device). */
function useWatermarkLabel(sessionRef) {
  const { user } = useAuth();
  const [stamp, setStamp] = React.useState(() => new Date());

  React.useEffect(() => {
    const timer = setInterval(() => setStamp(new Date()), 30 * 1000);
    return () => clearInterval(timer);
  }, []);

  const identity = user?.email || user?.name || "ADLM Studio · adlmstudio.net";
  const when = stamp
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");
  return sessionRef
    ? `${identity} · ${when}Z · ${sessionRef}`
    : `${identity} · ${when}Z`;
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

/**
 * Two different reactions, because they trade off differently.
 *
 *   guarded — blank the frame AND pause. For a capture attempt or a hidden
 *             tab, where showing nothing is the point.
 *   paused  — pause only, frame left visible. For losing window focus, which
 *             on this course usually means the student alt-tabbed into Revit
 *             to follow along. Blanking there would fight the lesson, and it
 *             buys nothing: a screen recorder does not need focus to capture.
 */
function useScreenshotGuard() {
  const [guarded, setGuarded] = React.useState(false);
  const [paused, setPaused] = React.useState(false);

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
      const key = String(e.key || "");
      // PrintScreen (Windows), Win+Shift+S (Snip & Sketch) and
      // Cmd+Shift+3/4/5 (macOS capture). The OS swallows some of these before
      // the page sees them — the ones that do arrive get blanked, the rest are
      // covered by the watermark. There is no key handler that makes capture
      // impossible; this only raises the effort.
      const isSnip = e.shiftKey && (e.metaKey || e.ctrlKey) && /^[sS345]$/.test(key);
      if (key === "PrintScreen" || isSnip) {
        flash();
        // Best-effort: clobber the clipboard so a captured frame isn't pasted.
        try { navigator.clipboard?.writeText(" "); } catch { /* ignore */ }
      }
    };
    const onVisibility = () => setGuarded(document.hidden);
    const onBlur = () => setPaused(true);
    const onFocus = () => setPaused(false);

    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return { guarded, paused };
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

/**
 * Attaches an HLS stream to a <video>.
 *
 * Safari plays .m3u8 natively; everywhere else needs hls.js, which is loaded
 * lazily so the 100 kB parser isn't in the bundle for pages with no video.
 *
 * `withCredentials` matters: playback is authorised by CloudFront signed
 * cookies, and without it the manifest and every segment come back 403.
 */
function useHlsSource(videoRef, src) {
  const isHls = /\.m3u8(\?|$)/i.test(String(src || ""));

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video || !src || !isHls) return undefined;

    // Safari / iOS: native, and the only path that can also do FairPlay later.
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      return undefined;
    }

    let hls = null;
    let cancelled = false;

    import("hls.js").then(({ default: Hls }) => {
      if (cancelled || !Hls.isSupported()) return;
      hls = new Hls({
        xhrSetup: (xhr) => {
          xhr.withCredentials = true;
        },
        // Keep the buffer modest: these lectures run two hours, and buffering
        // far ahead on a metered Nigerian connection burns the student's data
        // for footage they may never reach.
        maxBufferLength: 30,
      });
      hls.loadSource(src);
      hls.attachMedia(video);
    });

    return () => {
      cancelled = true;
      try { hls?.destroy(); } catch { /* ignore */ }
    };
  }, [videoRef, src, isHls]);

  return isHls;
}

/* Self-hosted video (direct mp4 / Cloudinary / HLS from CloudFront). */
export function SecureVideo({
  src,
  poster,
  className = "",
  videoClassName = "",
  sessionRef = "",
  ...rest
}) {
  const label = useWatermarkLabel(sessionRef);
  const { guarded, paused } = useScreenshotGuard();
  const ref = React.useRef(null);
  const isHls = useHlsSource(ref, src);

  // Pause when guarded; harden the element imperatively (props not all standard).
  React.useEffect(() => {
    const v = ref.current;
    if (!v) return;
    try { v.disableRemotePlayback = true; } catch { /* ignore */ }
    if (guarded || paused) { try { v.pause(); } catch { /* ignore */ } }
  }, [guarded, paused]);

  return (
    <div
      className={`secure-media relative overflow-hidden ${className}`}
      onContextMenu={(e) => e.preventDefault()}
    >
      <video
        ref={ref}
        // For HLS the source is attached by useHlsSource (hls.js or Safari
        // native); setting src here as well would race it.
        src={isHls ? undefined : src}
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
  sessionRef = "",
}) {
  const label = useWatermarkLabel(sessionRef);
  const { guarded } = useScreenshotGuard();

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
