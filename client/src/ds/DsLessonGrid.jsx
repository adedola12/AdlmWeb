// His free-lesson block on Learn (learn.html #lessons, site.js LRN-2), on the
// real YouTube library (R02, R10).
//
// His filter row, his tiles and his "Show more lessons": a row of tiles to
// start, and each click drops the next row out from behind the one above.
// What changed is where the tiles come from. His nine were demo posters; these
// are every published lesson in /learn/free/sections, so a new upload filed by
// the fifteen-minute job (server/util/freeLibraryAuto.js) shows up here by
// itself. The whole channel lives inside this section: nothing spills out
// below it.
//
// React draws the rows (his site.js moved DOM nodes about, which React cannot
// share), with his classes, so ds.css styles it exactly as his page.
// The chosen filter is in the URL (?lessons=PlanSwift) so a link can open it.

import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { extractYouTubeId, fetchLessonLibrary, formatDuration, youtubeThumb } from "../lib/freeVideos.js";

const perRow = () => {
  const w = typeof window === "undefined" ? 1280 : window.innerWidth;
  return w <= 600 ? 1 : w <= 900 ? 2 : 3;
};

const reduceMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

const time = (d) => (d ? new Date(d).getTime() || 0 : 0);

// Recommended lessons lead, then the editor's sort, then the newest upload.
function byPlace(a, b) {
  return (
    Number(!!b.v.recommended) - Number(!!a.v.recommended) ||
    (Number(b.v.sort) || 0) - (Number(a.v.sort) || 0) ||
    time(b.v.publishedAt) - time(a.v.publishedAt)
  );
}

function Tile({ v, section, index }) {
  const id = extractYouTubeId(v.youtubeId);
  const clock = formatDuration(v.durationSec);
  const eyebrow = [section.filter || section.label, clock].filter(Boolean).join(" · ");
  return (
    <Link
      className="ltile"
      data-cat={section.filter || ""}
      to={`/learn/free/${encodeURIComponent(v._id)}`}
      style={{ "--c": index }}
    >
      <img src={v.thumbnailUrl || youtubeThumb(id)} alt="" loading="lazy" />
      <div className="lt">
        <span className="playbtn">
          <svg viewBox="0 0 24 24">
            <use href="#i-play" />
          </svg>
        </span>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h4>{v.title}</h4>
        {section.label && <p>{section.label}</p>}
      </div>
    </Link>
  );
}

/** His drop: the new row grows from nothing, its tiles emerge from behind. */
function Row({ tiles, isNew }) {
  const ref = React.useRef(null);
  React.useLayoutEffect(() => {
    const row = ref.current;
    if (!isNew || !row || reduceMotion()) return undefined;
    const h = row.getBoundingClientRect().height;
    row.classList.add("lrow-new");
    row.style.height = "0px";
    row.style.marginTop = "0px";
    void row.offsetHeight;
    row.style.height = `${h}px`;
    row.style.marginTop = "22px";
    const done = () => {
      row.style.height = "";
      row.style.marginTop = "";
      row.classList.remove("lrow-new");
    };
    row.addEventListener("transitionend", done, { once: true });
    const t = setTimeout(done, 900);
    return () => {
      clearTimeout(t);
      row.removeEventListener("transitionend", done);
      done();
    };
  }, [isNew]);
  return (
    <div className="lrow" ref={ref}>
      {tiles}
    </div>
  );
}

export default function DsLessonGrid() {
  const [params, setParams] = useSearchParams();
  const [lib, setLib] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [cols, setCols] = React.useState(perRow);
  const [step, setStep] = React.useState(0);
  const [grown, setGrown] = React.useState(-1);

  React.useEffect(() => {
    const ctl = new AbortController();
    fetchLessonLibrary(ctl.signal)
      .then(setLib)
      .catch((e) => {
        if (e?.name !== "AbortError") setFailed(true);
      });
    return () => ctl.abort();
  }, []);

  React.useEffect(() => {
    const onResize = () => setCols(perRow());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const all = React.useMemo(() => {
    const out = [];
    for (const s of lib?.sections || []) for (const v of s.videos || []) out.push({ v, section: s });
    return out.sort(byPlace);
  }, [lib]);

  // Only chips with a lesson behind them.
  const chips = React.useMemo(() => {
    const have = new Set(all.map((x) => x.section.filter).filter(Boolean));
    return (lib?.filters || []).filter((f) => have.has(f));
  }, [all, lib]);

  const want = params.get("lessons") || "all";
  const filter = want === "all" || chips.includes(want) ? want : "all";
  const list = filter === "all" ? all : all.filter((x) => x.section.filter === filter);
  const shown = Math.min(list.length, cols * (step + 1));
  const left = list.length - shown;

  const pick = (f) => {
    setStep(0);
    setGrown(-1);
    const next = new URLSearchParams(params);
    if (f === "all") next.delete("lessons");
    else next.set("lessons", f);
    setParams(next, { replace: true, preventScrollReset: true });
  };

  const rows = [];
  for (let i = 0; i < shown; i += cols) {
    const r = i / cols;
    rows.push(
      <Row
        key={`${filter}-${cols}-${r}`}
        isNew={r === grown}
        tiles={list.slice(i, i + cols).map((x, c) => <Tile key={x.v._id} v={x.v} section={x.section} index={c} />)}
      />,
    );
  }

  return (
    <>
      {chips.length > 0 && (
        <div className="filters" id="lesson-filters">
          {["all", ...chips].map((f) => (
            <button key={f} type="button" className={f === filter ? "on" : undefined} onClick={() => pick(f)}>
              {f === "all" ? "All" : f}
            </button>
          ))}
        </div>
      )}
      <div className="lgrid lrows">
        {rows}
      </div>
      <div className="lmore">
        {left > 0 && (
          <button
            type="button"
            className="ds-btn btn-o"
            onClick={() => {
              setGrown(step + 1);
              setStep((s) => s + 1);
            }}
          >
            Show more lessons
          </button>
        )}
        <span className="lcount" aria-live="polite">
          {failed ? (
            <>
              The lessons could not be loaded just now.{" "}
              <a href="https://www.youtube.com/@ADLMStudio" target="_blank" rel="noopener noreferrer">
                Watch them on YouTube
              </a>
            </>
          ) : !lib ? (
            "Loading lessons…"
          ) : left > 0 ? (
            `Showing ${shown} of ${list.length} lessons`
          ) : list.length ? (
            `All ${list.length} lessons`
          ) : (
            ""
          )}
        </span>
      </div>
    </>
  );
}
