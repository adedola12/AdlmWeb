# QUIV for Revit — What's New

The latest features, improvements, and fixes for QUIV, ADLM's quantity takeoff and estimating plugin for Autodesk Revit. QUIV runs as a docked side panel or a pop-out window inside Revit.

> **Compatibility:** Revit 2024, 2026 & 2027

<!--
  ────────────────────────────────────────────────────────────────────────
  THIS IS THE ONLY FILE YOU EDIT TO UPDATE THE WEBSITE "What's New" PAGE.
  A build step turns it into src/data/quivChangelog.js automatically
  (npm run gen:changelog — also runs on every build & dev start).

  FORMAT (keep it exactly like the releases below):
    ## <version> — <Month YEAR> — <short title>
    <optional one–two sentence highlight paragraph>
    ### New          (also: Improved / Fixed)
    - bullet
    - bullet

  • The TOP release is automatically marked "Latest".
  • Separators in the heading are " — " (spaces around the dash).
  • Section headings are matched by keyword, so the ✨ / 🔧 / 🐛 emojis
    are optional decoration.
  ────────────────────────────────────────────────────────────────────────
-->

---

## 3.1.1 — June 2026 — Priced budgets, element-level detail & a dockable workspace

Our biggest release yet — QUIV moves beyond quantities into full priced budgets, adds element-level detail, and ships a redesigned dockable workspace that lives right inside Revit.

### ✨ New

- Per-element quantities — select any element in your model and instantly see its exact quantity and material breakdown. Available across Steelwork, Blockwork, Slab, Beam, Column, Pad & Strip Foundation, Curtain Wall, Doors, Windows, Landscaping and more.
- Bill of Quantities — saved takeoffs are now presented as a proper, structured Bill of Quantities. Re-save at any time to override and keep your BoQ in sync as the model evolves.
- Budget & margin dashboard — turn any takeoff into a priced budget in one step. Material and labour costs are derived automatically from rate build-ups, with a margin view so you can see profitability at a glance.
- Labour costing engine — labour is now priced directly from your rates and grouped right beside each module's materials, with a productivity build-up (gang × output → rate) and a live labour-rate library keeping figures realistic.
- Dockable side panel — keep QUIV open beside your model as a native Revit panel, or pop it out into its own window when you need more room.

### 🔧 Improved

- Responsive narrow dock — when docked to a slim panel the dashboard cards stack, the Take-off List collapses to a compact tick-box summary, and the canvas scales to fit instead of clipping, then expands back when widened.
- New Reset Takeoff control that also clears the attached budget in one action, plus a dedicated reset for the material database.
- Press Enter to sign in, and a live date / time now shows in the header.
- Manually entered rates are now preserved when a saved view is rebuilt.

### 🐛 Fixed

- Corrected reinforcement pricing so per-tonne rates are no longer misapplied per-kilogram.
- Aligned and wrapped the work-item headers in the Strip Foundation materials popup.
- Removed a stray shadow that left a header card appearing blank.

---

## 3.0.2 — May 2026 — Unit flexibility & Revit 2027

### ✨ New

- Metric / Imperial unit switch — work in whichever unit system suits your project and switch on the fly.
- Revit 2027 support — added a Revit 2027 build target alongside existing supported versions.

---

## 3.0.1 — April 2026 — Model checking & multi-storey takeoffs

Focused on getting your quantities right — stronger model validation and full multi-storey support.

### ✨ New

- Model Checker for Takeoff — validate your model before takeoff in a dedicated workspace, with one-click Excel export and a revamped roof workflow.
- Multi-storey Bill of Quantities — automatic multi-storey detection with a dynamic, per-floor BoQ export and smarter Excel cell-linking, so quantities flow straight into your spreadsheets.

### 🔧 Improved

- Smoother recalculation that prevents overlapping calculations on rapid edits.
- Better linked-model handling and a new element visibility filter for cleaner takeoffs.
