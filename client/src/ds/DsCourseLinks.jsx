// Points his "View course" buttons at the real course pages.
//
// Every one of them — three on Learn, three on Pricing — links to
// `learn#courses`, which is the section the button is already sitting in. So
// the button appears to do nothing. He has no course detail page in his build,
// but this app does: /learn/course/:sku.
//
// This wraps a page and rewrites those CTAs to the matching course, leaving
// everything else about his cards alone. A card with no matching course keeps
// his original link rather than being pointed at a guess — the third card,
// "Rates & 2D Takeoff", is a course that does not exist (see the snag list).

import React from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../config.js";

// His card title -> terms that must ALL appear in the real course title.
const MATCH = {
  "BIM for Building Works": ["building works"],
  "BIM for MEP & HVAC": ["mep"],
};

export default function DsCourseLinks({ children }) {
  const navigate = useNavigate();
  const [courses, setCourses] = React.useState(null);
  const rootRef = React.useRef(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/learn/courses`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.json();
        const items = raw.items || raw.courses || (Array.isArray(raw) ? raw : []);
        if (alive) setCourses(items);
      } catch {
        if (alive) setCourses([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  React.useEffect(() => {
    if (!courses?.length || !rootRef.current) return undefined;
    const root = rootRef.current;

    const wire = () => {
      for (const card of root.querySelectorAll(".pcard2")) {
        const title = (card.querySelector("h3")?.textContent || "").trim();
        const terms = MATCH[title];
        if (!terms) continue;

        const course = courses.find((c) => {
          const t = String(c.title || c.name || "").toLowerCase();
          return terms.every((n) => t.includes(n));
        });
        const sku = course?.sku || course?.key;
        if (!sku) continue;

        // His CTA is the "View course" link at the foot of the card.
        const cta = [...card.querySelectorAll("a")].find((a) =>
          /view course/i.test(a.textContent),
        );
        if (cta) cta.dataset.courseSku = sku;
      }
    };

    wire();
    const mo = new MutationObserver(wire);
    mo.observe(root, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [courses]);

  const onClick = React.useCallback(
    (e) => {
      const cta = e.target.closest?.("a[data-course-sku]");
      if (!cta) return;
      e.preventDefault();
      navigate(`/learn/course/${encodeURIComponent(cta.dataset.courseSku)}`);
    },
    [navigate],
  );

  return (
    <div ref={rootRef} onClickCapture={onClick}>
      {children}
    </div>
  );
}
