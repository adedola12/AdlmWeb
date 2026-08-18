// Makes his free-lesson tiles play the real videos.
//
// His tiles are complete: thumbnail, play badge, category, duration, title and
// a line of copy. What they are not is wired — the whole grid is static markup
// with no destination, so the play button does nothing.
//
// This wraps the Learn page and, once his tiles are on screen, turns each one
// into a link to the matching video on /learn/free/:id. Nothing about his
// markup changes: his thumbnails, his copy and his layout are left exactly as
// designed. That was the instruction, and it is also the right call — his art
// direction is better than a wall of YouTube stills.
//
// Matching is by title against GET /learn/free. A tile that cannot be matched
// with confidence goes to the library rather than to a guess — sending someone
// to a PlanSwift lesson when they clicked a Revit one is worse than one extra
// click. What it must never do is nothing: an earlier version left unmatched
// tiles inert, so a momentary API outage turned the entire section into dead
// artwork with no hint why. Every tile is now clickable, always.

import React from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../config.js";

// His tile title -> terms that must ALL appear in the real video's title.
//
// Written out rather than fuzzy-matched: there are nine, and an explicit table
// is something you can check by eye. Every term must match, not any — the
// Revit video is titled "Master Architectural Quantity Takeoff … | Walls,
// Windows, Doors, and More!", so an any-match on "walls, window" pointed his
// PlanSwift walls lesson at the Revit video. Naming the host plugin
// disambiguates the pairs that share subject matter.
const MATCH = {
  "Master architectural quantity takeoff": ["master architectural quantity takeoff"],
  "Columns, beams and slabs": ["columns, beams"],
  "Foundation takeoff tutorial": ["planswift", "foundation takeoff"],
  "Frame takeoff tutorial": ["planswift", "frame takeoff"],
  "Walls, windows and doors": ["planswift", "walls, window"],
  "Roof works": ["planswift", "roof works"],
  "Generate a BoQ in minutes": ["generate accurate bill of quantities in minutes"],
  "Installing with the Hub": ["getting started with the adlm planswift plugin"],
  // "Building a defensible rate" is a RateGen lesson. There is no RateGen
  // video in the library, so it stays inert until one exists.
};

// 761 -> "12:41", 3723 -> "1:02:03" — his format.
function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

function findVideo(title, videos) {
  const terms = MATCH[title.trim()];
  if (!terms) return null;
  return (
    videos.find((v) => {
      const t = String(v.title || "").toLowerCase();
      return terms.every((n) => t.includes(n));
    }) || null
  );
}

export default function DsFreeLessons({ children }) {
  const navigate = useNavigate();
  const [videos, setVideos] = React.useState(null);
  const rootRef = React.useRef(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/learn/free?page=1&pageSize=60`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.json();
        const items = raw.items || raw.videos || (Array.isArray(raw) ? raw : []);
        if (alive) setVideos(items.filter((v) => v.isPublished !== false));
      } catch {
        if (alive) setVideos([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Attach the destination to each of his tiles once the library has loaded.
  //
  // His grid starts at three tiles and reveals the rest through "Show more
  // lessons", so this cannot run only once — the six revealed later would stay
  // inert. A MutationObserver re-runs it whenever tiles are added.
  React.useEffect(() => {
    if (!videos || !rootRef.current) return undefined;
    const root = rootRef.current;

    const wire = () => {
    const tiles = root.querySelectorAll(".ltile");
    const unmatched = [];

    for (const tile of tiles) {
      const title = tile.querySelector("h4")?.textContent || "";
      const video = findVideo(title, videos);
      if (video) {
        tile.dataset.videoId = video._id;
        tile.dataset.dest = `/learn/free/${video._id}`;

        // His eyebrow reads "REVIT · 12:41" — the category is his editorial
        // choice, the runtime was invented. Replace only the time, and only
        // when we actually know it, so a video with no stored duration keeps
        // his caption rather than showing a blank or a zero.
        const secs = Number(video.durationSec) || 0;
        if (secs > 0) {
          const eyebrow = tile.querySelector(".eyebrow");
          if (eyebrow && !eyebrow.dataset.durationSet) {
            eyebrow.textContent = eyebrow.textContent.replace(
              /\d+:\d{2}(?::\d{2})?/,
              formatDuration(secs),
            );
            eyebrow.dataset.durationSet = "1";
          }
        }
      } else {
        unmatched.push(title.trim());
        delete tile.dataset.videoId;
        // No confident match — the library, not a guess and not a dead tile.
        tile.dataset.dest = "/learn";
      }
      tile.style.cursor = "pointer";
      // His tile is an <article>, so give it the affordances a link would have.
      tile.setAttribute("role", "link");
      tile.setAttribute("tabindex", "0");
      tile.setAttribute("aria-label", video ? `Play: ${title.trim()}` : `Browse lessons: ${title.trim()}`);
    }

    if (unmatched.length) {
      // Deliberately visible: a tile with no video is a content gap, not a
      // silent condition to swallow.
      console.info(
        `[ds] free lessons with no matching video (left inert): ${unmatched.join(" · ")}`,
      );
    }
    };

    wire();
    const mo = new MutationObserver(wire);
    mo.observe(root, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [videos]);

  const onActivate = React.useCallback(
    (e) => {
      const tile = e.target.closest?.(".ltile");
      if (!tile) return;
      if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
      // Until the library loads, or if it never does, the tile still goes
      // somewhere useful.
      const dest = tile.dataset.dest || "/learn";
      e.preventDefault();
      navigate(dest);
    },
    [navigate],
  );

  return (
    <div ref={rootRef} onClick={onActivate} onKeyDown={onActivate}>
      {children}
    </div>
  );
}
