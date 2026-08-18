# Snag list — adlm-studio-site

For **Richard Enoch** · repo `RichardEnoch/adlm-studio-site`
Raised while porting the site into the main ADLM web app (React). Compiled 17 August 2026.

Everything here was found by measurement, not opinion — each item says how it was found so it can
be reproduced. Items are grouped by whether they break something, or are content we need from you.

---

## A. Content we need from you

### A0. Resolved upstream — thank you
**Mobile navigation now exists and works.** We had this down as the one hard blocker: below
1000px the nav links were `display:none` with no burger anywhere. Your build now ships a `.burger`
button and a `.mnav` drawer with the full menu, and it behaves correctly — opens, traps scroll,
closes on Escape and on resize past 1000px. Removed from the blocker list.

Your 2026-08-18 commit also split the Products menu into **"By product"** and **"Part of the studio"**.
That settles the note we had raised about Ada, the mobile app and "How ADLM works" being listed
as products: your two-column split is the same distinction, made better. We had been stripping
those three entries out during the port and have stopped — your nav is now taken as-is.

### A1. CIVIQ build roadmap section — **new section, your layout** ⭐
CIVIQ is no longer "roads, drainage and earthworks". It covers **every kind of civil engineering
work**, and it ships module by module. Current state:

| Module | Status |
|---|---|
| **Road** (23 items — earthworks, pavement, road structures) | **Shipped, measuring today** |
| Culvert | In the build queue |
| Bridge Works (20 items) | In the build queue |
| Cofferdam | In the build queue |
| Railways (13 items) | In the build queue |
| Drainage Bulk Excavation, Side Drains, Demolition & Site Clearance | Specified |

Two corrections to the takeoff spec you were working from: **cofferdam is back** (the spec says it
was removed), and **culvert and cofferdam are their own modules**, not lines under Road Structures
— they carry their own temporary works.

> I drafted this section and pulled it back out: it reused `.fgrid`, which renders at 6 columns on
> that page (see B4), so it came out as three ~100px columns. The content above is right; the
> layout is yours to do.

### A1b. "View course" goes nowhere — no course page in the build
All six "View course" buttons (three on `learn.html`, three on `pricing.html`) link to
`learn#courses` — the section the button is already inside. Clicking does nothing. There is no
course detail page in the build.

*Handled on our side for now:* the two real courses are wired through to our own course pages, so
the buttons work in the merged site. The third card ("Rates & 2D Takeoff") still goes nowhere,
because that course does not exist — see A4.

### A1c. Lesson durations are invented
Each free-lesson tile carries a runtime — "REVIT · 12:41", "PLANSWIFT · 11:27" and so on. None of
them came from the videos; they are placeholders. We now store a real duration per video and render
that instead, so the captions stop claiming a length nobody measured.

### A2. `contact.html` has no form
The page is headed "Talk to a human" and contains zero `<form>` elements. Your own notes mention
repointing CTAs away from it for this reason. It should probably have the same `.sform` block the
solutions pages got.

### A3. Team portraits still monograms
`about.html` — the 270px frames are ready, but three of four are still initials (AQ, EF, ET). The
28 Unsplash images added in August are all architecture and sites, no portraits. Needs real
headshots.

### A4. Learn — fourth course copy is provisional
`learn.html` carries a fourth course with a name, a **₦85,000 price** and a syllabus that your
notes flag as written-from-real-products but unconfirmed. It must not ship as real. Either confirm
it or pull it.

---

## B. Bugs

### B1. Stray `}` in `site.css:2258`
The `@media (max-width:430px)` block is closed twice. Browsers discard the extra brace during
error recovery, so the site looks fine — but any tool that parses the stylesheet sees the rest of
the file at the wrong nesting depth.

*Found by:* brace-depth scan over `site.css`, ignoring strings and comments.

### B2. Two stray `</div>` in `about.html` (lines 73 and 150)
Both close an element that is not open. Browsers drop them; the page renders correctly.

### B3. Unclosed `<div class="frag">` — 12 occurrences
In `quiv.html`, `rategen.html`, `timepro.html` and `civiq.html`, three per page. The pattern is:

```html
<div class="frag">
  <div class="frag-t">…</div>
  <div class="frag-r"><span class="frag-k">…</span>
</div>          <!-- closes .frag-r -->
</article>      <!-- .frag never closed; the browser closes it here -->
```

Renders correctly only because the parser implicitly closes `.frag` at `</article>`.

### B4. `.fgrid` is defined twice, with different column counts
`site.css:895` → `repeat(2,1fr)`; `site.css:1937` → `repeat(6,1fr)`. The second wins everywhere
after it, so `.fgrid` means "6 columns" in practice. Worth splitting into two named classes —
anything reusing `.fgrid` expecting the documented 2 columns will come out unusably narrow.

### B5. The five Lexend font files are byte-identical
`assets/fonts/lexend-{300,400,500,600,700}.woff2` — all five are the same file, md5
`2077a5271e5c1164bdd3fbe1744157a7`, 39,680 bytes each. The `@font-face` block declares five
weights but serves one, so every weight renders identically. Either ship real per-weight files or
declare a single variable font with a `font-weight: 100 900` range.

### B6. Two corrupt images, unrecoverable from source
`hd-engineer.jpg` and `hd-night.jpg` are truncated JPEGs that decode to flat grey over the bottom
13% and 38%. Your notes confirm the originals in `Images/` are also corrupt, so they need
re-sourcing. Currently moved aside into `assets/img/_corrupt/`.

---

## C. Forms with no backend — **11 of them**

Every form on the site is `action="thanks"` (or similar) with `method="get"`. They render, they
navigate to a thank-you page, and **they send nothing anywhere**. As written, every enquiry is
silently lost.

| Page | Form |
|---|---|
| `solutions-firms` · `-professionals` · `-students` · `-institutions` | Message form ×4 |
| `civiq` | Waitlist |
| `login` | Sign in → `dash-home` |
| `signup` | Create account → `verify` |
| `dash-settings` | ×3 |
| `dash-support` | Support request |

The auth two matter most: a sign-in form that looks real and does nothing is worse than no form.

---

## D. Smaller things

- **`quiv-legacy.html` is an orphan** — no `src/` counterpart, so `build.js` never touches it. It
  still carries the old `.mega` nav and no promo band, and nothing links to it. Delete or adopt.
- **Marketing nav on app screens** — every `dash-*` and `work-*` page ships with the marketing nav
  and footer above the rail, because `build.js` adds them unconditionally. Deliberate? It reads
  oddly to have "Book a demo" above a signed-in dashboard.
- **`ic-*.png` product icons** are raster. At the sizes used in the compare table they'd be
  crisper as SVG.

---

## Notes on how this was checked

- Stylesheet: all 1,400 rules parsed and diffed before/after porting; brace depth, selector scope
  and declaration survival all asserted.
- Markup: every one of the 52 pages converted with a strict parser that refuses to guess — the
  items in section B are what it refused to guess about.
- Links: all **1,608** `href`/`src` values across every page resolved and checked against disk.
  Zero dead links, zero missing assets. That part is in very good shape.
- Icons: all 49 `<use href="#…">` references resolve against the sprite. Also clean.

The port is at `client/src/ds/` in the main repo, staged under `/preview/*`; run
`node client/scripts/verify-ds-port.mjs` to re-check any of the above.
