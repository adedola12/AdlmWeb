---
id: quiv
title: QUIV for Revit
tagline: Measure your Revit model item by item, review the quantities, and send the take-off to ADLM Cloud to price, plan and value.
version: "4.0.3"
updated: 2026-10-04
platform: Revit 2024-2027 add-in (Windows)
productKeys: [revit]
pdf: ADLM-QUIV-Revit-User-Guide.pdf
order: 3
---

QUIV is ADLM's quantity take-off add-in for Autodesk Revit. It reads quantities straight from your model: foundations, frame, walls, roof, doors, windows, finishes and external works. You add only what a quantity surveyor knows that the model does not, such as bar sizes, spacing and filling thicknesses. QUIV 4.0 measures; ADLM Cloud prices. You save your take-off to ADLM Cloud, and on adlmstudio.net you price the bill with your Rate Gen rates, plan the budget and value the work.

> **Note:** This guide covers **QUIV 4.0.3**. QUIV 4.0.0 is the version the Installer Hub gives customers today. Versions 4.0.1, 4.0.2 and 4.0.3 are being prepared, and each feature they add is marked "from 4.0.1", "from 4.0.2" or "from 4.0.3". Until the Hub offers them, those features are not on your PC yet.

## What's new in 4.0.3

QUIV 4.0 is a new QUIV, from sign-in to save. The measuring underneath is the QUIV you know. The latest builds add:

- **From 4.0.1: search on Review.** Type any words, such as "lintel 230 basement", to filter the bill lines.
- **From 4.0.1: click a line to see it in the model.** A Review line selects and zooms to the Revit elements behind it.
- **From 4.0.1: Add rates on ADLM Cloud.** One button on Review opens your project on the website, where it is priced.
- **From 4.0.1: tile skirting.** The floor finishes item now measures skirting in metres, net of door openings.
- **From 4.0.2: room finishes go to ADLM Cloud.** Each save sends the floor finish, floor area and skirting length of every Revit room.
- **From 4.0.3: aligned material constants.** POP ceiling boards, emulsion paint and pile cap soil poison now use the same figures as ADLM Cloud and HERON. See [Material constants](#material-constants).

See [Version history](#version-history) for everything that changed since QUIV 3.1.11.

## Before you start

### What you need

| Item | Requirement |
|---|---|
| Autodesk Revit | Revit 2024, 2025, 2026 or 2027, on a Windows PC |
| Your licence | An active QUIV subscription on your ADLM account |
| The Installer Hub | QUIV is installed and updated through the ADLM Installer Hub |
| Internet | Needed to sign in and to save to ADLM Cloud |
| Rate Gen (for pricing) | Needed to price the bill on ADLM Cloud with the ADLM rate library and your own rates |

### Install QUIV

Installing is covered in full in the [Installer Hub guide](/guides/installer-hub). The short version:

1. Close Revit. Windows will not let the Hub replace add-in files that Revit is holding open.
2. Open the ADLM Installer Hub and sign in with your ADLM account.
3. Find **QUIV for Revit** and click **Install**.
4. When asked, choose the year of Revit you use. If you use more than one year, install once for each.
5. Start Revit. QUIV loads when Revit starts, so a Revit that was already open will not see it until you restart it.

When the Hub offers an update, close Revit, update, then open Revit again.

> **Note:** Your licence is tied to the computer you sign in from. If you change computers, contact ADLM support from [/support](/support) rather than buying again.

### Open QUIV and sign in

QUIV adds a **QUIV** tab to the Revit ribbon. Its **ADLM** panel has two buttons:

| Button | What it does |
|---|---|
| **QUIV** | Opens the QUIV panel beside your model. Asks you to sign in the first time. |
| **Model Checker** | Opens the ADLM Model Checker, which tells you whether the model is ready to measure. See [The Model Checker](#the-model-checker). |

![The QUIV tab on the Revit ribbon, with the QUIV button that opens the panel.](shot:quiv-ribbon-launch.png)

1. Open the model you want to measure.
2. On the **QUIV** tab, click **QUIV**.
3. The panel opens with the sign-in card. Enter your **Email** and **Password**. These are the same details you use on adlmstudio.net.
4. Click **Log in**. The button reads **Signing in…** while it works.

After a good sign-in the card shows "Preparing your projects…" while QUIV builds your panel. QUIV remembers your email and your session, so you normally sign in once on each computer.

![The QUIV start card, shown while QUIV prepares your projects.](shot:quiv-splash.png)

On the sign-in card, **Forgot password?** opens the website so you can reset your password, and **Create account** opens adlmstudio.net to make an account.

> **Important:** If QUIV says "This account has no active QUIV licence. Renew or buy one on adlmstudio.net.", your subscription has expired or does not include QUIV. Renew it on adlmstudio.net, then click **QUIV** again.

## Finding your way around

QUIV 4.0 is one panel, docked inside Revit, that walks you through a take-off in order: open the model, make the take-off list, measure item by item, review, and save to ADLM Cloud.

### The header

The header shows where you are: the screen name and, under it, the project and progress (for example "8 of 12 items · BESMM4R"). A thin bar under the header fills as items are completed. On the right are four small buttons. Hover over one to see its name:

| Button (tooltip) | What it does |
|---|---|
| **Dark mode** / **Light mode** | Switches the panel between light and dark. Not shown in Revit 2024. |
| **Full screen** / **Dock as a panel** | Expands QUIV to full screen, with the take-off list on the left and the open item on the right. Click again to go back to the docked panel. |
| **Minimise** | Folds QUIV down to its title bar so you can see the whole Revit view. |
| **Close** | Closes the panel. Your work is kept. |

On inner screens, a **Back** arrow at the top left takes you one step back.

![QUIV minimised to its title bar, leaving the Revit view clear.](shot:quiv-minimised.jpg)

### The status bar

The line along the bottom tells you whether QUIV is online:

- **Connected · your name** means QUIV can reach ADLM Cloud.
- **Offline · your work stays on this PC** means the internet is down. You can keep measuring; your work is kept on this computer. Save to ADLM Cloud once you are back online.

**Sign out** is at the right of the status bar.

Short messages appear at the bottom of the panel and fade after a few seconds. Some carry a button, such as **Undo**.

## Home

Home is where QUIV opens after sign-in. It greets you and shows three things.

![The QUIV home panel: the model open in Revit, Continue take-off, recent projects and Open ADLM Cloud.](shot:quiv-home-panel.png)

- **Open in Revit** names the model you have open. If that model already belongs to a project, it reads "Linked to" the project name and how much is measured, with **Continue take-off**. If not, it reads "Not linked to a project yet." with **Start a take-off for this model**.
- **Recent projects** lists the projects you have saved to ADLM Cloud, with the number of lines and when each was last saved. Click one to open it. **New project** starts another take-off for the open model.
- **Open ADLM Cloud** ("Price, plan and value these projects on the web") opens your QUIV projects on adlmstudio.net.

Projects open on any computer where you sign in with the same account.

## Starting a new project

1. On Home, click **Start a take-off for this model** or **New project**.
2. Type a **Project name**. QUIV will not go on without one ("Give the project a name.").
3. Type the **Client** if you want to. It is optional.
4. Under **Building**, choose **Bungalow** ("One storey") or **Multi-storey** ("Frame, slabs, stairs").
5. Under **Foundation**, tick one or more of **Strip**, **Pad**, **Pile** and **Raft**, or none. A building on pads with a piled core is one take-off, so tick both. An extension with no new foundation can have none.
6. Under **How to start**, choose **Item by item** ("You select, QUIV measures") or **Auto take-off** ("AI measures, you review"). See [Auto take-off](#auto-take-off).
7. Choose the **Standard**: **BESMM4R**, **NRM2**, **SMM7** or **POMI**.
8. Read the line "The take-off list will have…", which names every item the list will contain.
9. Click **Generate take-off list**.

QUIV shows "Generating the take-off list", then opens your take-off list. If you chose **Auto take-off**, the run starts straight away.

![QUIV generating the take-off list.](shot:quiv-generating-list.png)

> **Note:** The standard is recorded with the take-off. Bill descriptions are not yet worded differently for each standard.

## The take-off list

The take-off list is your plan for the job. Items are grouped the way a bill is written:

| Group | Items |
|---|---|
| **Foundation** | **Oversite**, **Strip foundation**, **Pad foundation**, **Pile cap**, **Raft foundation** |
| **Frames** | **Columns**, **Beams**, **Suspended slab**, **Steelwork** |
| **Architectural** | **Walls**, **Roof**, **Ceilings**, **Curtain wall**, **Doors**, **Windows**, **Staircase**, **Floor finishes** |
| **External works** | **Railings**, **Landscaping**, **Model items** |

Only the items for your building and foundations appear. Each group shows how many of its items are done, for example "2 of 3". Each item has a dot: empty when not started, a blue ring when part measured, and green with a tick when complete. A measured item shows its main quantity.

- **Click an item** to measure it.
- **Remove from the list** (the cross on an item) takes off an item the job does not need, such as the frame on a substructure-only job. Click **Undo** in the message to bring it back. An item with saved lines cannot be removed.
- **Auto take-off** lets QUIV measure the items for you.
- **Review and save** opens Review.

> **Tip:** Work down the list from top to bottom. It is the order a bill is written in, so your bill comes out in bill order.

> **Note:** QUIV reads the model when you measure, not all the time. If the model changes after you measured an item, open the item again and measure it again. QUIV 4.0.3 does not warn you when the model changes.

## Measuring an item

Every item screen works the same way, in three numbered steps with the results underneath.

![An item before measuring: step 1 asks you to select the elements in Revit.](shot:quiv-item-select.png)

1. **Select in Revit.** The step names what to pick, for example "Select the suspended floors in Revit". Only that kind of element can be picked; anything else is ignored. Where the item measures by level and type, choose the **Level** and **Type** here instead, and QUIV measures them.
2. Click **Select in Revit**, click the elements in the Revit view, then click **Finish** on the Revit options bar. QUIV shows "Reading the model…" and then how many elements it measured.
3. **From the model** shows what QUIV read from Revit, with no typing: areas, lengths, volumes and counts. You cannot type over these. To change them, change the model and measure again.
4. **Your inputs** ("What only the QS knows") holds thicknesses, depths, bar sizes, numbers of bars, spacing and switches. Change a value and the results update when you leave the field. "0,15" and "0.15" both mean 0.15.
5. **Results** shows the quantities that will go into the bill.

![A measured item: the selection, the quantities read from the model, your inputs and the results.](shot:quiv-item-measured.png)

To pick again, click **Change selection**.

### Material breakdown and mix ratio

Click **Material breakdown** under the results to see the materials behind them, such as cement in bags, sharp sand and granite in tonnes, blocks and bars. Concrete items show a **Mix ratio** you can edit, for example 1:2:4. Click **Hide materials** to fold it away.

![The material breakdown for an item, with the editable mix ratio.](shot:quiv-material-breakdown.png)

### Mark complete

1. Check the selection, inputs and results.
2. Click **Mark complete**. QUIV saves the item's lines to the take-off and ticks it on the list.
3. The button now reads **Completed · next item**. Click it to go to the next item, or **Previous** to go back.

When every item is done, the button reads **Review and save**.

![A completed item, ready to move on with Completed · next item.](shot:quiv-item-complete.png)

If you save a level and type you have already saved, QUIV asks whether to replace the previous figures or add to them. Choose replace when you are correcting a measurement, and add when you are measuring another part of the same thing.

If the save did not complete, QUIV says "Not saved yet". Check the selection and inputs, then mark it complete again.

### What each item measures

| Item | What it measures |
|---|---|
| **Oversite** | Hardcore and laterite filling (leaving out the walls standing on the slab), BRC mesh, DPM, formwork to edges, oversite concrete and blinding |
| **Strip foundation** | Excavation, earthwork support, concrete in footing, blockwork in foundation, blinding, surface treatment, levelling and compacting, damp-proof course, backfill and disposal |
| **Pad foundation** | Excavation, earthwork support, concrete in pads, formwork, blinding and bars |
| **Pile cap** | Excavation, concrete in pile caps and piles, formwork, blinding, bars and surface treatment |
| **Raft foundation** | Excavation, concrete in slab and beams, hardcore, laterite, DPM, beam formwork and reinforcement |
| **Columns** | Concrete in columns, formwork, main bars and links |
| **Beams** | Concrete in beams, formwork, top and bottom bars and links |
| **Suspended slab** | Concrete in slab, formwork to soffit and edges, and reinforcement |
| **Steelwork** | Structural steel by weight and surface area |
| **Walls** | Blockwork net of openings, rendering, lintel concrete, formwork and reinforcement |
| **Roof** | Roof members such as rafters, purlins, tie beams, king posts, struts, wall plate, fascia and ridge |
| **Ceilings** | Ceiling area, noggings and POP boards |
| **Curtain wall** | Curtain walling area with its mullions, panels and fixings |
| **Doors** / **Windows** | Doors and windows by type, with area and perimeter |
| **Staircase** | Concrete in stairs, formwork and reinforcement |
| **Floor finishes** | Wall paint, floor tiling, ceilings, paint in litres, tile packs and tile skirting |
| **Railings** | Railings and balustrades in metres, by level and type |
| **Landscaping** | Paving, turf, fencing and other external works |
| **Model items** | Anything modelled that does not fit an item above |

Steel beams and columns are measured under **Steelwork** only, not as concrete beams or columns.

## Tile skirting

From 4.0.1, the **Floor finishes** item measures tile skirting, in metres.

1. Open **Floor finishes** and select the finished floors in Revit.
2. Read **Skirting** (m) under **Results**, beside **Floor tiling** and **Tile packs**.

How it is measured:

- For each tiled floor, QUIV takes the perimeter of every Revit room standing on it, less the width of each door into that room. A door between two tiled rooms comes off both rooms.
- If no rooms are modelled, QUIV uses the floor's own edge, less the doors on it.
- Each room counts once.

Skirting goes on the bill as its own line, "Skirtings, 100mm high", in metres under M40 Skirtings in the floor finishes. It is never added to the tiling area.

> **Tip:** Skirting is most accurate when the model has Revit rooms. Place rooms before you measure finishes.

## Room finishes sent to ADLM Cloud

From 4.0.2, every save to ADLM Cloud also sends a room-by-room record of the finishes QUIV measured. For each Revit room standing on a measured floor, it records:

- the room name, number and level
- the floor finish
- the floor area, in m²
- the skirting length, in metres

A room on two floors is one record, and re-saving keeps rooms measured earlier. Wall finish areas per room are not included yet. The records let ADLM Cloud answer room questions, such as "floor area and skirting for the toilets". Your bill lines are not changed by them.

> **Note:** For the room records to be useful, give your Revit rooms clear names, such as "Toilet 1" or "Master bedroom".

## Auto take-off

Instead of measuring each item yourself, you can let QUIV measure them. In QUIV 3 this was **✦ Run the whole takeoff**. In QUIV 4.0 it is **Auto take-off**.

QUIV goes through the model level by level and type by type with the same measuring engines you use by hand, and puts every level and every type on its own bill line. Nothing it measures counts until you accept it.

### Run it

1. On the take-off list, click **Auto take-off** (in full screen, **Auto take-off with AI**). Or choose **Auto take-off** under **How to start** when you make a new project; the run then starts straight away over every item it can reach.
2. In **Auto take-off with AI**, tick the items to measure. Items that start with a pick in Revit say "You pick this in Revit" and cannot be ticked; measure those yourself.
3. Click **Run auto take-off**, or **Cancel**.

![The Auto take-off with AI window, where you tick the items to measure.](shot:quiv-auto-take-off.png)

While it runs, a card shows the item and level, measurements saved, a clock and a time estimate. Revit stays usable.

![QUIV measuring items, showing the item it is on and how many are left.](shot:quiv-ai-measuring.png)

To stop, click **Stop**. QUIV finishes the measurement in progress, then stops. What is saved is kept.

### Review and accept the results

When the run ends, QUIV says how many items it measured, how many look right and how many need a closer look. Each measured item shows a confidence figure, and a bar at the top of the list reads, for example, "4 AI results to review".

- **Accept 2** (the number changes) accepts every result at 85% confidence or more in one click.
- For the others, open the item. It reads "Measured by AI" with its confidence and a note, such as which levels did not save. Check the selection and inputs, then click **Accept and complete**.

![An item measured by auto take-off at lower confidence, with its note and Accept and complete.](shot:quiv-ai-item-review.png)

> **Important:** The confidence figure is not a guess. It is the share of an item's planned measurements that saved without failing. A low figure means some levels did not save; check those levels.

You cannot save to ADLM Cloud while results are waiting. QUIV says "Accept the AI results first".

> **Note:** Auto take-off runs are limited per day on each account. QUIV tells you when you are close to the limit. Measuring item by item is never limited.

## Review and save to ADLM Cloud

Click **Review and save** on the take-off list. Review shows your take-off as bill lines before it goes to ADLM Cloud.

![The Review screen: items measured, items still to do, the bill lines and Save changes to ADLM Cloud.](shot:quiv-review.png)

- Three figures at the top: **measured**, **still to do** and **bill lines**.
- If items are not measured yet, a note names them. You can save now and finish later; the project updates on ADLM Cloud each time. When all are done it says "Every item is measured."
- **Click a bill line** (from 4.0.1) to select and zoom to its elements in the Revit model. A line with nothing behind it, or from a model that is not open, says so.

### Search the quantities

From 4.0.1, a search box sits above the bill lines: "Search quantities: item, level, type or size".

1. Type one or more words, for example `lintel 230 basement`.
2. Every word must appear in the line (item, level, type, size, quantity or unit), in any order.
3. QUIV shows how many lines match, for example "6 of 120 lines". If nothing matches, it says "No line matches. Try fewer words."
4. Click the cross to clear the search.

You can still click a found line to see it in the model.

### Save to ADLM Cloud

1. On Review, click **Save to ADLM Cloud**. For a project already on ADLM Cloud, the button reads **Save changes to ADLM Cloud**.
2. Answer any question QUIV asks, for example whether to replace or add to lines you measured before.
3. QUIV shows "Saved to ADLM Cloud" with the project name.

Each save updates the same project. QUIV will not save when nothing is measured, while auto take-off results are waiting, or offline ("You are offline"); your measurements stay on this PC until you reconnect.

### Add rates on ADLM Cloud

QUIV 4.0 measures; rates and the budget are added on ADLM Cloud. From 4.0.1, **Add rates on ADLM Cloud** on Review opens this project's page on adlmstudio.net. Save the take-off first; otherwise QUIV says "Save to ADLM Cloud first".

## Pricing with Rate Gen

Prices and rates come from the ADLM rate library, which is part of Rate Gen. Rates are built only in ADLM Rate Gen. On ADLM Cloud you pick a Rate Gen rate onto a bill line, or type a price on a project bill line; you cannot build or edit a rate on the website. See the [Rate Gen guide](/guides/rategen) for building rates and the [ADLM Cloud guide](/guides/cloud) for pricing a bill.

### The Rate Gen licence rule

A Rate Gen licence is what prices the bill. QUIV checks your licence once after you sign in.

- **With Rate Gen:** nothing extra appears. When you save, QUIV says your project "is on the web, ready to price in RateGen". On ADLM Cloud, prices from your Rate Gen library are added to the QUIV budget when you save, and you pick Rate Gen rates onto bill lines. A price you typed on the web is never overwritten.
- **Without Rate Gen:** your bill is quantities only. Review shows a card, **Price this bill with RateGen**: "This bill is quantities only. Prices and rates come from the ADLM rate library, which is part of RateGen. With a RateGen licence you can price it and add your own rates." The save message says pricing it needs Rate Gen.

On the card, **Get RateGen** opens Rate Gen pricing on adlmstudio.net, and **I have RateGen** checks your licence again after you buy. If it says "No RateGen licence yet", wait a minute and try again.

If QUIV cannot reach ADLM to check (for example, offline), it does not show the card and does not block anything. If a Rate Gen pricing request fails for a licensed account, QUIV says "RateGen did not answer" rather than showing a silent zero.

> **Tip:** You can measure and save a full take-off without Rate Gen. Your quantities are safe on ADLM Cloud, ready to price when you get a licence.

## Linked models

Many jobs come as an architectural model with the structural engineer's model linked into it. QUIV measures the beams, columns and slabs inside a linked structural model.

- **Levels are matched for you,** by name where the two models agree and by height where they do not. So "00 - GROUND FLOOR" in the engineer's file is recognised as your "Ground floor level". Each linked element is measured on exactly one level.
- **Load the link.** QUIV can only measure a link that is loaded in Revit. If an item comes back empty when you know it is modelled, check the link is loaded in Manage Links.

> **Important:** If the same linked file is placed in your model more than once (copied, mirrored, or linked again when it looked missing), its elements can be measured once for each placement, which doubles the quantities. Open Manage Links in Revit and remove the link instances you do not need before you measure.

## Material constants

QUIV turns measured quantities into materials with a set of material constants: waste factors, coverages and conversions. From 4.0.3, the constants below match ADLM Cloud and HERON, so the same model gives the same materials in every ADLM product.

| Constant | Value in 4.0.3 | What it means |
|---|---|---|
| **POP board factor** | 1.44 m² per board | A 1.2 m x 1.2 m POP ceiling board. Boards = ceiling area x 1.3 ÷ 1.44, rounded up. Was 4.32. |
| **Emulsion paint (20L drum)** | 0.026 drums per m² | 0.52 litres per m², so 100 m² needs 52 litres (2.6 drums). Used by the floor finishes item, the material schedule and model items alike. |
| **Soil poison coverage** | 20 m² per unit | Also used for the pile cap surface treatment. 10 m² now needs 1 unit, not 56 as before. |
| **Blockwork waste factor** | 1.03 | Added to blockwork. |
| **Tiles per area** | 1.10 m² per m² | Tile waste on floor tiling. |
| **Reinforcement weight** | d² ÷ 162 kg per metre | Bar weight from its diameter in mm. |
| **Beam main bars: laps and waste** | 1.15 | Added to beam main bars. |
| **Staircase bars: laps and waste** | 1.10 | Added to staircase bars. |

The old "Paint coverage" setting (10 m² per litre) is retired, because it priced paint about five times lower than real bills do.

### Your own values are kept

QUIV keeps your constants in a file on your PC. When you update:

- A constant still at the old default moves to the new value.
- A constant you changed yourself stays as you set it. If you had edited the old paint coverage, it is converted to drums per m².

> **Note:** The QUIV 4.0 panel has no button that opens the full constants library. QUIV uses the values saved on your PC, or the defaults above. You can change an item's **Mix ratio** in its **Material breakdown**.

## The Model Checker

Before you measure, the Model Checker tells you whether the model can be measured: what is there, what is missing, what overlaps, and whether reinforcement has been modelled.

### Run a check

1. Sign in through the **QUIV** button first. Otherwise the checker says "Please sign in via the QUIV button first."
2. Open the model you want to check.
3. On the **QUIV** tab, click **Model Checker**. The **ADLM Model Checker** window opens.
4. Under **Select Model Type**, choose **Architectural Model** or **Structural Model**.
5. Under **Check Options**, tick the checks you want.
6. Click **Run Model Check**.

| Option | What it looks for |
|---|---|
| **Check for Overlapping Elements** | Duplicated elements sitting on top of each other. Duplicates are the usual reason a quantity comes out double. |
| **Check Inter-Model Clashes** | Clashes between your model and the models linked into it. |
| **Check Reinforcement (InDesign Rebar)** | Structural models only. Shows which categories carry modelled rebar and which do not. |

### Read the results

The results screen shows four figures: **Readiness Score**, **Elements Found**, **Issues Found** and **Element Categories**. Below them:

- **Element Categories** lists what was found. A missing category has to be modelled first.
- **Reinforcement Analysis** (structural models) shows which categories have modelled rebar. Where there is none, you enter bars yourself when you measure.
- **Issues** lists each problem. Click a row to highlight that element in Revit.

| Button | What it does |
|---|---|
| **Export Excel** | Saves the whole check to a spreadsheet. |
| **View QS Query** | Opens a **QS Query Report**: the questions to send the design team about missing or unclear parts of the model. |
| **Generate QR Code** | Saves the report to the ADLM website with a QR code anyone can scan to read it. |
| **Proceed to Takeoff** | Records your take-off decision in the QS query and closes the checker. |
| **Back to Setup** | Returns to the options to run another check. |

> **Important:** A report published with **Generate QR Code** can be read by anyone who has the link or the code. Check the project name and the category list before you share it.

## AI in QUIV

This section sums up the AI features you can use from QUIV 4.0. For how ADLM AI works, what it never does on its own, and the allowances, see [ADLM AI services](/guides/ai-services).

| Feature | Where | Availability |
|---|---|---|
| **Auto take-off** | Take-off list, or **How to start** on a new project | On for everyone signed in. Runs are limited per day. |
| **Ada** and the AI cost checks | ADLM Cloud, on the project you saved | See [ADLM AI services](/guides/ai-services) |
| **AI Rate Check**, **AI Match Labour**, **AI Match Materials** | Not in the QUIV 4.0 panel | These lived on QUIV 3's Bill and Budget, which QUIV 4.0 replaced with pricing on ADLM Cloud. |
| **QUIV AI Assistant**, the AI prompt bar and **AI Assist** | Not in standard installs | Set up by ADLM only |

### Auto take-off

Auto take-off is labelled "AI" on screen, but a run **uses no AI model**. It drives QUIV's own measuring engines over every level and type, and every result waits for you to accept it. See [Auto take-off](#auto-take-off). It is rationed per day because a run walks every item over every level.

### Ada on ADLM Cloud

Once your take-off is saved, Ada, the assistant on the website, can answer questions about your project, and the AI cost checks compare your rates with the market. From 4.0.2, the room finishes QUIV sends are there for room questions. Nothing changes in your bill without your confirmation.

## ADLM Cloud: your project on the website

Go to [/projects/revit](/projects/revit) after signing in on adlmstudio.net, or click **Open ADLM Cloud** on QUIV's Home. Every project you saved from QUIV is listed there. Open a project to price the bill, plan the budget, value the work and export it.

### Learning samples

At the top of the QUIV projects page you may see **Learning samples**: fully worked projects, each measured from its own 3D model. Click **Show** and the number of samples, then open one to see every tab filled in on a realistic job. Samples are read-only.

### Exports on the website

Exports are made on ADLM Cloud. On an open project, click **Export**. The groups are **Bill & Budget**, **Generic BoQ**, **Elemental BoQ** (by building element), **Trade BoQ** (by work section) and **Milestone BoQ** (one priceable bill per construction stage).

From the ICMS 3 release on ADLM Cloud, the **Export** menu also has an **ICMS 3** group, "international cost and carbon report":

- **ICMS 3 cost and carbon (Excel)**: cost and upfront carbon (A1-A5) by ICMS 3 Group, with every line's code and carbon source, and the lines not yet placed.
- **ICMS 3 cost and carbon (JSON)**: the same report as data, conforming to the RICS Data Standard 3.3.3.

The report total equals the contract total: preliminaries go in Group 08, contingency in 09.020 and VAT in 10.020. Carbon per line comes from your Rate Gen rates, so price the bill with Rate Gen rates first. Cost and carbon per m² appear when an IPMS 1 or 2 floor area is given. It works on the learning samples too.

See the [ADLM Cloud guide](/guides/cloud) for the rest of the website.

## Version history

### 4.0.3 (October 2026, being prepared)

- POP ceiling boards use 1.44 m² per board in every QUIV tool, matching ADLM Cloud.
- One paint basis everywhere: 0.026 drums per m² (0.52 L/m²). The old 10 m² per litre paint coverage is retired.
- Pile cap surface treatment uses the soil poison coverage, 20 m² per unit.
- Values you edited yourself are kept through the update.

### 4.0.2 (October 2026, being prepared)

- Room-by-room finishes (floor finish, floor area and skirting per Revit room) go to ADLM Cloud with each save.

### 4.0.1 (October 2026, being prepared)

- Search on Review.
- Click a Review line to see its elements in the model.
- **Add rates on ADLM Cloud** on Review.
- Tile skirting in metres on **Floor finishes**.
- Curtain walling reopened from ADLM Cloud keeps its mullion, panel and fixing lines.
- A fence wall modelled from ground level bills its blockwork below ground.

### 4.0.0 (September 2026)

A new QUIV, from sign-in to save:

- Sign-in inside the panel, Home, a one-screen new project, a take-off list you can trim, and one screen per item.
- **Auto take-off** replaces **✦ Run the whole takeoff**, with confidence on every result.
- Review and **Save to ADLM Cloud**. Pricing, the budget and exports move to ADLM Cloud, so QUIV 3's Bill, Budget and Revit exports are gone. Pricing follows your Rate Gen licence.
- Light and dark, full screen and minimise.
- A full check of every item's quantities. For example, strip backfill is now excavation less footing concrete, blinding and blockwork; oversite filling leaves out the walls standing on the slab; and laps and waste on beam and staircase bars are material constants (1.15 and 1.10).

### Since 3.1.11

QUIV 3.1.11 was the last QUIV 3 release (<kbd>Esc</kbd> closes pop-ups; pop-ups fit a narrow panel). 4.0.0 includes its fixes, and the 3.1.9 features (linked models, a line per level and type) carry on.

## Troubleshooting

### There is no QUIV tab in Revit

QUIV is not loaded. Close Revit, open the Installer Hub, and install or reinstall **QUIV for Revit**, choosing the year of Revit you use. Then start Revit again. Add-ins load only when Revit starts.

### "That email and password do not match."

Check your email and password and try again. Use the same details as on adlmstudio.net. If you have forgotten your password, click **Forgot password?**.

### My computer changed and now I cannot sign in

Your licence is tied to the computer you first used. Contact ADLM support from [/support](/support) to move it.

### Nothing appears in the Type list, or Select in Revit picks nothing

Nothing of that kind is modelled on the level you chose. Check the level first; this is nearly always the cause. Only the kind of element the step names can be picked. If the elements are in a linked model, make sure the link is loaded.

### A quantity looks double

1. **Duplicated elements.** Run the Model Checker with **Check for Overlapping Elements** ticked, then click the issue rows to find the duplicates in Revit.
2. **A link placed twice.** Open Manage Links in Revit and remove link instances you do not need. See [Linked models](#linked-models).

### The reinforcement comes out as zero

The rebar is not modelled, which is normal. Enter the bar sizes, numbers and spacing under **Your inputs**.

### I changed the model but the quantities did not change

QUIV reads the model when you measure. Open the item, select again, and mark it complete. When asked, choose to replace the previous figures. Then save to ADLM Cloud again.

### Auto take-off says "You pick this in Revit"

That item starts with a pick in Revit, so auto take-off cannot reach it. Open it and select the elements yourself.

### "Accept the AI results first"

Auto take-off results are waiting. Click **Accept** for the sure ones on the list, or open each item and click **Accept and complete**. Then save.

### I cannot find the Bill, the Budget or Export in QUIV

QUIV 4.0 measures, and ADLM Cloud prices. Save on Review, then click **Add rates on ADLM Cloud** to price, plan and export on the website.

### My bill has no prices

Prices are added on ADLM Cloud, from Rate Gen. Without a Rate Gen licence the bill stays quantities only; see [The Rate Gen licence rule](#the-rate-gen-licence-rule). If you have just bought Rate Gen, click **I have RateGen** on Review.

### There is no dark mode button

You are using Revit 2024, where QUIV stays in light mode.

### Support asks for my log file

QUIV writes a diagnostic log to `%APPDATA%\ADLM\adlm.log`. Paste that address into the Windows File Explorer address bar to find it, and attach the file to your support ticket.

## Frequently asked questions

### Do I need Rate Gen to use QUIV?

No. QUIV measures and saves without it. You need Rate Gen to price the bill with the ADLM rate library and your own rates on ADLM Cloud.

### Can I still price inside Revit?

No. In QUIV 4.0, pricing, the budget and exports are on ADLM Cloud. Rates are built in ADLM Rate Gen.

### Can I measure a structural model linked into my architectural model?

Yes, for beams, columns and slabs. Make sure the link is loaded. See [Linked models](#linked-models).

### Why did my POP boards or paint change after the update?

From 4.0.3, QUIV uses the same constants as ADLM Cloud and HERON: 1.44 m² per POP board and 0.52 litres of paint per m². Constants you edited yourself are kept. See [Material constants](#material-constants).

### Which versions of Revit does QUIV work with?

Revit 2024 to 2027. The Installer Hub asks which year you use and installs the matching version.

### Where can I get help?

Raise a ticket or chat with ADLM from [/support](/support). With a take-off problem, send the project name, the item, the level and type you chose, the number QUIV gave and the number you expected, and a screenshot of the item screen.
