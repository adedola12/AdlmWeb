// One tile in the free video library.
//
// A YouTube still that becomes a muted preview on hover, the running time in
// the corner, and the title as the link to the lesson player. Used by the
// Learn page's shelves, the product pages' recommended strip and the player's
// "more from this shelf" row, so the three read as one library.

import React from "react";
import { Link } from "react-router-dom";
import { extractYouTubeId, formatDuration, youtubeThumb } from "../lib/freeVideos.js";
import { IconPlaySquare } from "./icons.jsx";

export function HoverYouTube({ id, title, thumb, durationSec }) {
  const [hovered, setHovered] = React.useState(false);
  const thumbUrl = thumb || youtubeThumb(id);
  const iframeSrc = id
    ? `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&controls=0&rel=0&modestbranding=1`
    : "";
  const clock = formatDuration(durationSec);

  return (
    <div
      className="relative rounded-xl overflow-hidden border border-black/5 dark:border-white/10 bg-slate-900"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={title}
    >
      {hovered && id ? (
        <iframe
          className="w-full aspect-video"
          src={iframeSrc}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture"
        />
      ) : (
        <>
          {thumbUrl ? (
            <img
              src={thumbUrl}
              alt={title}
              loading="lazy"
              className="w-full aspect-video object-cover"
            />
          ) : (
            <div className="w-full aspect-video grid place-items-center text-white/50">
              <IconPlaySquare className="w-8 h-8" />
            </div>
          )}
          {clock && (
            <span className="absolute bottom-2 right-2 rounded-md bg-black/75 px-1.5 py-0.5 text-[11px] font-semibold text-white tabular-nums">
              {clock}
            </span>
          )}
        </>
      )}
    </div>
  );
}

export default function FreeVideoCard({ v, sectionLabel }) {
  const id = extractYouTubeId(v.youtubeId);
  const label = sectionLabel || v.productLabel || "";
  return (
    <div className="group card p-0 lift spotlight overflow-hidden">
      <HoverYouTube id={id} title={v.title} thumb={v.thumbnailUrl} durationSec={v.durationSec} />
      <Link
        to={`/learn/free/${encodeURIComponent(v._id)}`}
        className="block p-3"
      >
        {label && (
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-adlm-orange mb-1">
            {label}
          </span>
        )}
        <span className="block text-sm font-medium leading-snug text-slate-900 dark:text-adlm-dark-text group-hover:text-adlm-blue-700 dark:group-hover:text-adlm-blue-400 line-clamp-2">
          {v.title}
        </span>
      </Link>
    </div>
  );
}
