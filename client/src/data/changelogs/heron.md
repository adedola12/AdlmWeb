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

## 3.0 — 1 October 2026 — HERON 3, rebuilt around your take-off

HERON 3 is a complete redesign: start from your take-offs, read the PlanSwift job once, check every item before it is billed, then price, export and save from one place. Underneath, roof timber, steel frames, column bases and bill wording are now measured and described correctly across the bill, the Budget and Excel.

### ✨ New

- **Your take-offs, in one place.** HERON opens on the job PlanSwift has open and the take-offs kept on this PC, as a gallery or a list. Make a project from the open job, rename or delete take-offs, and bring your ADLM Cloud projects across once.
- **Read the job, then check it.** HERON reads every folder of the job and flags what needs attention before it reaches the bill: no quantity, no unit, a broken form field, an item outside a folder, or empty sub-items. Group the take-off by folder, trade or element, search it, and filter by any of those checks.
- **Correct the bill description on the item.** Pick any item to see its figures and its bill description, and fix the wording right there. Your wording is what goes to ADLM Cloud.
- **Show in PlanSwift.** From an item, HERON opens the page it is drawn on, frames its shapes and selects it in PlanSwift. Items drawn on several pages get a page stepper, and Follow in PlanSwift does this on every pick.
- **A Budget card for every tool.** Each tool's sub-items sit inside its card. A sub-item that appears under two tools (Blinding under Girth and under Column Base, say) is no longer merged into one line.
- **Fill a client's bill.** On the Excel screen, open a client's own BoQ workbook, old .xls files included. HERON matches its lines to your take-off and writes the quantities into a copy, with a note on every cell it filled. The client's file is never changed.
- **Open the Excel Takeoff Link from HERON.** The Excel screen lists the workbooks open in Excel and opens the Takeoff Link pane in the one you pick, in a new workbook or in a file, docked left or right.
- **Take-off time log.** When you export or save a take-off, HERON shows how long it took. You can stop sharing timings in Settings.
- **Dock beside PlanSwift.** Dock turns HERON into a narrow column on the right of the screen, kept on top of PlanSwift. Full screen puts it back. Light and dark themes are one click away.

### 🔧 Improved

- **Roof timber is billed once.** On a job with a Roof Covering calculator, rafters, purlins, tie beams, king posts and struts come from the calculator by length. The ROOF MEMBERS Rafter, Noggings and Tie Beam tools stay in the take-off as aids and no longer bill the same timber a second time as an area.
- **Pit excavation is measured net (BESMM4).** Counted pits and pits measured by area no longer add a working-space volume or a flat 20% uplift. Earthwork support is measured on the net faces.
- **Steel Tonnage covers more of the job.** The STEEL TRUSS tools (UC column, UB beam, SHS/RHS, Z purlin, bracing) are added from the weight the template already computes.
- **Better bill wording.** Ridge Cap reads as ridge capping, not eave angle. Earthwork support follows the excavation depth ("not exceeding 2m" or "exceeding 2m"). Walls of any thickness, lighting fittings, column concrete, landing soffit formwork and stair tread formwork now get ADLM wording instead of their raw PlanSwift names, and the wording's typos are gone.
- **Budget prices follow your Rate Gen licence.** Without Rate Gen, the Budget says where prices come from instead of showing ₦0.00 everywhere. Lifetime Rate Gen licences are recognised.

### 🐛 Fixed

- **Items outside a folder, or in a sub-folder, went missing from the bill.** HERON now reads every folder, plus a "Not in a folder" group, so those quantities reach the bill, the Budget, the cloud save and Excel.
- **Measured pad concrete was recomputed.** Concrete in Column Base (and ground beam, pile cap and lift base concrete) is billed as you measured it, not replaced by a computed figure with an extra formwork line.
- **Counted column bases and lift bases.** Every part of them (rebar, formwork, bars, excavation) now follows the number of bases, not just one.
- **Timber tie beams and steel beams were given concrete formwork and rebar.** Only linear concrete beams get them now.
- **Steel frame columns and beams weighed 0 t.** The ADLM STEEL FRAME sections are recognised and weighed.
- **Bulk excavation, site area and wire runs were measured in feet on metric jobs.** They now measure in metres, like every other tool.
- **Parts named from a blank form field disappeared** (tiling and lighting points, for example). They keep their quantity and are listed under the item's name.
- **Deleting a line in Review & save lost its sub-items.** They now move up into the same folder.
- **Data Cable and Coaxial Cable could not be drawn, and detector and camera tools lost their Type.** Both are repaired.
- **Starting HERON hid the ADLM template from PlanSwift** until you signed out and in again. The template now stays in place.
- **Two copies of the ADLM template.** The template now installs into PlanSwift's own template folder, and an older duplicate copy is moved aside, so PlanSwift no longer warns about it when you open a job.
- **Review & save failed silently when PlanSwift was closed or restarted.** It now says so, reconnects where it can, and asks you to re-read the job when it cannot.

## 2.9.5 — 4 September 2026 — Rates when you ask for them

You decide when a job gets priced, and an item priced below cost no longer blocks your save. This update also fixes a start-up lockout and stops the installer leaving the ADLM take-off package on your desktop.

### ✨ New

- **Rates load only when you ask.** The Bill, the Budget and the Budget cloud review open with every rate at 0. A **Load rates** button on each screen prices the job from your rate library (it becomes *Reload rates* afterwards). Manual edits, the inline rate search and "BoQ rate ← budget" still work on an unpriced job.
- **Loading rates on the Bill prices the Budget too.** One click does both. Each Budget item carries its material recipe, one Labour line and a single **Other materials** line for whatever the recipe does not cover, so the margin left is the rate's real overhead and profit.

### 🔧 Improved

- **Items priced below cost no longer block the save.** They are still highlighted in amber and listed in the save confirmation, but the take-off always saves.
- **An unpriced take-off saves unpriced.** If you save without loading rates, the cloud budget carries the quantities at 0 and no Profit line, so the job no longer shows online as a total loss.
- **"Other materials" is always shown.** It used to be dropped when the gap was large, which hid cost exactly where the recipe covered least.
- **The ADLM take-off package stays off your desktop.** Installs no longer place it on the shared Public Desktop. HERON removes copies left by earlier versions, and may ask once for administrator permission to do it. The desktop shortcut is now named **ADLM HERON**.
- **Every message has a title.** HERON's message boxes now say what they are about, so none of them looks like a blank window.

### 🐛 Fixed

- **HERON froze on the loading screen after a hardware change.** A new dock, VPN, network adapter or firmware update could stop HERON at start-up behind an untitled message. HERON now asks you to sign in again and carries on.

## 2.9.4 — 12 August 2026 — An install that always finishes

HERON now registers the Excel Takeoff Link itself, so the install never depends on your version of the Installer Hub.

### 🐛 Fixed

- **"The executable to run could not be found after deployment."** On older versions of the Installer Hub, the step that registered the Excel add-in could not run, and it stopped the whole install, so you also lost the desktop shortcut and the PlanSwift import package. That step is gone, and every install now finishes.
- **Connect Excel reported the add-in as not installed when it was.** HERON was checking the wrong registry entry.

### 🔧 Improved

- **HERON registers the Excel add-in itself.** It checks each time it starts and registers the add-in for the person who actually opens Excel, not the administrator account the installer runs as.

## 2.9.3 — 12 August 2026 — One HERON, and a cloud that reconnects

HERON now reconnects to ADLM Cloud after a restart, and opening it twice brings back the window you already have.

### 🐛 Fixed

- **Save to Cloud was greyed out after restarting HERON.** If you stayed signed in, HERON came back without its cloud connection, so every Save to Cloud button did nothing. It now reconnects on start. When there is genuinely no cloud connection, Save tells you so.

### 🔧 Improved

- **One HERON per PC.** Opening HERON a second time brings the open window to the front instead of starting another copy. Two copies could feed the Excel Takeoff Link from the wrong window and overwrite each other's settings.

## 2.9.2 — 9 August 2026 — The Excel Takeoff Link, ready on install

The Excel Takeoff Link registers itself as part of the install, so the ribbon is there the first time you open Excel.

### 🐛 Fixed

- **The Excel Takeoff Link never appeared in Excel.** Installing HERON copied the add-in onto your machine, but Excel only loads an add-in it has been registered to know about — and that registration step was missing from the installer package. So the files were there, nothing was broken on your side, and the ribbon simply never appeared. The registration now ships with HERON and runs as part of the install.
- **Reinstalling did not help either.** Because the missing piece was in the package rather than on your machine, repairing or reinstalling 2.9.1 changed nothing. Updating to 2.9.2 is what fixes it.

### 🔧 Improved

- **You can re-run the registration yourself.** The registration tool now also lands next to HERON's own files, at `C:\ProgramData\Planswift Plugin\Register-ExcelAddin.cmd`. If the Excel link ever stops appearing — after an Office repair or a profile change, say — double-click it and Excel will pick the add-in up again.

## 2.9.1 — 31 July 2026 — Sign-in that follows the service

HERON now resolves the ADLM service through your machine's settings, so sign-in stays reliable and future infrastructure changes never require a new download.

### 🔧 Improved

- **A server move no longer means a new download.** Every part of HERON that talks to ADLM now goes through one setting, `ADLM_API_BASE_URL`, which the ADLM Installer Hub writes for you. This is the same mechanism QUIV already used — and the reason QUIV kept working throughout. If we ever move the service again, it is a settings change rather than a new version for every customer.

### 🐛 Fixed

- **"Server is temporarily unavailable" when signing in.** HERON was built with ADLM's server address baked in. When the service moved to its new home, HERON kept calling the old address and every sign-in attempt failed with that message. Retrying did not help, and there was nothing you could change on your machine to point it at the working service — the address was fixed inside the plugin itself. HERON now reads the address from your machine's settings each time it starts, and sign-in works again.
- **"You are offline" while your connection was fine.** HERON decided whether you had a working connection by contacting that same retired address. Because nothing answered there, it could report you as offline — and fall back to offline behaviour — on a perfectly healthy internet connection. It now checks against the live service.
- **Rates, cloud projects and licence checks** were all affected by the same cause and all recover with this update. If HERON told you your subscription could not be verified during this period, that was this fault and not your licence.

## 2.5 — 25 July 2026 — The Specifications Release

Write your own bill descriptions. Every measured item carries a free-text Specification that prints through the cloud review, the Excel BoQ export and the Excel Takeoff Link.

### ✨ New

- **Specification input on every measured template.** Finishes, walls (blockwork & openings), services (electrical, plumbing, HVAC, fire alarm, ELV), frame, roofing and substructure — every Area, Linear and Count template gains a "Specification" field on its record form. Existing installs are patched automatically on the next launch.
- **Specifications tab.** A new sidebar view lists every takeoff item in the job at a glance — trade, item, quantity, unit, the default bill description and your specification side by side. Type or clear a specification right in the table and it is saved back onto the PlanSwift item immediately, so it survives reloads and flows into every export. Includes a search box and an "only items with a specification" filter.
- **Blank means default.** Anywhere a description is produced, a non-blank Specification wins verbatim; blank falls back to the standard QS wording exactly as before.

### 🐛 Fixed

- **Steel Tonnage crash.** Clicking Steel Tonnage could take the whole app down. HERON now has an app-wide crash shield: unexpected errors show a friendly dialog and are written to a log file instead of closing the app. The steel scan also skips and reports unreadable items rather than aborting, and a theme file that fails to load no longer kills the session.
- **Sidebar collapse** now also hides the Steel Tonnage and Specifications labels.

## 2.4.1 — 21 July 2026 — Sharper concrete quantities

Concrete volumes in beam sections now measure to full accuracy across every template.

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

Turn any takeoff into a costed budget automatically — a full Material & Labour schedule for every BoQ item, priced from your RateGen library and exported as a linked Excel workbook.

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
