import React from "react";

let ytApiPromise = null;

function loadYouTubeIframeAPI() {
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) return resolve(window.YT);

    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === "function") prev();
      resolve(window.YT);
    };

    const existing = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]',
    );
    if (!existing) {
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    }
  });

  return ytApiPromise;
}

export default function YoutubeWelcomeModal({
  open,
  onClose,
  videoId,
  title = "Watch this quick intro",
  maxSeconds = 20,
  closeOnOutsideClick = true,
  hideControls = true,
}) {
  const mountRef = React.useRef(null);
  const playerRef = React.useRef(null);
  const timerRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  React.useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function init() {
      const YT = await loadYouTubeIframeAPI();
      if (cancelled) return;

      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // Ignore player cleanup errors while remounting.
        }
        playerRef.current = null;
      }

      if (mountRef.current) {
        while (mountRef.current.firstChild) {
          mountRef.current.removeChild(mountRef.current.firstChild);
        }
      }

      playerRef.current = new YT.Player(mountRef.current, {
        videoId,
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 1,
          mute: 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          controls: hideControls ? 0 : 1,
          fs: 0,
          iv_load_policy: 3,
          disablekb: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (e) => {
            try {
              e.target.seekTo(0, true);
              e.target.playVideo();
            } catch {
              // Ignore autoplay restrictions from the embed runtime.
            }
          },
        },
      });

      clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        const p = playerRef.current;
        if (!p || typeof p.getCurrentTime !== "function") return;

        let t = 0;
        try {
          t = p.getCurrentTime();
        } catch {
          // Ignore transient player state errors while polling.
          return;
        }

        if (Number(maxSeconds) > 0 && t >= Number(maxSeconds)) {
          try {
            p.seekTo(0, true);
            p.playVideo();
          } catch {
            // Ignore loop restart failures and keep the modal usable.
          }
        }
      }, 200);
    }

    init();

    return () => {
      cancelled = true;
      clearInterval(timerRef.current);
      timerRef.current = null;

      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // Ignore player cleanup errors while unmounting.
        }
        playerRef.current = null;
      }
    };
  }, [open, videoId, maxSeconds, hideControls]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999]"
      onClick={() => closeOnOutsideClick && onClose?.()}
      role="presentation"
    >
      <div className="absolute inset-0 bg-black/60" />

      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="w-full max-w-4xl rounded-2xl bg-white shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div className="text-sm md:text-base font-semibold text-slate-900">
              {title}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-800"
            >
              Close
            </button>
          </div>

          <div className="relative w-full aspect-video bg-black overflow-hidden">
            <div
              ref={mountRef}
              className="yt-player absolute inset-0"
              style={{
                width: "100%",
                height: "100%",
              }}
            />
          </div>

          <div className="px-4 py-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700"
            >
              Continue to website
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .yt-player iframe {
          width: 100% !important;
          height: 100% !important;
          display: block;
        }
      `}</style>
    </div>
  );
}
