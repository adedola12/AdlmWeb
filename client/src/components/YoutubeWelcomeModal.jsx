import React from "react";

export default function YoutubeWelcomeModal({
  open,
  onClose,
  videoId,
  title = "Watch this quick intro",
}) {
  React.useEffect(() => {
    if (!open) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);

    // prevent background scroll
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  // YouTube embed with autoplay + muted for better browser compatibility
  const src = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&rel=0&modestbranding=1`;

  return (
    <div className="fixed inset-0 z-[9999]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
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
            <iframe
              className="absolute inset-0 w-full h-full"
              src={src}
              title="YouTube video player"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
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
