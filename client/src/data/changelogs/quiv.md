---
slug: quiv
name: QUIV
tagline: Quantity takeoff & estimating for Autodesk Revit
category: QUIV
accent: orange
icon: cube
status: live
order: 1
compatibility: Revit 2024, 2026 & 2027
summary: Model-based quantity takeoff, priced budgets and a dockable workspace — right inside Revit.
---

<!--
  ────────────────────────────────────────────────────────────────────────
  THIS IS THE ONLY FILE YOU EDIT TO UPDATE QUIV'S "What's New" PAGE.
  A build step turns every src/data/changelogs/*.md file into
  src/data/changelogs.js automatically
  (npm run gen:changelogs — also runs on every build & dev start).

  FRONT MATTER (the --- block at the very top) controls the product card:
    slug / name / tagline / category / accent / icon / status / order /
    compatibility / summary.
    • accent: orange | blue | sky | emerald | violet | amber
    • icon:   cube | map | layers | zap | dollar | play | trending | book
    • status: live | coming-soon   (coming-soon shows a placeholder state)

  RELEASE FORMAT (keep it exactly like the releases below):
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

## 3.1.9 — 28 August 2026 — Linked models, the whole takeoff in one go & a much faster run

QUIV now measures a structural model linked into your architectural one, hands you the entire takeoff in a single run split by level and by type, and runs it in about a third of the time. Nothing is priced until you ask, and an export now shows only the rates you set — anything unpriced reads 0 rather than a figure nobody chose.

### ✨ New

- **Full Handover.** Hand QUIV the whole takeoff and watch it work. It asks permission once, then walks every ticked item on your Take off List — level by level, type by type — switching the Revit view as it goes so you can see what is being measured. A modal progress panel shows the current action, what has been saved, how many were skipped and roughly how long is left. Cancel at any moment and choose to stop where it is or roll the whole run back; a cancel never interrupts a save in progress. Modules that need you to pick elements in the model are listed for you rather than guessed at.
- **Every level, every type, on its own line.** A run no longer produces one lumped figure per module. Each level is split into the types that level actually has — every beam size, every column size, every wall type, every door and window type — so the bill carries one line per level per type and each figure can be checked against the model. A level that holds none of a given thing contributes no line at all.
- **Railings & Balustrades.** A module of its own, measuring by the metre per level and per type, billed supply-and-fix.
- **Clear applied prices.** A single action removes every rate QUIV applied by itself and leaves the ones you typed untouched, so you can start pricing from a clean sheet without losing your own work.
- **Back to top.** A floating button on the Bill and the Budget returns you to the totals from anywhere in a long priced bill, instead of a long scroll back.

### 🔧 Improved

- **Linked structural models are measured.** If your structural engineer's model is linked into your architectural model, QUIV now measures the beams, columns and slabs inside it. Levels are paired by name where the two models agree and **by height where they do not** — so "00 - GROUND FLOOR" in the engineer's file is recognised as your "Ground floor level", which is what makes a real two-model job work. Every linked element is measured on exactly one level, so the levels always add back up to the whole-model total.
- **Nothing is priced until you ask.** Opening a project, saving a takeoff or loading the Budget no longer applies rates behind your back. Prices arrive when you press the button, and a takeoff nobody has priced now shows no prices — whatever produced them.
- **A rate you typed is told apart from one QUIV applied.** The Budget records where each figure came from, so your own rates survive a refresh, a rebuild and a reload.
- **A much faster takeoff.** A full run on a seven-storey model dropped from about seventeen minutes to around six. Most of that was QUIV waiting rather than measuring: fixed pauses that outlasted work already finished, waits that could never be satisfied, and steps planned for levels that hold nothing.
- **A faster dashboard and Budget.** Recent projects load in under a second instead of stalling for the best part of a minute, and the Budget no longer freezes while it builds — a large bill was doing many times the work it needed to on the screen thread.
- **Prices are fetched once.** Rates already looked up are remembered for the session instead of being requested again every time prices are applied.
- **Import Excel BoQ has been removed.** It was a web feature behind a desktop button and never worked from here. Import your BoQ on the web app instead.

### 🐛 Fixed

- **Exports printed prices nobody had set.** The two BoQ formats carried built-in rates from an old template — windows at ₦55,000, doors at ₦95,000, ground water at ₦850,000, and 68 more. They appeared in the rate column, and in the section and project totals, looking exactly like rates you had agreed. The Budget workbook did the same more quietly: items you had not priced were given rates worked out from the Material module or the constants library, a stand-in labour rate where the library had none, and a 25% overhead-and-profit margin when the job carried none anywhere. Now an export prints the rate you entered, or a RateGen rate, and **0** for anything else. Quantities are untouched — a derived build-up still lists its real materials and measured quantities at 0, ready to price on the Basic Prices sheet.
- **Staircases measured zero.** Stair dimensions are now read from Revit's own stair API, with the run width taken from the stair type when an individual run cannot report it. Levels with stairs measured nothing at all before this.
- **Steel members were counted twice.** A steel beam or column sits in the same Revit category as a concrete one, so both the Beam/Column modules and Steelwork measured them — once by volume with formwork, once by weight. On one job that was 183 beams and 36 columns double-counted, carrying 15.52 m³ of concrete and over 300 m² of formwork that no steel section has. Steel now belongs to Steelwork alone, and the steel sections no longer appear in the Beam and Column type lists.
- **Module materials attached to the wrong bill line.** Materials from one trade could be mopped up onto another trade's line; each now attaches to the line it belongs to.
- **Each measurement is filed under the type it measured.** Per-type quantities were correct but could all be saved under the label "All", so every type on a level shared one description on the bill.
- **A rejected sign-in ends the session.** An expired session used to retry indefinitely instead of asking you to sign in again.
- **A new takeoff starts empty.** The money cards on the Bill no longer carry figures over from the previous takeoff.

## 3.1.7 — 31 July 2026 — Rock-solid sign-in, everywhere

QUIV signs in reliably on every install, however it was deployed — including machines set up outside the Installer Hub.

### 🔧 Improved

- **The built-in fallback address now points at the live service.** QUIV reads the ADLM service address from your machine's settings, which is why it kept working through the move while other plugins did not. It also carries a fallback address, used only when that setting is missing — a manual install that bypassed the Installer Hub, a reset Windows profile, or a brand-new workstation. That fallback still named the retired server, so a machine in one of those states would have failed to sign in for the same reason the other plugins did. It now names the live service, so QUIV works whether or not the setting is present.

## 3.1.6 — July 2026 — The AI Assistant, budgets that balance & QS-format exports

Ask QUIV for a takeoff in plain English, let it match your unpriced labour, and get a budget that reconciles line-for-line with the rate you priced — exported in proper QS format.

### ✨ New

- **QUIV AI Assistant.** Type what you want measured — "generate the entire beam and slab quantity for the first floor" — and QUIV maps it onto the right module and the real level name, then measures it with the same engines you use by hand. The assistant never invents a quantity: every result reports the element count, the level and type it applied, and the key quantities it produced, and the measured elements are highlighted and zoomed in your Revit view so you can check them.
- **AI Match Labour.** One button in the Budget sends every labour row still priced at zero — with its work description and unit — for matching against your real labour library and the labour portion of your rate build-ups. Only genuine library rates are ever applied, units must be compatible, and anything the match isn't confident about is offered as a suggestion for you to accept rather than applied silently.
- **Budgets that balance to your rate.** RateGen rates are now decomposed into the named materials behind them, plus a single "Other Materials" balancing line for waste, loading and sundries, plus labour — so the build-up adds back up to the rate you priced. A rate cap makes sure the decomposed components can never imply a rate above the RateGen headline.
- **Finishes factor & labour-rate library.** A full constants library transcribed from a reference QS schedule — rendering, POP screeding, wall and floor tiling, floor screed, emulsion painting, soil poisoning, filling density, roof sheeting — plus labour rates per bill unit for concrete, formwork, rebar, blockwork, rendering, POP, tiling, painting, screed, DPM, BRC, excavation, backfill and roof covering. Finishes items now derive real materials and labour instead of coming through unpriced, and every constant is editable.
- **Supply items priced as shares of the rate.** Doors, windows, ceilings, sanitary ware, balustrades and railings, roof members, curtain walling, MEP, wardrobes and tanks now budget as an editable material / labour share of the bill rate, so the rebuilt BoQ re-prices to exactly the figure you entered.
- **QS-format Excel export.** Revit names like "Blockwork - Lintel Concrete [L:All Floors | T:150]" become an SMM-style preamble plus a terse measured description with size and level qualifiers. Each trade group gets an unpriced italic preamble row, and a new **General Summary** sheet totals every element down to Estimated Construction Cost, with editable Preliminaries, Contingency and VAT percentages.

### 🔧 Improved

- **The rate you picked is remembered.** QUIV stores the exact rate you chose on the bill line, so its build-up re-resolves the same way on any device instead of relying on a fuzzy re-match — and picking a rate now auto-applies it to similar unpriced lines.
- **"From Budget" rates apply immediately.** Bill rates driven from the budget now price the moment budget rows load or reprice, instead of staying at 0.00 until the first cloud save.
- **Labour matches count.** Automatically matched labour rows now count toward the "Auto matched" tally so the unpriced figure reflects reality.

### 🐛 Fixed

- **Sign-in lockouts (DEVICE_MISMATCH) are gone.** Your device used to be identified partly by whichever network adapter happened to be active, so switching between Wi-Fi, ethernet, a dock, a hotspot or a VPN could make the same laptop look like a brand-new machine and block sign-in. Device identity is now network-independent, and existing licences migrate themselves the first time you sign in.
- **The Budget price refresh no longer wipes rates.** Refreshing prices blanked every labour row and every rate derived from a build-up, so they could never re-match. Existing rates are now kept, and labour rows are priced from the labour library instead.

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


Work in Metric or Imperial and switch between them at any time, with Revit 2027 supported alongside every earlier version.

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
