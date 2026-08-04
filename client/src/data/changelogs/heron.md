---
slug: heron
name: HERON
tagline: Takeoff-to-budget estimating for PlanSwift
category: ADLM Heron
accent: emerald
icon: layers
status: live
order: 3
compatibility: PlanSwift 10+
summary: 2D takeoff with automatic material + labour budgets, RateGen pricing and a fully-linked Excel BoQ — right inside PlanSwift.
---

<!--
  Edit this file to publish HERON updates. Same release format as quiv.md:
    ## <version> — <date> — <short title>
    <optional one–two sentence highlight paragraph>
    ### New   (also: Improved / Fixed)   ← only these three groups render
    - bullet

  Source of truth for these notes: the HERON plugin repo at
  ADLMPlanswiftApp/docs/CHANGELOG.md. Keep them in sync when you cut a release.
  Note: the website only renders New / Improved / Fixed, so any "Security"
  items from the plugin changelog are folded into Improved here.
-->

## 2.9.1 — 31 July 2026 — Sign-in restored

HERON could not sign in after ADLM's servers moved. It now finds the service through your machine's settings instead of an address fixed when the plugin was built, so sign-in works again — and a future move will not need a new download.

### 🔧 Improved

- **A server move no longer means a new download.** Every part of HERON that talks to ADLM now goes through one setting, `ADLM_API_BASE_URL`, which the ADLM Installer Hub writes for you. This is the same mechanism QUIV already used — and the reason QUIV kept working throughout. If we ever move the service again, it is a settings change rather than a new version for every customer.

### 🐛 Fixed

- **"Server is temporarily unavailable" when signing in.** HERON was built with ADLM's server address baked in. When the service moved to its new home, HERON kept calling the old address and every sign-in attempt failed with that message. Retrying did not help, and there was nothing you could change on your machine to point it at the working service — the address was fixed inside the plugin itself. HERON now reads the address from your machine's settings each time it starts, and sign-in works again.
- **"You are offline" while your connection was fine.** HERON decided whether you had a working connection by contacting that same retired address. Because nothing answered there, it could report you as offline — and fall back to offline behaviour — on a perfectly healthy internet connection. It now checks against the live service.
- **Rates, cloud projects and licence checks** were all affected by the same cause and all recover with this update. If HERON told you your subscription could not be verified during this period, that was this fault and not your licence.

## 2.5 — 25 July 2026 — The Specifications Release

Write your own bill descriptions. Every measured takeoff item now carries a free-text Specification — leave it blank and the bill keeps HERON's default wording; fill it in and your specification is what prints, in the cloud review, the Excel BoQ export and the Excel Takeoff Link.

### ✨ New

- **Specification input on every measured template.** Finishes, walls (blockwork & openings), services (electrical, plumbing, HVAC, fire alarm, ELV), frame, roofing and substructure — every Area, Linear and Count template gains a "Specification" field on its record form. Existing installs are patched automatically on the next launch.
- **Specifications tab.** A new sidebar view lists every takeoff item in the job at a glance — trade, item, quantity, unit, the default bill description and your specification side by side. Type or clear a specification right in the table and it is saved back onto the PlanSwift item immediately, so it survives reloads and flows into every export. Includes a search box and an "only items with a specification" filter.
- **Blank means default.** Anywhere a description is produced, a non-blank Specification wins verbatim; blank falls back to the standard QS wording exactly as before.

### 🐛 Fixed

- **Steel Tonnage crash.** Clicking Steel Tonnage could take the whole app down. HERON now has an app-wide crash shield: unexpected errors show a friendly dialog and are written to a log file instead of closing the app. The steel scan also skips and reports unreadable items rather than aborting, and a theme file that fails to load no longer kills the session.
- **Sidebar collapse** now also hides the Steel Tonnage and Specifications labels.

## 2.4.1 — 21 July 2026 — Beam accuracy fix

### 🐛 Fixed

- **Concrete in beam section now measures correctly.** The beam depth never entered the volume calculation, so the result didn't match a manual check against the measured linear metres. It now measures length × width × (thickness − slab thickness), matching the beam floor-plan tool. Thanks to the customer who reported this.
- **Beam formwork now includes the soffit.** Formwork on both beam tools was measured as the two sides only. It now measures both sides below the slab plus the soffit width, so the underside of the beam is priced.
- **Slab Thickness on the beam section tool is now entered in metres**, consistent with every other beam dimension.
- Note: existing drawn beam items keep their old formulas — redraw them, or re-create them from the template, to pick up the corrected calculation.

## 2.4 — 13 July 2026 — The Excel Link & Steel Release

A live two-way Excel Takeoff Link, a new Steel Tonnage tool that turns measured lengths into weights, and a batch of reliability fixes.

### ✨ New

- **Rates in Excel.** A new Rates tab in the Excel Takeoff Link pane lists every BoQ item's Description, Unit, Rate and Amount straight from your Budget — pick a row and drop it into your sheet to fill a rate column. It stays linked, so refreshing re-pulls updated rates.
- **Material & Labour in Excel.** The Material Takeoff tab now shows your Budget's full material + labour breakdown (with unit rate and amount), instead of the old stored-breakdown view.
- **Build a cell from several quantities.** Link multiple takeoff items into one Excel cell as a running sum with Add to Cell, and pull individual items back out with Remove from Cell — the cell re-totals automatically.
- **Steel Tonnage tab.** A new tool that scans your job for steel sections (Universal Beams/Columns, channels, angles, hollow sections) in item names and converts each measured length to net / allowance / gross tonnage, with editable connection and waste allowances.
- **Roof & truss steel.** Steel Tonnage also reads the computed roof/truss members — rafters, purlins, tie beams, king posts, struts, chords, bracing — even when their names carry no section size. Assign a section from the searchable catalogue (or type a kg/m) and the tonnage fills in; your choice locks in and survives a re-scan.
- **Live link tally.** The Takeoff Link pane shows how many cells and items are currently linked in the workbook, updating as you link, add, remove or unlink.

### 🔧 Improved

- **Auto-refresh on return to Excel.** Change a quantity or rate in HERON, switch back to your workbook, and the linked cells update automatically — no need to press Refresh (and unchanged cells are left untouched, so your Undo history is preserved).
- **Findable takeoff items.** Items that HERON renames to a full BoQ description (e.g. "DPM" → "…waterproof sheeting…") now keep their original name in front, so you can still search the pane for DPM, Topsoil, etc.
- **Readable, resizable pane.** Descriptions wrap to show in full, columns are drag-resizable, and hovering any cell shows its complete text.
- **Works offline.** The Rates and Material Takeoff lists appear even before you sign in to load prices — the figures read zero until prices load, then refresh in place.
- **Professional bill export.** The Excel Save / Export now writes a proper Bill of Quantities layout — ITEM · DESCRIPTION · QTY · UNIT · RATE · AMOUNT columns, QS item lettering (A, B, C … skipping I and O), a bold work-section header, wrapped descriptions and accounting number format (unpriced lines read "-"), with the Rate column left blank for pricing.

### 🐛 Fixed

- **Takeoff Link pane now always opens.** Previously, if Excel started on its Start screen with no workbook, clicking Takeoff Link did nothing. The pane is now created against the workbook you're actually in, and any error is shown instead of failing silently.
- **Budget "No take-off folders found."** The Budget view now re-checks PlanSwift for the open job, so it loads your folders even when the plugin started before a job was open.
- **Steel Tonnage startup crash** fixed (a theme styling error that stopped the tab from loading).

## 2.3 — 8 June 2026 — The Budget Release

Turn any takeoff into a costed budget automatically. HERON now builds a full Material & Labour schedule for every BoQ item, prices it from your RateGen library, works out your overhead & profit per item, and exports it all as a linked Excel workbook.

### ✨ New

- **Budget view (Material & Labour schedule).** A new Budget tab replaces the old Material Breakdown view. It lists every BoQ line item, grouped by takeoff folder, with its material and labour build-up underneath — computed automatically the moment you open it.
- **Automatic material breakdown.** Each item's materials are calculated from built-in QS recipes (concrete mix ratios, reinforcement by bar diameter, formwork, blockwork, rendering and more) and priced from your RateGen material library.
- **Labour from your real rates.** Labour cost is taken from the actual labour content of the matched RateGen rate — not a guess — so your build-up reflects the rates you already maintain.
- **Profit & margin per item.** HERON shows overhead + profit and a margin % on every item (green for profit, red for loss) and rolls it up to a project-level total at the top of the view.
- **Over-budget guardrail.** If an item's material + labour cost exceeds its rate, it's flagged OVER BUDGET with a hover explanation telling you exactly which figure to adjust — and saving is blocked until it's resolved, so you never quote below cost by accident.
- **Editable prices with inline rate search.** Every price is editable. Start typing in a price cell to search your RateGen material and labour libraries and drop in a rate without leaving the schedule. Totals and margins update live as you type.
- **Fully-linked Excel BoQ export.** Export the whole budget to a multi-sheet Excel workbook. For each folder you get a BoQ sheet and a Budget sheet, connected with live cell links — change a rate and the margin recalculates in Excel — plus a master Budget Summary sheet with grand totals, overhead + profit, and margin % per section.
- **Save Budget to Cloud.** Push your budget to your ADLM cloud project so proposed-vs-actual margins can be tracked online. The budget is saved as a linked companion to its takeoff, so your quantities and your costs stay tied together.
- **Project profit header.** A colour-coded strip across the top of the Budget view shows Project Cost (Material + Labour), Take-off Value, Overhead + Profit and Margin % at a glance, with a PROFIT / LOSS badge.

### 🔧 Improved

- **Better rate matching.** HERON now matches your items against both your custom rates and the master RateGen library, dramatically increasing how many items get priced automatically (typical projects went from almost no matches to roughly half matched on the first pass, before any manual matching).
- **Keep edited rates.** A new "Keep edited rates" option on the takeoff review screen preserves the rates you've adjusted across closing and reopening a project — choose your edited values or refresh to the latest library rates, per review.

### 🐛 Fixed

- **Steel priced by the tonne** is now correctly converted to a per-length rate. No more inflated figures — a single bar no longer shows as ₦1.18M because a per-tonne price was applied per length.
- **Reinforcement bar size** is now read per item (column links, main bars, etc.) so each line uses the correct diameter and binding-wire allowance instead of a fixed 12 mm.
- **Saved budgets now persist** correctly to the cloud, including your edited prices and the profit line, even when the project name comes from the takeoff flow.

---

## 2.2 — 15 May 2026 — Units & Templates

A complete units overhaul plus two new trade templates and far more accurate sub-item quantities.

### ✨ New

- **App-wide metric / imperial toggle.** Switch the whole plugin between metric and imperial units from one control — quantities, rates and displays all follow.
- **Automatic scale-unit detection.** When you open a project, HERON reads PlanSwift's scale units and configures itself automatically, so quantities come out right whatever the drawing was set up in.
- **Piling templates.** New piling takeoff templates for bored / cast-in-place pile measurement.
- **Ribbed-slab templates.** New and corrected ribbed-slab templates.
- **Native sub-items now visible.** Substructure sub-items — Hardcore, DPM, Laterite, Blinding — are now shown directly from your PlanSwift takeoff.

### 🔧 Improved

- **In-app sub-item engine.** A new calculation engine computes sub-item quantities inside the plugin for faster, more consistent results.
- **Result-unit inference.** HERON infers an item's result unit from its type and detects pages more broadly, reducing manual unit fixes.

### 🐛 Fixed

- **Corrected sub-item quantities** for Beam, Slab, Staircase and Pile Cap items.
- **Unit normalisation.** Scale-unit inputs from PlanSwift are normalised to metric at the point of calculation, eliminating mixed-unit errors in derived quantities.

---

## 2.1 — 18 April 2026 — Cloud, Rates & Security

The foundation release: a cloud dashboard, automatic price matching against your RateGen rates, new steel and MEP templates, multi-folder export, and a hardened licensing system.

### ✨ New

- **Cloud Dashboard.** A new home screen for your ADLM cloud projects — open, review and manage takeoffs and material projects from one place.
- **Material price matching.** HERON matches your takeoff items to your RateGen price library automatically, bringing live rates into your takeoff.
- **Steel truss & member templates.** New templates for steel truss and member takeoff.
- **MEP templates.** New mechanical, electrical & plumbing takeoff templates.
- **Multi-folder export.** Select and export several takeoff folders at once.
- **Currency & zone handling.** Rates respect your currency and regional pricing zone, with conversion applied automatically.
- **Splash screen & material projects.** A new startup splash screen and dedicated material projects.

### 🔧 Improved

- **Excel export & offline use.** A more robust Excel takeoff / BoQ export that also works offline.
- **Automatic template repair.** HERON now detects and fixes common issues in PlanSwift template definitions on load, so trade templates calculate correctly out of the box.
- **Count-based steel accessories** now correctly use the "Nr" (number) unit.
- **Hardened licence validation.** Licences are now validated with industry-standard RS256 / JWKS signing (with a safe fallback), replacing the previous scheme.
- **Device-bound licensing.** A hardware fingerprint ties each licence to the activated device, and hard-coded secrets have been removed from the installer.
- **Leaner, safer footprint.** Removed the legacy MongoDB dependency and self-managed the signing key, fixing a crash when reopening the app after closing.

---

## 1.0 — 2022 — HERON for PlanSwift

HERON brings ADLM's takeoff workflow to PlanSwift, turning 2D drawings into structured, standards-aligned quantities.

### ✨ New

- 2D quantity takeoff directly inside PlanSwift.
- BESMM4R / NRM-aligned measurement output.
- One-click export to Excel for billing.
