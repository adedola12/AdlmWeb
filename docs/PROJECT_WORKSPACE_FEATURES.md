# ADLM Website — Project Workspace Feature Documentation

**What you can do on the ADLM web platform after saving a project from the desktop plugins (QUIV / HERON / CIVIQ / Revit MEP).**

This document is the definitive feature reference for everything that happens *after* a takeoff is saved to the cloud: rate generation, the Bill of Quantities, material & labour schedules with pricing, the variation tracker, the contract tracker, interim valuation & payment certificates, the Work Breakdown Structure (WBS), cost-to-WBS linking, and earned-value project controls. Every feature described here is implemented in the current codebase.

---

## Table of contents

1. [The big picture — plugin → cloud → web](#1-the-big-picture)
2. [The plugin suite & how projects arrive](#2-the-plugin-suite--how-projects-arrive)
3. [The project workspace](#3-the-project-workspace)
4. [Bill of Quantities (BOQ)](#4-bill-of-quantities-boq)
5. [Rate Generation engine](#5-rate-generation-engine)
6. [Material & Labour schedules with pricing](#6-material--labour-schedules-with-pricing)
7. [Contract Tracker (contract lock & baseline)](#7-contract-tracker)
8. [Variation Tracker](#8-variation-tracker)
9. [Interim Valuation & Payment Certificates](#9-interim-valuation--payment-certificates)
10. [Project Management — WBS & linking cost with WBS](#10-project-management--wbs--linking-cost-with-wbs)
11. [Earned Value Management (EVM)](#11-earned-value-management-evm)
12. [Progress tracking & the valuation audit trail](#12-progress-tracking--the-valuation-audit-trail)
13. [Client sharing — the public dashboard](#13-client-sharing--the-public-dashboard)
14. [BIM model attachments](#14-bim-model-attachments)
15. [Appendix — formulas, classifications & export reference](#15-appendix)

---

## 1. The big picture

The ADLM Website is the cloud workspace and quantity-surveying brain that sits behind the ADLM desktop takeoff plugins. The workflow is:

```
   Desktop model            ADLM Cloud (this website)              Outputs
 ┌────────────────┐      ┌──────────────────────────────┐    ┌──────────────────┐
 │ Revit / PlanSwift│ save │  Priced BOQ → Rate Gen        │    │ Excel BOQ        │
 │ / Civil 3D model │─────▶│  Material/Labour schedules    │───▶│ Payment certs    │
 │  (QUIV/HERON/    │ open │  Contract + Variation tracker │    │ Final account    │
 │   CIVIQ plugins) │◀─────│  WBS + EVM project controls   │    │ Public dashboard │
 └────────────────┘ from   └──────────────────────────────┘    └──────────────────┘
                    cloud
```

A takeoff done in the plugin is **saved to the cloud as a project**. On the website that project becomes a fully editable, priced **Bill of Quantities**, which then drives everything downstream: rates, schedules, the contract baseline, variations, payment certificates, the work programme (WBS), and earned-value reporting — all sharable with the client through a live read-only dashboard. Changes made on the web can be pulled back into the plugin via **Open from Cloud**, so the model and the commercial data stay in step.

The platform is **Naira-native** (NGN) and built around **Nigerian QS practice** — BESMM4 preliminaries, NRM2 / SMM7 work-section structure, and the Nigerian BOQ serial-letter convention.

---

## 2. The plugin suite & how projects arrive

### 2.1 The plugins and what they map to

Each desktop plugin is a different takeoff source. Internally the platform identifies the source by a `productKey`, and the discipline (structural/architectural vs services) follows from it:

| Brand name | Platform | `productKey` | Discipline categories produced |
|---|---|---|---|
| **QUIV** | Autodesk Revit (Architectural/Structural) | `revit` | Substructure · Frames · Superstructure |
| **HERON** | PlanSwift | `planswift` | Substructure · Frames · Superstructure |
| **CIVIQ** | Autodesk Civil 3D | `civil3d` | Substructure · Frames · Superstructure |
| **Revit MEP** | Autodesk Revit (Services) | `revitmep` | HVAC · Plumbing · Electrical |

> **Naming note:** in the code the services split is driven by whether the product key contains `mep`. QUIV/HERON/CIVIQ all produce the structural/architectural category set (Substructure/Frames/Superstructure); the MEP plugin produces the services set (HVAC/Plumbing/Electrical). Each plugin also has a paired **materials** mode (e.g. `revit-materials`) used for the material/labour schedule.

Every project — whatever the source plugin — lives in **one unified project model** and gains the *same* downstream toolset (BOQ, rates, contract, variations, certificates, WBS, EVM). The plugin only determines the takeoff content and the default classification set.

### 2.2 Saving a project (the save flow)

When a user clicks **Save to Cloud** in a plugin, the plugin signs in to the ADLM API and posts the takeoff:

- The project is created/updated through the ADLM API (no direct database access from the plugin).
- **Entitlement-gated:** the save only succeeds if the user holds an **active subscription** for that plugin. Expired or missing subscriptions are rejected with a clear "No active subscription" / "Subscription expired" message.
- **What's saved:** the project `name`, the takeoff `items` (each line: description, quantity, unit, rate, level/floor, type/code, and the Revit element IDs behind it), plus model identity metadata so re-saves update the same project instead of duplicating it.
- **Safe re-saves:** every save carries a version number. If two edits collide, the platform returns a version conflict rather than silently overwriting — so cloud edits and plugin re-saves never clobber each other.
- **Auto-classification on arrival:** each item is automatically tagged with a **Category** (building element) and a **Trade** (work section) if the plugin didn't supply one, so the BOQ is organised the moment it lands.

There is also a **unified save** path that, in one call, persists both the priced takeoff *and* its derived material/labour schedule (the QUIV material-rate upgrade), returning a proposed-vs-actual profit-margin summary.

### 2.3 Open from Cloud

Every project shows a copyable **Project ID**. Pasting that ID into the plugin's **Open from Cloud** dialog pulls the cloud project (including any rates and edits made on the web) back into the desktop model — the round-trip that keeps the model and the commercial data synchronised.

---

## 3. The project workspace

### 3.1 The project explorer

After saving, the user lands in the **project explorer** for that plugin — a folder-card grid where each saved project is a card showing:

- Project name and a 📁 folder icon
- **Item count** (number of takeoff lines)
- Last-updated timestamp
- Roll-up totals at the section header: total cost, valued amount, progress

The most recently saved project appears at the top. Cards support multi-select, per-card delete, "delete selected" and "delete all". Clicking a card opens the project.

### 3.2 The four working tabs

Opening a project reveals four tabs — the heart of the workspace:

| Tab | Purpose |
|---|---|
| **Dashboard** | Progress and cost summary at a glance — gross value, valued (earned) amount, remaining, % complete |
| **Bill of Quantity** | The main work surface: priced line items, rate application, categories/trades, preliminaries, PC sums, variations, contract lock |
| **PM Dashboard** | The work programme: WBS/tasks, schedule, earned-value (EVM) metrics, risk register, issue log |
| **Valuation** | Interim payment certificates, the daily valuation log, retention/VAT/WHT settings |

The header also surfaces the **Project ID** (for Open from Cloud), a **contract lock/draft badge**, and a **Share Dashboard** control that produces a public client link.

---

## 4. Bill of Quantities (BOQ)

The BOQ is generated automatically from the saved takeoff and presented as a fully editable, priced bill. It is the central artefact from which rates, schedules, the contract, and certificates all flow.

### 4.1 The BOQ work surface

The bill is a spreadsheet-grade table. Columns:

`S/N` · `Status` (✓ + % complete) · `Description` · `Qty` · `Unit` · `Rate` · *(optional Actual qty / Actual rate / Actual amount)* · `Gross amount` · `Deducted` (earned) · `Balance` (outstanding) · `Actions`

- Columns are **drag-resizable**; rows are **drag-reorderable**; every column is **sortable**.
- **Quantity and unit** are read-only (they come straight from the takeoff — the single source of truth for measurement).
- **Description** carries an inline **category/trade reclassification** dropdown and a **WBS-link health chip**.

### 4.2 Applying rates (the smart rate cell)

The rate cell is where pricing happens, and it is deliberately powerful:

- **Excel-style formula entry** — type `=` to enter a formula, e.g. `=1.2*1.5*95000`, with a live preview. Only arithmetic is allowed (safe-evaluated, not raw `eval`). `%` is understood as `/100`.
- **Rate-library search** — type a name instead of a number and the cell searches the **Rate Generation** library, suggesting matching built-up rates. Picking one fills the rate.
- **Automatic unit conversion** — when a suggested rate's unit differs from the item's (m² ↔ m via a slab thickness parsed from the description, tonne ↔ kg, m³ → m²), the rate is converted automatically; genuine mismatches are flagged amber.
- **Group linking** — link similar items so a rate change on one propagates to the whole group (e.g. all "150mm blockwork" lines at once).
- **Lock-aware** — once the contract is locked, the rate cell becomes a read-only 🔒 chip and cannot be edited (see [Contract Tracker](#7-contract-tracker)).

### 4.3 Earned-value per line

Each line has a **binary status tick** *and* a **% complete** field. From these the bill computes, per row:

```
Gross   = qty × rate
Deducted (earned) = Gross × valuationFactor      (valuationFactor = 1 if ratified, else %/100)
Balance (outstanding) = Gross × (1 − valuationFactor)
```

So the BOQ doubles as a live **value-of-work-done** tracker. Optional **Actual qty / Actual rate** columns let the QS record re-measured values post-construction.

### 4.4 Organisation: categories, trades & sections

Items group two ways, toggled live:

- **By Category** (building element): *Substructure / Frames / Superstructure* (structural) or *HVAC / Plumbing / Electrical* (MEP).
- **By Trade** (NRM2/SMM7 work section): Earthworks, Concrete Works, Formwork, Reinforcement, Masonry, Damp-proofing, Carpentry & Roofing, Joinery, Finishes (Floor/Wall/Ceiling), Decoration, Structural Steelwork, External Works — or HVAC / Plumbing & Drainage / Electrical Installations for MEP.

Each group renders a banner header, its items, and a **subtotal row**. A **Summary by category** card tabulates items/gross/deducted/balance per group with a grand total. Users can **reclassify** any line inline, and trade reclassifications **train a self-learning classifier** so future takeoffs are categorised better.

A sticky **Section Rail** (and a collapsible Office-style ribbon) gives instant jump-to-section navigation — important on bills with hundreds of lines.

### 4.5 Preliminaries, provisional sums, contingency & tax

Beyond the measured lines, the bill carries the full QS grand-summary scope:

- **Preliminaries** — a standard **BESMM4 22-item checklist** (seeded automatically), each item with an allocation %, a "done" tick, and an **actual ₦** column showing variance vs planned.
- **Provisional / PC Sums** — described lump sums with a "done" tick.
- **Variations** — change orders (see [Variation Tracker](#8-variation-tracker)).

These roll up through the standard cascade (all percentages editable inline; defaults shown):

```
Preliminary amount  = (Gross + Provisional) × 7.5%
BOQ subtotal        = Gross + Provisional + Preliminary
Contingency amount  = BOQ subtotal × 5%
VAT                 = (BOQ subtotal + Contingency) × 7.5%
Planned project total = BOQ subtotal + Contingency + VAT
Project total       = Planned project total + Variations
```

A **multi-step undo bar** keeps the last five deletions (measured/prelim/PC/variation) individually restorable.

### 4.6 Exporting the BOQ

The Export menu offers several professionally formatted outputs (all Excel):

| Export | Structure |
|---|---|
| **Elemental BOQ** (Bungalow / Multi-storey) | One sheet per building element — Preliminaries, Substructure, Superstructure, Frame (split by floor), Staircase, External Works — plus Cover, Provisional Sums, Variations, "Other items", and a General Summary |
| **Trade BOQ** (NRM2-style, Bungalow / Multi-storey) | A single trade-structured sheet with per-trade sections and subtotals, plus separate Preliminaries / PC / Variations and a General Summary |
| **Generic BOQ** (by category / by trade) | A flat bill that mirrors exactly what's on screen, including unsaved rates |

The elemental/trade exports are **formula-driven** — every amount is a live Excel formula (`Amount = qty × rate`), so a recipient can change a rate and the workbook recalculates. They follow Nigerian BOQ conventions including the **A-B-C…(skip I)…J-K** serial-letter column, BESMM4 preliminaries, SMM work-section codes (E10 concrete / E20 formwork / E30 reinforcement), and standards references (BS 4449/4483 rebar, BS 5950 steelwork). The exporter intelligently handles foundation type (pad/raft/pile) and splits multi-storey frame elements per floor level. Empty elements are omitted, so there are no blank sheets.

---

## 5. Rate Generation engine

"Rate Gen" is the pricing brain. It builds a **unit rate** (price per m², m³, m, Nr…) for a work item by summing the per-unit cost of its **materials** and **labour**, then adding overhead and profit. These rates feed directly into the BOQ rate cell.

### 5.1 The rate build-up formula

A rate is composed from its breakdown of material + labour lines:

```
Net cost   = Σ (line quantity × line unit price)      ← quantity includes any wastage/conversion factor
Overhead   = Net cost × Overhead%      (default 10%)
Profit     = Net cost × Profit%        (default 25%)
Total cost = Net cost + Overhead + Profit
```

Both overhead and profit are taken **on the net cost** (not compounded). Wastage isn't a separate line — it's folded into each component's quantity as a multiplier (e.g. ×1.4). This same formula is applied identically when authoring a rate, when computing one on demand, and when the plugin reads it back, so the number never drifts between surfaces.

The rate authoring screen supports **spreadsheet-style formulas** in unit-price fields (a line can be priced as `=3% * Net Cost`, and the engine iterates until interdependent formulas converge).

### 5.2 Three layers: master, override, custom

Rates are layered so a shared catalogue can be personalised per user:

1. **Master rates** — the shared, admin-curated catalogue.
2. **User overrides** — a user's personal edit *of an existing master rate*. An override **fully replaces** the master rate for that item.
3. **Custom rates** — brand-new rates a user builds themselves (purely additive).

**Precedence:** *user override > master*, with custom rates appended. The "effective rates" a user actually prices against is the merged result. All edits are version-guarded so concurrent edits don't clobber each other.

Rates are organised into canonical **sections**: Groundwork, Concrete Works, Blockwork, Finishes, Roofing, Windows & Doors, Painting, Steelwork, Carbon & Others. Underneath sits a shared **master component catalogue** of materials and labour (each with a serial number, name, unit, and default unit price) that the build-ups reference.

### 5.3 Guardrails & integrity

- **Composition guardrail** — when a rate is saved, the platform checks that the stated headline total equals its build-up (within a 0.5% tolerance). An **overstated** rate (headline > build-up) is rejected/clamped down to the build-up, so an inflated rate can never reach the plugin.
- **Price provenance (`priceAsOf`)** — every breakdown line records *which* master material/labour row it came from (serial number + name) and *when* that price was captured. This provenance is carried through overrides and custom rates too, giving full traceability from a unit rate back to the dated source price.
- **Component classification** — each component is deterministically tagged Material / Labour / Plant / Consumable, so the downstream material & labour schedule is split correctly rather than re-guessed.

### 5.4 Profit-margin analysis (proposed vs actual)

Separate from the per-rate profit %, the platform computes **project profitability** per takeoff line: proposed revenue (sell rate × qty) vs proposed cost (net × (1 + overhead%) × qty), giving proposed profit and margin %, with an **actual** side that uses re-measured rate/qty. Aggregated across the project, this reports total proposed vs actual profit and the variance — surfaced at unified save time as a margin summary.

### 5.5 Where rates are managed

End-users browse their **effective rate library** on the web (a live, auto-refreshing dashboard with tabs for Master Materials/Labour, My Materials/Labour, My Custom Rates, and Effective Rates) and see a **Rate Updates feed** that badges newly changed master rates. Heavy rate *editing* happens in the RateGen desktop app and syncs to these endpoints. Admins curate the master catalogue and build-up rates.

---

## 6. Material & Labour schedules with pricing

The **Materials view** turns the takeoff into a priced **material & labour schedule** — the procurement and pricing companion to the structural BOQ.

- **One line per material/labour component.** The takeoff is grouped by material (e.g. "Cement", "Sandcrete Block 9in", "Reinforcement Y12"), each with its quantity, unit, and an editable rate.
- **Priced from Rate Gen's component catalogue.** Rates here come from the **material + labour** master/user price lists (not composite build-up rates). For each line the platform proposes the best-matching catalogue price, honouring the required unit and preferring the user's own library over the master.
- **One-click auto-fill & price sync.** "Auto-fill (RateGen)" prices every line against the catalogue (optionally only empty rates, never overwriting on a unit conflict); "Sync prices" keeps them current.
- **Procurement tracking.** The same grid drives a **Purchased** status (instead of "Completed"), so the material schedule doubles as a purchase/earned tracker: qty × rate = amount, with valued/balance per line.

The connection to Rate Gen is two-tiered: the **Materials view** prices against *component* (material + labour) rates, while the **BOQ view** prices against *composite build-up* rates — both sourced from the same Rate Gen library.

---

## 7. Contract Tracker

The contract tracker turns a priced BOQ into a **frozen contract baseline** and then polices every subsequent change against it — the mechanism that makes the platform a genuine contract-administration tool, not just an estimating sheet.

### 7.1 Locking the contract

When the bill is agreed, the user **locks the contract** behind a **4-digit PIN** (stored hashed, never returned to the browser). Locking:

- **Snapshots every line** (`description, qty, unit, rate`) as the contract baseline.
- **Freezes the grand-summary cascade** at that moment — measured work, provisional, preliminaries, contingency, VAT, and the resulting **contract sum** — and stores each frozen component.

Unlocking requires the matching PIN (contracts locked before the PIN feature unlock without one, for back-compatibility). Unlocking clears the lock and PIN but **keeps the baseline and contract sum** for history, so re-locking sets a fresh PIN.

### 7.2 What the lock enforces

Once locked, the priced structural scope is protected — and the enforcement is **server-side and authoritative**, so it holds even if a client tries to bypass a disabled field:

- **New lines** added after lock are **not** added to measured work — they are automatically diverted into the **Variation tracker** as `post-lock-new-item` change orders.
- **Re-measured quantity** → the new figure is written to **Actual qty** while the contract `qty` snaps back to the baseline. The variance becomes a claimable item without losing the baseline.
- **Re-priced rate** → same pattern: the new rate goes to **Actual rate**, the contract `rate` reverts to baseline.
- **Delete protection** — any baseline line omitted from a save is **re-inserted** (with its prior actuals/progress), so the contract sum can never silently shrink.

Editable while locked: rate (recorded as actual), actual qty/rate, category/trade, and completion status. Everything that would move the contract sum is captured as a tracked variance instead.

The result: the **contract sum stays stable**, while every deviation from it is surfaced and tracked.

---

## 8. Variation Tracker

Variations are the controlled channel for change after the contract is set. Each variation carries: `description, qty, unit, rate, reference, issued date`, a **source** (`manual` or `post-lock-new-item`), and a **completed** flag. Its value is `qty × rate`.

- **Manual variations** — the QS keys them directly into the BOQ's Variations section (reference, description, qty, unit, rate, date).
- **Automatic variations** — as described above, any line added to a **locked** contract is automatically captured as a variation with reference `AUTO`, so out-of-contract scope can never slip into measured work unnoticed.
- **Roll-up rules** — variations **always** count toward the project total (and toward EVM's Budget at Completion), but count as **earned value only when marked completed**. The same semantics apply to provisional sums.
- **Progress propagation** — when a WBS task linked to a variation reaches 100%, the variation is automatically flipped to completed.

A **Contract Movement** panel on the PM dashboard visualises variations declared vs executed, PC sums released, and the forecast final cost vs the contract sum (savings or over-run).

---

## 9. Interim Valuation & Payment Certificates

The platform issues proper **interim payment certificates** on the cumulative-less-previous basis, with full retention/VAT/WHT handling.

### 9.1 How a certificate is computed

Issuing a certificate computes the **cumulative value to date** across all streams:

- **Measured work** — `Σ (actual or planned qty) × (actual or planned rate) × valuationFactor`, so **partial progress flows in** (a line at 60% contributes 60%).
- **Variations** — completed variations only.
- **Provisional sums** — completed only.
- **Preliminaries** — the preliminary pool × the completed allocation.

Then the certificate arithmetic:

```
This certificate  = max(0, Cumulative value − Σ previous certificates)
Retention         = This certificate × Retention%
Net before tax    = This certificate − Retention + Retention released
VAT               = Net before tax × VAT%
WHT               = Net before tax × WHT%
Net payable       = Net before tax + VAT − WHT
```

Retention/VAT/WHT rates default from the project's valuation settings and are **captured at issue**, so historical certificates remain reproducible even if rates later change. Certificates are numbered automatically.

### 9.2 Certificate lifecycle

- **Status** — each certificate is `draft → approved → paid`, set from a per-row dropdown.
- **Immutable financials** — once issued, only status/notes/dates can be edited; the money is frozen.
- **Safe deletion** — only the **latest** certificate can be deleted, preserving the cumulative chain.
- **Export** — certificates export to Excel; the valuation tab can also produce a printable **Interim Payment Application** from the daily valuation log.
- A **totals footer** shows total certified and net retention held.

### 9.3 Final account

When work is complete, the project is closed out with a **Final Account** that snapshots final measured work, provisional, preliminaries and variations; sums retention released and total certified to date; and computes:

```
Final contract value = Measured + Provisional + Preliminary + Variations
Savings              = Agreed contract sum − Final contract value     (positive = under-run)
```

Finalising freezes the project (no further certificates or BOQ edits); it can be reopened if needed.

---

## 10. Project Management — WBS & linking cost with WBS

The PM layer turns the priced BOQ into a costed **work programme**. Its defining capability is **linking cost to the Work Breakdown Structure**, so schedule progress and commercial value stay reconciled.

### 10.1 The WBS / task model

Each task carries a dotted **WBS code** (e.g. `A.21.1`), name, schedule (start/end, baseline start/end, duration, actuals), predecessors, critical-path flag, % complete, status, priority, and **cost links**.

### 10.2 Three ways to build the WBS

1. **Manual** — add tasks with a WBS code, dates, priority, milestone/critical-path flags, and either a manual ₦ cost or BOQ links.
2. **Generate from BOQ** — one task per BOQ line, auto-linked, with `baselineCost = qty × rate` and dates distributed across the programme window. Re-running updates existing tasks rather than duplicating.
3. **Import MS Project** — upload a `.xml` (or `.mpp`) programme. The importer reads dates, baselines, durations, % complete, WBS/outline numbers, milestones, summaries, predecessors and the **critical path** (from the Critical flag or zero total slack). It deliberately ignores resource-derived costs (importing only explicit baseline costs) so your cost baseline stays clean.

### 10.3 Linking cost to the WBS (the core feature)

Tasks link to one or more BOQ lines — **measured items, preliminaries, PC sums, or variations** — through a searchable picker. The differentiator is **weighting**:

- A single BOQ line can be **split across several tasks** by weight (e.g. an electrical line as *first-fix 70% / final-fix 30%*).
- A task's **baseline cost** is the weighted sum of its linked lines: `Σ item.amount × weight%`.
- A **WBS-link health chip** on each BOQ row shows whether that line is fully allocated (emerald = 100%), under-allocated (a WBS gap), or over-allocated (a double-count risk).

**Smart auto-linking** matches imported task names to BOQ items using (a) per-user **learned mappings** that improve over time and (b) fuzzy matching, reporting how many links were made. Re-importing an updated programme **smart-merges**: schedule fields refresh from MS Project while progress, cost links and manual edits are preserved.

### 10.4 WBS roll-ups & scheduling

- **Summary tasks** roll up their leaf descendants — baseline/actual cost, weighted % complete, and earliest-start/latest-finish — purely from the WBS code hierarchy.
- **Auto-reschedule** — changing the project start cascades dates through the network (finish-to-start, cycle-safe), and a manual reschedule recalculates the whole programme.
- A **BOQ heatmap** renders every line as a colour-coded progress cell (grouped by category/trade), giving an at-a-glance picture of where work stands.
- A **calendar export** (`.ics`) puts the programme into any calendar app.

---

## 11. Earned Value Management (EVM)

Because cost is linked to the WBS, the platform produces genuine **earned-value** project controls on the PM dashboard.

| Metric | Meaning | How it's derived |
|---|---|---|
| **BAC** (Budget at Completion) | Total project budget | The live project total (forced to it when the contract is locked) |
| **PV** (Planned Value) | What *should* be earned by today | Schedule-based: each task's baseline cost interpolated between its baseline start/finish |
| **EV** (Earned Value) | Value actually delivered | BOQ-side earned value: measured (partial-aware) + completed PC/variations/preliminaries |
| **AC** (Actual Cost) | Spent to date | Actual costs recorded against the work |
| **CPI** | Cost performance | `EV / AC` |
| **SPI** | Schedule performance | `EV / PV` |
| **EAC** | Forecast final cost | `BAC / CPI` |
| **VAC** | Forecast variance | `BAC − EAC` |

The dashboard surfaces six headline tiles (Progress %, Budget Used %, Overdue, CPI, SPI, Tasks Done %), a **budget bar** (BAC/EV/AC), a **tasks donut**, a **burndown chart** (planned vs actual remaining), and a **WBS health strip** (status & priority mix + critical-path banner).

A standout integrity feature is the **BOQ↔WBS coverage reconciliation**: it classifies every BOQ line as *unlinked, fully linked, under-linked,* or *over-linked*, flags **stale links** (a task pointing at a line that was renamed or removed — which would silently drop its baseline to ₦0), and reports an overall coverage %. This catches the classic earned-value error of double-counting or missing scope.

---

## 12. Progress tracking & the valuation audit trail

Progress is captured as an **append-only valuation ledger**. Every time a line's earned position changes — a binary ratification or a % movement — the platform records a signed event (the value delta, the before/after %, and the day it was marked). Summing the positive deltas for a period gives the **value of work done** in that period.

These events roll into **daily valuation logs** (with a staleness filter so reverted lines don't linger), which power the valuation date selector and the printable interim certificate. Progress is also **bi-directional**: updating a WBS task's % complete propagates back to its linked BOQ lines as a weighted sum, which then flows through the same valuation pipeline — so the schedule and the bill always agree on how much has been earned.

---

## 13. Client sharing — the public dashboard

Any project can be shared with the client through a **read-only public link** (no login required). The public dashboard re-frames the QS numbers in plain client-facing language:

- An **on-track / watch / over-budget** status banner and a progress ring with physical and cost bars.
- The full **contract-sum cascade** (measured / provisional / preliminaries / contingency / VAT / variations) — showing the **frozen lock-time values** once the contract is locked.
- **EVM in plain English** — "Spent to date" (ACWP), "Value delivered" (BCWP), "Performance" (CPI), "Expected final cost" (EAC).
- A **certificate roll-up** — total certified, retention held, and whether the final account is open or closed.
- Any attached **BIM models** and an upcoming-spend view.
- A header badge showing Draft / Contract-locked / Final-account-closed.

---

## 14. BIM model attachments

Each project can carry up to three **IFC/BIM model** uploads — one each for **Architectural, Structural, and MEP** disciplines — stored in cloud object storage and surfaced (including on the public dashboard) so the client can see the model alongside the commercial data.

---

## 15. Appendix

### 15.1 Key formulas at a glance

**Rate build-up**
```
Net  = Σ(component qty × unit price)
Total = Net + Net×Overhead% + Net×Profit%        (defaults: OH 10%, Profit 25%)
```

**BOQ grand summary**
```
Prelim       = (Gross + Provisional) × Prelim%        (default 7.5%)
Subtotal     = Gross + Provisional + Prelim
Contingency  = Subtotal × Contingency%                (default 5%)
VAT          = (Subtotal + Contingency) × VAT%        (default 7.5%)
Project total = Subtotal + Contingency + VAT + Variations
```

**Interim certificate**
```
This cert    = max(0, Cumulative value − Σ previous certs)
Retention    = This cert × Retention%
Net before tax = This cert − Retention + Retention released
Net payable  = Net before tax + (Net before tax × VAT%) − (Net before tax × WHT%)
```

**Earned value**
```
CPI = EV/AC   SPI = EV/PV   EAC = BAC/CPI   VAC = BAC − EAC
```

**Per-line earned value**
```
valuationFactor = 1 if ratified, else %complete/100
Earned   = qty × rate × valuationFactor
Balance  = qty × rate × (1 − valuationFactor)
```

### 15.2 Classification taxonomy

**Categories (building element)**
- Structural (QUIV/HERON/CIVIQ): Substructure · Frames · Superstructure
- Services (Revit MEP): HVAC · Plumbing · Electrical

**Trades (NRM2/SMM7 work sections)**
- Structural: Earthworks · Concrete Works · Formwork · Reinforcement · Masonry · Damp-proofing · Carpentry & Roofing · Joinery · Finishes—Floor · Finishes—Wall · Finishes—Ceiling · Decoration · Structural Steelwork · External Works
- Services: HVAC · Plumbing & Drainage · Electrical Installations

**Rate Gen sections**
- Groundwork · Concrete Works · Blockwork · Finishes · Roofing · Windows & Doors · Painting · Steelwork · Carbon & Others

### 15.3 Export reference

| Output | Format | Source |
|---|---|---|
| Elemental BOQ (Bungalow / Multi-storey) | Excel (formula-driven) | Server |
| Trade BOQ (NRM2-style) | Excel (formula-driven) | Server |
| Generic BOQ (by category / by trade) | Excel | Client (live on-screen rates) |
| Material & Labour schedule | Excel | Client |
| Interim payment certificate | Excel + printable HTML | Client/Server |
| Final account | Excel | Server |
| Work programme | `.ics` calendar | Server |

### 15.4 Standards & conventions referenced in the code

- **BESMM4** — preliminaries checklist (22 standard items)
- **NRM2 / SMM7** — trade/work-section structure and codes (E10/E20/E30)
- **BS 4449 / BS 4483** — reinforcement bars; **BS 5950** — structural steelwork
- **Nigerian BOQ serial lettering** — A, B, C … (skip I) … J, K …
- **Currency** — NGN-native throughout

---

*This document reflects the features implemented in the ADLM Website codebase as of the current branch. Formulas, defaults, and classifications are drawn directly from the implementation.*
