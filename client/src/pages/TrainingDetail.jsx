import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../http";

function formatDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function modeBadgeClasses(mode) {
  switch (mode) {
    case "online":
      return "bg-blue-600";
    case "office":
      return "bg-green-600";
    case "conference":
      return "bg-purple-600";
    default:
      return "bg-slate-600";
  }
}

function IconRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-sm text-slate-600">
      <span className="font-medium text-slate-800">{label}:</span>
      <span className="text-slate-600">{value}</span>
    </div>
  );
}

function SmallTrainingCard({ t }) {
  const cover = t?.imageUrl || t?.imageUrls?.[0] || "";
  const location = [t.city, t.country].filter(Boolean).join(", ");

  return (
    <div
      className="
        group bg-white rounded-xl shadow-sm overflow-hidden border border-slate-100
        transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-slate-200
      "
    >
      <div className="relative h-40 w-full bg-slate-100 overflow-hidden">
        {cover ? (
          <img
            src={cover}
            alt={t.title}
            className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.04]"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
        ) : null}

        <span
          className={`absolute top-3 right-3 px-3 py-1 rounded-full text-xs text-white capitalize ${modeBadgeClasses(
            t.mode
          )}`}
        >
          {t.mode}
        </span>
      </div>

      <div className="p-4">
        <Link
          to={`/trainings/${t._id}`}
          className="font-semibold text-slate-900 text-sm line-clamp-2 hover:text-blue-700"
        >
          {t.title}
        </Link>

        <div className="mt-2 space-y-1 text-xs text-slate-600">
          <div>
            <span className="font-medium">Date:</span> {formatDate(t.date)}
          </div>
          {(location || t.venue) && (
            <div className="line-clamp-1">
              <span className="font-medium">Location:</span>{" "}
              {[location, t.venue].filter(Boolean).join(" • ")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** ✅ Full image popout (lightbox) */
function ImageLightbox({
  open,
  images,
  index,
  title,
  onClose,
  onPrev,
  onNext,
  setIndex,
}) {
  const startX = useRef(null);

  // lock scroll + esc close
  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
      if (e.key === "ArrowRight") onNext?.();
      if (e.key === "ArrowLeft") onPrev?.();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, onNext, onPrev]);

  if (!open) return null;

  const current = images[index] || "";

  return (
    <div
      className="fixed inset-0 z-[9999]"
      role="presentation"
      onClick={onClose}
    >
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/80" />

      {/* content */}
      <div className="absolute inset-0 flex items-center justify-center p-3 sm:p-6">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title || "Image preview"}
          className="
            relative w-full max-w-6xl
            rounded-2xl overflow-hidden bg-black
            shadow-2xl
          "
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => {
            startX.current = e.touches?.[0]?.clientX ?? null;
          }}
          onTouchEnd={(e) => {
            const endX = e.changedTouches?.[0]?.clientX ?? null;
            if (startX.current == null || endX == null) return;

            const delta = endX - startX.current;
            if (Math.abs(delta) < 40) return; // small swipe ignore
            if (delta < 0) onNext?.();
            else onPrev?.();
          }}
        >
          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-3">
            <div className="text-xs sm:text-sm text-white/80 truncate pr-2">
              {title}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="h-9 w-9 rounded-full bg-white/10 hover:bg-white/15 text-white flex items-center justify-center"
              aria-label="Close"
              title="Close"
            >
              ✕
            </button>
          </div>

          {/* Image */}
          <div className="relative w-full h-[70vh] sm:h-[78vh] bg-black">
            {current ? (
              <img
                src={current}
                alt={title || "Preview"}
                className="absolute inset-0 h-full w-full object-contain"
                referrerPolicy="no-referrer"
                draggable={false}
              />
            ) : null}

            {/* arrows */}
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={onPrev}
                  className="
                    absolute left-3 top-1/2 -translate-y-1/2 z-10
                    h-10 w-10 sm:h-11 sm:w-11 rounded-full
                    bg-white/10 hover:bg-white/15 text-white
                    flex items-center justify-center
                  "
                  aria-label="Previous image"
                  title="Previous"
                >
                  ‹
                </button>

                <button
                  type="button"
                  onClick={onNext}
                  className="
                    absolute right-3 top-1/2 -translate-y-1/2 z-10
                    h-10 w-10 sm:h-11 sm:w-11 rounded-full
                    bg-white/10 hover:bg-white/15 text-white
                    flex items-center justify-center
                  "
                  aria-label="Next image"
                  title="Next"
                >
                  ›
                </button>
              </>
            )}

            {/* counter */}
            {images.length > 1 && (
              <div className="absolute bottom-3 right-3 text-xs text-white bg-white/10 px-2 py-1 rounded-full">
                {index + 1}/{images.length}
              </div>
            )}
          </div>

          {/* thumbs (optional, nice on desktop) */}
          {images.length > 1 && (
            <div className="bg-black/70 p-2 overflow-x-auto">
              <div className="flex gap-2">
                {images.map((src, i) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setIndex(i)}
                    className={`h-12 w-16 rounded-md overflow-hidden border ${
                      i === index ? "border-white" : "border-white/20"
                    }`}
                    title={`Image ${i + 1}`}
                  >
                    <img
                      src={src}
                      alt={`thumb-${i + 1}`}
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      draggable={false}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TrainingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // carousel
  const [activeIndex, setActiveIndex] = useState(0);

  // lightbox
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        setError("");

        const data = await api("/trainings");
        if (!mounted) return;

        const list = data?.items || [];
        setItems(list);

        setActiveIndex(0);
        setLightboxOpen(false);
      } catch (err) {
        if (!mounted) return;
        setError(err?.message || "Failed to load training");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [id]);

  const training = useMemo(
    () => items.find((x) => String(x._id) === String(id)),
    [items, id]
  );

  const otherTrainings = useMemo(() => {
    return items.filter((x) => String(x._id) !== String(id)).slice(0, 9);
  }, [items, id]);

  const images = useMemo(() => {
    if (!training) return [];
    const merged = [
      ...(Array.isArray(training.imageUrls) ? training.imageUrls : []),
      ...(training.imageUrl ? [training.imageUrl] : []),
    ];
    return Array.from(new Set(merged.filter(Boolean)));
  }, [training]);

  const currentImage = images[activeIndex] || "";

  function nextImage() {
    if (!images.length) return;
    setActiveIndex((i) => (i + 1) % images.length);
  }

  function prevImage() {
    if (!images.length) return;
    setActiveIndex((i) => (i - 1 + images.length) % images.length);
  }

  // keyboard arrows (carousel only when lightbox is not open)
  useEffect(() => {
    const onKeyDown = (e) => {
      if (lightboxOpen) return;

      if (e.key === "ArrowRight") nextImage();
      if (e.key === "ArrowLeft") prevImage();
      if (e.key === "Escape") navigate("/trainings");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images.length, lightboxOpen]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 sm:px-6 md:px-8 lg:px-24 py-8 sm:py-10">
        <div className="max-w-6xl mx-auto text-sm text-slate-600">
          Loading training…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 sm:px-6 md:px-8 lg:px-24 py-8 sm:py-10">
        <div className="max-w-6xl mx-auto">
          <p className="text-sm text-red-600">{error}</p>
          <Link
            to="/trainings"
            className="text-sm text-blue-700 hover:underline"
          >
            Back to trainings
          </Link>
        </div>
      </div>
    );
  }

  if (!training) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 sm:px-6 md:px-8 lg:px-24 py-8 sm:py-10">
        <div className="max-w-6xl mx-auto">
          <p className="text-sm text-slate-700">Training not found.</p>
          <Link
            to="/trainings"
            className="text-sm text-blue-700 hover:underline"
          >
            Back to trainings
          </Link>
        </div>
      </div>
    );
  }

  const locationText = [training.city, training.country]
    .filter(Boolean)
    .join(", ");
  const venueText = training.venue ? String(training.venue) : "";
  const fullLocation = [locationText, venueText].filter(Boolean).join(" • ");

  return (
    <div className="min-h-screen bg-slate-50 px-4 sm:px-6 md:px-8 lg:px-24 py-8 sm:py-10">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Top card */}
        <section className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
          {/* Image slider */}
          <div className="relative bg-slate-100">
            {/* ✅ more mobile-friendly height */}
            <div className="relative w-full aspect-[16/10] sm:aspect-[16/8] md:aspect-[16/6] bg-slate-100 overflow-hidden">
              {currentImage ? (
                <button
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  className="absolute inset-0 w-full h-full"
                  aria-label="Open full image"
                  title="Open full image"
                >
                  <img
                    src={currentImage}
                    alt={training.title}
                    className="absolute inset-0 h-full w-full object-cover object-top"
                    loading="eager"
                    referrerPolicy="no-referrer"
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                </button>
              ) : null}

              {/* Mode badge */}
              <span
                className={`absolute top-3 left-3 sm:top-4 sm:left-4 px-3 py-1 rounded-full text-xs text-white capitalize shadow ${modeBadgeClasses(
                  training.mode
                )}`}
              >
                {training.mode}
              </span>

              {/* arrows (smaller on mobile) */}
              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={prevImage}
                    className="
                      absolute left-2 sm:left-3 top-1/2 -translate-y-1/2
                      h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-white/90 hover:bg-white shadow
                      flex items-center justify-center
                    "
                    aria-label="Previous image"
                    title="Previous"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={nextImage}
                    className="
                      absolute right-2 sm:right-3 top-1/2 -translate-y-1/2
                      h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-white/90 hover:bg-white shadow
                      flex items-center justify-center
                    "
                    aria-label="Next image"
                    title="Next"
                  >
                    ›
                  </button>
                </>
              )}

              {/* counter */}
              {images.length > 1 && (
                <div className="absolute bottom-3 right-3 text-xs text-white bg-black/50 px-2 py-1 rounded-full">
                  {activeIndex + 1}/{images.length}
                </div>
              )}
            </div>
          </div>

          {/* Details */}
          <div className="p-4 sm:p-5 md:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg md:text-xl font-semibold text-slate-900">
                  {training.title}
                </h1>
                {fullLocation ? (
                  <p className="mt-1 text-sm text-slate-600 line-clamp-2">
                    {fullLocation}
                  </p>
                ) : null}
              </div>

              <Link
                to="/trainings"
                className="text-sm text-slate-600 hover:text-slate-900 shrink-0"
                title="Back"
              >
                ✕
              </Link>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <IconRow label="Date" value={formatDate(training.date)} />
              <IconRow label="Type" value={training.mode} />
              <IconRow
                label="Attendees"
                value={
                  training.attendees ? `${training.attendees} participants` : ""
                }
              />
              <IconRow label="Venue" value={training.venue} />
            </div>

            {training.description ? (
              <div className="mt-4">
                <p className="text-sm font-semibold text-slate-900">
                  Description
                </p>
                <p className="mt-1 text-sm text-slate-600 leading-relaxed">
                  {training.description}
                </p>
              </div>
            ) : null}

            {/* Tags */}
            {Array.isArray(training.tags) && training.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {training.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex px-2 py-1 rounded-md bg-slate-100 text-xs text-slate-700"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* thumbnails */}
            {images.length > 1 && (
              <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
                {images.map((src, idx) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => {
                      setActiveIndex(idx);
                      setLightboxOpen(true); // ✅ open popout when thumb clicked
                    }}
                    className={`h-14 w-20 sm:h-16 sm:w-24 rounded-lg overflow-hidden border ${
                      idx === activeIndex
                        ? "border-blue-600"
                        : "border-slate-200"
                    }`}
                    title={`Open image ${idx + 1}`}
                  >
                    <img
                      src={src}
                      alt={`thumb-${idx + 1}`}
                      className="h-full w-full object-cover object-top"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Other trainings */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base md:text-lg font-semibold text-slate-900">
              Other trainings & events
            </h2>
            <Link
              to="/trainings"
              className="text-sm text-blue-700 hover:underline"
            >
              View all
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {otherTrainings.map((t) => (
              <SmallTrainingCard key={t._id} t={t} />
            ))}
          </div>
        </section>

        {/* ✅ Lightbox */}
        <ImageLightbox
          open={lightboxOpen}
          images={images}
          index={activeIndex}
          title={training.title}
          onClose={() => setLightboxOpen(false)}
          onPrev={prevImage}
          onNext={nextImage}
          setIndex={setActiveIndex}
        />
      </div>
    </div>
  );
}
