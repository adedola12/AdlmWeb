# What a Quantity Surveyor Can Do on the ADLM Website

**A complete capability outline — every QS-facing job the platform supports today, from opening an account to closing a final account.**

This is a *job-shaped* map of the platform: it walks the work a QS actually does, in order, and names the screen, the rule and the output behind each step. It is a companion to [`PROJECT_WORKSPACE_FEATURES.md`](./PROJECT_WORKSPACE_FEATURES.md), which goes deeper on the workspace internals (formulas, classifications, export anatomy). Where the two differ, this document is the current one — the workspace has grown from four tabs to six, and now carries a Budget tab, a 3D model tab, collaboration, Excel BoQ import, project merging and AI assistance.

---

## Contents

| # | Section | The QS question it answers |
|---|---|---|
| 1 | [Account, licence & entitlements](#1-account-licence--entitlements) | How do I get in and what am I allowed to use? |
| 2 | [Getting work in — six routes](#2-getting-work-in--six-routes-onto-the-platform) | How does a job reach the platform? |
| 3 | [The project workspace](#3-the-project-workspace--six-tabs) | Where do I work? |
| 4 | [Bill of Quantity](#4-bill-of-quantity--measure-price-organise) | How do I price and organise the bill? |
| 5 | [Budget — material & labour](#5-budget-tab--material--labour-build-up--procurement) | What does the work actually cost me to build? |
| 6 | [Rate Generation library](#6-rate-generation--the-pricing-library) | Where do my rates come from? |
| 7 | [Contract administration](#7-contract-administration--lock-baseline--variations) | How do I freeze and police the contract? |
| 8 | [Valuation & certificates](#8-valuation-interim-certificates--final-account) | How do I get paid? |
| 9 | [Programme & project controls](#9-programme--project-controls-wbs--evm) | Am I on time and on budget? |
| 10 | [3D model & model health](#10-3d-model--model-health) | Does the model back up my quantities? |
| 11 | [Collaboration & client sharing](#11-collaboration--client-sharing) | How do I work with my team and report to the client? |
| 12 | [Portfolio & reporting](#12-portfolio-view--reporting) | How is the whole office doing? |
| 13 | [AI assistance (Ada)](#13-ai-assistance--ada) | Can something check my work? |
| 14 | [Beyond the bill](#14-beyond-the-bill--site-time-learning--training) | What else is here? |
| 15 | [Gates, limits & guardrails](#15-gates-limits--guardrails) | What needs a subscription, and what will the system refuse? |
| 16 | [Quick reference](#16-quick-reference) | Formulas, exports, route map |

---

## 1. Account, licence & entitlements

Everything below the plugin line is free to browse; everything that touches a project needs an active subscription for the relevant product.

**Signing up and managing the account**
- Sign up / log in, change password, edit profile, and set the **name that prints on course certificates**.
- **Dashboard** (`/dashboard`) — the account hub: active products, active subscriptions with expiry/expiring-soon/expired badges, tutorials watched, total orders, **per-product project storage bars**, and quick actions into projects, the learning centre, user guides and support.
- **Profile** — orders, invoices, installation status and licence detail.

**Buying and licensing**
- **Products** (`/products`, `/product/:key`) — the plugin catalogue with detail pages and "what's new" changelogs per product.
- **Quote builder** (`/quote`) — self-serve quotation: pick products and quantities, optionally add training at a chosen training location, switch currency, and generate a quote.
- **Purchase / checkout** (`/purchase`) — **personal vs organization licences** (org licences normally start at 2 seats; RateGen may be bought as a single seat), coupon codes, a site-wide coupon banner, and a thank-you/confirmation flow.
- **Receipts & invoices** — `/receipt/:orderId` and `/invoice/:id`, both downloadable as PDF, plus order history and **training-date confirmation** on training orders.
- **Installation & approval tracking** — see whether an order is pending admin approval, approved/rejected, and whether the plugin installation is complete.
- **Storage slots** — each project-bearing product has a project cap (default **30 personal / 50 organization**); extra slots are purchasable at an admin-set per-product price.

**Getting help and staying current**
- **Support** (`/support`) — raise a support ticket; **Request technical help** (`/support/request`) for hands-on assistance.
- **What's New** (`/whats-new`, `/whats-new/:slug`) — per-product release notes and changelogs.
- **Freebies** (`/freebies`) — free downloads and resources for logged-in users.
- **Testimonials**, **About**, and the **showcase** for reference work.
- **Ada**, the AI agent widget, is available on every page (see §13).

---

## 2. Getting work in — six routes onto the platform

The platform is deliberately not plugin-only. A QS has six independent ways to create a project:

### 2.1 Save from a desktop takeoff plugin
The primary route. Each plugin maps to a product bucket:

| Brand | Platform | `productKey` | Default category set |
|---|---|---|---|
| **QUIV** | Revit (Arch/Struct) | `revit` | Substructure · Frames · Superstructure |
| **HERON** | PlanSwift | `planswift` | Substructure · Frames · Superstructure |
| **CIVIQ** | Civil 3D | `civil3d` | Substructure · Frames · Superstructure |
| **Revit MEP** | Revit (Services) | `revitmep` / `mep` | HVAC · Plumbing · Electrical |
| **QUIV for ArchiCAD** | ArchiCAD | `archicad` | (see 2.3) |

- **Save to Cloud** is entitlement-gated (no active subscription → an explicit "No active subscription / expired" refusal), version-guarded (concurrent edits return a conflict rather than silently overwriting), and **auto-classifies** every line with a Category and a Trade on arrival.
- A **unified save** persists the priced takeoff *and* its material & labour schedule in one call, returning a proposed-vs-actual **profit-margin summary**.
- **Open from Cloud** — paste the project's **Project ID** back into the plugin to pull down web-side rates and edits, keeping model and commercial data in step.

### 2.2 Import an existing Excel BoQ — no model required
From the project explorer: **Import Excel BoQ**.
- Download the **import template**, fill it with an existing bill, upload it, and the platform creates a full project from it.
- The importer then runs **the same pipeline a plugin save runs**: it links (or **generates**) a material & labour schedule for every line the workbook didn't bring one for, derives live bill rates from the build-up, and reconciles progress. This is what makes an uploaded bill immediately useful — real workbooks almost never ship an M&L sheet, so without generation the Budget tab would open with one generic row per line instead of the cement / sand / granite / blocks / labour a QS actually buys against.
- **Re-import** refreshes an imported project from a newer copy of the workbook, reporting what was added or changed.
- Works for both building bills (QUIV/HERON) and services bills (MEP) — the product key only decides which subscription is required and which bucket the project lands in.

### 2.3 ArchiCAD extraction pipeline
A separate, versioned costing surface under `/archicad`:
- **Extract** a BoQ from the ArchiCAD model, then browse it at `/archicad/:projectId/boq`, with a **project dashboard** and an **element inspector** (`/archicad/:projectId/element/:guid`).
- **Versioned BoQs** — every costing run is stored as a version; list them, open any prior version, and see which lines changed between runs.
- **Re-apply rates** from the rate library, set **margin** and **budget**, save costing **preferences**, **export to Excel or PDF**, and **share** the result.

### 2.4 Merge projects into one federated job
When architectural and structural models are saved separately (different model fingerprints → separate documents), select them in the explorer and **merge**:
- The merge creates a **container project** that owns no items and *resolves* its sources on read — one bill, one budget, one valuation.
- The sources stay untouched and remain the plugin's save/open target, so each Revit model still re-saves only the lines it measured. Re-saving from the plugin flows straight into the merged view.
- Line identity is namespaced per source, so identical bill codes across disciplines never collide, and every merged line routes back to the document that owns it.
- Merge order is editable, and a merge can be unmade.

### 2.5 Join a project someone shared with you
- **Add shared project** — paste a share code in the explorer, or open a **share link / QR code** (`/j/:code`). Logged-out colleagues are bounced through login and land back on the project.

### 2.6 Start a standalone PM tracker project
- `/pm-tracker` — create a programme-only project with **no takeoff behind it**, run the full WBS/EVM toolset on it, and **invite a full editor by email**. Useful for jobs where you're managing delivery but didn't do the takeoff.

---

## 3. The project workspace — six tabs

Opening a project gives six tabs, grouped into three stages of a job:

| Stage | Tab | What it's for |
|---|---|---|
| **Overview** | **Dashboard** | Gross value, valued (earned) amount, remaining, % complete, charts |
| **Commercial** | **Bill of Quantity** | Priced lines, rates, categories/trades, prelims, PC sums, variations, contract lock |
| **Commercial** | **Budget** | Material & labour build-up per bill line, pricing, O&P, procurement |
| **Commercial** | **Valuation** | Valuation basis, interim certificates, retention/VAT/WHT, daily log, final account |
| **Delivery** | **3D Model** | IFC/BIM viewer with element ↔ BoQ line linking |
| **Delivery** | **PM Dashboard** | WBS, schedule, EVM, risks, issues, heatmap |

The header carries the **Project ID** (for Open from Cloud), a **draft / contract-locked / final-account badge**, the **Share Dashboard** control, the **collaborators** panel, and the **report** button (Project report on most tabs, PM report on the PM tab).

**Project explorer** (`/projects/:tool`, `/revit-projects`) — folder-card grid per product: item count, last updated, roll-up totals (total cost, valued amount, progress), multi-select, per-card and bulk delete, merge-selected, Import Excel BoQ, Add shared project, and a badge on any project that is part of a merge.

---

## 4. Bill of Quantity — measure, price, organise

The BoQ is the central artefact. Everything downstream (rates, budget, contract, certificates, WBS, EVM) flows from it.

**The work surface**
- Columns: `S/N` · `Status` (✓ + % complete) · `Description` · `Qty` · `Unit` · `Rate` · *(optional Actual qty / Actual rate / Actual amount)* · `Gross` · `Deducted` (earned) · `Balance` · `Actions`.
- Drag-resizable columns, drag-reorderable rows, sortable on every column.
- **Qty and unit are read-only** — measurement comes from the takeoff and stays the single source of truth.
- A sticky **Section Rail** and collapsible ribbon for jump-to-section navigation on bills with hundreds of lines.

**Pricing (the smart rate cell)**
- **Excel-style formulas** — type `=` for e.g. `=1.2*1.5*95000`, with live preview, safe-evaluated (arithmetic only, `%` read as `/100`).
- **Rate-library search** — type a description instead of a number and the cell searches the RateGen library, suggesting matching built-up rates.
- **Automatic unit conversion** — m² ↔ m via a slab thickness parsed from the description, tonne ↔ kg, m³ → m²; genuine mismatches are flagged amber rather than silently converted.
- **Group linking** — link similar lines so one rate change propagates to the whole group (e.g. every "150mm blockwork" line).
- **Lock-aware** — once the contract is locked the cell becomes a read-only 🔒 chip (see §7).
- Rates can also be **derived automatically from the Budget tab** (Material + Labour + O&P) rather than typed.

**Progress and earned value per line**
```
valuationFactor = 1 if ratified, else %complete / 100
Gross    = qty × rate
Deducted = Gross × valuationFactor          ← earned
Balance  = Gross × (1 − valuationFactor)    ← outstanding
```
Optional **Actual qty / Actual rate** columns record re-measured values post-construction.

**Organisation**
- Group **by Category** (Substructure / Frames / Superstructure, or HVAC / Plumbing / Electrical) or **by Trade** (NRM2/SMM7 work sections: Earthworks, Concrete, Formwork, Reinforcement, Masonry, DPC, Carpentry & Roofing, Joinery, Finishes ×3, Decoration, Structural Steelwork, External Works — or the services set).
- Banner headers, per-group subtotals, and a **Summary by category** card with a grand total.
- **Inline reclassification** on any line — and trade reclassifications **train a self-learning classifier**, so future takeoffs land better classified.

**The grand summary**
- **Preliminaries** — a seeded **BESMM4 22-item checklist**, each with an allocation %, a done tick, and an **actual ₦** column showing variance against plan.
- **Provisional / PC sums** — described lump sums with a done tick.
- **Variations** — change orders (see §7).
- The cascade (all percentages editable inline; defaults shown):
```
Preliminary   = (Gross + Provisional) × 7.5%
Subtotal      = Gross + Provisional + Preliminary
Contingency   = Subtotal × 5%
VAT           = (Subtotal + Contingency) × 7.5%
Project total = Subtotal + Contingency + VAT + Variations
```
- A **multi-step undo bar** keeps the last five deletions individually restorable.

**Exports**

| Export | Structure |
|---|---|
| **Elemental BoQ** (bungalow / multi-storey) | One sheet per element — Preliminaries, Substructure, Superstructure, Frame (split per floor), Staircase, External Works — plus Cover, Provisional Sums, Variations, Other items, General Summary |
| **Trade BoQ** (NRM2-style) | Trade-structured sheet with per-trade sections and subtotals, plus separate Prelims / PC / Variations and a General Summary |
| **Generic BoQ** (by category / by trade) | A flat bill mirroring exactly what's on screen, including unsaved rates |

The elemental and trade exports are **formula-driven** (every amount is a live Excel formula), follow Nigerian BoQ conventions including the **A-B-C…(skip I)…J-K** serial-letter column, carry SMM codes (E10 concrete / E20 formwork / E30 reinforcement) and standards references (BS 4449/4483, BS 5950), handle foundation type (pad/raft/pile), split multi-storey frame elements per floor, and omit empty elements so there are no blank sheets.

---

## 5. Budget tab — material & labour build-up & procurement

The Budget tab is the cost-plan side of the same bill: what each measured line is actually made of.

- **The Bill drives the arrangement.** Every budget row is matched back to its bill line (by code → Revit element overlap → title), then laid out in **Bill order and Bill sections**, with each line's **material and labour bundled together** (materials first, then labour, then plant / consumable / equipment).
- **Price each row** manually or **from RateGen**, set a **per-line Overhead & Profit %**, and the resulting **Bill Rate = Material + Labour + O&P flows up to the BoQ automatically**.
- **Material Constants library** (`/rategen/material-constants`) — the factors that turn a measured quantity into materials and labour ("1 m³ of 1:2:4 concrete = 6.65 bags of cement"). Editing a constant changes every schedule generated afterwards, and **any project can be regenerated against the new figures from its Budget tab**. The same keys back QUIV's and HERON's desktop constants, so a firm's standards mean the same thing on the desktop and on the web.
- **Service Constants library** (`/rategen/services-constants`) — house standards for pricing MEP: standard lengths → bundles/Nr, connector rules, fittings allowance per type.
- **One-click services pricing** — on an MEP project, one action prices every services bill line: the server resolves material + labour rates, applies the Constants through the shared service-compute engine, writes the build-up as budget items, and derives each bill line's rate.
- **Material & labour schedule view** — one line per component (Cement, Sandcrete Block 9in, Reinforcement Y12…) with quantity, unit and editable rate; **Auto-fill (RateGen)** prices every line against the catalogue (optionally only empty rates, never overwriting on a unit conflict), and **Sync prices** keeps them current.
- **Procurement tracking** — the same grid carries a **Purchased** status instead of "Completed", so the schedule doubles as a purchase tracker: qty × rate = amount, with valued/balance per line. This is what feeds the *budget-basis* valuation (see §8).

> **The two-tier rule:** the **Budget/Materials** view prices against *component* (material + labour) rates; the **BoQ** view prices against *composite build-up* rates. Both come from the same RateGen library.

---

## 6. Rate Generation — the pricing library

**Rate build-up formula**
```
Net   = Σ (component qty × unit price)      ← wastage/conversion folded into the qty (e.g. ×1.4)
OH    = Net × Overhead%   (default 10%)
Profit= Net × Profit%     (default 25%)
Total = Net + OH + Profit                    ← both taken on Net, never compounded
```
The same formula runs when authoring a rate, computing one on demand, and when the plugin reads it back, so the number never drifts between surfaces. Unit-price fields accept **spreadsheet formulas** (`=3% * Net Cost`), and the engine iterates until interdependent formulas converge.

**Three layers, one effective library** (`/rategen`)
1. **Master rates** — the shared, admin-curated catalogue.
2. **User overrides** — your personal edit of a master rate; an override **fully replaces** the master for that item.
3. **Custom rates** — brand-new rates you build yourself (purely additive).

Precedence is **override > master**, with customs appended. The live, auto-refreshing library page has tabs for Master Materials/Labour, My Materials/Labour, My Custom Rates and **Effective Rates**; all edits are version-guarded.

**Sections:** Groundwork · Concrete Works · Blockwork · Finishes · Roofing · Windows & Doors · Painting · Steelwork · Carbon & Others — over a shared master component catalogue (serial number, name, unit, default unit price).

**Rate Updates feed** (`/rategen/updates`) — badges newly changed master rates so you can see what moved and when.

**Integrity guardrails**
- **Composition guardrail** — on save, the stated headline total must equal its build-up within 0.5%. An **overstated** rate is rejected/clamped to the build-up, so an inflated rate can never reach the plugin.
- **Price provenance (`priceAsOf`)** — every breakdown line records which master material/labour row it came from (serial + name) and when that price was captured, carried through overrides and customs. Full traceability from a unit rate back to a dated source price.
- **Component classification** — each component is deterministically tagged Material / Labour / Plant / Consumable, so the downstream schedule splits correctly instead of re-guessing.

**Profit-margin analysis** — per takeoff line: proposed revenue (sell rate × qty) vs proposed cost (net × (1 + OH%) × qty) → proposed profit and margin %, with an **actual** side using re-measured rate/qty. Aggregated to a project-level proposed-vs-actual profit and variance, surfaced at unified-save time.

---

## 7. Contract administration — lock, baseline & variations

**Locking the contract**
- Lock behind a **4-digit PIN** (stored hashed, never returned to the browser).
- Locking **snapshots every line** (`description, qty, unit, rate`) as the baseline and **freezes the grand-summary cascade** — measured work, provisional, preliminaries, contingency, VAT and the resulting **contract sum** — storing each frozen component.
- Unlocking needs the matching PIN (pre-PIN contracts unlock without one), clears the lock, but **keeps the baseline and contract sum** for history.

**What the lock enforces — server-side and authoritative** (it holds even if a client bypasses a disabled field):

| Action after lock | What happens |
|---|---|
| Add a new line | Diverted into the **Variation tracker** as a `post-lock-new-item` change order; never added to measured work |
| Change a quantity | New figure written to **Actual qty**; contract `qty` snaps back to baseline |
| Change a rate | New figure written to **Actual rate**; contract `rate` reverts to baseline |
| Delete a baseline line | **Re-inserted** on save (with its prior actuals/progress) — the contract sum can never silently shrink |

Still editable while locked: rate (recorded as actual), actual qty/rate, category/trade, and completion status.

**Variation tracker**
- Each variation carries `description, qty, unit, rate, reference, issued date`, a **source** (`manual` or `post-lock-new-item`) and a **completed** flag; value = qty × rate.
- **Manual** variations are keyed into the BoQ's Variations section; **automatic** ones are captured with reference `AUTO`.
- **Roll-up rule:** variations always count toward the project total and toward EVM's Budget at Completion, but count as **earned value only when marked completed**. Provisional sums follow the same semantics.
- **Progress propagation** — a linked WBS task reaching 100% flips its variation to completed.
- A **Contract Movement** panel on the PM dashboard shows variations declared vs executed, PC sums released, and forecast final cost vs contract sum (savings or over-run).

---

## 8. Valuation, interim certificates & final account

**Choose the valuation basis** (Valuation tab):
- **By Bill of Quantity** — each line valued by its own % complete on the BoQ tab.
- **By Budget (Material & Labour)** — each line valued from its material & labour breakdown, driven by procurement marked on the Budget tab.

**Issuing an interim certificate** — cumulative-less-previous, across all streams:
- **Measured work** — `Σ (actual or planned qty) × (actual or planned rate) × valuationFactor`, so partial progress flows in (a line at 60% contributes 60%).
- **Variations** — completed only. **Provisional sums** — completed only. **Preliminaries** — the pool × the completed allocation.

```
This certificate = max(0, Cumulative value − Σ previous certificates)
Retention        = This certificate × Retention%
Net before tax   = This certificate − Retention + Retention released
VAT              = Net before tax × VAT%
WHT              = Net before tax × WHT%
Net payable      = Net before tax + VAT − WHT
```

- Retention/VAT/WHT default from the project's valuation settings and are **captured at issue**, so historical certificates stay reproducible when rates later change. Certificates are numbered automatically.
- **Lifecycle** — `draft → approved → paid` from a per-row dropdown. Once issued the **money is frozen**: only status, notes and dates can be edited. Only the **latest** certificate can be deleted, preserving the cumulative chain.
- **Outputs** — certificates export to Excel; the tab also produces a printable **Interim Payment Application** from the daily valuation log. A totals footer shows total certified and net retention held.

**Progress ledger & audit trail**
- Progress is captured as an **append-only valuation ledger**: every earned-position change records a signed event (value delta, before/after %, the day it was marked). Summing positive deltas over a period gives the **value of work done** in that period.
- Events roll into **daily valuation logs** (with a staleness filter so reverted lines don't linger), powering the valuation date selector and the printable certificate.
- Progress is **bi-directional** — a WBS task's % complete propagates back to its linked BoQ lines as a weighted sum, so schedule and bill always agree on what has been earned.

**Final account**
```
Final contract value = Measured + Provisional + Preliminary + Variations
Savings              = Agreed contract sum − Final contract value    (positive = under-run)
```
Snapshots final measured work, provisional, preliminaries and variations; sums retention released and total certified to date. **Finalising freezes the project** (no further certificates or BoQ edits) and can be reopened if needed. Exports to Excel.

---

## 9. Programme & project controls (WBS & EVM)

**Task model** — dotted **WBS code** (e.g. `A.21.1`), name, schedule (start/end, baseline start/end, duration, actuals), predecessors, critical-path flag, % complete, status, priority, milestone flag, and cost links.

**Three ways to build the WBS**
1. **Manual** — add tasks with code, dates, priority, milestone/critical flags, and either a manual ₦ cost or BoQ links.
2. **Generate from BoQ** — one task per bill line, auto-linked, `baselineCost = qty × rate`, dates distributed across the programme window. Re-running updates rather than duplicates.
3. **Import MS Project** — upload `.xml` (or `.mpp`, with an in-app helper): reads dates, baselines, durations, % complete, WBS/outline numbers, milestones, summaries, predecessors and the **critical path** (Critical flag or zero total slack). It deliberately ignores resource-derived costs, importing only explicit baseline costs, so the cost baseline stays clean. Imports can be cleared.

**Linking cost to the WBS — the core capability**
- Tasks link to one or more BoQ lines — **measured items, preliminaries, PC sums or variations** — through a searchable picker.
- **Weighting**: one bill line can be split across several tasks (e.g. electrical as first-fix 70% / final-fix 30%). A task's baseline cost = `Σ item.amount × weight%`.
- A **WBS-link health chip** on each BoQ row shows fully allocated (emerald = 100%), under-allocated (a scope gap) or over-allocated (a double-count risk).
- **Smart auto-linking** matches imported task names to BoQ items via per-user **learned mappings** (improving over time) plus fuzzy matching, and reports how many links it made. **Re-importing smart-merges**: schedule fields refresh from MS Project while progress, cost links and manual edits are preserved.

**Roll-ups & scheduling**
- **Summary tasks** roll up leaf descendants — baseline/actual cost, weighted % complete, earliest start / latest finish — purely from the WBS code hierarchy.
- **Auto-reschedule** cascades dates through the network (finish-to-start, cycle-safe) when the project start moves; a manual reschedule recalculates the whole programme.
- **BoQ heatmap** — every line as a colour-coded progress cell, grouped by category/trade.
- **Calendar export** (`.ics`) puts the programme into any calendar app.
- **Risk register** and **issue log**, with open-risk / open-issue counts on the dashboard.

**Earned Value Management**

| Metric | Meaning | Derivation |
|---|---|---|
| **BAC** | Budget at Completion | Live project total (forced to it when the contract is locked) |
| **PV** | Planned Value | Each task's baseline cost interpolated between baseline start/finish |
| **EV** | Earned Value | BoQ-side earned: measured (partial-aware) + completed PC/variations/prelims |
| **AC** | Actual Cost | Actual costs recorded against the work |
| **CPI / SPI** | Cost / schedule performance | `EV / AC` · `EV / PV` |
| **EAC / VAC** | Forecast final cost / variance | `BAC / CPI` · `BAC − EAC` |

The dashboard shows six headline tiles (Progress %, Budget Used %, Overdue, CPI, SPI, Tasks Done %), a **budget bar** (BAC/EV/AC), a **tasks donut**, a **burndown chart**, and a **WBS health strip** with a critical-path banner.

**BoQ ↔ WBS coverage reconciliation** — classifies every bill line as *unlinked, fully linked, under-linked* or *over-linked*, flags **stale links** (a task pointing at a renamed or removed line, which would silently drop its baseline to ₦0), quantifies the excess on over-allocations, and reports an overall coverage %. This catches the classic earned-value errors of double-counting and missing scope.

---

## 10. 3D model & model health

- **Attach up to three IFC/BIM models per project** — one each for **Architectural, Structural and MEP** — stored in cloud object storage and surfaced on the project and the public dashboard.
- **3D Model tab** — an in-browser viewer where **each mesh is tagged with its Revit Element ID**. Selecting a BoQ line **highlights the exact elements its quantity came from**; clicking an element traces back to the BoQ lines that measured it, with each element's share of the quantity (from the per-element split when present, otherwise an even split flagged as approximate) and its share of the cost. Money is hidden for viewers who aren't entitled to see rates.
- **Model check reports** (`/model-check/:id`) — readiness reports saved from the plugin: a **readiness score ring** (Ready for Takeoff / Conditionally Ready / Not Ready), total elements, missing categories, overlap count, per-category breakdown, rebar analysis, and a **QS query text** to send back to the modeller. Reports are listed, openable, deletable, and have a **public link** for sharing with the design team.

---

## 11. Collaboration & client sharing

**Working with colleagues**
- **Share codes** (owner-only panel) — generate a code carrying an **access level** (`view` or `full`), an optional **email restriction** and a **use limit**. Each code has a short **share link** (`/j/:code`) and a downloadable **QR code (PNG)**.
- See who has joined, **change a collaborator's access level**, and **revoke** codes or people at any time.
- **Rate masking rule** — a collaborator without an active **RateGen** subscription sees the project with **all rate and amount fields masked**, server-side. It is not a UI hide: masked collaborators receive rate 0, so money simply doesn't render anywhere — bill, model viewer, reports included. The owner always sees rates.
- **Invite a full editor by email** on PM tracker projects.

**Linked projects (services rolled into works)**
- Roll another project's cost — typically an MEP/services project — into this project's general bill. Totals are **live** (a variation on the linked project reflects immediately), and a **drift** indicator shows how far the live total has moved from the frozen snapshot, with a **rebaseline** action and a breakdown of what changed.

**The public client dashboard**
- Share any project through a **read-only public link, no login required**, which re-frames the QS numbers in client language:
  - An **on-track / watch / over-budget** banner, a progress ring, physical and cost bars.
  - The full **contract-sum cascade** (measured / provisional / prelims / contingency / VAT / variations), showing the **frozen lock-time values** once the contract is locked.
  - **EVM in plain English** — "Spent to date", "Value delivered", "Performance", "Expected final cost".
  - A **certificate roll-up** — total certified, retention held, and whether the final account is open or closed.
  - Attached **BIM models** and an upcoming-spend view.
  - A header badge: Draft / Contract-locked / Final-account-closed.

---

## 12. Portfolio view & reporting

**Across all your jobs**
- **Portfolio** (`/portfolio`) — every saved project grouped by product (QUIV, HERON, MEP, Civil 3D, ArchiCAD and the derived materials buckets), owned **and shared with you**.
- **Portfolio dashboard** (`/portfolio-dashboard`) — a single roll-up across every product: progress ring, BoQ total vs completed per product, project count per product, status mix, and an **Excel export** of the whole portfolio.

**Report documents (rendered on-screen, exportable to PDF)**

| Report | Scope |
|---|---|
| **Project report** | One project — progress, cost, contract position |
| **PM report** | One project — schedule and earned-value performance |
| **Management report** | Portfolio-wide across every product you own or collaborate on |
| **Activity report** | Your platform activity |

Reports are cost documents end to end, so the per-project reports require the product entitlement, and a non-owner collaborator additionally needs an active RateGen subscription; the management report only aggregates what you may already see (money on shared projects is masked without RateGen).

**Full export inventory**

| Output | Format |
|---|---|
| Elemental BoQ (bungalow / multi-storey) | Excel, formula-driven |
| Trade BoQ (NRM2-style) | Excel, formula-driven |
| Generic BoQ (by category / by trade) | Excel, live on-screen rates |
| Material & labour schedule | Excel |
| ArchiCAD BoQ | Excel + PDF |
| Interim payment certificate | Excel + printable HTML |
| Final account | Excel |
| Work programme | `.ics` calendar |
| Portfolio roll-up | Excel |
| Project / PM / Management / Activity reports | PDF |
| Invoices & receipts | PDF |
| BoQ import template | Excel |

---

## 13. AI assistance — Ada

**Ada** is the AI agent widget available across the site. For a logged-in QS with an active subscription she works on your real data:

| Ask her to… | What she does |
|---|---|
| "Show my projects" | Lists your projects and opens details |
| "What's the budget on Ikoyi Duplex?" | Reads the project's budget and bill |
| "How many bags of cement do I need?" | Resolves a resource quantity from the schedule |
| "Check my rates" | **Market verdict per bill line** against the RateGen benchmarks (whole bill or a matching subset) |
| "Review my takeoff for errors" | **Scans for duplicates, wrong units for the work type, implausible quantities, rate outliers and descriptions that contradict their unit or rate** |
| "What should 150mm blockwork cost?" | **Suggests a component-level unit-rate build-up** for a described item |
| "What's on my account?" | Subscriptions, expiry, renewal |

The three cost-intelligence capabilities (**BoQ market check**, **error scan**, **rate build-up**) are grounded in the RateGen library and BESMM 4R and are also exposed as an API so the plugins can offer them as a button. Usage is metered against your own account with an allowance gate; a lapsed subscription is turned into a renewal prompt rather than an error.

---

## 14. Beyond the bill — site time, learning & training

**ADLM Time Pro** (`/time-management`) — a separate paid product for site labour time management: log tasks against **31 trades** (site clearance, earthworks, concrete, formwork, rebar, blockwork, carpentry, roofing, steelwork, glazing, plumbing, drainage, electrical, ELV, HVAC, fire protection, tiling, screed, ceilings, painting, waterproofing, piling, scaffolding, roadworks, landscaping, lifts, T&C, demolition…), with a **7-day site weather forecast** for the site's location.

**Learning centre** (`/learn`)
- **Paid courses** (`/learn/course/:sku`) with secure signed video playback and progress tracking.
- **Quizzes** with attempt limits, best-score tracking, and remaining attempts shown.
- **Assignments/submissions** with instructor grading.
- **Certificates** — issued against the certificate name on your profile, from the course's certificate template.
- **Free videos** (`/learn/free/:id`) and **user guides** filtered to the products you own.

**Training** (`/trainings`)
- **Virtual trainings** — browse, view detail (`/trainings/:id`), enrol and manage the enrolment (`/trainings/enrollment/:enrollmentId`).
- **Physical trainings** (`/ptrainings/:key`) — enrol, confirm a training date on the order, and see the training location / classroom assigned.
- Add sessions to your calendar from the dashboard.

---

## 15. Gates, limits & guardrails

**What needs a subscription**

| Surface | Requirement |
|---|---|
| Saving from a plugin, opening a project, BoQ/Budget/PM/Valuation | Active entitlement for that product (`revit`, `planswift`, `civil3d`, `revitmep`/`mep`, `archicad`) |
| Seeing rates/amounts as a **non-owner collaborator** | Active **RateGen** subscription (otherwise all money is masked server-side) |
| Per-project and management **reports** | Product entitlement (+ RateGen for non-owner collaborators) |
| Excel BoQ import | Entitlement for the target product bucket |
| Time Pro time log | Time Pro entitlement |
| Ada's cost-intelligence tools | Any active subscription, within the AI allowance |

**Capacity limits**
- **30 projects per product (personal) / 50 (organization)**, with purchasable extra storage slots at an admin-set per-product price; storage bars on the dashboard and in the projects view.
- Up to **3 BIM model attachments** per project (one per discipline).
- AI calls are capped per request and metered per account.

**What the system will refuse to do** (the guardrails worth knowing)
- Overwrite a concurrent edit — saves are version-guarded and return a conflict instead.
- Accept a rate whose headline exceeds its build-up by more than 0.5% — it is rejected or clamped down.
- Let a locked contract's sum move — quantity/rate changes become actuals, new lines become variations, deleted lines are re-inserted.
- Change an issued certificate's money — only status, notes and dates remain editable, and only the latest certificate can be deleted.
- Let a client-side bypass through — lock enforcement, rate masking and entitlement checks are all server-side.
- Run raw `eval` on a formula cell — arithmetic only, safe-evaluated.
- Silently convert a genuinely mismatched unit — it flags amber instead.

---

## 16. Quick reference

**Formulas**
```
Rate build-up   Net = Σ(qty × unit price);  Total = Net + Net×OH% + Net×Profit%   (OH 10%, Profit 25%)
Bill rate       Bill Rate = Material + Labour + O&P            (when derived from the Budget tab)
Grand summary   Prelim = (Gross + Prov) × 7.5%
                Subtotal = Gross + Prov + Prelim
                Contingency = Subtotal × 5%
                VAT = (Subtotal + Contingency) × 7.5%
                Project total = Subtotal + Contingency + VAT + Variations
Per line        valuationFactor = 1 if ratified else %/100
                Earned = qty × rate × valuationFactor;  Balance = qty × rate × (1 − valuationFactor)
Certificate     This cert = max(0, Cumulative − Σ previous)
                Retention = This cert × Retention%
                Net before tax = This cert − Retention + Retention released
                Net payable = Net before tax + VAT − WHT
Earned value    CPI = EV/AC;  SPI = EV/PV;  EAC = BAC/CPI;  VAC = BAC − EAC
Final account   Final value = Measured + Prov + Prelim + Variations
                Savings = Contract sum − Final value
```

**Route map**

| Area | Routes |
|---|---|
| Projects | `/projects/:tool` · `/revit-projects` · `/portfolio` · `/portfolio-dashboard` · `/projects/shared/:token` · `/j/:code` |
| ArchiCAD | `/archicad` · `/archicad/:projectId/boq` · `/archicad/:projectId/dashboard` · `/archicad/:projectId/element/:guid` |
| Rates | `/rategen` · `/rategen/updates` · `/rategen/material-constants` · `/rategen/services-constants` |
| Delivery | `/pm-tracker` · `/model-check/:id` · `/time-management` |
| Account | `/dashboard` · `/profile` · `/change-password` · `/receipt/:orderId` · `/invoice/:id` · `/purchase` · `/quote` |
| Learning | `/learn` · `/learn/course/:sku` · `/learn/free/:id` · `/trainings` · `/ptrainings/:key` · `/freebies` |
| Info & help | `/products` · `/product/:key` · `/whats-new` · `/testimonials` · `/about` · `/support` · `/support/request` |

**Standards & conventions**
BESMM4 preliminaries (22 items) · NRM2 / SMM7 work sections and codes (E10/E20/E30) · BS 4449 / BS 4483 reinforcement · BS 5950 steelwork · Nigerian BoQ serial lettering (A, B, C … skip I … J, K) · **NGN-native throughout**.

---

*Compiled from the ADLM Website codebase. For the deep internals of the workspace — export anatomy, classification tables, pmCompute derivations — see [`PROJECT_WORKSPACE_FEATURES.md`](./PROJECT_WORKSPACE_FEATURES.md).*
