// Reusable, dependency-free motion/3D primitives for the ADLM UI upgrade.
//
//   <Reveal>   — fades + slides content in once it scrolls into view.
//   <TiltCard> — gives a card a subtle 3D hover-tilt + cursor spotlight.
//
// Both degrade gracefully:
//   • prefers-reduced-motion  → no motion, content shown immediately.
//   • touch / coarse pointers → tilt disabled (no hover to drive it).
//
// Styling lives in index.css (.fx-reveal / .tilt / .spotlight). These
// components only toggle classes and set CSS custom properties, so they
// add no runtime cost beyond a single IntersectionObserver / rAF.

import React from "react";

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Scroll-reveal wrapper. Renders a DOM element (default <div>) that fades
 * and rises into place the first time it enters the viewport.
 *
 * @param {string}  as            DOM tag to render ("div", "section", "li"…)
 * @param {number}  delay         Stagger delay in ms (sets --reveal-delay)
 * @param {boolean} once          Reveal only once (default true)
 */
export function Reveal({
  as: Tag = "div",
  delay = 0,
  once = true,
  className = "",
  style,
  children,
  ...rest
}) {
  const ref = React.useRef(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (prefersReducedMotion()) {
      setVisible(true);
      return undefined;
    }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return undefined;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          if (once) obs.disconnect();
        } else if (!once) {
          setVisible(false);
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [once]);

  return (
    <Tag
      ref={ref}
      className={`fx-reveal ${visible ? "is-visible" : ""} ${className}`}
      style={{ "--reveal-delay": `${delay}ms`, ...style }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/**
 * 3D tilt card. Tracks the cursor over the element and tilts it toward the
 * pointer while moving a soft spotlight sheen. Disabled on touch devices
 * and when reduced motion is requested — there it's just a plain div.
 *
 * @param {number}  max     Max tilt angle in degrees (default 8)
 * @param {boolean} glare   Enable the cursor spotlight sheen (default true)
 */
export function TiltCard({
  max = 8,
  glare = true,
  className = "",
  style,
  children,
  ...rest
}) {
  const ref = React.useRef(null);
  const raf = React.useRef(0);
  const [enabled, setEnabled] = React.useState(false);

  React.useEffect(() => {
    const finePointer =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    setEnabled(finePointer && !prefersReducedMotion());
  }, []);

  function handleMove(e) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width; // 0..1
    const py = (e.clientY - rect.top) / rect.height; // 0..1
    const ry = (px - 0.5) * 2 * max; // rotateY: tilt left/right
    const rx = -(py - 0.5) * 2 * max; // rotateX: tilt up/down
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      el.style.setProperty("--tilt-rx", `${rx.toFixed(2)}deg`);
      el.style.setProperty("--tilt-ry", `${ry.toFixed(2)}deg`);
      el.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
      el.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
    });
  }

  function handleLeave() {
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(raf.current);
    el.style.setProperty("--tilt-rx", "0deg");
    el.style.setProperty("--tilt-ry", "0deg");
  }

  React.useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return (
    <div
      ref={ref}
      onMouseMove={enabled ? handleMove : undefined}
      onMouseLeave={enabled ? handleLeave : undefined}
      className={`${enabled ? "tilt " : ""}${glare ? "spotlight " : ""}${className}`}
      style={style}
      {...rest}
    >
      {children}
    </div>
  );
}

export default { Reveal, TiltCard };
