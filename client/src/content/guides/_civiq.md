---
id: civiq
title: CIVIQ for Civil 3D
tagline: Measure roads, drainage, earthworks and site clearance inside Civil 3D, price them from your rate library and send a bill to Excel.
version: "1.0.1"
updated: 2026-10-01
platform: Civil 3D 2024-2026 add-in (Windows), plus your CIVIQ projects on the ADLM website
productKeys: [civil3d]
order: 8
---

CIVIQ is ADLM Studio's quantity takeoff tool for civil and infrastructure work. It runs inside Autodesk Civil 3D and measures from the objects you already have in the drawing: alignments, profiles, TIN surfaces and closed boundaries. You plan the takeoffs for a job, measure each one, price the lines from your rates, and export a multi-sheet Excel bill. Takeoffs you save also go to your CIVIQ projects on the ADLM website, where you can open them from any computer.

It is written for quantity surveyors, estimators and engineers who price roads, drainage, earthworks and site clearance, and who would rather measure from the design than from hand-drawn cross-sections.

> **Important:** CIVIQ is not on general sale yet. The product page on the website shows it as "In development" with a waitlist, and it is not yet listed in the Installer Hub. This guide covers version 1.0.1, the build ADLM is preparing for early-access teams. If you do not have CIVIQ on your account, join the waitlist on the [CIVIQ product page](/product/civil3d) or [contact ADLM](/support).

## Before you start

### What you need

- A 64-bit Windows computer with **Autodesk Civil 3D 2024, 2025 or 2026** installed and licensed.
- An ADLM account with an active CIVIQ licence.
- An internet connection when you sign in, save to the cloud, or fetch rates.
- Optional: an **ADLM Rate Gen** subscription if you want to pull your own rates into CIVIQ. See [ADLM Rate Gen](/guides/rategen).

> **Note:** Inside Civil 3D the product appears as **ADLM Civil 3D QTO**, and its ribbon tab is called **ADLM QTO**. On the website and on your licence it is called CIVIQ. They are the same product.

### Your licence

CIVIQ is licensed per computer. When you sign in, the computer is registered against your licence, using the same device check as your other ADLM desktop products, so one machine counts as one device across them. If you change computers, ask ADLM to free the old one.

Measuring works on its own. Pulling rates from the cloud needs Rate Gen on the same account.

### Installing CIVIQ

CIVIQ installs as a standard Civil 3D plug-in. Civil 3D loads it automatically every time it starts, so there is nothing to switch on.

1. Close Civil 3D.
2. Install CIVIQ using the installer or link ADLM sends you for early access.
3. Start Civil 3D and open any drawing.
4. Look for the **ADLM QTO** tab on the ribbon. The command line also shows `[ADLM QTO] Ribbon loaded.`

> **Tip:** When CIVIQ joins the Installer Hub it will be listed as **CIVIQ: Civil3D TakeOff Software**, and updates will arrive there like your other products. See [ADLM Installer Hub](/guides/installer-hub).

### The ribbon

The **ADLM QTO** tab has two buttons:

| Button | What it does |
| --- | --- |
| **ADLM QTO** | Opens the CIVIQ dashboard. You sign in here the first time. |
| **Export to Excel** | Exports every takeoff you have saved for the open drawing straight to an Excel workbook, without opening the dashboard. |

You can also type `ADLM_QTO_OPEN` at the Civil 3D command line to open the dashboard.

### Signing in

1. Click **ADLM QTO** on the ribbon.
2. The **Sign in to ADLM Civil 3D QTO** window opens.
3. Type your email or username under **EMAIL OR USERNAME**.
4. Type your password under **PASSWORD**. Use the eye button to show it if you want to check it.
5. Click **Sign in**.

CIVIQ remembers you, so next time **ADLM QTO** goes straight to the dashboard. If your licence has been renewed in the meantime, CIVIQ refreshes it quietly in the background.

To sign out, click **Sign out** in the top bar of the dashboard. Your email address is shown beside it so you can see which account is in use.

## Finding your way around

The CIVIQ window has three parts.

- **The sidebar** on the left lists the work modules. Click **≡** to collapse or expand it.
- **The main page** in the middle shows the dashboard or the module you are working in.
- **The Progress tracker** on the right lists every planned takeoff for the drawing, grouped by work type, with a tick when it is done.

The top bar holds **Rate library**, a **Dark mode** / **Light mode** switch, your email address and **Sign out**.

### The modules

| Sidebar entry | What you measure | How |
| --- | --- | --- |
| **Dashboard** | Your plan for the drawing | Always available |
| **Drainage Bulk Excavation** | Trench excavation for drainage runs | Length × width × average depth, from an alignment or typed in |
| **Demolition & Clearance** | Vegetation, trees, buildings, other structures, pipelines | You enter the quantities |
| **Side Drains** | Excavation, concrete, formwork and reinforcement for side drains | You enter the quantities |
| **Road** | Earthworks, pavement and road furniture (22 items) | Calculated from the alignment, ground and formation levels |
| **Bridge Works** | Excavation, piles, caps, beams, deck, railings and more (20 items) | You enter the quantities |
| **Railways** | Ballast, sleepers, rails, turnouts, crossings and fixings | You enter the quantities |
| **Bulk Excavation** | Site or foundation excavation over a boundary | Grid method, from a surface or spot heights |
| **Database & Export** | Every saved takeoff for the drawing, with rates and totals | Always available |

> **Note:** A work module stays greyed out until you have planned at least one takeoff for it. Plan the work first on the dashboard, then the module opens. **Dashboard** and **Database & Export** are always available.

## Planning your takeoffs

CIVIQ works from a plan. Before you measure, you list the pieces of work the drawing needs: for example "Main carriageway 0+000 → 5+500", "Side drain left" or "Site clearance". Each planned item becomes one takeoff.

### On the dashboard

The dashboard greets you with **Welcome back** and shows the **Active drawing** name. Below it, under the work cards heading, there is one card for each work type.

1. On the card for the work type, click **+ Add**.
2. The **New planned takeoff** form opens.
3. Type a name in **Name (required)**, for example `Main carriageway 0+000 → 5+500`.
4. If you want, type a scope in **Scope (optional)**: a chainage range, phase, pier number and so on.
5. Click **Add**.

The item now appears on the card and in the Progress tracker, and the matching module in the sidebar becomes available. To remove a planned item, use the remove button beside it. To tick one off by hand, use **Mark complete**.

### From the Progress tracker

You can also plan from the right-hand panel.

1. Click **+ Add** at the top of the **Progress tracker** to add an item under any work type, or **+** beside a work type to add one under that type.
2. In **Add planned takeoff**, choose the **Category**, type a **Name** and, if you want, a **Scope (optional)**.
3. Click **Add**.

Your plan is saved with the drawing on this computer, so it is still there the next time you open the same drawing.

## Measuring a takeoff

Every module starts the same way.

1. Click the module in the sidebar.
2. On **Pick a planned takeoff**, click the item you want to measure. Items already saved show a tick; opening one again lets you edit it.
3. The page shows **Measuring:** with the item's name. To switch to another item, click **◂ Choose another takeoff**.

When you have finished, click **Save locally**. This saves the takeoff for the drawing, ticks the item in the Progress tracker and, if you are signed in, also sends it to your CIVIQ projects online in the background. When every planned item for a module is done, the module gets a tick in the sidebar.

> **Tip:** Rates and amounts are not entered on the measuring pages. As each page says, "rates + amounts live in the Database view". Measure first, price afterwards.

## Road

The Road module produces the full road bill: earthworks (RA items), pavement (RB items) and road furniture (RS items), 22 items in all. It reads the alignment, the existing ground and the formation level, and works out cut and fill with Simpson's rule at a chainage interval you choose.

### Step 1: pick the alignment

1. Click **Pick alignment (C3D)**.
2. Select the road's alignment in the drawing.

The **ALIGNMENT** box shows its name and station range. Straight away CIVIQ fills in every item that depends only on the road's length and width, such as pavement layers, markings, signs, kerbs and mile stones. The cut and fill items stay at zero until you give it ground and formation levels.

### Step 2: choose the existing ground

Under **OGL SOURCE**, choose where the original ground level comes from. The list shows existing-ground profiles on the alignment and TIN surfaces in the drawing.

- If you choose a TIN surface, CIVIQ samples it at the centre line of every station.
- To turn that surface into a proper profile on the alignment, click **↳ Attach as EG profile to alignment**. This does the same job as creating a surface profile in Civil 3D, without leaving CIVIQ.

If you have no survey surface yet, you can build an approximate one:

1. Click **⤓ Online terrain (DEM)**.
2. If the drawing has no geographic location set, first type the latitude and longitude of the start of the alignment in **anchor lat** and **lon**.
3. CIVIQ fetches free terrain data along the alignment and builds an existing-ground profile.

> **Important:** Online terrain is about 30 m resolution. It is fine for an early estimate, but always check it against a proper survey before you price for construction.

### Step 3: choose the formation level

Under **FORMATION PROFILE**, choose the engineer's design profile. If none is chosen, CIVIQ shows **⚠ missing**. You have two other options:

- Type a single level in **or flat FG (m)** for an early estimate before the design profile exists.
- Click **⚡ Best-fit FG** to create one straight grade through the existing ground so that cut and fill roughly balance. To raise or lower it, type a value in **auto FG bias** first: a positive number raises the road (more fill), a negative number lowers it (more cut). Clicking again updates the same profile.

### Step 4: check the inputs

Under **EARTHWORKS INPUTS** and **PAVEMENT & STRUCTURE INPUTS**, check the values. CIVIQ starts with these:

| Input | Starting value |
| --- | --- |
| **Chainage interval (m):** | 20 |
| **Road width (m):** | 7.3 |
| **Topsoil thickness (m):** | 0.15 |
| **Batter width (m):** | 1.5 |
| **Marking c/c (m):** | 12 |
| **Marking dash length (m):** | 4 |
| **Traffic sign spacing (m):** | 500 |

Once an alignment, a ground source and a formation level are set, CIVIQ recalculates on its own whenever you change the interval or the road width. You can also click **Generate sheet** at any time.

### Step 5: read the results

The three boxes at the top show **CUT VOLUME (SIMPSON)**, **FILL VOLUME (SIMPSON)** and **NET (FILL − CUT)** in cubic metres. In the road bill of quantities table you see each item with its **Code**, **Description**, **Quantity** and **Unit**, plus a short summary of full-cut and full-fill lengths, average cut and fill depths, markings, signs and mile stones.

The road items are:

| Group | Items |
| --- | --- |
| RA, earthworks | RA-01 Cutting Topsoil to RA-14 Geotextile (earthworks): topsoil and subsoil cut and disposal, preparation and trimming of cut and filled surfaces, filling to embankment and to stated depths, double handling, landscaping |
| RB, pavement | RB-01 Geotextile (pavement), RB-02 Subbase Course, RB-03 Base Course, RB-04 Surface Course, RB-05 Surface Marking, RB-06 Traffic Signs |
| RS, furniture | RS-01 Kerbs, RS-02 Culvert, RS-03 Mileage Stone |

To start again, click **Clear**. When you are happy, click **Save locally**.

### The Earth Balance Sheet

Click **View Earth Balance Sheet** to see the station-by-station working. For every chainage it shows **OGL (m)**, **Formation (m)**, **Balance (m)**, **Method**, **Plot / Shape**, **Strip Vol (m³)** and **Remark**, with the cut, fill and net totals at the top.

- Click **Export to Excel** to save it as its own workbook.
- Click **Save as PDF**, then choose **Microsoft Print to PDF** as the printer to save a PDF copy.

## Drainage Bulk Excavation

This module measures trench excavation for drainage. Each run adds length × width × average depth to the bulk excavation item D-01.

1. Open the module and pick your planned item.
2. Click **Pick alignment (C3D)** and select the drain's alignment. CIVIQ adds a run with its station range and length, and starts width and depth at 1.0 m.
3. Change **Width (m)** and **Avg Depth (m)** for that run.
4. To add a run by hand, click **Add run** and type the **Station Range**, **Length (m)**, **Width (m)** and **Avg Depth (m)**.
5. Click **Compute**. The page shows **RUNS**, **TOTAL LENGTH** and **TOTAL VOLUME**.
6. Click **Save locally**.

Click **Clear** to remove all runs.

## Bulk Excavation

This module measures site or foundation excavation over a closed boundary using the grid method. Corner points count once, edge points twice and interior points four times.

### Set up the grid

1. Click **Pick boundary (C3D)** and select a closed polyline around the excavation.
2. Check **Length (m):** and **Width (m):**, then set how many grid divisions you want in **Nx:** and **Ny:**. The page shows the cell size and area.
3. Type the **FORMATION LEVEL (m)**: the level you excavate down to.
4. Type the **Topsoil thickness (m):**.

### Fill the depths

You have three ways to fill **DEPTH AT EACH INTERSECTION (m)**:

- **From a surface:** under **OGL SOURCE (TIN surface)** choose the existing ground surface, then click **⚡ Auto-sample**. CIVIQ samples the surface at every grid point and works out the depth to formation level.
- **From spot heights in the drawing:** click **◉ Pick spot heights** and select AutoCAD points or Civil 3D COGO points placed at the grid intersections. Each point snaps to its nearest grid point; several points on one grid point are averaged. You do not need a boundary for this: CIVIQ can work out the grid from the points themselves.
- **By hand:** type a depth into any cell. Your edits stay even after an auto-sample.

If your points already carry depths, as on a surveyor's grid sheet, leave **Spot Z values are depths (skip formation-level subtraction)** ticked. Untick it if the points carry ground levels instead.

Click **Clear depths** to empty the grid.

### Read the results

The page shows **TOTAL AREA**, **AVERAGE DEPTH** and **EXCAVATION VOLUME**, and fills the bulk excavation bill of quantities: BE-01 Bulk Excavation, BE-02 Topsoil Stripping, BE-03 Disposal of Excavated Material, BE-04 Trimming of Excavated Surface and BE-05 Geotextile (earthworks). Click **Save locally** when you are done.

## Demolition, Side Drains, Bridge Works and Railways

These four modules give you the standard list of bill items for the work type, and you type the quantities you have measured.

1. Open the module and pick your planned item.
2. In the items table, type a **Quantity** against every item that applies. Leave the rest empty. Use **Notes** for anything the pricer should know.
3. Click **Compute**. **ITEMS WITH QUANTITY** and **PROGRESS** show how far through the list you are.
4. Click **Save locally**. The button only works once at least one row has a quantity.

| Module | Codes | Examples |
| --- | --- | --- |
| **Demolition & Clearance** | DM-01 to DM-05 | Clear Vegetation and Shrub, Felling Trees, Demolition and Clearance of Building, Pipelines |
| **Side Drains** | SD-01 to SD-12 | Topsoil Excavation, Concrete Blinding, Formwork to Wall, Base Reinforcement, Concrete Wall |
| **Bridge Works** | BR-01 to BR-20 | Driven In-situ Concrete Piles, Pile Caps (Complete), Bridge Bearing, Precast Concrete I-Beam, Railings |
| **Railways** | RW-A01 to RW-C03 | Bottom Ballast, Top Ballast, Sleepers, Rails, Turnout, Fish Plates |

## Pricing and exporting

### The rate library

Click **Rate library** in the top bar. The **Rate Library** window has two tabs:

- **Catalog rates**: the rates CIVIQ uses for every item code in every module. Type or change a **Rate** here and click **Save**.
- **Cloud Library (Rate Gen)**: a read-only copy of your rates on the ADLM website. Click **Refresh from ADLM Rate Gen** to bring it up to date. Use **Search** to filter by description, item number, section or unit.

### The Database & Export page

**Database & Export** collects every takeoff you have saved for the open drawing, grouped by work type. Each group shows its lines with **Code**, **Item**, **Station**, **Quantity**, **Unit**, **Rate** and **Amount**, a **Subtotal**, and at the bottom the **Lines:** count and **Grand total:**.

To price the lines:

1. Type a rate straight into the **Rate** column, or click **…** on a line to pick one from your Rate Gen library, then click **Apply rate**.
2. Or click **Refresh rates from cloud** to pull your latest Rate Gen rates and apply them to every matching line on the drawing.
3. Click **Save rates**.

> **Note:** **Refresh rates from cloud** and the **…** picker need a Rate Gen subscription on your account. Without one, CIVIQ tells you the cloud rates are unavailable, and you can still type rates by hand.

### Export the Excel bill

1. On **Database & Export**, type a name in **Project:** if you want one on the bill.
2. Tick the work types you want in the bill, or click **Select all**.
3. Click **Export Excel Bill**.

CIVIQ saves the workbook in your **Documents\ADLM QTO** folder and opens the folder for you. The workbook has a **Summary** sheet, one sheet for each work type, and a **Rates** sheet.

The **Export to Excel** button on the ribbon does the same without opening the dashboard. It exports every saved takeoff for the open drawing; if there are none, it exports every takeoff saved on this computer.

> **Tip:** The bill uses the Lexend font, like CIVIQ itself. If Lexend is not installed on the computer that opens the file, Excel uses its normal font instead. Nothing else changes.

### Save to the cloud

Click **Save to cloud** on **Database & Export** to upload the drawing's takeoffs as a CIVIQ project on the ADLM website. **Save locally** in each module already does this in the background when you are signed in, so this button is for when you want to be sure everything is uploaded, for example before you switch computers.

## Your CIVIQ projects online

Takeoffs saved to the cloud appear under **CIVIQ projects** on the website at [/projects/civil3d](/projects/civil3d). You need to be signed in with the account that holds your CIVIQ licence.

### Opening a cloud project on another computer

On the CIVIQ dashboard, **RECENT CLOUD PROJECTS** lists your latest cloud projects, even ones saved from another machine.

1. Open the drawing you want to work on.
2. Click **ADLM QTO** to open the dashboard.
3. Under **RECENT CLOUD PROJECTS**, click **Open** on the project. CIVIQ loads it onto the current drawing.

Click **Refresh** to update the list. **RECENT TAKEOFFS ON THIS DRAWING** shows what has been saved for the open drawing.

### What you can do on the website

Opening a CIVIQ project on the website gives you the same project workspace as the other ADLM products:

| Tab | What it is for |
| --- | --- |
| **Dashboard** | Overview and progress |
| **Bill of Quantity** | Rates and line items |
| **Budget** | Cost plan and procurement |
| **Valuation** | Certificates and settings |
| **Work area** | Model, bill, schedule and Ada together |
| **3D Model** | View and check the model |
| **PM Dashboard** | Schedule, earned value, risks and issues |

> **Note:** CIVIQ sends your quantities to the website, not a 3D model. The **3D Model** tab stays empty until a model is attached. It shows "No model attached yet" and points you to the **Bill of Quantity** tab, where you can upload a checked IFC file of the corridor.

### Viewing a road model

When a road corridor model is attached, the viewer opens on the first stretch of the road and looks along it, so you can read the pavement layers, kerbs and drains straight away instead of seeing the whole road as a thin grey line. Zoom out or orbit to see the rest of the corridor.

## Learning samples

Every CIVIQ subscriber can open four worked road jobs on the website. They are complete projects: bill, budget, a locked contract, valuation certificates, variations, a programme and a 3D corridor model, each measured chainage by chainage the way CIVIQ measures a road.

1. Go to [/projects/civil3d](/projects/civil3d).
2. Above your own projects, find **Learning samples**.
3. Click a sample card to open it. Each card shows the **Contract** sum, the number of **Lines**, the number of **Certificates** and a **3D model** flag.

The four samples are:

| Sample | Pavement | Location |
| --- | --- | --- |
| Estate Access Road - Asphalt Pavement | Flexible pavement (asphalt) | Akobo, Ibadan |
| Industrial Estate Road - Rigid Concrete Pavement | Rigid pavement (concrete) | Agbara Industrial Estate, Ogun |
| Housing Estate Street - Interlocking Paving Stones | Interlocking paving | Gwarinpa, Abuja |
| Rural Feeder Road - Laterite with Culverts | Laterite feeder road | Ikire-Apomu, Osun |

Samples are **Read-only**: you can open every tab, including rates, but you cannot change or save anything. Click **Hide samples** to fold the row away, and **Show 4 samples** to bring it back.

## What's new in 1.0.1

CIVIQ has not had a public release yet, so there are no published release notes. This is what is in the early-access build and on the website.

**CIVIQ 1.0.1 (early access)**

- Signing in recognises your computer the same way as your other ADLM desktop products, so one machine counts as one device across all of them.
- The **Bulk Excavation** module: grid-method excavation over a boundary, with depths from a surface, from spot heights or typed in.

**On the website (September 2026)**

- Four read-only **Learning samples** for CIVIQ: worked road jobs with a full bill, budget, valuations, programme and corridor model.
- Long road corridors now open in the 3D viewer on their first stretch, looking along the road, instead of as a thin line.

## Troubleshooting

### I cannot see the ADLM QTO tab in Civil 3D

CIVIQ loads when Civil 3D starts. Close Civil 3D completely and start it again, then open a drawing. Check that your Civil 3D is 2024, 2025 or 2026; older versions are not supported. If the tab is still missing, contact ADLM support.

### Sign-in says my email or password is incorrect

Check them by signing in on the ADLM website with the same details. If the website accepts them, try again in CIVIQ. Use the eye button to check the password as you type it.

### Sign-in says my account doesn't have access to ADLM Civil 3D QTO

Your account has no active CIVIQ licence, or it has expired. Check your licences on your [dashboard](/dashboard). CIVIQ is not on general sale yet, so if you expected access, contact ADLM.

### Sign-in says it can't reach ADLM servers or timed out

Check your internet connection and try again. Office firewalls sometimes block new programs; ask your IT team to allow Civil 3D to reach the internet.

### A module in the sidebar is greyed out

You have not planned any takeoffs for it yet. Add one from its card on the dashboard or from the Progress tracker, and the module opens.

### The Road page says "Pick an alignment first."

Click **Pick alignment (C3D)** and select the road's alignment before generating the sheet, attaching a profile or fetching online terrain.

### The cut and fill boxes stay at zero

CIVIQ needs both a ground level and a formation level. Choose an **OGL SOURCE**, then either choose a **FORMATION PROFILE**, type a level in **or flat FG (m)**, or click **⚡ Best-fit FG**. Until then only the items that depend on the road's length and width are filled.

### "⚠ missing" shows beside FORMATION PROFILE

No formation level is set. See the previous answer.

### Online terrain did not work

The drawing needs a geographic location, or you must type the start of the alignment in **anchor lat** and **lon** in decimal degrees. You also need an internet connection.

### Bulk Excavation says "No closed polyline selected."

The boundary must be a closed polyline. Close it in Civil 3D and pick it again. If you are working from spot heights, you can skip the boundary.

### Export says "No saved takeoffs to export."

Nothing has been saved yet. Open a module, measure, and click **Save locally** first.

### Export Excel Bill says "Select at least one category to export."

Tick at least one work type on **Database & Export**, or click **Select all**.

### Refresh rates from cloud says cloud rates are unavailable

Your account needs an active Rate Gen subscription for cloud rates. You can still type rates by hand in the **Rate** column or in **Rate library**.

### Save to cloud failed

Make sure you are signed in and online, then click **Save to cloud** again. Your takeoffs are always saved on this computer first, so nothing is lost.

### Save as PDF printed on paper instead

**Save as PDF** opens the Windows print window. Choose **Microsoft Print to PDF** as the printer, then pick where to save the file.

### The 3D Model tab on the website is empty

CIVIQ sends quantities, not a model. Upload a checked IFC of the corridor from the **Bill of Quantity** tab to see it in the viewer.

### I cannot edit a learning sample

Samples are read-only for everyone. They are there to show how a finished road job looks.

## Frequently asked questions

### What does CIVIQ measure?

Roads (earthworks, pavement layers, markings, signs, kerbs, culverts and mile stones), drainage trench excavation, bulk excavation over a boundary, and standard item lists for demolition and site clearance, side drains, bridge works and railways.

### Which Civil 3D versions does it work with?

Civil 3D 2024, 2025 and 2026 on 64-bit Windows.

### Do I need Rate Gen?

Not to measure. You need Rate Gen only if you want CIVIQ to pull your own rates from the cloud. You can always type rates yourself.

### Where are my takeoffs saved?

On your computer, against the drawing, as soon as you click **Save locally**. When you are signed in they are also sent to your CIVIQ projects on the website, so you can open them on another computer.

### Where does the Excel bill go?

To the **ADLM QTO** folder inside your **Documents** folder. Each export gets its own file with the date and time in the name, so nothing is overwritten.

### Can I use the online terrain for a tender?

It is best treated as an early estimate. The data is about 30 m resolution. Use a proper survey surface for construction pricing.

### Why does Civil 3D call it ADLM Civil 3D QTO and the website call it CIVIQ?

They are the same product. CIVIQ is the product name; the plug-in inside Civil 3D still uses its original name.

### When will CIVIQ be on general sale?

ADLM has not set a date. Join the waitlist on the [CIVIQ product page](/product/civil3d) and you will be told first. Prices shown there are indicative and may change before release.
