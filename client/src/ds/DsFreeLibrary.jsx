// The whole ADLM Studio channel, shelved by software, under his free-lesson
// tiles on the Learn page.
//
// His nine tiles are the front of the shop: curated, art-directed, with his
// own photography. They stay exactly as he built them. Below them, this
// renders every other lesson — a hundred-odd — in his own tile markup
// (.filters, .lgrid, .ltile) so the page reads as one design, grouped onto the
// shelves the server defines (GET /learn/free/sections): QUIV, HERON, the MEP
// plugin, RateGen, then the generic PlanSwift and Revit teaching, the course
// recordings and the rest.
//
// The thumbnails here are YouTube's stills rather than his photography,
// because there are far too many to art-direct and a wall of identical
// placeholders would be worse. Each shelf shows six and opens fully on
// request; picking a single shelf in the filter row opens it in full.
//
// Wrapped in [data-ds-library] so DsFreeLessons — which wires his static
// tiles by matching titles — leaves these alone: they are real links already.

import React from "react";
import { Link } from "react-router-dom";
import {
  extractYouTubeId,
  fetchFreeVideoSections,
  formatDuration,
  youtubeThumb,
} from "../lib/freeVideos.js";

const SHELF_PREVIEW = 6;

export function DsVideoTile({ v, label }) {
  const id = extractYouTubeId(v.youtubeId);
  const clock = formatDuration(v.durationSec);
  const eyebrow = [label || v.productLabel, clock].filter(Boolean).join(" · ");
  return (
    <Link className="ltile lib-tile" to={`/learn/free/${encodeURIComponent(v._id)}`}>
      <img src={v.thumbnailUrl || youtubeThumb(id)} alt="" loading="lazy" />
      <div className="lt">
        <span className="playbtn">
          <svg viewBox="0 0 24 24">
            <use href="#i-play" />
          </svg>
        </span>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h4>{v.title}</h4>
      </div>
    </Link>
  );
}

function Shelf({ section, open, onToggle }) {
  const all = section.videos || [];
  const shown = open ? all : all.slice(0, SHELF_PREVIEW);
  const hidden = all.length - shown.length;
  return (
    <div className="lib-shelf" id={`lib-${section.slug || "more"}`}>
      <div className="lib-shelf-head">
        <div>
          <h3>
            {section.label}
            <span className="lcount">
              {all.length} {all.length === 1 ? "video" : "videos"}
            </span>
          </h3>
          {section.blurb && <p>{section.blurb}</p>}
        </div>
        {all.length > SHELF_PREVIEW && (
          <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={onToggle}>
            {open ? "Show fewer" : `Show all ${all.length}`}
          </button>
        )}
      </div>
      <div className="lgrid">
        {shown.map((v) => (
          <DsVideoTile key={v._id} v={v} label={section.label} />
        ))}
      </div>
      {hidden > 0 && (
        <div className="lmore">
          <button type="button" className="ds-btn btn-o" onClick={onToggle}>
            {hidden} more in {section.label}
          </button>
        </div>
      )}
    </div>
  );
}

export default function DsFreeLibrary() {
  const [sections, setSections] = React.useState(null);
  const [filter, setFilter] = React.useState("all");
  const [openShelves, setOpenShelves] = React.useState(() => new Set());

  React.useEffect(() => {
    const ac = new AbortController();
    fetchFreeVideoSections(ac.signal)
      .then(setSections)
      .catch((e) => {
        if (e?.name !== "AbortError") setSections([]);
      });
    return () => ac.abort();
  }, []);

  // Nothing to show is nothing to show: no heading over an empty grid, and
  // his tiles above carry the section on their own.
  if (!sections || !sections.length) return null;

  const total = sections.reduce((n, s) => n + (s.count || 0), 0);
  const visible = filter === "all" ? sections : sections.filter((s) => s.slug === filter);
  const toggle = (slug) =>
    setOpenShelves((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });

  return (
    <div className="ds-lib" data-ds-library id="library">
      <div className="sec-head mid rise">
        <span className="eyebrow">The whole channel</span>
        <h2>
          Every lesson, <span className="grad">shelved by software</span>
        </h2>
        <p className="ds-lede">
          {total} free walkthroughs from the ADLM Studio channel, filed by the tool they are about.
        </p>
      </div>
      <div className="filters rise" role="tablist" aria-label="Filter the library by software">
        <button
          type="button"
          role="tab"
          aria-selected={filter === "all"}
          className={filter === "all" ? "on" : undefined}
          onClick={() => setFilter("all")}
        >
          All
        </button>
        {sections.map((s) => (
          <button
            key={s.slug || "more"}
            type="button"
            role="tab"
            aria-selected={filter === s.slug}
            className={filter === s.slug ? "on" : undefined}
            onClick={() => setFilter(s.slug)}
          >
            {s.label}
          </button>
        ))}
      </div>
      {visible.map((s) => (
        <Shelf
          key={s.slug || "more"}
          section={s}
          open={filter !== "all" || openShelves.has(s.slug)}
          onToggle={() => toggle(s.slug)}
        />
      ))}
    </div>
  );
}
