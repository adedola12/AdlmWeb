import React from "react";

let ytApiPromise = null;

function loadYouTubeIframeAPI() {
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise((resolve) => {
    // If already available
    if (window.YT && window.YT.Player) return resolve(window.YT);

    // Create callback
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === "function") prev();
      resolve(window.YT);
    };

    // Inject script once
    const existing = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]'
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
  maxSeconds = 20, // ✅ set limit here
  closeOnOutsideClick = true, // ✅ click backdrop closes
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

    // prevent background scroll
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  // Create / destroy player when modal opens/closes
  React.useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function init() {
      const YT = await loadYouTubeIframeAPI();
      if (cancelled) return;

      // Clean any old instance
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {}
        playerRef.current = null;
      }

      // Ensure mount is empty
      if (mountRef.current) mountRef.current.innerHTML = "";

      // Create player
      playerRef.current = new YT.Player(mountRef.current, {
        videoId,
        playerVars: {
          autoplay: 1,
          mute: 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          controls: 1,
        },
        events: {
          onReady: (e) => {
            try {
              e.target.playVideo();
            } catch {}
          },
        },
      });

      // Loop logic: when it reaches maxSeconds, restart to 0
      clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        const p = playerRef.current;
        if (!p || typeof p.getCurrentTime !== "function") return;

        let t = 0;
        try {
          t = p.getCurrentTime();
        } catch {
          return;
        }

        if (Number(maxSeconds) > 0 && t >= Number(maxSeconds)) {
          try {
            p.seekTo(0, true);
            p.playVideo();
          } catch {}
        }
      }, 250);
    }

    init();

    return () => {
      cancelled = true;
      clearInterval(timerRef.current);
      timerRef.current = null;

      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {}
        playerRef.current = null;
      }
    };
  }, [open, videoId, maxSeconds]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999]"
      onClick={() => {
        if (closeOnOutsideClick) onClose?.();
      }}
      role="presentation"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Modal */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()} // ✅ clicking card won't close
        >
          {/* Header */}
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

          {/* Video */}
          <div className="relative w-full aspect-video bg-black">
            {/* YouTube API mounts player into this div */}
            <div className="absolute inset-0" ref={mountRef} />
          </div>

          {/* Footer */}
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
    </div>
  );
}
