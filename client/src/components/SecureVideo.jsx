// Protected media players for ADLM.
//
//   <SecureVideo>  — wraps a self-hosted <video> (Cloudinary/Bunny direct src)
//   <SecureEmbed>  — wraps an <iframe> (YouTube / Bunny stream)
//
// What protection is realistic on the web:
//   • You CANNOT truly block OS-level screenshots/recording from a browser.
//     iOS is the clearest case: no key events to intercept, and the screenshot
//     and screen-record paths are OS-level. Only FairPlay DRM blocks capture
//     there, and it has to be applied at the packaging layer, not here.
//   • Overlays only exist while the video plays INSIDE the page. Any native
//     fullscreen takeover (iOS especially) hands the picture to the OS player
//     and every DOM overlay vanishes with it — hence playsInline below.
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
import { IconLock } from "./icons.jsx";

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
          <IconLock className="w-4 h-4" />
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

    // WHICH PLAYER, AND WHY NOT canPlayType
    //
    // This used to ask `video.canPlayType("application/vnd.apple.mpegurl")`
    // and treat a truthy answer as "this browser plays HLS natively, hand it
    // the manifest". Chromium answers "maybe" — truthy — and then cannot
    // demux an m3u8 at all. So every Chrome and Edge viewer got the playlist
    // assigned as a video source, MEDIA_ELEMENT_ERROR code 4
    // (DEMUXER_ERROR_COULD_NOT_PARSE), a black player and no hls.js. That is
    // every lecture and every organisation video on the two browsers almost
    // all of this audience uses.
    //
    // canPlayType is advisory by specification; it is not a capability check.
    // The real question is whether Media Source Extensions exist, because
    // that is what hls.js needs and what iOS Safari lacks. Ask that directly.
    // ManagedMediaSource is the newer iOS spelling and counts.
    const hasMse =
      typeof window !== "undefined" &&
      (typeof window.MediaSource !== "undefined" ||
        typeof window.ManagedMediaSource !== "undefined");

    if (!hasMse) {
      // iOS Safari: HLS is native here, and it is also the only path that can
      // carry FairPlay later. No point downloading the parser it cannot use.
      video.src = src;
      return undefined;
    }

    let hls = null;
    let cancelled = false;

    import("hls.js").then(({ default: Hls }) => {
      if (cancelled) return;
      if (!Hls.isSupported()) {
        // MSE exists but hls.js still refuses it. Native is the last resort
        // rather than leaving the element with nothing attached.
        video.src = src;
        return;
      }
      hls = new Hls({
        xhrSetup: (xhr) => {
          xhr.withCredentials = true;
        },
        // Keep the buffer modest: these lectures run two hours, and buffering
        // far ahead on a metered Nigerian connection burns the student's data
        // for footage they may never reach.
        maxBufferLength: 30,

        // Discard what has already been watched. hls.js keeps 90s of back
        // buffer by default, but on a two-hour lecture the real cost is memory
        // on a cheap Android device, where growth shows up as stutter that
        // looks like a network problem and is not one.
        backBufferLength: 30,

        // Deliberately NOT capping the level to the player size. That is the
        // usual advice, and it is wrong for this content: these are screen
        // recordings of Revit and Excel, where the thing a student needs to
        // read is 11px UI text. Capping a phone to its ~360px width would save
        // bandwidth by making the toolbars illegible — the blurry-playback
        // complaint the ladder was built to fix in the first place.

        // CHOOSE THE RUNG ON ITS AVERAGE, NOT ITS PEAK
        //
        // Screen recordings are pathological for peak-based selection. The
        // picture is static for seconds at a time and then the whole screen
        // redraws, so one segment in a stretch costs many times its
        // neighbours. MediaConvert advertises BANDWIDTH as that worst segment
        // and AVERAGE-BANDWIDTH as the truth, and on this content they are
        // nowhere near each other. Measured on the first organisation video:
        //
        //   2160p   peak 8.88 Mbps   average 1.26 Mbps   (7.1x)
        //   1080p   peak 4.27 Mbps   average 0.68 Mbps   (6.2x)
        //
        // hls.js compares against maxBitrate — the peak — and only against
        // averageBitrate when config.maxStarvationDelay is 0 AND the buffer
        // already holds two segments (abr-controller, findBestLevel). With the
        // default of 4 it therefore demanded 8.88/0.7 = 12.7 Mbps of measured
        // throughput before it would show 4K that genuinely needs 1.26, and
        // parked everyone on 720p or below. The ladder was right and the
        // picture was still soft.
        //
        // Zero does not mean "ignore rebuffering". It means "do not budget for
        // any", and the two-segment buffer condition is what makes that safe:
        // the average is only trusted once there is a healthy buffer to absorb
        // a spike, and the moment the buffer falls the selector reverts to the
        // peak and steps down. Exactly the right way round for video-on-demand
        // whose entire value is being readable.
        maxStarvationDelay: 0,

        // NO abrEwmaDefaultEstimate. There was one here, set to 600 kbps, on
        // the reasoning that guessing low costs a few seconds at a lower rung
        // while guessing high costs a stall. The reasoning was wrong about
        // what the option does.
        //
        // 600 kbps sits BELOW the bottom rung's advertised bandwidth, so it
        // did not merely start conservatively — it pinned the opening segment
        // to 428x240 and, by supplying an estimate at all, replaced hls.js's
        // own first-variant bootstrap, which otherwise seeds from the manifest.
        // On a Revit screen recording, 240p is not a cautious start, it is no
        // text at all, and the climb back up is gated on measured throughput
        // that only accumulates while the picture is already unusable.
        //
        // The mechanism, so this is not re-added as a "safer" number: hls.js
        // seeds its estimate from the first variant in the manifest, capped at
        // abrEwmaDefaultEstimateMax (5 Mbps), and it does that ONLY when the
        // option is absent from userConfig — level-controller.ts guards the
        // whole block with `userConfig?.abrEwmaDefaultEstimate === undefined`.
        // Supplying any value, high or low, switches the bootstrap off. So the
        // fix is to delete the option, not to raise it.
        //
        // MediaConvert writes the manifest highest rung first, so the seed is
        // the top rung and playback opens sharp, then adapts DOWN within a
        // segment if the connection cannot hold it. That is the right way round
        // for content whose entire value is legibility: be readable immediately
        // and drop if you must, rather than open unusable and hope to recover.
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
        controlsList="nodownload noremoteplayback noplaybackrate nofullscreen"
        disablePictureInPicture
        // iOS hands playback to the OS fullscreen player unless told not to,
        // and that player is not part of the page — so the watermark, which is
        // a DOM overlay, simply is not there. Inline playback is what keeps the
        // identity burned across the picture on an iPhone.
        playsInline
        // Legacy attribute; older iOS reads this spelling instead.
        webkit-playsinline="true"
        x-webkit-airplay="deny"
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
