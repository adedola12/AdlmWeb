---
slug: heron
name: HERON
tagline: Takeoff-to-budget estimating for PlanSwift
category: PlanSwift Plugin
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
