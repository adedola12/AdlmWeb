// Motion primitives for the ADLM UI, built on Framer Motion.
//
//   <Reveal>   — fades + slides content in once it scrolls into view.
//   <TiltCard> — gives a card a subtle 3D hover-tilt + cursor spotlight.
//   <Stagger>  — reveals its children in sequence, no per-child delay maths.
//
// These were hand-rolled against IntersectionObserver and CSS custom
// properties. The API is unchanged so call sites did not have to move, but the
// implementation now goes through Framer Motion: springs instead of fixed
// easing curves, interruptible instead of restart-from-zero, and one system to
// reason about rather than JS that sets variables which CSS elsewhere reads.
//
// Both still degrade the way they did:
//   • prefers-reduced-motion  → no motion, content shown immediately.
//   • touch / coarse pointers → tilt disabled (no hover to drive it).
//
// The reduced-motion check is Framer's own `useReducedMotion`, which tracks the
// media query live — the previous version read it once on mount, so a viewer
// turning the preference on mid-session kept the animations until reload.

import React from "react";
import {
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";

/* Shared feel. One curve for the whole UI: quick to start, settles without
   overshoot. Duration-based rather than a spring so that staggers stay
   predictable when many items reveal at once. */
const EASE = [0.2, 0.7, 0.2, 1];
const DURATION = 0.65;

/**
 * Scroll-reveal wrapper. Fades and rises into place the first time it enters
 * the viewport.
 *
 * @param {string}  as     DOM tag to render ("div", "section", "li"…)
 * @param {number}  delay  Stagger delay in ms (kept in ms for the old call sites)
 * @param {boolean} once   Reveal only once (default true)
 * @param {number}  y      Distance to rise from, in px (default 20)
 */
export function Reveal({
  as: Tag = "div",
  delay = 0,
  once = true,
  y = 20,
  className = "",
  style,
  children,
  ...rest
}) {
  const ref = React.useRef(null);
  const reduced = useReducedMotion();
  // margin trims the bottom of the viewport so a reveal fires slightly before
  // the element is fully on screen, matching the old -10% rootMargin.
  const inView = useInView(ref, { once, margin: "0px 0px -10% 0px", amount: 0.15 });

  const Component = motion[Tag] || motion.div;
  const show = reduced || inView;

  return (
    <Component
      ref={ref}
      className={className}
      style={style}
      initial={reduced ? false : { opacity: 0, y }}
      animate={show ? { opacity: 1, y: 0 } : { opacity: 0, y }}
      transition={{ duration: DURATION, ease: EASE, delay: delay / 1000 }}
      {...rest}
    >
      {children}
    </Component>
  );
}

/**
 * Reveals children one after another.
 *
 * Replaces the pattern of handing each <Reveal> an increasing `delay` prop,
 * which meant renumbering every sibling whenever one was inserted or removed.
 *
 * @param {number} gap  Seconds between children (default 0.08)
 */
export function Stagger({
  as: Tag = "div",
  gap = 0.08,
  once = true,
  className = "",
  children,
  ...rest
}) {
  const ref = React.useRef(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref, { once, margin: "0px 0px -10% 0px", amount: 0.15 });
  const Component = motion[Tag] || motion.div;

  return (
    <Component
      ref={ref}
      className={className}
      initial={reduced ? false : "hidden"}
      animate={reduced || inView ? "shown" : "hidden"}
      variants={{ shown: { transition: { staggerChildren: gap } } }}
      {...rest}
    >
      {children}
    </Component>
  );
}

/** A child of <Stagger>. Inherits the parent's timing; takes no delay itself. */
export function StaggerItem({ as: Tag = "div", y = 20, className = "", children, ...rest }) {
  const Component = motion[Tag] || motion.div;
  return (
    <Component
      className={className}
      variants={{
        hidden: { opacity: 0, y },
        shown: { opacity: 1, y: 0, transition: { duration: DURATION, ease: EASE } },
      }}
      {...rest}
    >
      {children}
    </Component>
  );
}

/**
 * 3D tilt card. Tracks the cursor and tilts toward it while a soft spotlight
 * follows. Disabled on touch devices and under reduced motion, where it
 * renders as a plain div.
 *
 * The tilt is spring-damped now rather than transitioned, so flicking the
 * cursor across a card settles instead of snapping between two CSS states.
 *
 * @param {number}  max    Max tilt angle in degrees (default 8)
 * @param {boolean} glare  Enable the cursor spotlight sheen (default true)
 */
export function TiltCard({
  max = 8,
  glare = true,
  className = "",
  style,
  children,
  ...rest
}) {
  const reduced = useReducedMotion();
  const [finePointer, setFinePointer] = React.useState(false);

  React.useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const query = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => setFinePointer(query.matches);
    sync();
    // A laptop with a touchscreen can switch between the two; listening keeps
    // the tilt honest instead of latching to whatever was true at mount.
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const enabled = finePointer && !reduced;

  // 0..1 pointer position within the card.
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);

  const spring = { stiffness: 260, damping: 26, mass: 0.4 };
  const rotateY = useSpring(useTransform(px, [0, 1], [-max, max]), spring);
  const rotateX = useSpring(useTransform(py, [0, 1], [max, -max]), spring);
  const mx = useTransform(px, (v) => `${(v * 100).toFixed(1)}%`);
  const my = useTransform(py, (v) => `${(v * 100).toFixed(1)}%`);

  function handleMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - rect.left) / rect.width);
    py.set((e.clientY - rect.top) / rect.height);
  }

  function handleLeave() {
    px.set(0.5);
    py.set(0.5);
  }

  if (!enabled) {
    return (
      <div className={`${glare ? "spotlight " : ""}${className}`} style={style} {...rest}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className={`${glare ? "spotlight " : ""}${className}`}
      style={{
        ...style,
        rotateX,
        rotateY,
        transformPerspective: 900,
        transformStyle: "preserve-3d",
        // Read by .spotlight::after, which stays in CSS: a pseudo-element
        // cannot be driven by a motion value, and a real element would sit in
        // the way of the card's own pointer events.
        "--mx": mx,
        "--my": my,
      }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export default { Reveal, TiltCard, Stagger, StaggerItem };
