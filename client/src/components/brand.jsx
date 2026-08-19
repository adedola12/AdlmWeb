// Brand primitives — the marketing collateral's visual language, as components.
//
// See docs/BRAND_SYSTEM.md for where each of these comes from. The short
// version: the flyers speak a layered, physical language (sticker headlines,
// hexagon fields, floating 3D tiles on lit podiums, ribbon strips) that the
// site did not use anywhere. These are those moves, reusable and reduced-motion
// aware.
//
// Colour and type are NOT redefined here — they already match the collateral in
// tailwind.config.js. What was missing was treatment.
//
// Motion character is deliberately heavy: nothing spins, nothing overshoots,
// nothing runs under 200ms. The objects in the flyers hang in space.

import React from "react";
import { motion, useReducedMotion } from "framer-motion";

// Bound in a value position rather than written as motion.div inline. The lint
// config does not credit a JSX-only member reference, so the import otherwise
// reads as unused — the same reason effects.jsx resolves its tag through
// motion[Tag] instead of writing the member access in the markup.
const MotionDiv = motion.div;

/* ── Eyebrow ──────────────────────────────────────────────────────────────
   "INTRODUCING", "RATE GENERATOR", "HAPPY NEW MONTH". Tracked uppercase above
   a heading. The cheapest way to make a section read as ADLM. */
export function Eyebrow({ as = "p", tone = "muted", className = "", children }) {
  const Component = as;
  const tones = {
    muted: "text-slate-500 dark:text-adlm-dark-dim",
    blue: "text-adlm-blue-700 dark:text-adlm-blue-500",
    orange: "text-adlm-orange",
    onDark: "text-white/60",
  };
  return (
    <Component
      className={`text-[11px] sm:text-xs font-semibold uppercase tracking-[0.16em] ${
        tones[tone] || tones.muted
      } ${className}`}
    >
      {children}
    </Component>
  );
}

/* ── Sticker heading ──────────────────────────────────────────────────────
   The signature treatment: heavy weight, white outline, soft drop shadow.

   Used ONCE per page, as a hero. It is sized for a 1080×1350 flyer, and at
   1440px wide it shouts. See §7 of BRAND_SYSTEM.md. `paint-order: stroke` is
   what keeps the outline outside the glyph instead of eating into it; without
   it the letterforms thin out and the weight is lost. */
export function StickerHeading({
  as = "h1",
  outline = 6,
  className = "",
  style,
  children,
}) {
  const Component = as;
  return (
    <Component
      className={`font-extrabold leading-[0.95] tracking-tight ${className}`}
      style={{
        WebkitTextStroke: `${outline}px #fff`,
        paintOrder: "stroke fill",
        filter: "drop-shadow(0 6px 0 rgba(5,17,31,.18)) drop-shadow(0 14px 24px rgba(5,17,31,.28))",
        ...style,
      }}
    >
      {children}
    </Component>
  );
}

/* ── Hexagon field ────────────────────────────────────────────────────────
   Corporate mode's default texture. Pale, large, low contrast. It should
   never be the thing you notice. An inline SVG pattern rather than an image
   so it costs no request and recolours with the theme. */
export function HexField({ className = "", opacity = 0.5, size = 96 }) {
  const hex =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${Math.round(size * 0.866)}' viewBox='0 0 100 87'>` +
    `<path d='M25 0 L75 0 L100 43.5 L75 87 L25 87 L0 43.5 Z' fill='none' stroke='%23005be3' stroke-width='1'/></svg>`;
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 ${className}`}
      style={{
        backgroundImage: `url("data:image/svg+xml,${hex.replace(/#/g, "%23")}")`,
        backgroundRepeat: "repeat",
        opacity,
        maskImage: "radial-gradient(ellipse at center, #000 40%, transparent 78%)",
        WebkitMaskImage: "radial-gradient(ellipse at center, #000 40%, transparent 78%)",
      }}
    />
  );
}

/* ── Glow tile ────────────────────────────────────────────────────────────
   How every product is portrayed on the flyers: a floating object with a lit
   podium beneath it.

   The float and the glow run on deliberately different periods so they never
   peak together: synchronised, they read as one pulsing element rather than
   an object hanging in light. Both are decorative, so under reduced motion
   they stop outright rather than degrading to something faster. */
export function GlowTile({
  children,
  podium = true,
  float = true,
  className = "",
  glow = "#36a3ff",
}) {
  const reduced = useReducedMotion();
  const animate =
    float && !reduced ? { y: [0, -14, 0] } : { y: 0 };

  return (
    <div className={`relative grid place-items-center ${className}`}>
      {podium && (
        <MotionDiv
          aria-hidden="true"
          className="absolute bottom-0 h-8 w-3/5 rounded-[50%] blur-xl"
          style={{ background: glow }}
          animate={reduced ? { opacity: 0.35 } : { opacity: [0.25, 0.5, 0.25] }}
          transition={
            reduced ? undefined : { duration: 7, repeat: Infinity, ease: "easeInOut" }
          }
        />
      )}
      <MotionDiv
        className="relative"
        animate={animate}
        transition={
          reduced ? undefined : { duration: 5.5, repeat: Infinity, ease: "easeInOut" }
        }
      >
        {children}
      </MotionDiv>
    </div>
  );
}

/* ── App tile ─────────────────────────────────────────────────────────────
   How every product is presented on the flyers: a bevelled, glossy rounded
   square sitting on a pale hexagon ground with light pooled underneath.

   This is the presentation shell only, whatever the product actually shows
   (a poster, a hover-to-play preview, an icon) goes in as children, so the
   treatment is shared without the shell knowing anything about media.

   The glow is a hover state rather than an idle animation. A grid of twenty
   products each breathing on its own cycle is a fairground; the flyers get
   away with it because there is exactly one object on the page. */
export function AppTile({ children, className = "", ground = true, glow = true, ...rest }) {
  return (
    // Rest props land on the outer element so a caller can make the whole tile
    // the hover target — the media inside is smaller than the thing that looks
    // hoverable, and hovering the padding should still count.
    <div className={`group/tile relative ${className}`} {...rest}>
      {/* Light pooled under the tile. Sits behind, and is clipped by nothing,
          so it reads as spill rather than as a border. */}
      {glow && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-6 bottom-1 h-6 rounded-[50%] bg-adlm-blue-600/0 blur-xl transition-colors duration-500 group-hover/tile:bg-adlm-blue-600/40"
        />
      )}

      <div
        className={`relative overflow-hidden rounded-2xl p-2.5 ring-1 ring-black/5 dark:ring-white/10 ${
          ground
            ? "bg-gradient-to-b from-slate-50 to-slate-100 dark:from-adlm-dark-raised dark:to-adlm-dark-panel"
            : ""
        }`}
      >
        {ground && <HexField opacity={0.12} size={72} />}

        {/* The tile face. The ring plus the top highlight is what reads as a
            bevel, a shadow alone just looks like a floating rectangle. */}
        <div className="relative rounded-xl overflow-hidden ring-1 ring-black/10 dark:ring-white/10 shadow-[0_6px_16px_-6px_rgba(5,17,31,.45)]">
          {children}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/20 to-transparent"
          />
        </div>
      </div>
    </div>
  );
}

/* ── Ribbon strip ─────────────────────────────────────────────────────────
   The diagonal repeating bands from the seasonal posts. Runs off both edges by
   design, so it is always wider than its container and rotated.

   Marquee only when motion is allowed; otherwise it is a static band, which is
   what it looks like on the printed flyers anyway. */
export function RibbonStrip({
  text = "ADLM Studio",
  tone = "orange",
  angle = -4,
  speed = 28,
  className = "",
}) {
  const reduced = useReducedMotion();
  const bg = tone === "blue" ? "bg-adlm-blue-700" : "bg-adlm-orange";
  const items = Array.from({ length: 12 }, (_, i) => i);

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none overflow-hidden ${className}`}
      style={{ transform: `rotate(${angle}deg)` }}
    >
      <MotionDiv
        className={`flex w-max gap-8 py-2 ${bg}`}
        animate={reduced ? undefined : { x: ["0%", "-50%"] }}
        transition={
          reduced ? undefined : { duration: speed, repeat: Infinity, ease: "linear" }
        }
      >
        {/* Duplicated so the -50% loop lands on an identical frame. */}
        {[...items, ...items].map((n, i) => (
          <span
            key={i}
            className="whitespace-nowrap text-xs font-semibold uppercase tracking-[0.18em] text-white"
          >
            {text}
          </span>
        ))}
      </MotionDiv>
    </div>
  );
}

export default { Eyebrow, StickerHeading, HexField, GlowTile, AppTile, RibbonStrip };
