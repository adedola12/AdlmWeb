# ADLM visual system — extracted from the marketing collateral

Written by reading the 2025–26 flyer set (product launches, monthly posts,
recruitment, congratulations) and the logo sheet, then reconciling it with what
`tailwind.config.js` and `features/flyers/lib/brand.js` already define.

The headline finding: **the palette was never the gap.** The hexes in the code
already match the collateral. What the website lacks is the *treatment* — the
flyers speak a confident, layered visual language the site does not use at all.
This document is that language, written down.

---

## 1. Two modes, not one

The collateral splits cleanly, and the split is meaningful rather than
decorative. Mixing them is what makes a page look off-brand.

| | **Product mode** | **Corporate mode** |
| --- | --- | --- |
| Used for | launches, plugins, pricing, "we're live" | monthly posts, recruitment, congratulations, people |
| Ground | near-black → navy gradient (`#040d18` → `#091e39`) | white → pale blue-grey (`#FFFFFF` → `#EEF1F8`) |
| Subject | a single 3D object, lit, floating on a podium | photography of people, or a document/blueprint |
| Text | white, with blue as the accent | navy `#05111f`, with blue as the accent |
| Energy | glow, bloom, lightning, depth | flat, airy, generous whitespace |

Orange is the constant across both. It is never the ground and never a large
field — it is the *interrupt*: a pill behind one word, an underline, a price
saving, a CTA. Roughly one orange element per composition.

## 2. Colour

Already in `tailwind.config.js`; no changes proposed, only usage rules.

```
navy      #05111f   ground (product mode), text (corporate mode)
navy.deep #040d18   gradient origin
navy.mid  #061528   gradient mid
navy.tert #091e39   gradient end, raised surfaces
blue.700  #005be3   primary action, headline fill
blue.500  #36a3ff   glow, highlights, dark-mode text accent
orange    #E86A27   the interrupt — one per composition
white     #FFFFFF   product-mode text, corporate-mode ground
```

**Rule that matters most:** orange and blue never compete at the same size.
Every flyer that works has one dominant (blue, almost always) and orange as a
smaller accent. The two logo colourways exist so the lockup can pick whichever
is *not* dominant in its surroundings.

## 3. Type

Lexend throughout — already loaded. Weight carries hierarchy; there is no
second family. (Prata is loaded in `index.css` for one page and is not part of
this system.)

Three treatments recur:

**Eyebrow** — tracked, uppercase, small, muted.
`11–13px · 600 · letter-spacing 0.12–0.18em · uppercase`
Seen as "INTRODUCING", "RATE GENERATOR", "HAPPY NEW MONTH".

**Sticker headline** — the signature move. Heavy weight, white outline, soft
drop shadow, often two lines in contrasting weights or colours. This is what
makes a flyer read as ADLM at a glance and it appears on nearly every one.
`clamp(2.2rem, 6vw, 4.5rem) · 800 · line-height 0.95 · white outline · shadow`

**Body** — plain Lexend 400/500, generous line height (1.55–1.65), never
outlined, never over a busy area of the image.

Scale (a fifth, 1.25, which matches the collateral's jumps):
`12 · 14 · 16 · 20 · 25 · 31 · 39 · 49 · 61`

## 4. Motifs

Four, in rough order of how often they appear:

1. **Hexagon** — the plugin icons are hexagonal, and hexagon fields are the
   default background texture in corporate mode. Pale, low contrast, large.
2. **Rounded-square app tile** — heavy bevel, glossy, floating, with a glow
   beneath. This is how every product is portrayed (Quiv, Heron, Rate
   Generator, Revit).
3. **Podium** — a lit ellipse or dais under the floating subject. Sells depth.
4. **Ribbon strip** — repeating diagonal text bands, orange and blue
   alternating, running off both edges. Seasonal and announcement posts only.

## 5. Motion

Framer Motion is in and `components/effects.jsx` is built on it. The character
implied by the collateral, which is heavy and physical rather than quick and
flat:

- **Entrance:** rise + fade, 0.65s, `cubic-bezier(.2,.7,.2,1)`. Already the
  default in `<Reveal>`.
- **Stagger:** 80ms between siblings. `<Stagger>` does this.
- **Product tiles:** float — a slow 4–6s vertical drift, never a bounce. The
  objects in the flyers hang in space.
- **Glow:** breathes on the same slow cycle, offset from the float so the two
  never peak together.
- **Hover:** the existing spring tilt. Depth, not translation.
- **Never:** spin, flip, elastic overshoot, or anything under 200ms. Nothing in
  the collateral is fast; all of it is weighty.

Everything above must pass `useReducedMotion` — the float and the glow are
decorative and should simply stop, not degrade.

## 6. What this implies for the site

Ordered by leverage, not effort:

1. **Home hero** — currently a gradient with floating blobs. Product mode with
   a real 3D tile and podium is the single biggest gap between the site and the
   marketing.
2. **Product cards** — should read as the app tiles they are on the flyers:
   bevel, glow, hexagon ground.
3. **Pricing** — the flyers already solved this (thin rounded outline cards,
   blue headline, orange saving underneath). The site should copy its own
   answer rather than invent a second one.
4. **Section eyebrows** — cheap, consistent, and immediately recognisable.
5. **Learn / course pages** — corporate mode; they are about people.

## 7. Deliberately not doing

- **No new typeface.** The collateral is Lexend and near-Lexend; adding a
  display face would break the one-family rule that already holds.
- **No palette change.** It matches. Changing hexes would desynchronise the
  site from every flyer already published.
- **No literal flyer replicas.** The sticker headline works at 1080×1350 and
  would be shouting at 1440px wide. It is a hero treatment, not a heading
  style — used once per page, at most.
