---
id: archicad
title: QUIV for ArchiCAD
tagline: Measure walls, slabs, frames, footings, roofs and openings straight from your ArchiCAD model, then price, version and share the bill on adlmstudio.net.
version: "1.0"
updated: 2026-10-07
platform: Windows desktop app that works beside ArchiCAD 28, plus web pages in any browser
productKeys: [archicad]
order: 4
---

QUIV for ArchiCAD reads quantities from an open ArchiCAD model and turns them into a Bill of Quantities. It has two parts. The **desktop app** sits beside ArchiCAD on your Windows PC: you pick what to measure, click **Extract**, check the numbers and save them into a bill. The **web pages** on adlmstudio.net take that bill, price every line from the ADLM rate library and your own Rate Gen rates, keep every version, and let you set margins, track a budget, export to Excel or PDF and share a link with your client.

It is for quantity surveyors, estimators and project teams who receive ArchiCAD models and want a priced bill without measuring the model again by hand.

## Before you start

### What you need

| Item | Requirement |
|---|---|
| Computer | A Windows PC (64-bit) |
| ArchiCAD | ArchiCAD 28, the version QUIV for ArchiCAD has been tested on, with your project open |
| Tapir add-on | Strongly recommended. Tapir is a free ArchiCAD add-on. Without it QUIV still measures, but you lose the **Level** filter, the highlighting of elements in the model, and the most accurate way of telling external doors from internal ones |
| Internet | Needed to sign in, to send your bill to ADLM Cloud and to use the web pages |
| Subscription | An active **QUIV for ArchiCAD** subscription on your ADLM account |

> **Note:** QUIV for ArchiCAD reads your model. It never changes it. You cannot damage a model by measuring it, and you do not need to save ArchiCAD before you extract.

### Your subscription

QUIV for ArchiCAD needs its own subscription. A QUIV for Revit or HERON subscription does not include it. If you do not have one, contact ADLM through [Support](/support) and the team will set it up on your account.

Your licence is tied to the computer you first sign in on. To move to a new PC, ask ADLM support to release the old one.

### Install the desktop app

QUIV for ArchiCAD 1.0 is installed from the ADLM Installer Hub, the same way as the other ADLM products. See the [Installer Hub guide](/guides/installer-hub) if you have not used it before.

1. Install ArchiCAD 28 and, if you can, the Tapir add-on. Restart ArchiCAD after adding Tapir.
2. Open the ADLM Installer Hub and sign in.
3. Find **QUIV for ArchiCAD** in your products and install it.
4. Approve the Windows administrator prompt when it appears.
5. When setup finishes you can tick the option to launch the app straight away.

Setup adds **QUIV for ArchiCAD** to your Start menu, and can add a desktop icon if you tick that box during setup.

> **Note:** QUIV for ArchiCAD is the newest product in the suite. If it does not appear in your Installer Hub, it has not been released to your account yet. Contact [Support](/support).

### Optional: a QUIV button inside ArchiCAD

QUIV runs as its own window, not as a tab inside ArchiCAD. If you use Tapir, you can add a launcher to Tapir's script palette so you can open QUIV from inside ArchiCAD. Setup places the launcher script, `launch-quiv.py`, in the `tools` folder of the QUIV for ArchiCAD install folder (normally `C:\Program Files\QUIV for ArchiCAD\tools`), with a short note beside it.

1. In ArchiCAD, open the Tapir menu and show the scripts palette.
2. Click the **+** button on the palette.
3. Choose `launch-quiv.py` from the `tools` folder.
4. Select **launch-quiv** in the palette and run it. QUIV opens.

Pin the palette if you want the button to stay visible.

## Signing in

1. Open your project in ArchiCAD first, and get past the start screen into the model.
2. Start **QUIV for ArchiCAD** from the Start menu or desktop.
3. On the **ADLM Sign In** window, type your **Email** and **Password**. These are the same details you use on adlmstudio.net.
4. Click **Log in**.

QUIV remembers you on this computer, so next time it opens straight to your dashboard.

If you have forgotten your password, click **Forgot password?** on the sign-in window. If you do not have an account yet, click **Create account.** Both open the ADLM website.

To sign out, click **Log out** at the bottom of the sidebar, or click the **Settings** (gear) button at the top of the window and choose **Sign out**.

## Finding your way around

### The top bar

Across the top of the window you see:

- The time and date.
- The ArchiCAD badge. A green dot with, for example, **ArchiCAD 28 connected** means QUIV can see your model. A red dot with **ArchiCAD not connected** means it cannot. QUIV checks every few seconds, so the badge turns green on its own once ArchiCAD is ready.
- **Ready for a new project?**, which reopens your Take off List once you have started a project.
- The **Metric** and **Imperial** switch.
- The **Settings** (gear) button.
- Your name, email and initials.

### The sidebar

The sidebar on the left lists everything in the app, in groups:

| Group | What is in it |
|---|---|
| **Dashboard** | Your welcome page and recent projects |
| **Foundation** | **Oversite Qty**, **Strip Qty**, **Pad Foundation Qty**, **Pile Cap Qty**, **Raft Foundation Qty** |
| **Frames** | **Beam Qty**, **Column Qty**, **Slab Qty**, **Steelwork Qty** |
| **Architectural** | **Wall Qty**, **Roof Qty**, **Ceiling Qty**, **Curtain Wall Qty**, **Door Qty**, **Window Qty**, **Staircase Qty**, **Finishes Qty**, **Landscaping Qty**, **Model Items Qty** |
| **Database** | **BoQ** (your Bill of Quantities) and **Budget** |

The take-off modules are greyed out until you start a project and choose what you are measuring (see the next section). **Dashboard**, **BoQ** and **Budget** are always available.

> **Important:** In version 1.0, these modules measure from the model: **Oversite Qty**, **Strip Qty**, **Pad Foundation Qty**, **Beam Qty**, **Column Qty**, **Slab Qty**, **Wall Qty**, **Roof Qty**, **Curtain Wall Qty**, **Door Qty** and **Window Qty**. The others (**Pile Cap Qty**, **Raft Foundation Qty**, **Steelwork Qty**, **Ceiling Qty**, **Staircase Qty**, **Finishes Qty**, **Landscaping Qty** and **Model Items Qty**) open a **COMING SOON** page. Measure those items another way for now.

## Starting a project

### The Dashboard

When you sign in you land on the Dashboard. It greets you by name and shows two template cards and your recent projects.

- **Bungalow**: strip footings and oversite. Clicking it opens the Take off List straight away.
- **Multi-Story**: asks for your foundation type first, then opens the Take off List.
- **Recent Projects**: every QUIV for ArchiCAD project already saved to your account, newest first, with its **Updated** date, number of **Versions** and **Grand Total**. Click **Refresh** to reload the list.

### Choose a building type

1. Click **Bungalow** or **Multi-Story**.
2. If you chose **Multi-Story**, the **Foundation type** window asks "What type of foundation is your multi-story project?". Click **Raft Foundation**, **Pad Foundation** or **Pile Foundation**.

> **Tip:** For a multi-storey job, **Pad Foundation** is the choice that measures footings from the model in version 1.0. Raft and pile foundations open the take-off list, but their foundation modules are still coming soon.

### The Take off List

The Take off List is your scope for the job. It lists every item for the building type you picked, grouped under headings such as **Substructure**, **Frame**, **Superstructure** and **External Works**, with the unit beside each item.

1. Tick each item the job actually contains. Use **Check All** or **Uncheck All** to save time.
2. Click **Continue**. (It stays greyed out until at least one item is ticked.)

QUIV unlocks only the sidebar modules your ticked items need, and opens the first one. For a bungalow that is **Strip Qty**; for a pad-foundation building it is **Pad Foundation Qty**.

To close the list without changing anything, click the **X** beside **Continue**.

You are not locked in. Click **Ready for a new project?** in the top bar at any time to reopen the list, tick something you missed and click **Continue** again.

## Taking off from the model

Every module page works the same way, so learn one and you know them all.

### The parts of a module page

| Part | What it does |
|---|---|
| Title and status line | Shows the module name (for example **Walls**) and what just happened, such as how many elements were extracted |
| **Extract** | Reads every element of this kind from the open ArchiCAD model |
| **Use ArchiCAD Selection** | Reads only the elements you have selected in ArchiCAD |
| **Save Takeoff** | Saves the ticked elements into your Bill of Quantities |
| **Level** and **Type** | Filter the list to one storey or one type (for example one wall thickness) |
| Element list | One row per element, with a tick box and the quantities ArchiCAD reports |
| Totals | Running totals for the ticked rows, for example **Selected** 42 / 50 and the total net face area |
| **Inputs** | Things the model cannot tell you, such as excavation depth or working space |
| **Results** | The trade quantities worked out from the ticked elements and your inputs |
| **View Material Breakdown** | Opens the materials behind the results |

### Measuring step by step: walls

Walls are the best module to learn first.

1. Click **Wall Qty** in the sidebar.
2. Click **Extract**. The status line reads "Extracting from ArchiCAD…" and then tells you how many elements were found.
3. Use **Level** to pick a storey, or leave it on **All Floors**. Use **Type** to narrow to one thickness, or leave it on **All Types**.
4. Untick any rows you do not want. Use **Select all** to tick or untick every row at once.
5. Check the **Inputs** panel on the right. For walls, set **Rendered faces (0/1/2)**: 2 for walls plastered both sides, 1 for one side, 0 for none.
6. Read the **Results**: walling area, wall volume, render or plaster area and wall length.
7. Click **Save Takeoff**. A message confirms how many bill lines were saved from how many elements.

When you tick or untick rows, the selected elements are highlighted in ArchiCAD (this needs Tapir), so you can see exactly what you are measuring.

> **Tip:** Check one element before you trust a thousand. Compare the figures QUIV shows for a single wall with ArchiCAD's own element information. If one agrees, the rest will.

### Measuring only what you select

1. In ArchiCAD, select the elements you want, for example one run of walls.
2. In QUIV, open the matching module and click **Use ArchiCAD Selection**.
3. QUIV extracts and ticks only the selected elements of that kind.

If nothing is selected, QUIV tells you to select elements in ArchiCAD first. If your selection contains none of that module's elements (for example you selected slabs while on **Wall Qty**), it says so.

### Saving again

Each module keeps one saved take-off. If you extract and click **Save Takeoff** again in the same module, the new take-off replaces the old one for that module. Other modules are not affected.

As you save modules, the Take off List ticks items off, and the progress shows as "Take-off progress" with the number done out of the number chosen.

### What each module measures

All quantities come straight from ArchiCAD. QUIV does not recalculate a volume from an area and a thickness.

| Module | What it reads from the model | Inputs you set | Results it works out |
|---|---|---|---|
| **Strip Qty** | Strip footings: volume, top area, depth, length, width | **Working space**, **Depth of excavation**, **Blinding thickness**, **Foundation walling height**, **Bar diameter (manual)**, **Rebar rate (manual)** | Strip Footing Excavation, Surface Treatment, Earth Work Support, Leveling & Compaction, Blinding to Footing, Concrete Footing, Blockwork in Foundation, Damp Proof Course (DPC), Reinforcement |
| **Pad Foundation Qty** | Pad footings: volume, depth, plan width | **Working space**, **Depth of excavation**, **Blinding thickness**, **Bar diameter (manual)**, **Bar spacing (manual)** | Pad Foundation Excavation, Earth Work Support, Surface Treatment, Leveling & Compaction, Blinding, Formwork to Sides, Concrete, Rebar |
| **Oversite Qty** | Ground-floor slabs only: net area, volume, thickness, perimeter | **Hardcore thickness**, **Laterite thickness**, **Blinding thickness**, **BRC/Bar Ø (manual)** | Hardcore Filling, Laterite Filling, DPM, BRC Mesh, Formwork to Edges, Blinding, Oversite Concrete |
| **Slab Qty** | Slabs: net, gross and soffit area, net volume, thickness, perimeter | **Bar diameter (manual)**, **Rebar rate (manual)** | Concrete in Slab, Soffit Formwork, Edge Formwork, Reinforcement |
| **Beam Qty** | Beams: net volume, length, section width and depth | **Bar diameter (manual)**, **Rebar rate (manual)** | Concrete in Beams, Beam Formwork, Reinforcement |
| **Column Qty** | Columns: net volume, height, section width and depth, section and side areas | **Bar diameter (manual)**, **Rebar rate (manual)** | Concrete in Columns, Column Formwork, Reinforcement |
| **Wall Qty** | Walls: net, inside and gross face area, door and window openings, net volume, length, height, thickness, position | **Rendered faces (0/1/2)** | Walling (net face area), Wall Volume, Render / Plaster, Wall Length |
| **Roof Qty** | Roofs: net surface, projected and soffit area, volume, thickness, pitch, eaves and ridge lengths | None | Roof Covering, Soffit / Eaves Lining, Roof Volume, Fascia, Ridge Capping |
| **Curtain Wall Qty** | Curtain walls: boundary area, panel area, frame length, length, height | None | Curtain Walling, Glazed Panels, Frames / Mullions |
| **Door Qty** and **Window Qty** | Openings: width, height, opening area and volume (doors also show position) | None | Number of doors or windows, Opening Area, Frame Length |

> **Note:** ArchiCAD models carry no reinforcement, so every rebar figure in QUIV comes from the rate, bar size or spacing you type in **Inputs**. The page reminds you of this.

### How QUIV sorts elements

QUIV files every saved element into one of eight bill categories:

| Category | What goes in it |
|---|---|
| Substructure | Pad footings, strip footings and ground-floor slabs |
| Frame | Columns and beams |
| Upper floors | Slabs above ground level |
| Roof | Roof elements |
| External walls | Walls with Position set to Exterior, and curtain walls |
| Internal walls | Walls with Position set to Interior, and walls with no Position set |
| Windows and external doors | All windows, and doors in external walls |
| Internal doors | Doors in internal walls |

A few rules are worth knowing:

- **Slabs.** A slab whose bottom sits at or just above project zero counts as a ground-floor slab (substructure, and the only slabs **Oversite Qty** reads). Everything higher is an upper floor.
- **Walls.** External and internal are decided by the wall's **Position** setting in ArchiCAD (in the wall's settings, under its ID and categories). Walls with no Position set are listed under Internal walls and flagged as a data issue, never dropped.
- **Doors and windows.** A door takes external or internal from the wall it sits in. With Tapir installed this match is exact.
- **Footings.** ArchiCAD has no footing tool, so QUIV looks for elements classified as **Footing** (or anything under it) in the ArchiCAD Classification. Footings modelled with the wall or beam tool, or whose classification mentions strip, footing beam or ground beam, become strip footings. The rest become pad footings.

> **Tip:** If your external wall areas look too small, the missing walls are probably set to an undefined Position. Fix the Position in ArchiCAD and extract again. Always fix it in the model, not in the bill: the next extraction reads the model afresh.

### Data issues: a dash, never a zero

When ArchiCAD does not report a quantity for an element, QUIV shows a dash in that cell instead of a number and counts it as a data issue. A warning above the list gives the number of data issues and reminds you that missing fields show a dash, never zero. Hover over a flagged cell to see what is missing.

QUIV never puts in a zero, because a zero looks like a real measurement and a dash does not. Every data issue is either a modelling gap to fix in ArchiCAD or an item to measure another way.

### Material Breakdown and Material Constants

Click **View Material Breakdown** on a module page to see the materials behind its results: cement, sand, granite, blocks and so on. The figures come from your Material Constants.

To change those constants:

1. Click the **Settings** (gear) button in the top bar.
2. Choose **Material Constants…**.
3. Edit the **Value** column for the constants you want to change.
4. Click **Save**.

**Reset Defaults** puts every constant back to the ADLM standard values. Material Constants are kept on this computer.

## The Bill of Quantities in the app

Click **BoQ** in the sidebar to see everything you have saved, combined into one bill.

### What you see

At the top are summary cards:

| Card | Meaning |
|---|---|
| **Measured Total** | Quantity × rate for every line, using the rates currently in the app |
| **Bill Lines** | How many lines the bill has |
| **Data Issues** | How many lines are missing a quantity |
| **Grand Total (Cloud)** | The priced total that came back from ADLM Cloud. A dash until you click **Update To Cloud** |
| **Cost / m²** | Grand total divided by floor area, also from ADLM Cloud |

Below is the bill itself, grouped by category, with the columns **S/N**, **Ref**, **Item**, **Qty**, **Unit**, **Rate**, **Source**, **Amount** and **Status**. **Status** reads **Priced**, **Unpriced** or **Missing**. **Source** shows where the rate came from, for example a Rate Gen rate, **Custom rate**, or **Manual** for a rate you typed.

Use the search box to find lines by item name, category or reference.

### Typing your own rate

You can type a rate into the **Rate** column. QUIV keeps your rate when the bill is rebuilt after you save another module.

> **Note:** A rate you type in the app stays in the app. The bill on adlmstudio.net is priced by ADLM Cloud from the rate library and your Rate Gen rates, and you adjust it there with margins.

### Sending the bill to ADLM Cloud

1. Click **Update To Cloud**.
2. The first time, QUIV asks for a **Project name**. Type it and click **OK**.
3. Wait while the status reads "Updating to ADLM Cloud…".
4. When it finishes, the rates, **Grand Total (Cloud)** and **Cost / m²** fill in, and the status shows the version number, for example "Synced · v1".
5. Click **View in Browser** to open the same bill on adlmstudio.net.

Every **Update To Cloud** saves a new version. Nothing you send ever overwrites an older version, so re-measuring after a design change is safe.

> **Important:** Saved take-offs live in the app only until you close it. Click **Update To Cloud** before you close QUIV, or you will need to extract again.

To carry on with a project you saved before, double-click it in **Recent Projects** on the Dashboard. QUIV links the bill to that project, so your next **Update To Cloud** adds a new version to it instead of starting a new project.

**Export Excel** is not available in the desktop app in version 1.0. Hover over it and it reminds you that Excel export is on the web: use **View in Browser**.

### Starting again

**Reset Takeoff** clears every saved module and the budget, so you can start a fresh project. QUIV asks you to confirm first. It does not touch anything already saved to ADLM Cloud.

## The Budget in the app

Click **Budget** in the sidebar after you have clicked **Update To Cloud**. Until then it reads "Run Update To Cloud from the Bill of Quantities to build the budget."

The Budget splits the priced bill into what you will buy and who you will pay:

- Summary cards: **Materials Total**, **Labour Total**, **Direct Cost** and **Project Total**.
- A table with a material row and labour rows under each bill line, including the gang of trades the labour came from where the rate has one.
- **All**, **Material** and **Labour** buttons to filter the rows, and a search box.

## QUIV for ArchiCAD on adlmstudio.net

The web pages are where your bill is priced, versioned, adjusted and handed to other people. You need to be signed in with an account that has a QUIV for ArchiCAD subscription.

### Your projects

Go to [adlmstudio.net/archicad](/archicad), or open QUIV for ArchiCAD from your subscriptions on your [dashboard](/dashboard).

The page lists **Your ArchiCAD projects**. Each card shows the project name, its version number, when it was last updated and its estimate. Each has two buttons:

- **Open BoQ** opens the priced bill.
- **Dashboard** opens the budget dashboard.

Click **Refresh** to reload the list after sending a new version from the app.

### Sample projects

Above your own projects you may see **Learning samples**: worked duplex projects, one per foundation type, measured from an ArchiCAD model. Open one to see a finished bill, dashboard and element pages before you measure your own job. Click **Hide samples** or **Show samples** to fold the row away or bring it back.

Samples are read-only. You can open and export every line, element and version, but you cannot change margins, reapply rates, set a budget or share them.

### The priced bill

**Open BoQ** shows the full bill for the current version. The heading shows the project name, then "Bill of Quantities" with the ArchiCAD version the model came from and the bill version number.

The bill is grouped into the eight categories. Click a category heading to fold it away or open it again. Each category ends with a subtotal, and the bill ends with the **Grand total**.

| Column | What it holds |
|---|---|
| **Item ref** | The line reference, for example 5.2 (category 5, line 2) |
| **Description** | What the line is, for example "225mm thick exterior wall" |
| **Unit** and **Qty** | The quantity in metric or imperial units |
| **Unit rate** | The rate per unit |
| **Material** and **Labour** | The split of the line's cost |
| **Total** | The amount for the line |
| **Margin** | The margin percentage on that line |

Click **Item ref**, **Description**, **Qty** or **Total** to sort by that column; click again to reverse it. Type in **Filter by description or item ref…** to find lines.

Some lines carry markers:

- **Orange row**: the quantity changed since the previous version. Hover over it to see "Quantity changed vs previous version".
- **Unpriced**: no matching rate was found. The line is shown at a rate of zero, never quietly priced at a guess. Add a suitable rate to your Rate Gen library, then use **Reapply rates**.
- **"3 elements"** (or another number): the line was measured from several model elements. Click it to list them, then click any one to open its element page. A line from a single element links straight from its description.

If the model extraction flagged any data issues, a box above the bill lists them, for example "3 data issues detected in the model extraction", with a link to each affected element.

### How lines are priced

When you send a bill, ADLM Cloud matches each line to a rate. It looks in the ADLM rate library and in your own Rate Gen library, matching on the description and the unit. The rate's build-up gives the material and labour split. Where a rate has no labour breakdown, the labour is worked out from the rate itself or from the ADLM labour price list. A line with no match is marked **Unpriced**.

The bill is always priced from the project owner's rates, even when a team member sends a new version.

To learn more about building your own rates, see the [ADLM Rate Gen guide](/guides/rategen).

### Margins

The unit rate is the net cost, plus overhead, plus margin. A line starts with the margin set in the rate it matched.

To change one line:

1. Click in the line's **Margin** box.
2. Type the new percentage.
3. Press <kbd>Enter</kbd> or click away. The line reprices straight away. Press <kbd>Esc</kbd> to cancel.

To change every line at once:

1. Type a percentage in **Global margin**.
2. Click **Apply to all** (or press <kbd>Enter</kbd>).

Margin changes update the current version. They do not create a new one.

### Versions and reapplying rates

The **Version** list above the bill shows **Current** first, then every older version with its date, time and grand total.

- Choose an older version to view it. It opens read-only, with a note saying so. Click **Back to current** to return.
- Click **Reapply rates** to reprice the current bill at today's rates, for example after you have added rates to your Rate Gen library. This saves the result as a new version. The button only shows while you are viewing the current version.

### Exporting to Excel and PDF

Click **Excel** or **PDF** at the top of the bill. The file downloads to your computer, named after the project. Exports always contain the current version.

### Sharing a link with your client

1. Click **Create share link**.
2. The link appears beside the button. Click the copy icon to copy it.
3. Send it to your client.

Anyone with the link can open a read-only view of the project without signing in. Click **Disable share link** to switch it off.

> **Important:** A share link has no password. Send it only to the people who should see the bill, and switch it off once you no longer need it.

### The budget dashboard

Click **Dashboard** from the project card or from the bill. It shows:

- Summary tiles: **Total material**, **Total labour**, **Total direct cost**, **Margin**, **Total with margin** (the grand total) and **Cost per m²** with the floor area it was based on. If the model has no slabs to give a floor area, the tile says "No slab floor area detected".
- **Cost by category**: a bar for each category, split into material, labour and margin. Hover over a part of a bar to see its amount.
- **Budget tracker**: type a **Target budget (NGN)** and click **Save budget**. The tracker then shows the estimate as a share of your target, and whether you are over or under budget and by how much.

Click **Open BoQ** to go back to the bill.

### The element page

Click an element from the bill or the data-issues box to open its page. It shows:

- The element's description, its kind (wall, slab and so on), its ArchiCAD element ID (GUID) and a link back to its bill item.
- **Quantities**: every quantity extracted for that element.
- **Cost breakdown**: **Unit rate**, **Material**, **Labour**, **Margin**, **Total**, and **Share of BoQ line**, which is this element's share of the line it belongs to.
- **Rate provenance**: the rate it was priced from, its **Source** (for example RateGen library or Custom rate), **Section** and **Match score**.
- **Labour provenance**: how the labour was worked out and, where there is one, the gang of trades with each trade's quantity per unit and unit price.

This page is useful when someone queries a single beam or wall: you can show exactly where its cost came from.

### Metric and imperial

Both the app and the web pages have a **Metric** and **Imperial** switch. Imperial shows lengths in feet, areas in square feet, volumes in cubic feet and cross-sections in inches. It changes the display only: what was measured and the money in naira stay exactly the same. On the web, the unit rate adjusts so that quantity × rate still equals the total.

Your choice is saved to your account, so the app and the website remember it.

## What's new in 1.0

QUIV for ArchiCAD 1.0 is the first release.

- A Windows app that works beside ArchiCAD 28 and reads quantities from the open model, with the same guided start as QUIV for Revit: building type, foundation type and Take off List.
- Eleven working take-off modules: oversite, strip footings, pad foundations, beams, columns, slabs, walls, roofs, curtain walls, doors and windows.
- **Use ArchiCAD Selection** to measure just what you selected, and highlighting of ticked elements in ArchiCAD when Tapir is installed.
- Missing quantities shown as a dash and counted as data issues, never as zero.
- **Update To Cloud** to price the bill on ADLM Cloud, with every send saved as a new version.
- The QUIV for ArchiCAD web pages (July 2026): priced bill with versions and changed-line highlighting, margins per line or for the whole bill, **Reapply rates**, Excel and PDF export, share links, a budget dashboard with a target budget, element pages, and metric or imperial display.
- Read-only learning sample projects on the web.

## Troubleshooting

### The badge says "ArchiCAD not connected"

Work through these in order:

1. **ArchiCAD is on its start screen.** This is the most common cause. Open your project properly so a plan window is showing.
2. **ArchiCAD was started after QUIV.** That is fine. QUIV keeps checking every few seconds. Wait a moment, or close and reopen QUIV.
3. **A dialog is open in ArchiCAD.** ArchiCAD cannot answer while it waits for you to close a dialog. Close it and try again.
4. **Two copies of ArchiCAD are running.** Close the one you are not using.

### Extract shows an error, or "No walls found in the model"

Check the ArchiCAD badge is green first. If it is, the model may simply have no elements of that kind. For footings, remember QUIV only finds elements classified as **Footing** in the ArchiCAD Classification. Set the classification in ArchiCAD and click **Extract** again.

### The Level list only shows "All Floors"

The storey list comes from the Tapir add-on. Install Tapir in ArchiCAD, restart ArchiCAD, then click **Extract** again.

### External wall areas look too small

Some external walls probably have no Position set, so they went to Internal walls and were flagged. Set **Position** to Exterior on those walls in ArchiCAD and extract again.

### Doors are in the wrong category

A door takes external or internal from its wall. Check the Position of the wall it sits in. Installing Tapir gives the most accurate match between doors and their walls.

### "Nothing is selected in ArchiCAD"

You clicked **Use ArchiCAD Selection** with nothing selected. Select the elements in ArchiCAD first, then click the button again.

### Save Takeoff is greyed out

No rows are ticked. Tick at least one element, or click **Extract** first if the list is empty.

### A module just says "COMING SOON"

That module does not measure from ArchiCAD models yet in version 1.0. Measure those items another way for now.

### Update To Cloud fails

Check your internet connection and that you are still signed in, then try again. If the message says your session has expired, sign out and sign in again. If it keeps failing, contact [Support](/support) with the message QUIV shows.

### Sign-in fails

Check your email and password on adlmstudio.net first. If they work there, the problem is usually your subscription or the computer your licence is tied to. Contact [Support](/support): the team can see why the sign-in was refused.

### Grand Total (Cloud) shows a dash

You have not sent this bill yet, or you reset it. Click **Update To Cloud**.

### The bill shows lines as Unpriced

No rate in the ADLM library or your Rate Gen library matched the line. Add a suitable rate in Rate Gen, then open the bill on the web and click **Reapply rates**.

### The web page says "No ArchiCAD projects yet", or "Connector not running"

You have not sent a bill from the app yet. Measure in the desktop app and click **Update To Cloud**; the project then appears on the web page. The "Connector running" or "Connector not running" badge on the web pages refers to a separate helper program, not to the QUIV for ArchiCAD app. If you use the app, you can ignore it.

### I closed the app and my take-offs are gone

Saved take-offs are kept only while the app is open. Anything you sent with **Update To Cloud** is safe on adlmstudio.net. Anything you did not send needs to be extracted again.

### I cannot change margins or the budget on a project

You are viewing an older version, a sample project, or a project someone shared with you as view-only. Switch back to the current version, or ask the project owner for full access.

## Frequently asked questions

### Does QUIV for ArchiCAD change my model?

No. It only reads from ArchiCAD. Nothing is ever written back to the model.

### Do I need the Tapir add-on?

QUIV measures without it, but Tapir is strongly recommended. It gives you the **Level** filter, highlights your ticked elements in ArchiCAD, and matches doors to their walls exactly.

### Which ArchiCAD versions does it work with?

QUIV for ArchiCAD has been tested on ArchiCAD 28. If you use a different version, contact [Support](/support) before you rely on it for a tender.

### Is there a Model Checker like in QUIV for Revit?

No. Problems in the model show up as data issues instead: a dash in the cell, a count on the module page and in the bill, and a list on the web.

### Where do the rates come from?

From the ADLM rate library and your own Rate Gen library, matched to each line by ADLM Cloud when you click **Update To Cloud**. See the [Rate Gen guide](/guides/rategen).

### What happens when the design changes?

Extract the affected modules again, click **Save Takeoff**, then **Update To Cloud**. A new version is saved, and lines whose quantities moved are highlighted orange on the web. Older versions stay available to view.

### Can my client see the bill without an ADLM account?

Yes. Create a share link on the bill page and send it to them. They can view it without signing in. Switch the link off when you are done.

### Can I export the bill to Excel?

Yes, from the bill page on adlmstudio.net. Click **Excel** (or **PDF**). In the desktop app, click **View in Browser** to get there.

### Can I use it on a Mac?

The desktop app runs on Windows only. The web pages work in any modern browser, including on a phone, so you can review, share and export the bill anywhere.

### Is my ArchiCAD work in QUIV for Revit or HERON too?

QUIV for ArchiCAD projects have their own page at [adlmstudio.net/archicad](/archicad). If you also measure in Revit, see the [QUIV for Revit guide](/guides/quiv).
