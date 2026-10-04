---
id: quiv
title: QUIV for Revit
tagline: Measure your Revit model module by module, price it into a bill and a budget, and keep the job on ADLM Cloud.
version: "3.1.11"
updated: 2026-10-03
platform: Revit 2024-2027 add-in (Windows)
productKeys: [revit]
pdf: ADLM-QUIV-Revit-User-Guide.pdf
order: 3
---

QUIV is ADLM's quantity take-off and estimating add-in for Autodesk Revit. It reads quantities straight from your model: foundations, frame, walls, roof, doors, windows, finishes and external works. You add only what a quantity surveyor knows that the model does not, such as bar sizes, spacing and filling thicknesses. QUIV turns what you save into a bill of quantities and a budget inside Revit, and saves the job to your ADLM account so you can open it on adlmstudio.net.

It is for quantity surveyors, estimators and engineers who receive Revit models and want a bill of quantities without measuring the drawings again by hand.

> **Note:** This guide covers **QUIV 3.1.11**, the version the Installer Hub gives you today. QUIV 4.0, with a new panel design, is being prepared and is not yet available to customers. See [Coming in 4.0](#coming-in-40).

## Before you start

### What you need

| Item | Requirement |
|---|---|
| Autodesk Revit | Revit 2024, 2025, 2026 or 2027, on a Windows PC |
| Your licence | An active QUIV subscription on your ADLM account |
| The Installer Hub | QUIV is installed and updated through the ADLM Installer Hub |
| Internet | Needed to sign in and to save to the cloud |
| Rate Gen (optional) | Needed to load rates from the ADLM rate library onto your bill |

### Install QUIV

Installing is covered in full in the [Installer Hub guide](/guides/installer-hub). The short version:

1. Close Revit. Windows will not let the Hub replace add-in files that Revit is holding open.
2. Open the ADLM Installer Hub and sign in with your ADLM account.
3. Find **QUIV for Revit** and click **Install**.
4. When asked, choose the year of Revit you use. If you use more than one year, install once for each.
5. Start Revit. QUIV loads when Revit starts, so a Revit that was already open will not see it until you restart it.

When a new version is published, the Hub offers it as an update. Close Revit, update, then open Revit again. Your saved projects are not affected.

> **Note:** Your licence is tied to the computer you sign in from. If you change computers, contact ADLM support from [/support](/support) rather than buying again.

### Sign in

1. In Revit, open the **ADLM Calculator** tab on the ribbon.
2. Click **ADLM Calculator**.
3. In the **ADLM Sign In** window, enter your **Email** and **Password**. These are the same details you use on adlmstudio.net.
4. Click **Log in**.

QUIV says "Signed in successfully." and opens. It remembers your session, so you normally sign in once on each computer. If you do not have an account yet, use the link under **Don't have an account?**.

> **Important:** If QUIV says your account has no active licence, your subscription has expired or does not include QUIV. Renew it on adlmstudio.net, then click **ADLM Calculator** again.

## Finding your way around

### The ADLM Calculator tab

QUIV adds one ribbon tab, **ADLM Calculator**, with two buttons on its **ADLM** panel:

| Button | What it does |
|---|---|
| **ADLM Calculator** | Opens the QUIV workspace: dashboard, take-off modules, Bill and Budget. Asks you to sign in the first time. |
| **Model Checker** | Opens the ADLM Model Checker, which tells you whether the model is ready to measure. See [The Model Checker](#the-model-checker). |

### The workspace

QUIV opens as a panel docked inside Revit, so you can keep it beside your model. It has a sidebar on the left and the current page on the right.

The sidebar is grouped the way a bill is written:

| Group | Modules |
|---|---|
| **Foundation** | **Oversite Qty**, **Strip Qty**, **Pad Foundation Qty**, **Pile Cap Qty**, **Raft Foundation Qty** |
| **Frames** | **Beam Qty**, **Column Qty**, **Slab Qty**, **Steelwork Qty** |
| **Architectural** | **Wall Qty**, **Roof Qty**, **Ceiling Qty**, **Curtain Wall Qty**, **Door Qty**, **Window Qty**, **Staircase Qty**, **Railing Qty**, **Finishes Qty**, **Landscaping Qty**, **Model Items Qty** |
| **Database** | **BoQ** (the Bill) and **Budget** |

**Dashboard** at the top takes you home, and **Log out** at the bottom signs you out. A module can only be opened once it is on your take-off list (see [Starting a project](#starting-a-project)).

### The header buttons

The header across the top has a few small buttons. Hover over one to see what it does:

| Button (tooltip) | What it does |
|---|---|
| **Pop out to a floating window** | Moves QUIV into its own window for more room. |
| **Toggle Dark Mode** | Switches between light and dark. Not shown in Revit 2024. |
| **Metric** / **Imperial** | Switches the rate display between metric and imperial units. |
| **Include Hidden Elements** | When on, QUIV measures every element, including hidden ones. When off, only visible elements. |
| **Material Constants** | Opens the material constants QUIV uses for mixes and allowances. |
| **Contact ADLM Support** | Sends a message to ADLM support. |

Click your name in the header for **View Profile** and **Sign Out**.

> **Tip:** Docked in a narrow strip, QUIV rearranges itself so nothing is cut off. If it feels cramped, widen the panel or pop it out.

## The Model Checker

Before you measure, the Model Checker tells you whether the model can be measured: what is there, what is missing, what overlaps, and whether reinforcement has been modelled.

### Run a check

1. Open the model you want to measure.
2. On the **ADLM Calculator** tab, click **Model Checker**. The **ADLM Model Checker** window opens.
3. Under **Select Model Type**, choose **Architectural Model** or **Structural Model**.
4. Under **Check Options**, tick the checks you want (see the table below).
5. Click **Run Model Check**.

You will see it work through the model: scanning elements by category, detecting overlapping elements, checking for missing categories, analysing reinforcement, then calculating the readiness score.

| Option | What it looks for |
|---|---|
| **Check for Overlapping Elements** | Duplicated elements sitting on top of each other, found by comparing their outlines. Duplicates are the usual reason a quantity comes out double. |
| **Check Inter-Model Clashes** | Clashes between your model and the models linked into it. |
| **Check Reinforcement (InDesign Rebar)** | Structural models only. Shows which categories carry modelled rebar and which do not. |

### Read the results

The results screen shows four figures: **Readiness Score**, **Elements Found**, **Issues Found** and **Element Categories**. Below them:

- **Element Categories** lists what was found in the model. A category that is missing has to be modelled first or measured some other way.
- **Reinforcement Analysis** (structural models) shows which categories have modelled rebar. Where there is none, you will enter bar sizes and spacing yourself when you measure.
- **Issues** lists each problem. Click a row to highlight that element in Revit, so you can see the problem and fix it in the model.

### The buttons on the results screen

| Button | What it does |
|---|---|
| **Export Excel** | Saves the whole check to a spreadsheet. |
| **View QS Query** | Opens a **QS Query Report**: the questions a quantity surveyor would send the design team about missing or unclear parts of the model. Use **Copy to Clipboard** or **Export PDF** to send it. |
| **Generate QR Code** | Saves the report to the ADLM website and makes a QR code for it. Anyone who scans the code can read the report in a browser, without Revit and without signing in. Use **Save QR Code** to save the image, or **Save Full Report** to save the report as a web page file. |
| **Proceed to Takeoff** | Records your take-off decision in the QS query and closes the checker. |
| **Back to Setup** | Returns to the options to run another check. |

> **Important:** A report published with **Generate QR Code** can be read by anyone who has the link or the code. Check the project name and the category list before you share it.

## Starting a project

### The dashboard

When you open QUIV you land on the dashboard. It greets you by name and shows:

- **Ready for a new project?** with two cards, **Bungalow** and **Multi-Story**.
- **Recent Projects**: the projects you have saved to the cloud, with a search box and the filters **All Projects**, **Takeoff Only** and **Material Only**. Click a project to open it.

### Create a new project

1. On the dashboard, under **Ready for a new project?**, click **Bungalow** or **Multi-Story**.
2. For **Multi-Story**, QUIV asks for the **Foundation type**. Choose **Pad Foundation**, **Pile Foundation** or **Raft Foundation**.
3. QUIV shows "Generating Taking-Off List", then your **Take off List**.
4. Tick the items this job needs. Use **Check All** or **Uncheck All** to start from everything or nothing.
5. Click **Continue**.

The modules you ticked are now open in the sidebar. To change the list later, use the **Edit take off list** button; the confirm button then reads **Update List**.

> **Tip:** Work down the sidebar from top to bottom. It is the order a bill is written in, so your bill comes out in bill order without sorting.

## Measuring with a module

Click a module in the sidebar to open it. Every module works the same way, from top to bottom:

1. **Model Selection.** Choose the level (or **All Floors** where offered) and the type you are measuring, for example a wall type or a beam type. For some modules you pick the elements in Revit instead.
2. **Model Quantities.** What QUIV read from the model: areas, lengths, volumes and counts. You cannot type over these. To change them, change the model and measure again.
3. **Your inputs.** What only the quantity surveyor knows: thicknesses, depths, bar diameters, numbers of bars, link spacing, lintel treatment. On many modules this section is called **Input Quantities**. Change a value and the results update.
4. **Results.** The quantities that will go into the bill.
5. **View Material Breakdown.** On most modules, this shows the materials behind the results, such as cement in bags, sharp sand and granite in tonnes, blocks, planks and nails.
6. **Save.** Puts the result on the Bill and the Budget.

The first time you save, QUIV asks for a **Project name** in the **Save Takeoff** window. Everything you save afterwards belongs to that project.

If you save a level and type you have already saved, QUIV asks whether to replace the previous figures or add to them. Choose replace when you are correcting a measurement, and add when you are measuring another part of the same thing.

> **Tip:** QUIV reads the model when you measure, not all the time. If you change the model, open the module again, choose the level and type, and save again.

> **Note:** The type list only shows types that are actually modelled on the level you chose. An empty list nearly always means the wrong level is selected.

### What each module measures

| Module | What it measures |
|---|---|
| **Oversite Qty** | Hardcore and laterite filling, BRC mesh, DPM, formwork to edges, oversite concrete and blinding. |
| **Strip Qty** | Excavation, earthwork support, concrete in footing, blockwork in foundation, blinding, surface treatment, levelling and compacting, damp-proof course, backfill and disposal. |
| **Pad Foundation Qty** | Excavation, earthwork support, concrete in pads, formwork, blinding and bars. |
| **Pile Cap Qty** | Excavation, concrete in pile caps and piles, formwork, blinding and bars. |
| **Raft Foundation Qty** | Excavation, concrete in slab and beams, hardcore, laterite, DPM, beam formwork and reinforcement. |
| **Beam Qty** | Concrete in beams, formwork, top and bottom bars and links. |
| **Column Qty** | Concrete in columns, formwork, main bars and links. |
| **Slab Qty** | Concrete in slab, formwork to soffit and edges, and reinforcement. |
| **Steelwork Qty** | Structural steel by weight and surface area. |
| **Wall Qty** | Blockwork net of openings, rendering, lintel concrete, formwork and reinforcement. |
| **Roof Qty** | Roof members such as rafters, purlins, tie beams, king posts, struts, wall plate, fascia and ridge. |
| **Ceiling Qty** | Ceiling area and noggings. |
| **Curtain Wall Qty** | Curtain walling area and its parts. |
| **Door Qty** / **Window Qty** | Doors and windows by type, with area and perimeter. |
| **Staircase Qty** | Concrete in stairs, formwork and reinforcement. |
| **Railing Qty** | Railings and balustrades in metres, by level and type. |
| **Finishes Qty** | Wall paint, floor tiling and ceiling finishes. |
| **Landscaping Qty** | Paving, turf, fencing and other external works. |
| **Model Items Qty** | Anything modelled that does not fit a category above. |

Steel beams and columns are measured under **Steelwork Qty** only, not as concrete beams or columns.

## Run the whole takeoff

Instead of opening each module yourself, you can hand the whole take-off list to QUIV. It measures every ticked item level by level and type by type, and saves each result to the Bill and the Budget.

1. Start a project and finish your take-off list.
2. Under the list, click **✦ Run the whole takeoff** (in a narrow panel, just **✦**).
3. Read **Hand the takeoff to QUIV**. It explains what happens and lists the items that **Still needs you**, because they start with a pick in Revit.
4. Click **Let QUIV run the whole takeoff**, or **Not now** to go back.

While **QUIV is running the takeoff**, the Revit view switches level by level and highlights each element as it is measured. A progress panel shows what has been saved, how many were skipped and roughly how long is left.

To stop, choose **Stop here and keep what is saved** or **Stop and undo the whole run**. The measurement in progress always finishes first, so a save is never cut in half. When the run ends you can also click **Undo this run** to put the Bill, the Budget and the Take off List back as they were.

> **Note:** Full runs are limited per day on each account. When you are close to the limit QUIV tells you how many are left. Measuring module by module is never limited.

> **Note:** A run does not save to the cloud. Check the Bill, then save to the cloud yourself.

## The Bill of Quantities

Click **BoQ** under **Database** in the sidebar. The **Bill of Quantities** lists everything you have saved, with the columns **S/N**, **Takeoff Title**, **Item**, **Category**, **Qty**, **Unit**, **Rate**, **Amount**, **Source** and **Done**.

- **Source** shows where a rate came from.
- **Done** is your own tick, for the lines you have checked or agreed.
- **Search Takeoff Items** filters the list.
- Click **Budget** to switch to the Budget, and **Back to Dashboard** to go home.

The cards at the top show **Measured Total**, **Budget Total**, **Left To Spend** and **Completed**, with **Preliminaries**, **Prime Cost (PC) / Provisional Sum** and **Project Total Cost**.

### Price the bill

| Button | What it does |
|---|---|
| **Load RateGen Prices** | Applies rates from the Rate Gen library to matching lines. Needs a Rate Gen licence. |
| **View Rates** | Opens the **RateGen Quantity Rate Viewer**. Choose a bill line in the map column, then click **Map** to write that rate onto it. |
| **From Budget** / **Manual / RateGen** | Chooses where rates come from. **From Budget** works each rate out from the line's material and labour build-up. **Manual / RateGen** lets you type a rate or pick one from Rate Gen. |
| **Refresh from Cloud** | Re-reads the saved project, so rates and ticks changed on the website show up here. |

Nothing is priced until you ask. A line nobody has priced shows no rate.

### Export from Revit

| Button | What you get |
|---|---|
| **Export to Excel** | The bill as a spreadsheet, with its totals. |
| **Budget Workbook** | A formula-linked QS workbook with a cover, dashboard, basic prices, budget summary, the bill with rate build-ups, and a material summary. Change one profit margin cell to re-price the whole job. |

Exports print the rate you entered or a Rate Gen rate. Anything not priced shows 0, never a made-up figure.

### Start again

**Reset** clears all take-off items and the attached budget for this model. **Load Latest Local** brings back the most recent copy kept on this PC.

> **Important:** Export the bill first if there is any chance you will want the figures after a **Reset**.

## The Budget

Click **Budget** under **Database**, or **Budget** on the Bill. The **Budget Library** turns the same take-off into what the job will cost you: every material and labour item, what you have bought, and what is left.

- **All**, **Material** and **Labour** filter the list.
- **Takeoff** names the module each line came from.
- **Bought** is yours to tick as you buy. The cards show **All Items Total**, **Purchased** and **Left To Spend**.
- **Load RateGen Prices** and **View Rates** price materials from the Rate Gen library. In the **RateGen Library Viewer**, choose a material in the map column and click **Map**.
- **Clear Prices** zeroes the prices QUIV applied by itself, keeping the quantities and any rate you typed. Save to the cloud afterwards to clear the saved copy too.
- **Export to Excel** saves the budget as a spreadsheet.
- **Bill** takes you back to the Bill of Quantities.

## Save to the cloud

1. Open the Bill (**BoQ** in the sidebar).
2. Click **Save To Cloud**. For a project already on the cloud the button reads **Update To Cloud**.
3. Check the **Project name** and confirm.

If some lines are missing a rate or other details, QUIV tells you before it saves. You can save as often as you like; each save updates the same project.

To open a saved project again, click it under **Recent Projects** on the dashboard. This works on any computer where you sign in with the same account.

> **Note:** You must be online to save to the cloud.

## Linked models

Many jobs come as an architectural model with the structural engineer's model linked into it. QUIV measures the beams, columns and slabs inside a linked structural model.

- **Levels are matched for you.** QUIV pairs the levels of the two models by name where they agree, and by height where they do not. So "00 - GROUND FLOOR" in the engineer's file is recognised as your "Ground floor level". Each linked element is measured on exactly one level.
- **Load the link.** QUIV can only measure a link that is loaded in Revit. If a category comes back empty when you know it is modelled, check the link is loaded in Manage Links.

> **Important:** If the same linked file is placed in your model more than once (copied, mirrored, or linked again when it looked missing), its elements can be measured once for each placement, which doubles the quantities. Open Manage Links in Revit and remove the link instances you do not need before you measure.

## ADLM Cloud: your project on the website

Go to [/projects/revit](/projects/revit) after signing in on adlmstudio.net. Every project you saved from QUIV is listed there.

Open a project to see its tabs, including **Dashboard**, **Bill of Quantity**, **Budget**, **Valuation**, **3D Model** and **PM Dashboard**. This is where you can also price the bill, plan the budget and value the work.

### Sample projects

At the top of the QUIV projects page you may see **Learning samples**: fully worked duplex projects, one for each foundation type, each measured from its own 3D model. Click the button that reads **Show** and the number of samples, for example "Show 4 samples", then open one to see every tab filled in on a realistic job. Samples are read-only.

### Exports on the website

On an open project, click **Export** to choose a workbook. The choices include:

| Export | What you get |
|---|---|
| **Export bill & budget workbook** | The bill and the budget together, by category (also offered by trade) |
| **Export generic BoQ (by category)** | A plain bill grouped by category (also offered by trade) |
| Elemental BoQ: **Bungalow** or **Multi-storey** | A bill grouped by building element |
| Trade BoQ: **Bungalow (Trade format)** or **Multi-storey (Trade format)** | A bill grouped by work section |
| Milestone BoQ: **Bungalow (Milestone format)** or **Multi-storey (Milestone format)** | One priceable bill per construction stage or storey, as a basis for a payment schedule |

See the [ADLM Cloud guide](/guides/cloud) for the rest of the website, and the [Rate Gen guide](/guides/rategen) for building your own rates.

## What's new in 3.1.11

### 3.1.11 (September 2026)

- Pop-up windows close with <kbd>Esc</kbd>, and take-off pop-ups fit a narrow docked panel.

### 3.1.10 (September 2026)

- Faster opening of the Bill and the Budget after a take-off that started with foundations.

### 3.1.9 (August 2026)

- Linked structural models are measured, with levels matched by name or by height.
- **✦ Run the whole takeoff**: QUIV measures every ticked item, splitting every level and every type onto its own bill line.
- A **Railing Qty** module.
- Staircases that measured zero now measure properly; steel members are no longer counted twice.
- Nothing is priced until you ask, and exports no longer print rates nobody set.
- **Clear Prices** removes the prices QUIV applied by itself and keeps the ones you typed.

### Coming in 4.0

QUIV 4.0 is not yet available to customers. When the Installer Hub offers it, QUIV will have a new panel with sign-in inside it, a one-screen new project, one screen per item, and auto take-off results you review and accept. In 4.0, pricing and exports move to ADLM Cloud. This guide will be updated when 4.0 is released.

## Troubleshooting

### There is no ADLM Calculator tab in Revit

QUIV is not loaded. Close Revit, open the Installer Hub, and install or reinstall **QUIV for Revit**, choosing the year of Revit you use. Then start Revit again. Add-ins load only when Revit starts.

### It says my account has no active licence

Your subscription has expired or does not include QUIV. Check your subscription on adlmstudio.net, renew it, then sign in again.

### "Sign in failed. Please verify your credentials."

Check your email and password and try again. Use the same details as on adlmstudio.net.

### "No internet connection detected."

QUIV needs the internet to sign in. Connect, then click **Log in** again.

### My computer changed and now I cannot sign in

Your licence is tied to the computer you first used. Contact ADLM support from [/support](/support) to move it.

### A module in the sidebar is greyed out

It is not on your take-off list. Use **Edit take off list**, tick it, and click **Update List**.

### Nothing appears in the type list

Nothing of that kind is modelled on the level you chose. Check the level first: this is nearly always the cause. If the elements are in a linked model, make sure the link is loaded.

### A quantity looks double

Two common causes:

1. **Duplicated elements.** Run the Model Checker with **Check for Overlapping Elements** ticked, then click the issue rows to find the duplicates in Revit.
2. **A link placed twice.** Open Manage Links in Revit and remove link instances you do not need. See [Linked models](#linked-models).

### The reinforcement comes out as zero

The rebar is not modelled, which is normal. Enter the bar sizes, numbers and spacing in the module's inputs.

### I changed the model but the quantities did not change

QUIV reads the model when you measure. Open the module, choose the level and type again, and save. When asked, choose to replace the previous figures.

### The rates are all blank

That is expected until you price. Click **Load RateGen Prices** on the Bill, or type rates with **Manual / RateGen**. Loading Rate Gen prices needs a Rate Gen licence.

### The project is not on the website

It was never saved to the cloud, or the save was made while offline. Open the project in QUIV, click **Save To Cloud** or **Update To Cloud** on the Bill, then refresh the projects page in your browser.

### There is no dark mode button

You are using Revit 2024, where QUIV stays in light mode.

### The panel is cramped

Widen the docked panel, or click the **Pop out to a floating window** button.

### Support asks for my log file

QUIV writes a diagnostic log to `%APPDATA%\ADLM\adlm.log`. Paste that address into the Windows File Explorer address bar to find it, and attach the file to your support ticket.

## Frequently asked questions

### Do I need Rate Gen to use QUIV?

No. QUIV measures without it, and you can type your own rates. You need Rate Gen to load rates from the ADLM rate library.

### Can I save before everything is measured?

Yes. Save to the cloud at any time. Each later save updates the same project.

### Is Run the whole takeoff guessing the quantities?

No. It uses the same modules you would use by hand, going through the model level by level and type by type. Check the Bill afterwards as you would check your own work.

### Can I measure a structural model linked into my architectural model?

Yes, for beams, columns and slabs. Make sure the link is loaded. See [Linked models](#linked-models).

### Which versions of Revit does QUIV work with?

Revit 2024 to 2027. The Installer Hub asks which year you use and installs the matching version.

### Can I work in imperial units?

Yes. Use **Metric** / **Imperial** in the header to switch the rate display. Decide before you price, so rates and quantities agree.

### Where can I get help?

Raise a ticket or chat with ADLM from [/support](/support). With a take-off problem, send the project name, the module, the level and type you chose, the number QUIV gave and the number you expected, and a screenshot of the module page.
