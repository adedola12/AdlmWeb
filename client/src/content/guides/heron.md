---
id: heron
title: ADLM HERON
tagline: Measure PDF drawings in PlanSwift with the ADLM template, then let HERON check the take-off, price the budget and hand a clean bill to Excel and ADLM Cloud.
version: "3.0.1"
updated: 2026-10-04
platform: Windows desktop app that works alongside PlanSwift 10 or 11
productKeys: [planswift, heron]
pdf: ADLM-Heron-User-Guide.pdf
pdfAliases: [ADLM-Complete-User-Guide.pdf]
order: 5
---

ADLM HERON is a Windows app for quantity surveyors and estimators who take off from 2D drawings in PlanSwift. You measure in PlanSwift with the ADLM template, so every slab, wall, finish and service already knows its unit and its formula. HERON then reads the job PlanSwift has open, tells you what is wrong with the take-off before it becomes a bill, prices a material and labour budget from your Rate Gen library, works out steel tonnage, and sends the bill to Excel and to ADLM Cloud. This guide covers HERON 3.0.1. HERON 3.0.0 is the version on the Installer Hub today; 3.0.1 is staged and adds the constants fixes listed in [What's new](#whats-new-in-301).

## What's new in 3.0.1

HERON 3.0 is a complete redesign. If you used HERON 2.9, the main changes are:

- **A new shell.** A slim sidebar with **Take-offs**, then the open take-off's four screens: **Take-off**, **Budget**, **Steel tonnage** and **Excel**. **Dock** puts HERON in a narrow column beside PlanSwift.
- **Take-offs, not projects.** Each PlanSwift job becomes a take-off card. Jobs you saved to ADLM Cloud earlier appear as cards too.
- **Checks before the bill.** HERON flags items with **No quantity**, **No unit**, a **Dead form field**, **Not in a folder** or **Empty sub-items**, so silent zeros never reach the bill.
- **Re-cut without touching PlanSwift.** View the take-off **By Folder**, **By Trade** or **By Element**, and search every item and sub-item in the job.
- **Show in PlanSwift.** Jump from an item to the page it is drawn on.
- **A simpler review.** **Review & save** opens one sheet, **Review before saving**, with **AI Review** and **Save to ADLM Cloud**.
- **Fill a client's bill.** Put HERON's quantities into a client's own Excel bill, in their layout.
- **Roof timber is billed again.** The Roof Covering works out its rafters, purlins, struts and ties, wall plate, fascia and barge boards, and they reach the bill, the budget and the export.
- **Pile, beam, slab and staircase breakdowns** are calculated again.

**HERON 3.0.1** (staged) aligns HERON's material constants with the other ADLM products:

- Blockwork waste is now **1.03** (was 1.05).
- Floor and wall tile waste is now **1.10** (was 1.12).
- Rebar weight uses **d²/162** everywhere (0.00617 kg/m per mm²).
- Paint is measured and labelled in **litres** (coverage 2.0 m² per litre, all coats).
- HERON keeps **1.10** waste on rebar and formwork on purpose: rebar waste carries laps and offcuts, and formwork is bought in whole sheets.

Constants you have edited yourself are kept. Only values still at the old default move to the new one.

## Before you start

### What you need

| You need | Notes |
|---|---|
| A Windows PC | HERON is a Windows desktop app. |
| PlanSwift 10 or 11 | HERON works alongside PlanSwift. It does not replace it. |
| An ADLM account with a HERON subscription | The same email and password you use on the ADLM website. |
| Rate Gen (optional) | Prices in the **Budget** come from the ADLM rate library, which is part of Rate Gen. Without it you get the budget as quantities only. |
| Microsoft Excel (optional) | For the workbooks, the Excel Takeoff Link and **Fill a client's bill**. |
| An internet connection | For your first sign-in, loading rates, AI Review and saving to ADLM Cloud. Reading and checking a take-off works offline. |

### Installing HERON

HERON is installed from the ADLM Installer Hub. See [ADLM Installer Hub](/guides/installer-hub).

1. Close PlanSwift and Excel completely.
2. Open the Installer Hub and sign in.
3. Find **ADLM Heron** and install or update it.
4. Wait for the Hub to report that the install has finished.

The Hub installs the HERON app with an **ADLM HERON** shortcut, the ADLM template inside every PlanSwift it finds, a protected copy of the template, and the Excel add-in.

> **Important:** If the install fails with access denied, PlanSwift or Excel was still running. Close both and install again.

### One licence, one PC

Your HERON licence is tied to the PC you first sign in on. To move it to a new computer, contact ADLM support through [/support](/support) and ask for the device lock to be reset.

## Signing in

When HERON starts you see its splash card while it reads the ADLM template in PlanSwift.

![The HERON splash window shown while the plugin starts and reads the ADLM template in PlanSwift.](shot:heron-splash.png)

1. Open **ADLM HERON** from the Start menu or the desktop.
2. Type your **Email** and **Password**. Click the eye to check what you typed.
3. Click **Log in**.

If you have forgotten your password, click **Forgot password?** to reset it on the ADLM website, then sign in with the new one.

- HERON remembers you and signs you back in next time.
- If it cannot reach the server, it signs you in from your saved licence and the top bar shows **Offline session: sign in again for cloud features**. You can still read and check take-offs. Loading rates, AI Review and saving to ADLM Cloud need a full sign-in.
- **Sign out** is at the bottom of the sidebar. Signing out hides the ADLM template from PlanSwift at its next restart, because the template belongs to your licence. Sign back in and restart PlanSwift to get it back.

> **Tip:** The first time you sign in on a PC, restart PlanSwift afterwards. PlanSwift only reads its template library when it starts.

## The HERON window

### The sidebar

| Item | What it does |
|---|---|
| **Take-offs** | All your take-offs, and the job PlanSwift has open. |
| **Take-off** | The items read from PlanSwift and their checks. The badge shows how many need attention. |
| **Budget** | Material and labour beneath every item. |
| **Steel tonnage** | Measured steel lengths turned into tonnes. |
| **Excel** | Workbooks, **Fill a client's bill** and the Excel Takeoff Link. |
| **Settings** | Display units, the take-off time log, material constants and the beta programme. |
| **Send feedback** | Opens WhatsApp with a message to ADLM support. |
| **Sign out** | Signs you out of HERON. |

The four take-off screens appear under the name of the open take-off. Under **BETA** you will also see **Auto take-off** and **Auto-takeoff probe**, greyed out. They are switched off in this release (see [AI in HERON](#ai-in-heron)).

### The top bar

- **←** goes back to all take-offs.
- The take-off name, with **Rename**, and a line saying which PlanSwift job it came from and when it was read. The dot turns green once the job has been read.
- **Read this job** (before the first read) or **Re-read job**.
- **Dock** and **Theme** (light or dark).

### Docking beside PlanSwift

Click **Dock** to shrink HERON into a narrow column on the right of your screen, so you can see PlanSwift and HERON together. The sidebar folds to icons and the tables drop their less important columns. Click **Full screen** to go back.

![HERON docked beside PlanSwift instead of full screen.](shot:heron-docked.jpg)

## The ADLM template in PlanSwift

The template is where your measurements get their meaning. Instead of drawing a shape and deciding later what it is, you pick what you are measuring first, and the template brings its own unit, form and formula.

In PlanSwift's templates panel choose **Complete ADLM TakeOff Plugin**. It is grouped by trade: SUBSTRUCTURE, FRAME, SWIMMING POOL, STAIRCASE, BLOCKWORK AND OPENINGS, FINISHES, ROOFING, ELECTRICAL, PLUMBING, EXTERNAL WORKS, RAILING, HVAC, FIRE ALARM and ELV SYSTEMS. Expand a trade to find the tool you measure with.

HERON matches each item back to this template by its name, form and formula. That match gives the item its trade and element. Items drawn without the template are still read, but they show **Not matched to the ADLM template**.

### Setting up the job

1. Create the job in PlanSwift and set metric or imperial.
2. Import your drawings and name every page properly, for example "Ground Floor Plan".
3. Scale every page. The scale is set per page, not per job. Scale off a long dimension you trust, then check another dimension on the other axis.
4. Measure with the ADLM tools, room by room or element by element.
5. On each item's properties dialog, set the **Folder**. A folder becomes a heading in the bill. Name folders by storey, block or trade.

> **Important:** An item with no folder is flagged **Not in a folder** and will not fall under any heading. HERON reads folders; it does not write them.

### Names that carry meaning

| Name it like this | Because |
|---|---|
| 225 Wall Area, 150 Wall Area | The leading figure is the wall thickness in millimetres. |
| Concrete in Column, Concrete in slab | The element drives the concrete, formwork and reinforcement breakdown. |
| UKB 305x165x40, SHS 100x100x5 | **Steel tonnage** reads the section from the name. |

## Take-offs

Click **Take-offs** in the sidebar. At the top, a card tells you **PlanSwift has a job open**, with the job's name. Below are your take-offs as cards.

![The HERON take-offs screen: the job PlanSwift has open and your saved take-offs as cards.](shot:heron-take-offs.png)

Each card shows **ITEMS**, **TO CHECK** and **PRICED**, the PlanSwift job it came from, and when it was last read. Switch to **List** for a table with **TAKE-OFF**, **PLANSWIFT JOB**, **CLIENT**, **ITEMS**, **TO CHECK** and **READ**. **Grid** switches back.

![The take-offs screen switched to List view.](shot:heron-take-offs-list.png)

### Making a take-off from a job

1. Open the job in PlanSwift.
2. In HERON, click **Make a project from this job** on the top card. (Or click **New take-off**, then **Bring that job across**.)
3. HERON shows **Take-off created**. It is named after the PlanSwift file. Click **Rename it** to give it the job's real name, or **Leave the name**.

![The New take-off dialog explaining that HERON brings across the job open in PlanSwift.](shot:heron-new-take-off.png)

![The confirmation after Make a project from this job, offering to rename the new take-off.](shot:heron-project-created.png)

In **Rename this take-off**, type a **Name** and, if you like, a **Client (optional)**, then click **Save**. This is HERON's name for it. The PlanSwift file keeps its own name.

![The Rename this take-off dialog with Name and optional Client.](shot:heron-rename.png)

> **Note:** HERON takes off nothing itself. It reads what the ADLM template collected in PlanSwift. If the job PlanSwift has open is already a take-off, **New take-off** says so.

### Renaming or deleting a take-off

Click **⋯** (**More**) on a card. The details card shows the client, when it was created and read, and whether it is **On ADLM Cloud**. Click **Rename** or **Delete**.

![The take-off details dialog opened from the card menu, with Rename and Delete.](shot:heron-project-menu.png)

Deleting removes the take-off from HERON only. Nothing is deleted in PlanSwift, and anything already saved to ADLM Cloud stays there.

### Take-offs from ADLM Cloud

Projects already saved to ADLM Cloud from HERON become take-off cards the first time HERON sees them, marked as from ADLM Cloud. Open the matching job in PlanSwift before you read one.

## Reading the job

Open a take-off. Before its first read, HERON asks you to **Read the job PlanSwift has open**, and shows the **JOB**, **UNITS** and **PLANSWIFT** version it found. Check the units each time you start a new job.

![A new take-off before the job is read, with Read this job at the top.](shot:heron-not-read.png)

1. Make sure the right job is open in PlanSwift.
2. Click **Read this job**.
3. HERON reports **Job read**: items read, folders, and how many have **No quantity**, **No unit** or are **Not in a folder**.
4. Click **Check the take-off**.

![The Job read summary: items read, folders, and how many have no quantity, no unit or no folder.](shot:heron-job-read.png)

Nothing is imported and PlanSwift is not changed. If a different job is open in PlanSwift, HERON warns you (**A different job is open in PlanSwift**) and asks before reading it into this take-off.

After you measure more in PlanSwift, click **Re-read job** in the top bar (or **Reload** on the **Take-off** screen).

> **Tip:** A take-off read by an older version of HERON is read again automatically when you open it with that job open in PlanSwift, so new calculations such as roof timber show up.

## The take-off home

Once read, a take-off opens on its home screen. Four figures sit at the top: **Items read**, **Sub-items**, **Needs attention** and **Budget**.

![A take-off's home screen: what needs checking and the next steps, Check the take-off, Price the budget and Work out steel tonnage.](shot:heron-job-home.png)

- **What is wrong with this take-off** lists each check with a count and a plain explanation.
- **Carry on** takes you to **Check the take-off**, **Price the budget**, **Work out steel tonnage** or **Review and save to ADLM Cloud**.
- **Saved take-offs** lists each version saved to ADLM Cloud with **Open on the web**.
- **Build this bill in PlanSwift** appears for a take-off that is on ADLM Cloud. See [Importing a bill from Excel](#importing-a-bill-from-excel).

## Checking the take-off

Click **Take-off** in the sidebar. Folders are on the left, as you named them in PlanSwift, with **Everything** at the top. The table shows **REF**, **ITEM**, **TYPE**, **QUANTITY**, **UNIT**, **SUB-ITEMS** and **CHECK**.

![The Take-off screen: folders on the left, the items read from PlanSwift and the checks that need attention.](shot:heron-take-off.png)

### The five checks

| Check | What it means | What to do |
|---|---|---|
| **No quantity** | Traced, but the quantity came back 0.00, usually a form field left blank. | Fill the field on the item in PlanSwift, then re-read. |
| **No unit** | The tool has no unit set in the template, so the bill cannot state one. | Set the result unit in PlanSwift, or correct the line on the web. |
| **Dead form field** | A field on the tool points at a property that no longer exists, so it shows blank. | Tell ADLM support which tool; it is a template fault. |
| **Not in a folder** | No folder was chosen on the properties dialog. | Click **Put it in a folder** for the steps, set the **Folder** in PlanSwift, then re-read. |
| **Empty sub-items** | The tool measured, but some of its sub-items came back 0.00. | Check the tool's form in PlanSwift. |

Click a check chip (for example **No unit**) to list only the items with that problem. **All items** shows everything again.

![The take-off filtered to one check so only the items with that problem are listed.](shot:heron-needs-attention.png)

> **Note:** Checks are warnings, not blocks. You can save a take-off with items still needing attention. They go across as they are.

### Folders, trades and elements

Click a folder to narrow the list to it. The segmented control re-cuts the whole take-off:

- **By Folder**: your PlanSwift folders.
- **By Trade**: the template trade each item came from, for example FRAME or FINISHES.
- **By Element**: the element, for example COLUMN, BEAM or PAD FOUNDATION.

Re-cutting changes nothing in PlanSwift.

![The take-off narrowed to a single PlanSwift folder.](shot:heron-folder.png)

![The take-off re-grouped by trade without changing anything in PlanSwift.](shot:heron-by-trade.png)

### Searching

Type in **Search items and sub-items**. The search covers the whole job, not just the open folder, and also matches folder, trade, element and bill description.

### An item's details

Click a row to open it beside the list. You see its **Quantity**, **Folder** and **Measured as**, the checks that apply to it, and:

- **BILL DESCRIPTION**: the wording that goes to the bill. Type to correct it; your wording is used when you save.
- **THE FORM THE QS FILLED**: the values typed on the tool in PlanSwift. A missing field shows **field missing**.
- **BREAKDOWN**: the sub-items the template (or HERON) calculated, with quantity and unit.

### Showing an item in PlanSwift

- In the item's details, click **Show in PlanSwift** to open the page it is drawn on, select it and zoom to it. Where it is drawn on several pages, use **‹** and **›** to step through them.
- Tick **Follow in PlanSwift** above the table, and every item (or folder) you pick also opens in PlanSwift.

### Roofs and roof timber

Measure the roof plan with the Roof Covering tool and type its pitch. HERON works out the roof members from the plan area, perimeter and pitch:

- rafters, purlins, ridge board and ridge cap, and hip rafters on a hip roof;
- **Struts and Ties** (one line), wall plate, fascia and barge boards.

Each member becomes timber pieces in the stock length with cutting waste, nails and wood preservative. These lines appear in the take-off, the **Budget** and the export, and are billed once. If the roof tool was left at pitch 0, HERON uses the angle between the sloped and plan areas, or else the default pitch in **Settings** (15°). Rafter spacing, purlin spacing, eaves overhang and timber waste are material constants under **Roof**.

## The Budget

Click **Budget** in the sidebar. Every item becomes a card with its materials and labour beneath it, worked out from QS recipes and your material constants. Totals for **Material**, **Labour** and **Total** sit at the top.

![The Budget screen, with material and labour priced beneath every item and the totals.](shot:heron-budget.png)

### Pricing the budget

Rates never load on their own. A new budget opens with every price at 0.

1. Click **Load rates**. HERON prices the budget from the ADLM rate library for your zone.
2. The button becomes **Refresh rates**. Click it to pull the latest prices.
3. Every **PRICE** cell stays editable. Type a price, or type a material or labour name to search Rate Gen and pick a rate.

> **Note:** Prices come from Rate Gen. Without a Rate Gen licence the budget shows **Price this budget with RateGen**: you still see the materials and labour each item needs, without prices. Click **Get RateGen** to buy it, or **I have RateGen** if you already do. Rates themselves are built and edited only in [ADLM Rate Gen](/guides/rategen).

### Working with the budget

| Button | What it does |
|---|---|
| **×** on an item or sub-item | Leaves it out of the budget. PlanSwift is not changed. |
| **Restore hidden (n)** | Appears when you have left items out. Brings them back. |
| **Bill rates from budget** | Sets each bill rate from its budget cost plus overhead and profit (from your material constants). |
| **Export** | Saves the budget as an Excel workbook. |

If the project's contract is locked on ADLM Cloud, the budget says so: budget changes saved from HERON are recorded as actuals.

## Steel tonnage

Steel is measured in metres but bought in tonnes. HERON reads the section designation from the item name (UB, UC, SHS, RHS, PFC and so on) and converts the measured length. A count item is multiplied by its height.

![The Steel tonnage screen before scanning.](shot:heron-steel.png)

1. Click **Steel tonnage** in the sidebar.
2. Set **Connections and fittings %** (default 7.5) and **Waste %** (default 0).
3. Click **Scan job**.
4. Read the table: **ITEM**, **TRADE**, **SECTION**, **KG/M**, **QTY**, **LENGTH M**, **NET T**, **ALLOWANCE T** and **GROSS T**, with a **Total** row.
5. Where no section was found in the name, type in the section box to search the catalogue and pick one. Your choice is kept when you scan again.

![Steel tonnage after a scan, listing each steel item by section with net and gross tonnage.](shot:heron-steel-scanned.png)

The ADLM steel frame columns and beams, and the weights the STEEL TRUSS tools already compute, are included. Click **Clear** to start again.

> **Tip:** Name steel with its full designation, for example UKB 305x165x40. "Steel beam" cannot be read.

## Reviewing and saving to ADLM Cloud

When the take-off is right, click **Review & save** (on the **Take-off** screen) or **Review and save to ADLM Cloud** (on the home screen). HERON gathers the take-off from PlanSwift, folder by folder, and opens **Review before saving**.

![The Review before saving sheet, listing every item and part with the take-off name and Save to ADLM Cloud.](shot:heron-review-sheet.png)

The sheet lists every line grouped by folder, with **REF**, **DESCRIPTION**, **QTY**, **UNIT** and **AMOUNT**. Sub-items sit under their item (B1, B2 and so on). An amount shows where the line has a bill rate, for example after **Bill rates from budget**; otherwise it shows a dash. A bar at the top tells you how many items still need attention.

1. Check the lines. To change a description, close the sheet, correct the **BILL DESCRIPTION** on the item, and review again.
2. Optionally click **AI Review** (see [AI in HERON](#ai-in-heron)).
3. Type the **Take-off name**.
4. Click **Save to ADLM Cloud**. Click **Stop saving** if you need to cancel.
5. HERON shows **Saved to ADLM Cloud** with the bill lines and the version. Click **Open on ADLM Cloud** to open the bill on the website, or **Stay in HERON**.

![The confirmation after saving a HERON take-off to ADLM Cloud.](shot:heron-saved-to-cloud.png)

What to know:

- The bill and its material and labour budget are saved together. A budget you never priced goes across with quantities and 0 prices.
- Each save is a new version, so re-saving never wipes out an earlier one.
- If the name is already used by another project on your account, HERON says **Project name already exists**. Choose another name, or open that take-off and save from it.
- If the contract is locked on ADLM Cloud, the sheet says so. Changed quantities are recorded as actuals and the contract stays as it was.
- If the budget did not save, or some items cost more than their rate, HERON tells you after saving.

### On the website

Saved take-offs appear on the ADLM website under your HERON projects (**HERON** in the side rail, or `/projects/planswift`). There you can price the bill from your Rate Gen rates, value it, share it and export it. See the [ADLM Cloud guide](/guides/cloud).

From the project's **Export** menu on the website, the **ICMS 3** group ("international cost and carbon report") offers **ICMS 3 cost and carbon (Excel)**, with cost and upfront carbon (A1-A5) by ICMS 3 Group, and **ICMS 3 cost and carbon (JSON)**, the same report as data to the RICS Data Standard. Carbon per line comes from your Rate Gen rates, so price the HERON bill with Rate Gen rates first.

## Excel

Click **Excel** in the sidebar.

### Send the bill out

| Button | What you get |
|---|---|
| **Bill of quantities** | ref, description, quantity, unit, rate, amount. The same lines HERON would save to ADLM Cloud; folders become headings and sub-items keep their reference. |
| **Budget** | Material and labour beneath every item. Open **Budget** once first so HERON can build it. |
| **Steel schedule** | Section, length, net and gross tonnage. |

Choose where to save. The files are ordinary .xlsx workbooks.

### Fill a client's bill

The client sent their own bill format? **Fill a client's bill** puts HERON's quantities into a copy of their workbook, in their layout. Their file is never changed.

1. Read the job first, so HERON has quantities.
2. On the **Excel** screen, click **Import a bill format**.
3. Click **Choose the bill** and pick their workbook (.xlsx, .xlsm, or an old .xls, which HERON converts to a working copy).
4. Under **SHEETS IN THIS WORKBOOK**, tick the sheets to fill. If HERON read the wrong column, type the letter for **Description**, **Unit** or **Quantity** and click **Apply**. Summary sheets are left out unless you tick them.
5. Click **Match with AI**. HERON's AI proposes which HERON lines make up each of their lines.
6. Check the table: **THE CLIENT'S ITEM**, **IN THEIR FILE**, **HERON QTY**, **MEASURED FROM** and **STATUS**. Filter with **All**, **Matched**, **To review** and **Not measured**.
7. Tick the lines that are right, or click **Tick all matched**. Type in **HERON QTY** to set a quantity yourself; the line is ticked for you.
8. Optionally keep **Note on each cell**, so each filled cell lists the HERON lines behind it, and tick **Clear ... old quantities HERON did not replace** if their file held quantities from another job.
9. Click **Write ... ticked lines to a copy** and choose where to save.
10. HERON shows **The client's bill is filled**. Click **Open the filled bill**.

Only ticked lines are written. Click **←** to go back to **Excel**.

### Link Excel to this take-off

The Takeoff Link pane pulls quantities, materials and rates from HERON into a workbook, and refreshes them when you re-read the job.

1. Under **PANE ON**, choose **Right** or **Left** for where the pane docks in Excel.
2. Pick where it opens: one of the workbooks open in Excel (listed by name), **A new workbook**, or **A workbook on this computer**. Click **Refresh** if a workbook you just opened is not listed.
3. HERON opens Excel with the **ADLM Takeoff Link** pane. It installs the ADLM add-in first if it is missing.

In the pane, pick a dataset: **Quantity Takeoff**, **Material Takeoff** (the budget's materials and labour) or **Rates**. Type in **Search** to filter it. Then:

1. Click the cell in your workbook.
2. Select one or more rows in the pane.
3. Click **Link Cell**. Several rows are added together.
4. **Add to Cell** adds more rows to the same cell; **Remove from Cell** takes rows out; **Unlink Cell** breaks the link.

Linked cells update when you switch back to Excel after a change in HERON. You can also click **Refresh** in the pane or on the **ADLM** ribbon tab.

> **Tip:** If the **ADLM** tab disappears from Excel, close Excel and open the link again from HERON's **Excel** screen. You can also double-click `Register-ExcelAddin.cmd` in `C:\ProgramData\Planswift Plugin`.

## Importing a bill from Excel

Sometimes the bill comes first and you need real measurements behind it. Importing a bill as a new HERON project happens on the ADLM website; you then build it in PlanSwift from HERON. (To put HERON's quantities into a client's bill instead, use [Fill a client's bill](#fill-a-clients-bill).)

> **Note:** Excel bill import is switched on for your account by ADLM and needs a live HERON subscription. If you do not see **Import Excel BoQ · HERON** on your HERON projects page, contact [/support](/support).

1. On the website, open your HERON projects and click **Import Excel BoQ · HERON**. Choose your bill (.xlsx or .xlsm) and click **Import project**.
2. In PlanSwift, open the job you will measure in.
3. In HERON, open the imported take-off from **Take-offs** (it is marked as from ADLM Cloud).
4. On its home screen, click **Build this bill in PlanSwift**.
5. In **Build Bill in PlanSwift**, check the **Template** for each line and, where needed, **Measured as**, **Depth/Height**, **Width** and **Thickness**. Choose lines with **Select all**, **Select none** or **Only lines not in the job**.
6. Click **Build in PlanSwift**. Each work section becomes a folder and each bill line a measurable item.
7. Scale the drawings, click **Measure** on a line to trace it, then read the job and save as usual.

Building again is safe: matched lines are updated, never duplicated, and an existing measurement is never overwritten.

## Settings

Click **Settings** at the bottom of the sidebar (it is hidden while docked). Pick a tab, make your changes, and click **Save**.

| Tab | What it holds |
|---|---|
| **Units** | **Display units**: **Metric (m, m², m³, mm, kg)** or **Imperial (ft, sqft, cuft, in, lb)**. HERON normally picks this from your PlanSwift pages. |
| **Time log** | **Share take-off timings with ADLM**. Only timings and counts are sent, never drawings, names, quantities or prices. Untick to turn it off. |
| **Material constants** | The factors HERON uses to turn quantities into materials: waste, mixes, laps and densities. |
| **Beta** | **Join the beta programme**. Auto take-off is switched off in this release, beta or not. |

### Material constants

1. Search by name, category or key.
2. Edit the **Value**. **Default** shows what ADLM ships.
3. Click **Save**. **Reset Defaults** puts every constant back to ADLM's figures.

Some defaults in 3.0.1:

| Constant | Default |
|---|---|
| Blockwork waste factor | 1.03 |
| Floor and wall tile waste factor | 1.10 |
| Rebar unit weight | 0.00617 kg/m per mm² (d²/162) |
| Rebar stock length | 12 m |
| Rebar waste factor | 1.10 (kept on purpose) |
| Formwork waste factor | 1.10 (kept on purpose) |
| Paint coverage (all coats) | 2.0 m² per litre |
| Sharp sand density | 1,440 kg/m³ |
| Hardcore and laterite density | 1.6 t/m³ |
| Roof pitch when the tool has none | 15° |

## AI in HERON

HERON has these AI features. For how ADLM AI works, the monthly allowance and what happens to your data, see [ADLM AI services](/guides/ai-services).

| Feature | Where | Availability in 3.0 |
|---|---|---|
| **AI Review** (**AI Bill Review**) | **Review before saving**, at the foot | On for everyone signed in with an active licence |
| **Match with AI** | **Excel**, **Fill a client's bill** | In the 3.0 release; needs a sign-in and a connection |
| **Auto take-off** | Sidebar, under **BETA** | Switched off for everyone |

### AI Review

AI Review turns raw take-off names into proper bill descriptions, fixes units, finds duplicates, flags rates out of line with the rest of the job, and points out items a QS would expect (for example blockwork with no rendering).

1. Click **Review & save** to open **Review before saving**.
2. Click **AI Review**.
3. In **AI Bill Review**, tick **Descriptions**, **Rate sanity** and **Missing items** as needed.
4. Click **Run Review**.
5. Accept the findings you agree with and click **Apply Accepted**.
6. Check the sheet and click **Save to ADLM Cloud** as usual.

To ask a question, type in **Ask about this bill** (for example "why is substructure so large a share of this job?") and click **Ask**.

AI Review gives suggestions only. Nothing changes until you accept a finding and apply it, and quantities are never altered. HERON sends the lines' descriptions, units, quantities and rates, the project name, currency and pricing zone, never your drawings. When you accept or reject suggestions, the service learns your house style for your account alone. A HERON clean-up uses 2 units and a bill question 1 unit of your monthly AI allowance.

### Match with AI

In **Fill a client's bill**, **Match with AI** proposes which HERON lines make up each of the client's lines, with a confidence and a reason in the cell note. The AI proposes; you tick; only ticked lines are written. It sends the client's descriptions and units and HERON's measured lines, not the drawings.

### Auto take-off

**Auto take-off** and **Auto-takeoff probe** show under **BETA** in the sidebar, but they are greyed out for everyone in HERON 3.0 and 3.0.1: "Auto take-off is in beta and is not available in this release." Joining the beta programme does not turn them on.

> **Note:** HERON's bill wording, its checks and its material breakdowns are not AI. They come from the ADLM template and fixed rules.

## Troubleshooting

### The ADLM template is not in PlanSwift

1. Make sure you are signed in to HERON.
2. Close PlanSwift completely and open it again.
3. In the templates panel, choose **Complete ADLM TakeOff Plugin**.
4. Still missing? Sign out of HERON, sign in again, and restart PlanSwift.
5. Still missing? Reinstall HERON from the Installer Hub with PlanSwift closed.

### "PlanSwift has no job open"

Open the job in PlanSwift, then click **Read this job** or **Re-read job**.

### "ADLM template not found"

HERON read the items, but trade, element and the template's checks need the ADLM template installed in PlanSwift. See the first item above.

### Quantities are far too big or too small

Almost always the scale. Check the page's scale with PlanSwift's Dimension tool, scale again if needed, then **Re-read job**.

### HERON shows imperial units on a metric job

Your pages had no usable scale units. Scale them properly, or choose metric in **Settings**, **Units**.

### An item is missing from the take-off

Click **Reload**. Check the **Everything** folder and the **Not in a folder** group, and use the search, which covers the whole job.

### Roof timber is missing

Re-read the job with it open in PlanSwift. Check the Roof Covering has a plan area and a pitch.

### Review & save says "Nothing to save yet"

Read the job first, so there is a take-off to review.

### Load rates is missing or prices stay at 0

Prices need a Rate Gen licence, a connection and a full sign-in (not an offline session). Click **I have RateGen** to check your licence again.

### Save to ADLM Cloud refuses to save

- **Offline session:** sign out, then sign in again while connected.
- **Project name already exists:** choose another name.
- **Version conflict:** the project was changed elsewhere. Open the take-off again and save again.

### "The pane did not open" (Excel)

Close Excel completely and open the link again from the **Excel** screen. A fresh Excel can take a few seconds.

### "That workbook cannot be read" (Fill a client's bill)

Check the file is a bill, not a price list, and that it is not open and locked in Excel. Type the column letters for **Description**, **Unit** and **Quantity** and click **Apply**.

### "Monthly AI quota reached"

Your account has used its AI allowance for the month. The rest of HERON keeps working. Ask [/support](/support) if you need more.

### "This PlanSwift subscription is bound to a different device."

Your licence is tied to another PC. Ask [/support](/support) to reset the device lock.

### "Internet required for first sign-in (no valid offline license found)."

The first sign-in on a PC must be online. Connect and sign in again.

## Frequently asked questions

### Does HERON replace PlanSwift?

No. You measure in PlanSwift with the ADLM template, and HERON reads, checks, prices and exports what you measured.

### Does HERON change my PlanSwift job?

Reading never changes it. Only **Build this bill in PlanSwift** and **Measure** add items, and they never overwrite a measurement.

### Where do I edit rates?

In [ADLM Rate Gen](/guides/rategen). HERON picks rates from your library and lets you type a price on a budget line, but rates are built only in Rate Gen.

### Do I need Rate Gen?

Only for prices. Without it you can read, check, review, export quantities and save to ADLM Cloud.

### Can I work without the internet?

Yes, once you have signed in online on that PC. Loading rates, AI features and saving to ADLM Cloud need a connection.

### Where is my work stored?

Your measurements live in the PlanSwift job file, so back it up. Take-offs saved to ADLM Cloud are kept on your account, with a new version on every save.

### Where did the 2.9 screens go?

**Dashboard** became **Take-offs** and the take-off home. **Quantity Take Off** became **Take-off**. **Save / Export** became **Review & save** for the cloud and the **Excel** screen for workbooks. **Connect Excel** is now **Link Excel to this take-off** on the **Excel** screen.

### Does HERON send my drawings to ADLM?

No. AI features send only bill lines, and the take-off time log sends only timings and counts.

### How do I get help?

Click **Send feedback** to message ADLM support on WhatsApp, or raise a ticket at [/support](/support). Tell us the take-off, the folder and item, whether the page is scaled, the exact message and your PlanSwift version.
