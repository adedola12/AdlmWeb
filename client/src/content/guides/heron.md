---
id: heron
title: ADLM HERON
tagline: Measure PDF drawings in PlanSwift with the ADLM templates, then turn the takeoff into a priced bill, a material and labour budget and a live Excel link.
version: "2.9.6"
updated: 2026-10-01
platform: Windows desktop app that works alongside PlanSwift 10 or 11
productKeys: [planswift, heron]
pdf: ADLM-Heron-User-Guide.pdf
pdfAliases: [ADLM-Complete-User-Guide.pdf]
order: 5
---

ADLM HERON (formerly the ADLM PlanSwift Plugin) is a Windows app for quantity surveyors and estimators who take off from 2D drawings in PlanSwift. HERON adds the ADLM template library to PlanSwift, so every slab, wall, finish and service you measure already knows its unit and its formula. HERON then reads your takeoff live out of PlanSwift and gives you a billed takeoff, a material and labour budget priced from your Rate Gen library, a professional Excel bill of quantities and a live link into your own Excel workbooks. You can also save each job to your ADLM Cloud projects and open it on the website. This guide covers HERON 2.9.6.

## Before you start

### What you need

| You need | Notes |
|---|---|
| A Windows PC | HERON is a Windows desktop app. |
| PlanSwift 10 or 11 | HERON works alongside PlanSwift. It does not replace it. If you run both versions, the templates go into each one. |
| An ADLM account with a HERON subscription | The same email and password you use on the ADLM website. |
| Rate Gen (optional) | Pricing from your rate library needs a Rate Gen subscription on the same account. Without it you can still measure, review and export quantities. |
| Microsoft Excel (optional) | Needed for the Excel export and the Excel Takeoff Link. |
| An internet connection | Needed for your first sign-in, for loading rates and for saving to the cloud. Measuring works offline. |

### Installing HERON

HERON is installed from the ADLM Installer Hub, never from a loose download. See [ADLM Installer Hub](/guides/installer-hub) for the Hub itself.

1. Close PlanSwift completely. The templates are written into PlanSwift's own folders, and Windows locks them while PlanSwift is open.
2. Close Excel too, so the Excel add-in can be registered.
3. Open the Installer Hub and sign in.
4. Find **ADLM Heron** and click **Install** (or **Update** if you already have an older version).
5. Wait for the Hub to report that the install has finished.

The Hub puts four things on your PC:

- The HERON app, with an **ADLM HERON** shortcut on the desktop.
- The ADLM template library, inside every PlanSwift installation it finds.
- A protected copy of the templates, which HERON uses to put them back if PlanSwift ever loses them.
- The Excel add-in (the ADLM Takeoff Link).

> **Important:** If the Hub reports that access was denied while installing HERON, PlanSwift was still running. Check the notification area beside the clock, close PlanSwift, and click **Install** again.

### One licence, one PC

Your HERON licence is tied to the PC you first sign in on. If you sign in on a second PC, HERON tells you the subscription is bound to a different device. To move your licence to a new computer, contact ADLM support through [/support](/support) and ask for the device lock to be reset.

### The order to do things in

You only do steps 1 to 3 once. After that, your day starts at step 4.

1. Install HERON from the Hub with PlanSwift closed.
2. Open HERON and sign in. Signing in is what switches the ADLM templates on.
3. Restart PlanSwift. PlanSwift only reads its template library when it starts.
4. Open or create your job in PlanSwift and scale the drawings.
5. Measure with the ADLM templates, then read, price and export the results in HERON.

## Signing in

1. Open **ADLM HERON** from the desktop shortcut.
2. On the **Sign in to ADLM Plugin** screen, type your email or username in **Username or Email**.
3. Type your password in **Password**. Click the eye button if you want to check what you typed.
4. Click **Sign In**.

HERON checks your subscription and your device, switches the ADLM templates on in PlanSwift, and opens the **Dashboard**. You will see one of these messages:

| Message | What it means |
|---|---|
| **ADLM Plugin activated successfully!** | The templates are in place. Carry on. |
| **ADLM templates restored. Please restart PlanSwift to see them.** | The templates had gone missing (usually after signing out) and HERON put them back. Close PlanSwift completely and open it again. |
| **Welcome, (your name)!** | You are signed in. If this is your first sign-in on this PC, restart PlanSwift before you look for the templates. |

If sign-in fails, the message tells you why. The common ones are **Invalid username/email or password.**, **Your subscription has expired.**, **Device limit reached for this subscription.** and **Internet required for first sign-in (no valid offline license found).** See [Troubleshooting](#troubleshooting).

> **Tip:** There is no password reset inside HERON. If you have forgotten your password, reset it on the ADLM website, then sign in to HERON with the new one.

### Staying signed in

- HERON remembers you. When you open it again it signs you back in from your saved session.
- A session lasts 10 days. After that you see **Session Expired** and sign in again. This is normal.
- If HERON starts without reaching the server, it signs you in from your saved licence. The header then shows an **Offline session** note. Measuring, reviewing and exporting to Excel all still work. Loading rates, cloud projects and saving to the cloud need a full sign-in: click **Sign Out**, then sign in again while you are connected.

### Signing out

Click **Sign Out** at the bottom of the sidebar. HERON tells you that PlanSwift templates will be hidden on next restart. That is deliberate: the templates belong to your licence. Sign back in and restart PlanSwift to get them back.

> **Tip:** Do not sign out at the end of each day out of habit. It gains you nothing and costs you a PlanSwift restart the next morning. Just close the window.

## A tour of the HERON window

HERON runs in its own window beside PlanSwift. It never redraws your plans. It reads the job that is open in PlanSwift.

### The sidebar

| Button | What it opens |
|---|---|
| **Dashboard** | Start a new project, see the units HERON detected and open projects saved to the cloud. |
| **Quantity Take Off** | Your measured folders and items, their breakdown, and **Save / Export**. |
| **Budget** | The material and labour schedule behind each item, with your margin. |
| **Steel Tonnage** | Converts measured steel lengths into tonnes. |
| **Connect Excel** | Checks and repairs the Excel add-in and starts the live link. |
| **Feedback** | Opens WhatsApp with a message to ADLM support. |
| **Sign Out** | Signs you out of HERON. |

**Quantity Take Off**, **Budget** and **Steel Tonnage** stay greyed out until you start or open a project from the **Dashboard**. The round button on the edge of the sidebar collapses it to icons when you need more room, and you can drag the sidebar edge to resize it.

### The header

Along the top right you will find:

- **The network signal.** Bars show how well you are connected to the ADLM Cloud: **Excellent**, **Good**, **Fair** or **Poor**. It shows **Offline** when you have no internet, and **No server** when your internet works but the ADLM server is not answering. Hover over it for details and click it to check again.
- **The theme button.** Switches between light and dark mode.
- **The gear.** Opens **Settings** (display units, the Takeoff Time Log and your material constants).
- Your name and email.

## The Dashboard

The Dashboard is where every session starts.

- **The top strip** shows the PlanSwift job that is open, the date, your PlanSwift version and the unit system HERON is using, for example **Units: Metric**. HERON reads this from the Scale Units of your PlanSwift pages when you open a project. Check it each time you open a new job.
- **New Project** starts a new takeoff from the job open in PlanSwift. Click **Start New**.
- **Quick Actions** jump straight to **Quantity Take Off** or **Budget**, or **Refresh** the Dashboard.
- **Recent Projects** lists the HERON projects saved to your ADLM Cloud account. Sort them with **Recent**, **A - Z** or **Most Items**, and use the search box to find one by name.

### Opening a saved project

1. Open the matching job in PlanSwift first.
2. On the Dashboard, find the project under **Recent Projects** and click **Open**.
3. If the project was saved from a different PlanSwift job, HERON warns you with **Job Mismatch**. Click **Yes** only if you are sure it is the right job.
4. HERON loads the project and asks whether to build the bill into PlanSwift now. Click **No** for a project you measured in HERON yourself. Click **Yes** only for a bill that came from the website and has no measurements behind it yet (see [Step 2: Build the bill in PlanSwift](#step-2-build-the-bill-in-planswift)).
5. HERON opens **Quantity Take Off**. Your next **Save to Cloud** updates this same project.

Click the small arrow on a project card to expand it and see the materials saved with it, with a **Materials total (material + labour)** at the bottom.

## Setting up the job in PlanSwift

Everything HERON reads comes from the job open in PlanSwift: its pages, its folders and its takeoff items. A tidy job gives you a tidy bill.

1. Create a new job in PlanSwift and set its measurement system to metric or imperial. This drives the units your pages report, which HERON then reads.
2. Import your drawings (PDF or image files) into the job.
3. Rename every page you will measure on, for example "Ground Floor Plan" rather than "Page 7".
4. Group pages into folders by drawing set, for example "Admin Struct" and "Admin Arch".
5. Rotate any sideways sheet, and give each separate drawing on a sheet its own page, because the scale is set per page.

> **Tip:** When revised drawings arrive mid-job, import the revision as a new page, measure it, then delete the old page. You never lose a takeoff you might want to compare against.

## Scaling your drawings

This is the step that decides whether every number after it is right. A PDF does not know how big the building is until you tell it.

> **Important:** The scale is set for each page, not for the whole job. Every page you measure on needs its own scale.

### Setting the scale

1. Open the page in PlanSwift.
2. Find a long dimension you trust, ideally an overall grid dimension of 6 metres or more. Avoid door and window sizes, which are often drawn roughly.
3. Start PlanSwift's Scale tool.
4. Type the real length in the units shown, for example 4425 for a 4425 mm grid, or 4.425 if you are working in metres.
5. Zoom right in, then click the two ends of that dimension.
6. Repeat on a dimension running the other way. Plots and scans are not always stretched equally in both directions.

### Checking the scale

1. Use PlanSwift's Dimension tool to measure a different dimension on the same page, ideally on the other axis.
2. Compare the result with the figure printed on the drawing.
3. If it is out by more than a few millimetres, the scale is wrong. Scale the page again.

### Common scaling mistakes

| What went wrong | What you see, and the fix |
|---|---|
| The page was never scaled | Quantities look far too big or too small. Scale the page. Existing measurements update to the new scale. |
| Scaled off a wrong dimension | Everything is out by the same percentage. Check with the Dimension tool and scale again. |
| Millimetres typed into a metre field | Quantities out by a factor of 1,000. Scale again, entering the length in the units shown. |
| Clicked at low zoom | A small, steady error across the job. Zoom in until the line is several pixels thick before clicking. |
| Two scales on one sheet | Give each part of the sheet its own page, and put the scale in the page name. |

> **Note:** Scaling also decides which units HERON uses. HERON reads the page's Scale Units (for example M, MM, FT or IN). If your pages are unscaled, HERON may pick the wrong unit system. You can always set it yourself in **Settings**, under **Display Units**.

> **Tip:** If you rescale a page after measuring, go back to HERON's **Quantity Take Off** and click **Reload** so HERON picks up the corrected numbers.

## The ADLM template library

The templates are the heart of HERON. Instead of drawing a shape and deciding later what it is, you pick what you are measuring first, and the template brings its own unit, colour and formula.

In PlanSwift, open the templates panel and choose **Complete ADLM TakeOff Plugin** from the list at the top. The library is grouped by trade:

- SUBSTRUCTURE
- FRAME
- SWIMMING POOL
- STAIRCASE
- BLOCKWORK AND OPENINGS
- FINISHES (wall, floor and ceiling finishes)
- ROOFING
- ELECTRICAL
- PLUMBING
- EXTERNAL WORKS
- RAILING
- HVAC
- FIRE ALARM
- ELV SYSTEMS

Expand a trade to see its folders, and expand a folder to see the templates you measure with. Many templates give you more than one quantity from one measurement. For example, a floor tile area also gives you its skirting, and a wall area gives you its rendering and perimeter.

> **Note:** If the ADLM library is missing from PlanSwift, see [The ADLM templates are not in PlanSwift](#the-adlm-templates-are-not-in-planswift).

## Measuring with the templates

PlanSwift gives you four kinds of measurement. The template you pick decides which one you use.

| Kind | Gives you | Use it for |
|---|---|---|
| Area | m² (or sq ft) | Slabs, wall elevations, floor and ceiling finishes, roof coverings, excavation footprints |
| Linear | m (or ft) | Walls on plan, beams, skirting, kerbs, pipe and cable runs, railings |
| Segment | m (or ft) | Single straight lengths where you want each leg recorded on its own |
| Count | Nr | Columns, doors, windows, sanitary fittings, light points, sockets |

### Measuring an item

1. Open the page and check it is scaled.
2. In the template library, expand down to the item you want, for example FINISHES, then FLOOR FINISH, then the floor tile template.
3. Start the takeoff from that template (in PlanSwift, click the button that appears beside the template).
4. Name the item after the room or element, for example "Offices" or "Sick bay", and adjust anything the template asks for, such as thickness or height. The name is what appears in your bill, so type it properly.
5. Draw the measurement on the plan, then finish it.
6. Check the running total in PlanSwift's takeoff summary.

> **Tip:** Measure room by room, not one big shape per floor. Five separately named areas cost no more effort than one, and they give you a bill you can defend line by line.

### Organising the takeoff so it bills well

HERON reads your PlanSwift folders literally: each folder becomes a section of your bill, and item names become descriptions.

- **By storey:** Admin Sub, Admin GF, Admin FF, Admin RF.
- **By block:** prefix everything, for example Admin and Hostel, so you can export one block at a time.
- **By package:** Admin Finishes, Admin Openings, where a trade is let separately.

Some names carry meaning for HERON:

| Name it like this | Because |
|---|---|
| 225 Wall Area, 150 Wall Area | The leading figure is the wall thickness in millimetres, used for blocks, mortar and rendering. |
| Concrete in Column, Concrete in slab | The element type drives the concrete, formwork and reinforcement breakdown. |
| UKB 305x165x40, SHS 100x100x5 | Steel section sizes are read by **Steel Tonnage** and converted to tonnes. |

> **Important:** Avoid two items with the same name inside one folder. HERON merges them when it reads the job. If they are different, say so in the name or put them in different folders.

## Quantity Take Off

This is where your PlanSwift measurements become billable quantities. Click **Quantity Take Off** in the sidebar.

The screen has three panels:

- **Take Off Folders:** the folders in your PlanSwift job.
- **Take Off Items:** the items in the selected folder, with **Name**, **Qty** and **Unit**.
- **Take Off Breakdown:** what the selected item resolves into, such as concrete, formwork, reinforcement and other sub-quantities.

Click **Reload** at the top whenever you change something in PlanSwift: a new measurement, a renamed folder or a corrected scale. HERON reads a snapshot of the job, and **Reload** refreshes it.

> **Tip:** Reload fixes most surprises. If PlanSwift was restarted while HERON was open, **Reload** also reconnects to it.

### Editing an item's parameters

1. Double-click an item in **Take Off Items**.
2. A detail window opens, with one block for each measured instance of that item (each **Instance** shows its size and parameters).
3. Change the parameters the item offers, such as thickness, depth, height or spacing.
4. Close the window. The breakdown recalculates.

### Adding reinforcement

For concrete items, the detail window has a **Reinforcement** section on each instance.

1. Click **+ Bars** for main and distribution bars, or **+ Links** for stirrups and links.
2. Enter **Dia:** (bar diameter in mm), **Nr:** (number of bars) and **Spc:** (spacing). HERON works out the weight in kg.
3. Use the ✕ on a row to remove it.
4. Click **Apply Reinforcement** to keep your changes, or **Cancel** to discard them.

### Roofs

Roof items work from the plan area and the pitch, so you measure the plan, not the slope. If HERON shows **Invalid Roof Area.** or **Pitch value must be greater than zero.**, check the roof measurement and its pitch in PlanSwift, then click **Reload**.

## Pricing and saving the bill

When your takeoff is complete, click **Save / Export** at the bottom of **Quantity Take Off**. Nothing is saved yet. HERON opens the **Review Takeoff Before Saving** screen, where you check descriptions, set rates and order the bill.

### What is on the review screen

| Part | What it does |
|---|---|
| Status bar | How many items are ready, plus the rate status. With Rate Gen it also shows **Rates:** matched out of total, and the **Total** in your currency. |
| **Project Name:** | The name the project is saved under in the cloud. Put the client or job name here. |
| **Search Rate:** | Search your Rate Gen library and apply a rate to the selected row (Rate Gen accounts only). |
| **Keep edited rates (uncheck to use the latest from your library)** | When ticked, the rates you typed come back next time you open this review. When unticked, HERON uses the latest rates from your library. |
| The bill table | **Item**, **Description**, **Qty**, **Unit**, **Rate** and **Amount**, grouped into sections by folder. |

### Loading rates

Rates are never loaded on their own. The bill opens with every rate at 0, so you decide when a job is priced.

1. Click **Load rates** at the bottom of the review screen. HERON prices the bill from your Rate Gen library and shows how many items matched.
2. The button then reads **Reload rates**. Click it again whenever you want to pull the latest rates.

Loading rates on the bill also prices the **Budget** behind it, so the two stay in step.

> **Note:** **Load rates** and **Search Rate:** appear only if your account has an active Rate Gen subscription. Without Rate Gen you can still type rates by hand.

### Editing the bill

| To do this | Do this |
|---|---|
| Change a description | Click the **Description** cell and type. Section headings and sub-items are locked. |
| Set a rate by hand | Type into the **Rate** cell. **Amount** updates when you leave the cell. |
| Pick a rate from your library | Select the row, type in **Search Rate:**, then double-click a result. |
| Reorder the bill | Select a row and click **Up** or **Down**, or drag it. The order you set is the order it exports in. |
| Remove a line | Click the ✕ at the end of the row. The line comes off this bill and is hidden from the **Budget** too. Your PlanSwift measurement is not touched. |

> **Important:** A row shaded amber means its rate is lower than the material plus labour cost HERON worked out for it. You can still save. HERON lists those items when you save so you can raise the rates when it suits you.

### Saving to the cloud

1. Check the **Project Name:**.
2. Click **Save to Cloud**.
3. If a project with that name already exists on your account and you did not open it from the Dashboard, HERON tells you **Project name already exists**. Choose a different name, or open the existing project from the Dashboard to update it.
4. Wait for **Takeoff saved to cloud!** with the project name. The bill and its material and labour budget are saved together.

While a save is running you can click **Cancel Save**. If the bill saves but the budget does not, HERON tells you so rather than reporting success. Save again once your connection is steady.

Each save creates a new version of the project, so re-saving never wipes out an earlier one. The project then appears under **Recent Projects** on the Dashboard on any PC you sign in from, and on the website.

> **Note:** If your session is offline, HERON explains that the takeoff cannot be saved to the cloud. Your rows stay in the review window and **Export All** still works. Sign out, sign in again while connected, then save.

### When the contract is locked

A project can be locked on the website once its bill becomes the contract. HERON then shows a red **CONTRACT LOCKED** chip on the review screen and on the **Budget**. You can still save. Your revised quantities and rates are recorded as actuals against the contract, and the contract sum does not change. The save confirmation says so.

## Exporting to Excel

You can export from the review screen at any time, even offline.

- **Export All** writes every folder to one workbook.
- **Export Folder(s)** opens **Select Folders to Export**. Tick the folders you want and click **Export Selected**. Export one folder for a single worksheet, or several for a combined workbook.

Choose where to save the file. HERON confirms when the workbook is written.

The workbook is laid out as a proper bill of quantities:

- One sheet per folder, with **ITEM**, **DESCRIPTION**, **QTY**, **UNIT**, **RATE** and **AMOUNT** columns.
- QS item lettering (A, B, C and so on), a bold section heading and wrapped descriptions.
- Sub-items shown under their parent line.
- A **GEN SUMMARY** sheet that links to each folder's total.

It is an ordinary .xlsx file, so you can restyle it or paste it into your own template.

> **Tip:** After an export, HERON may show a one-line note of how long the takeoff took. Click **Dismiss** to hide it. See [Settings](#settings) to turn the Takeoff Time Log off.

## The Budget: material and labour

Where the bill answers "what will I charge?", the **Budget** answers "what will it cost me?". Click **Budget** in the sidebar.

1. Pick a folder under **Take-Off Folders** on the left. HERON builds the budget for every item in it: concrete, cement, sand, granite, blocks, reinforcement, formwork, labour and more, worked out from built-in QS recipes and your material constants.
2. Click **Load rates** to price the budget from your Rate Gen library. Until then every price is 0. The button then reads **Reload rates**.
3. Check each item. Under it you see **Material / Labour**, **Qty**, **Unit**, **Price** and **Amount**, with **Material**, **Labour** and **Total** for the item.

The strip at the top shows the whole project at a glance: **Project cost (material + labour)**, **Take-off value (BoQ)**, **Overhead + profit** and **Margin** as a percentage.

### Working with the budget

| Button or action | What it does |
|---|---|
| Type in a **Price** cell | Type a price, or type a material or labour name to search Rate Gen and pick a rate. Totals and margins update as you type. |
| **Recompute** | Rebuilds the budget, for example after you change quantities in PlanSwift. |
| **BoQ rate ← budget** | Sets each item's bill rate from its budget: (material + labour) divided by quantity, plus the overhead and profit percentage from your material constants. |
| **Export** | Saves the budget as a linked Excel workbook (see below). |
| ✕ on an item | Hides the item from the budget. Your PlanSwift takeoff is not changed. |
| **Restore hidden** | Appears when you have hidden items. Brings them back. |

An item whose material and labour cost is higher than its rate shows **Over budget**. Raise the rate on the review screen, or use **BoQ rate ← budget**.

### The budget workbook

**Export** writes a workbook where everything except the measured quantities and your typed prices is a live formula:

- A **Basic Prices** sheet, the one place each material price is typed, plus an overhead and profit percentage cell.
- A budget sheet for each folder, with material and labour totals and the rate they imply.
- A bill sheet for each folder whose rates link to that budget.
- A **BUDGET SUMMARY** sheet with material, labour, budget, overhead and profit, and contract total for each folder.

Change a basic price in Excel and every rate and margin that depends on it recalculates.

> **Note:** The budget saves to the cloud together with the bill when you click **Save to Cloud** on the review screen. There is no separate budget save.

## Steel Tonnage

Steel is measured in metres but bought in tonnes. **Steel Tonnage** reads the section size from your item names and does the conversion.

1. Click **Steel Tonnage** in the sidebar.
2. Set **Connection/fittings %** (default 7.5) for cleats, plates, bolts and welds, and **Waste %** (default 0) for offcuts.
3. Click **Scan Job**.
4. Check the table: **Item**, **Trade**, **Detected Section**, **kg/m**, **Length (m)**, **Net (t)**, **Allowance (t)** and **Gross (t)**.
5. For any row where no section was found, use **Assign Section** and type to search the catalogue (UKB, UKC, PFC, UKA, SHS, RHS and CHS), or type a kg/m yourself. Your choice is kept when you scan again.
6. Read the job totals at the bottom: **NET**, **ALLOWANCE** and **GROSS**.

Roof and truss members (rafters, purlins, tie beams, king posts, struts, chords and bracing) are picked up even when their names carry no section size, so you can assign a section to them.

Where a column was measured as a count rather than a length, use the **Count × Ht?** column. The table shows the tonnage both ways, **Gross if metres (t)** and **Gross if count×ht (t)**, so you can use the one that matches how you measured.

Click **Clear** to empty the table and start again.

> **Tip:** Name steel items with the full designation, for example UKB 305x165x40. "Steel beam" cannot be read.

## Settings

Click the gear at the top right to open **Settings**.

### Display Units

Choose **Metric (m, m², m³, mm, kg)** or **Imperial (ft, sqft, cuft, in, lb)**. HERON normally picks this for you from your PlanSwift pages. Change it here if it picked wrong.

### Takeoff Time Log

HERON records how long each takeoff takes and how many items, folders and bill lines it produced, so ADLM can report the time its tools save. Only timings and counts are sent. Drawing content, item names, quantities and prices are never sent. Untick **Share takeoff timings with ADLM** to turn it off.

### Material Constants

The constants HERON uses to build your breakdowns and budgets: cement per cubic metre, blocks per square metre, mortar ratios, wastage, labour outputs, overhead and profit and so on.

1. Search by name, category or key to find a constant.
2. Edit its **Value**. The **Default** column shows the standard figure.
3. Click **Save**. HERON confirms **Material constants saved and applied.**
4. Click **Reset Defaults** to go back to the standard figures.

Set these once to match how you price, and every breakdown and budget follows.

## The Excel Takeoff Link

If your bill lives in your own spreadsheet, the Excel Takeoff Link pulls your takeoff, materials and rates straight into it and keeps them up to date. No copy and paste, and no re-export when a quantity changes.

### Turning it on

1. Close Excel completely.
2. In HERON, click **Connect Excel** in the sidebar. HERON checks the add-in.
3. If the add-in is missing, switched off or broken, HERON tells you and offers to install or repair it. Click **Yes**.
4. When HERON reports that the Excel bridge is ready, open Excel and open (or create) a workbook.
5. On the **ADLM** tab of the Excel ribbon, click **Takeoff Link**. The **ADLM Takeoff Link** pane opens.

> **Note:** HERON must be open, signed in and showing your project for the pane to find data. If the pane says no data was found, open HERON, load the job, then click **Refresh** in the pane.

### Using the pane

At the top, pick a dataset:

| Dataset | What it lists |
|---|---|
| **Quantity Takeoff** | Your billable takeoff: description, quantity, unit and level. |
| **Material Takeoff** | The full material and labour breakdown from your **Budget**, with unit rate and amount. |
| **Rates** | Each bill item's **Description**, **Unit**, **Rate** and **Amount** from your budget. |

Type in **Search** to filter the list. Item names keep their original takeoff name in front, so you can still search for DPM or Topsoil after HERON has expanded them into full descriptions.

To link figures into your sheet:

1. Click the cell in your workbook where the figure should go.
2. Select one or more rows in the pane.
3. Click **Link Cell**. The cell now holds the linked value (several rows are added together).
4. To add more rows to the same cell as a running sum, select them and click **Add to Cell**.
5. To take rows back out, select them and click **Remove from Cell**. The cell re-totals.
6. To break the link on a cell, click it and click **Unlink Cell**.

The top of the pane shows how many cells and items are linked in this workbook.

### Keeping figures up to date

Change a quantity or rate in HERON, switch back to Excel, and the linked cells update on their own. Cells that did not change are left alone, so your Undo history is kept. You can also click **Refresh** in the pane, or **Refresh** on the **ADLM** ribbon tab, at any time.

> **Tip:** If the **ADLM** tab ever disappears from Excel (for example after an Office repair), close Excel and click **Connect Excel** in HERON. You can also double-click `Register-ExcelAddin.cmd` in `C:\ProgramData\Planswift Plugin`, then reopen Excel.

## Your HERON projects on the ADLM website

Everything you save to the cloud from HERON appears on the ADLM website under your HERON projects (`/projects/planswift`, or **HERON** in the side rail once you are signed in). Anyone on your account can read the bill there without PlanSwift. Opening a project on the website gives you the bill grouped by section, the budget beside it, Excel exports and sharing.

### Learning samples

Your HERON projects page shows a **Learning samples** strip: worked duplex projects, one per foundation type, measured from PDF drawings. Open one to see every tab filled in. Samples are read-only. Click **Hide samples** to fold the strip away, and **Show N samples** to bring it back.

## Importing a bill from Excel

Sometimes the bill comes first: a client or another QS sends you their bill in Excel, and you need to price it or put real measurements behind it. Excel bill import is a HERON feature, done on the ADLM website, and then finished in HERON with **Build in PlanSwift**.

> **Note:** Excel bill import is switched on for your account by ADLM. It is not bought on its own, and it also needs a live HERON subscription. If you do not see **Import Excel BoQ · HERON** on your HERON projects page, contact ADLM support through [/support](/support). There is no import button inside HERON itself.

### Step 1: Import the bill on the website

1. Sign in to the ADLM website and open your HERON projects (`/projects/planswift`).
2. Click **Import Excel BoQ · HERON**.
3. Optionally type a name in **Project name (optional)**. If you leave it blank, the file name is used.
4. Under **Excel workbook (.xlsx)**, choose your bill (.xlsx or .xlsm).
5. Click **Import project**.

The website reads the sections and lines of your bill and creates a HERON project from it. Where the workbook has no material and labour schedule, one is built for you (cement, sand, granite, blocks, formwork, rebar and labour), priced from your material constants and Rate Gen.

> **Tip:** Click **Download the import template** if you want a workbook laid out the way the importer reads best.

> **Important:** Upload your own bill, not one exported from the ADLM website. An ADLM export is refused, because importing it would spend a project slot on a copy of a bill you already have.

### Step 2: Build the bill in PlanSwift

1. Open the matching job in PlanSwift.
2. In HERON, go to the **Dashboard** and find the imported project under **Recent Projects**.
3. Click **Build in PlanSwift** on the project card. (You can also click **Open** and answer **Yes** when HERON asks whether to build the bill now.)
4. The **Build Bill in PlanSwift** window lists every bill line. Each work section becomes a take-off folder and each bill line becomes a measurable item.
5. Check the **Template** chosen for each line and change it where the match is wrong. Lines with no match are built as plain measurable items. Where the template needs them, check **Measured as**, **Depth/Height**, **Width** and **Thickness**.
6. Choose which lines to build with **Select all**, **Select none** or **Only lines not in the job** (useful on a second run).
7. Click **Build in PlanSwift**.

HERON confirms what it built and opens **Quantity Take Off**. In PlanSwift, the new folders appear in the takeoff summary. If they do not show yet, refresh that panel in PlanSwift.

### What the build will and will not touch

- Lines that are missing are created.
- Lines already in the job are updated, never duplicated. Building again is safe.
- Lines that already have a measurement keep it. HERON never overwrites a measurement.
- Section headings become folders, not items.
- Costing rows (derived materials and labour) are skipped, because there is nothing on a drawing to measure for them.

### Step 3: Measure and save

1. Scale the drawings, exactly as for any job. The structure arrived ready-made, but scaling is still the step everything depends on.
2. Click **Measure** on a line in the **Build Bill in PlanSwift** window to send that item to PlanSwift ready for you to trace it on the drawing, or measure the items from the takeoff summary in PlanSwift.
3. Go to **Quantity Take Off**, click **Reload**, then **Save / Export** and **Save to Cloud**. Your measurements land on the same bill lines that came from the Excel file.

## What's new in 2.9.6

**HERON 2.9.6**

- **The ADLM templates stay put when HERON starts.** Opening HERON with a saved sign-in could hide the ADLM template library from PlanSwift. It no longer does.

**Earlier 2.9 updates**

- **Network signal in the header.** Bars show the quality of your connection to the ADLM Cloud, and tell you whether you are offline or the server is not answering.
- **Takeoff Time Log.** HERON records how long each takeoff takes (timings and counts only) and can show the time after an export. You can turn it off in **Settings**.
- **Rates load only when you ask.** The bill and the budget open with every rate at 0. Click **Load rates** to price them from your library, and **Reload rates** to refresh.
- **Below-cost items no longer block a save.** Items whose cost is higher than their rate are shaded amber and listed when you save, but the takeoff always saves.
- **Build in PlanSwift.** Turn a bill from your ADLM Cloud projects into take-off folders and measurable items in the open PlanSwift job.
- **Excel bill import moved to the website.** Import an Excel bill from your HERON projects page on the ADLM website, then build it in PlanSwift from HERON.
- **The Excel Takeoff Link is ready on install (2.9.2).** The add-in is registered as part of the install, so the **ADLM** tab is there the first time you open Excel.
- **Sign-in that follows the service (2.9.1).** HERON finds the ADLM server through a setting the Installer Hub writes, so a server move never needs a new download.

## Troubleshooting

### The ADLM templates are not in PlanSwift

Work through these in order:

1. Make sure you are signed in to HERON.
2. Close PlanSwift completely and open it again. PlanSwift only reads its templates when it starts.
3. In PlanSwift's templates panel, check the list at the top reads **Complete ADLM TakeOff Plugin**.
4. If it is still missing, sign out of HERON, sign in again, and restart PlanSwift. Signing in puts the templates back from the protected copy.
5. If you run two PlanSwift versions, check you have the one open that HERON installed into. If not, reinstall HERON from the Installer Hub with PlanSwift closed.

### The templates disappeared after I signed out

That is expected. Signing out hides them at the next PlanSwift restart. Sign in again and restart PlanSwift.

### "Could not retrieve the Job from PlanSwift."

No job is open in PlanSwift, or PlanSwift started after HERON. Open the job, then click **Reload** in **Quantity Take Off**.

### "PlanSwift connection lost. Please restart PlanSwift and click Reload."

PlanSwift closed or crashed while HERON was reading it. Restart PlanSwift, open the job, then click **Reload**. Nothing is lost: your takeoff lives in the PlanSwift job.

### HERON says the PlanSwift installation folder was not found

HERON could not find PlanSwift on this PC, so it cannot start. Install PlanSwift 10 or 11 (or repair it), then reinstall HERON from the Installer Hub.

### Quantities are far too big or too small

Almost always the scale. Check the page was scaled, check it with the Dimension tool, scale again if needed, then click **Reload** in HERON. If everything is out by about the same percentage, the page was scaled off a wrong dimension.

### HERON shows imperial units on a metric job

No page carried a usable Scale Units value, so HERON fell back. Scale your pages properly, or open **Settings** and pick **Metric (m, m², m³, mm, kg)** under **Display Units**.

### An item is missing from Quantity Take Off

Click **Reload**. If it is still missing, check for a second item with the same name in the same folder: HERON merges duplicates.

### No rates loaded, or Load rates is missing

- **Load rates** appears only with an active Rate Gen subscription. The status line tells you if no Rate Gen subscription was found.
- You must be online and fully signed in (not in an offline session). Check the network signal in the header.
- If HERON reports that no rates matched, add or check the rates in Rate Gen, then click **Reload rates**.

### Save to Cloud refuses to save

- **Offline session:** sign out, then sign in again while connected.
- **Project name already exists:** choose another name, or open the existing project from the Dashboard and save from there.
- **Version conflict:** the project was changed on another device. Open it again from the Dashboard and save again.

### "This PlanSwift subscription is bound to a different device."

Your licence is tied to another PC. Contact ADLM support through [/support](/support) to have the device lock reset.

### "Internet required for first sign-in (no valid offline license found)."

The first sign-in on a PC must be online. Connect to the internet and sign in again.

### "Your subscription has expired." or "No active PlanSwift subscription was found on this account."

Renew your HERON subscription from your account on the ADLM website (`/dashboard`), or check you signed in with the account that holds the licence.

### The ADLM tab or the Takeoff Link pane is missing from Excel

1. Close Excel completely.
2. In HERON, click **Connect Excel** and let it install or repair the add-in.
3. Open Excel and a workbook, then click **Takeoff Link** on the **ADLM** tab.

If that does not work, run `Register-ExcelAddin.cmd` from `C:\ProgramData\Planswift Plugin`, or reinstall HERON from the Installer Hub.

### The Takeoff Link pane shows no data

HERON must be open with your project loaded. Open HERON, open or start the project, then click **Refresh** in the pane.

### Build in PlanSwift says there is nothing to build

The cloud project has only section headings or costing rows, with no measurable bill lines. Check the bill on the website first. If HERON says no PlanSwift job is open, open the job in PlanSwift and try again.

### The Install button in the Hub fails with access denied

PlanSwift (or Excel) was open while the Hub was installing. Close both and click **Install** again.

## Frequently asked questions

### Does HERON replace PlanSwift?

No. You still need PlanSwift 10 or 11. You measure in PlanSwift with the ADLM templates, and HERON reads, prices and exports what you measured.

### Do I need Rate Gen?

Only for pricing from a rate library. Without Rate Gen you can measure, review, type rates by hand, export to Excel and save to the cloud.

### Can I work without the internet?

Yes, once you have signed in online at least once on that PC. Measuring, the takeoff, the review screen and Excel export all work offline. Loading rates and saving to the cloud need a connection and a full sign-in.

### Where is my work stored?

Your measurements live in the PlanSwift job file. Back that file up. HERON itself can always be reinstalled from the Hub. Projects you save to the cloud are also kept on your ADLM account, with a new version on every save.

### Can I use HERON on two computers?

Your licence is tied to one PC at a time. To move it, ask ADLM support to reset the device lock, then sign in on the new PC.

### Can I import an Excel bill from inside HERON?

No. Excel bill import happens on the ADLM website, on your HERON projects page, and only if ADLM has switched it on for your account. You then use **Build in PlanSwift** in HERON to turn that bill into measurable items.

### Does removing a line on the review screen delete my measurement?

No. The ✕ on the review screen only removes the line from that bill and hides it from the **Budget**. Hiding an item in the **Budget** also leaves PlanSwift untouched. To change the takeoff itself, edit it in PlanSwift and click **Reload**.

### Does HERON send my drawings to ADLM?

No. The Takeoff Time Log sends only timings and counts, and you can turn it off in **Settings**. A cloud save sends the bill and budget lines you chose to save.

### How do I get help?

Click **Feedback** at the bottom of the HERON sidebar to message ADLM support on WhatsApp, or raise a ticket at [/support](/support). Tell us the job name, the folder and item affected, whether the page is scaled, the exact wording of any message and your PlanSwift version. A screenshot of PlanSwift's takeoff summary and HERON's **Quantity Take Off** answers most questions at once.
