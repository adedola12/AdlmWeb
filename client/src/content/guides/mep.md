---
id: mep
title: SERVIQ for Revit MEP
tagline: Measure ductwork, pipework, cable, fixtures and equipment straight from your Revit model, price them, and send the take-off to ADLM Cloud.
version: "2.0.0"
updated: 2026-10-04
platform: Revit 2024-2027 add-in (Windows)
productKeys: [mep]
pdf: ADLM-Revit-MEP-User-Guide.pdf
order: 7
---

SERVIQ is ADLM's Revit add-in for measuring the services in a building: ductwork, pipework, cable and containment, and every terminal, fixture and piece of equipment on them. It reads the quantities from the Revit model you have open, so you do not count symbols on a drawing. It is for services quantity surveyors, main-contract QSs pricing an M&E package, and services engineers who want a quick quantity check. You get a measured take-off, a priced bill with overhead and profit, a material schedule, an Excel workbook, and a project on your ADLM Cloud account that you can price, value and report on the web.

This guide covers **SERVIQ 2.0** (ServiQ 2.0.0), the new version built on the same design as QUIV 4.0. In Revit it adds a tab called **SERVIQ** with one **ServiQ** button. In the Installer Hub the product is listed as the **Revit MEP Plugin**. It is the same subscription as the old ADLM Revit MEP Suite.

> **Note:** SERVIQ 2.0 is rolling out to every customer at once from 3 October 2026, through the Installer Hub. If your Hub still shows version 1.8.3 and no update, 2.0 has not reached your account yet: click **Refresh** in the Hub later. Version 1.8.3 has the older **ADLM MEP & HVAC** tab with one button per service; see [If you are still on 1.8.3](#if-you-are-still-on-1-8-3) at the end of this guide.

## What's new in 2.0

Version 2.0.0 was released on 1 October 2026.

- **A new name and a new panel.** The add-in is now SERVIQ. One **ServiQ** button on the **SERVIQ** tab opens a single panel beside your model. It signs you in, sets up a take-off list, walks you through each service, and saves to ADLM Cloud. The nine per-service ribbon buttons are gone.
- **A take-off list by service.** Start a project, tick **HVAC**, **Plumbing** and **Electrical**, and SERVIQ lists every item to measure, grouped by service, with a progress bar.
- **Auto take-off.** SERVIQ can measure every item on every level for you. Each result gets a confidence, and nothing counts until you accept it.
- **Save to ADLM Cloud the QUIV 4.0 way.** The bill and the budget (each line's material and labour) are saved together and linked, so the web **Budget** tab fills in. Your rates and build-ups travel with the save. The model goes up as a 3D model for the web viewer. Saving again updates the same project, and a project changed on another computer is caught instead of overwritten.
- **Reopening a cloud project** brings back line names, levels, rates and build-ups.
- **Light and dark mode** across the new panel (Revit 2025 and later), and a status bar that shows whether you are online.
- **Keyboard shortcuts** in the full bill window. Press <kbd>F1</kbd> to see them.
- **Fixed:** the rate build-up window no longer crashes when it opens; adding a take-off no longer puts its last line in twice; clicking a rate cell now lets you type the rate.
- **Fixed:** opening SERVIQ before you sign in no longer pops up a Windows box. SERVIQ shows its own message with a **Sign in** button, and an expired session is renewed quietly where it can be.

### Also new on the website (October 2026)

- **Price services from Rate Gen:** price a SERVIQ project on ADLM Cloud in one click from the Rate Gen master library. See [Price the services on ADLM Cloud](#price-the-services-on-adlm-cloud).
- **Services carbon and ICMS 3:** carbon for services rates in Rate Gen, and a cost and carbon report on ADLM Cloud. See [Services carbon and ICMS 3](#services-carbon-and-icms-3).

## Before you start

### What you need

| Item | Requirement |
|---|---|
| Computer | A Windows PC that runs Autodesk Revit |
| Revit | Revit 2024, 2025, 2026 or 2027 |
| Model | A Revit model with the services modelled as real elements (ducts, pipes, cable trays, fixtures and so on) |
| Internet | Needed to sign in, to save to the cloud, and to search the Rate Gen library |
| Subscription | An active SERVIQ (Revit MEP) subscription on your ADLM account |
| Optional | An active **Rate Gen** subscription, if you want to pick items from the Rate Gen library while building a rate |

> **Note:** SERVIQ is a separate subscription from QUIV for Revit. Having QUIV does not give you SERVIQ, and having SERVIQ does not give you QUIV. See [QUIV for Revit](/guides/quiv) for measuring the building itself.

### Get a subscription

1. Go to [adlmstudio.net/products](/products) and choose the SERVIQ (Revit MEP) plan.
2. Pay, then check that the subscription shows as active on your [dashboard](/dashboard).

### Install or update SERVIQ

SERVIQ is installed through the ADLM Installer Hub, like every other ADLM product. If you have not used the Hub before, read the [ADLM Installer Hub](/guides/installer-hub) guide first.

1. Close Revit completely. The Hub cannot replace an add-in that Revit is holding open.
2. Open the **ADLM Installer Hub** and sign in with your ADLM account.
3. Click **Installation Center** in the sidebar.
4. Find the **Revit MEP Plugin** card. It reads **Ready to install** for a first install, or **Update available** when 2.0 is waiting for you.
5. Click **Install**, or the **Update** button on the card.
6. If the **Choose Your Revit Version** window opens, pick your year under **Revit Version** and click **Continue Install**.
7. Click **Yes** if Windows asks for permission to make changes.
8. Wait until the card shows **Installed**.
9. Open Revit. If Revit asks whether to load **ServiQ 2.0**, choose **Always Load**.

> **Tip:** Use more than one Revit year? Click **Repair** on the card after the install and choose the other year. Do it again after every update so each year gets the new version.

> **Note:** Updating replaces the program files only. Your projects on ADLM Cloud and the local backup on your computer are kept.

## Open SERVIQ and sign in

1. Open the services model in Revit.
2. Click the **SERVIQ** tab.
3. On the **ADLM** panel, click **ServiQ**. The SERVIQ panel opens beside the model.
4. On **Sign in to ServiQ**, type your ADLM **Email** and **Password**.
5. Click **Sign in**, or press <kbd>Enter</kbd> in the password box.

The panel opens on its home screen and greets you by name. You sign in once each time you start Revit. To sign out, click **Sign out** in the status bar at the bottom of the panel.

No ADLM account yet? Click **Create an account** under "New to ADLM?". It opens the sign-up page on the website.

> **Important:** Your subscription is tied to the computer you first sign in on. To move to a new computer, free the old one first. See [Moving to a new computer](/guides/installer-hub#move-a-licence-to-a-new-computer) in the Installer Hub guide.

## Find your way around the panel

### The header

Across the top of the panel are the screen's title and a few small buttons:

| Button | What it does |
|---|---|
| Back arrow (**Back**) | Returns to the previous screen. |
| Moon or sun (**Dark mode** / **Light mode**) | Switches the panel between light and dark. Shown on Revit 2025, 2026 and 2027 only. |
| **Full screen** / **Dock in Revit** | Opens SERVIQ in a large floating window, or puts it back in the Revit side panel. Your work stays as it is. |
| **Minimise** | Folds the panel down to its header so you can see more of the model. |
| **Close** | Hides SERVIQ. Click **ServiQ** on the ribbon to bring it back. |

You can also drag, float or tab the docked panel the way you do with Revit's own Properties panel. When the panel is wide enough, the take-off list stays on the left and the item you are measuring opens on the right.

### The status bar

The bar along the bottom shows your connection:

- **Online** and your name, when SERVIQ can reach ADLM.
- **Offline · take-offs are kept on this computer**, when your PC has no network. You can keep measuring; save to the cloud when you are back online.

## The home screen

The home screen shows the model that is **OPEN IN REVIT** and what to do with it.

- **Start a take-off for this model** appears when this model has no take-off yet. It opens **New project**.
- **Continue take-off** appears when a take-off is already in the panel. It shows the project name, the number of lines and how many items are measured.
- **Recent projects** lists your latest saves on ADLM Cloud. Click one to open it in the panel. Click **Refresh** if the list looks out of date, or **New project** to start another.
- **Open ADLM Cloud** opens your SERVIQ projects on the website, where you price, plan and value them.

## Start a project and build the take-off list

1. On the home screen, click **Start a take-off for this model** (or **New project**).
2. Under **Project name**, check the name. It starts as the Revit model's name. Change it to something clear, for example the job name and "Services".
3. Under **Services**, tick one or more of **HVAC** (ducts, air), **Plumbing** (pipes, fixtures) and **Electrical** (light, power). The panel shows what "The take-off list will have".
4. Click **Generate take-off list**.

SERVIQ shows "Take-off list ready" and opens the list. If a take-off was already in the panel, it asks before clearing it. Anything you have already saved to ADLM Cloud stays there.

> **Note:** "Give the project a name." means the name box is empty or still says "Untitled". "Choose at least one service." means no service is ticked.

### The take-off list

The list groups the items by service. Each group shows how many of its items are done, for example "2/4", and you can fold a group away by clicking its heading. A progress bar across the top shows how much of the list is measured.

| Service | Item | What SERVIQ measures |
|---|---|---|
| HVAC | **Ductwork** | Duct length by type and size, in metres |
| HVAC | **Duct fittings** | Elbows, tees, reducers and transitions, counted |
| HVAC | **Air terminals** | Diffusers, grilles and registers, counted by type and size |
| HVAC | **HVAC equipment** | AHUs, FCUs, VAVs and other equipment, counted |
| Plumbing | **Plumbing fixtures** | WCs, basins, sinks and showers, counted |
| Plumbing | **Pipework** | Pipe length by type and diameter, and pipe fittings counted |
| Electrical | **Lighting** | Light fittings and switches, counted |
| Electrical | **Power** | Sockets, spurs and distribution boards, counted |
| Electrical | **Cable and containment** | Cable, cable tray and conduit length, and conduit fittings counted |

Anything that runs is measured in metres. Anything that sits on a run is counted. That is how a services bill is written.

An item you have measured gets a green tick and a note such as "12 lines · 3 levels". An item that already has saved lines stays on the list even if you untick its service later, so nothing measured is ever hidden.

## Take off a service

Every item works the same way. Learn one and you know them all.

### Step by step: measure the ductwork

1. On the take-off list, click **Ductwork**. The item screen opens.
2. Under step 1, **Choose a level in Revit**, open **Level** and pick a level, or **All Floors** for the whole building.
3. Wait while SERVIQ shows "Reading the model…".
4. Read step 2, **From the model**. It lists each duct by name, type and size with its length. "Read from Revit, no typing."
5. Click a line to show those ducts in the model.
6. Check the **Results** card for the totals.
7. Click **Add to take-off** at the bottom.

SERVIQ confirms, for example "Ductwork added: 14 lines for Level 1", and offers **Next item**. Pick the next level and add it too, or click **Next item** to move down the list. **Previous** goes back one item.

> **Tip:** Adding the same level twice does not double your quantities. SERVIQ says "Already on the take-off" and skips it. The **Add to take-off** button turns green with a tick when that level is already in.

> **Note:** "Nothing to measure for ductwork on this level." means that level has no elements of this kind. Try another level, or check the services are in this model and not in a linked one.

### Export one item to Excel

On the **Results** card, click **Export to Excel** to save that item and level on its own. For the whole job, use **Export to Excel** on the **Review and save** screen instead (see [Export to Excel](#export-to-excel)).

> **Tip:** Lines are grouped by the names, types and sizes the model uses. A model where half the supply ductwork is called "Duct 1" gives you a bill that says "Duct 1". Fix the names in Revit and measure again, rather than renaming lines every time the design changes.

> **Note:** SERVIQ measures what is modelled. A service that exists only as a single-line diagram, a note or a specification clause is not an element in the model, so it cannot be measured.

## Auto take-off

Auto take-off measures the items for you, level by level, exactly as you would by hand, and adds them to the take-off. It is not an AI feature: it runs SERVIQ's own measuring on every level.

1. On the take-off list, click **Auto take-off**.
2. The card lists the items not measured yet, all ticked. Untick any you want to measure yourself.
3. Click **Run auto take-off**. Click **Cancel** to close the card without running.

A progress card shows the item and level being measured, how many measurements are done and saved, the time taken and the time left. Click **Stop** to finish after the measurement in progress. What is saved is kept.

### Accept the results

When the run ends, SERVIQ tells you how many items it measured, how many "look right" and how many "need a closer look". **Nothing is complete until you accept it.**

- Each result has a confidence: the share of that item's levels that measured and saved without a problem. A result at 85% or more counts as sure.
- At the top of the take-off list, a bar shows how many auto take-off results are waiting. Click **Accept** (for example **Accept 6**) to accept all the sure ones at once.
- For the others, open the item, check its lines and click **Accept and complete**.

> **Important:** You cannot save to ADLM Cloud while auto take-off results are waiting. SERVIQ says "Accept the auto take-off results first". Accept them, or open each item and accept it.

> **Tip:** Running auto take-off again does not double count. An item and level already on the take-off is skipped.

## Review and save

When the list is measured, click **Review and save**.

The **Review and save** screen shows three counts: items **measured**, items **still to do**, and **bill lines**. If anything is left, it names it, for example "Still to measure: Power, Lighting." Below that, each item's lines are listed with their quantities.

From here you can:

- Click **Save to ADLM Cloud** (or **Save changes to ADLM Cloud** once the project is on the cloud).
- Click **Export to Excel** for the whole job.
- Click **Prices and budget** to open the full bill, where you price it (see below).

## Price the bill inside Revit

**Prices and budget** opens the full bill in its own window, the **ADLM Takeoff Database**. This is where you type rates, build rates up from material and labour, and check the budget. Prices are in naira (₦).

### Find your way around the bill window

The left side has three groups:

| Group | What is in it |
|---|---|
| **PROJECT** | The project name, **Save to Cloud** and **Load Latest Local**. |
| **VIEW** | **Take-Off Data**, **Take-Off Summary**, **Budget** and **Material Schedule**. |
| **RECENT CLOUD SAVES** | Your projects on ADLM Cloud. Click one to reopen it. The refresh button reloads the list. |

Along the top are **Export to Excel**, which exports the whole job, and **Clear All**, which empties the take-off. The header has **Shortcuts** and **Dark / Light**.

### Type a rate

1. Click **Take-Off Data**.
2. Click in the **Unit Rate** box on a line and type the rate.
3. Press <kbd>Tab</kbd> or click elsewhere. The **Amount** (quantity × rate) fills in.

A line with an empty **Unit Rate** is treated as unpriced. The **Bill Total** at the bottom updates as you price.

To remove lines, tick them and click **Delete Selected**. SERVIQ asks you to confirm first.

### Add overhead and profit

At the bottom of **Take-Off Data**:

1. Type your **Overhead %**.
2. Type your **Profit %**.
3. Read the **Budget Total**: the **Bill Total** plus overhead and profit.

### Build a rate from material and labour

1. On a line in **Take-Off Data**, click the **ƒ** button. The **Rate Build-Up** window opens.
2. Click **+ Material** to add a material row, or **+ Labour** to add a labour row.
3. For each row, fill in the **Description**, **Qty/unit** (how much goes into one unit of the line), **Unit** and **Unit Price**. The **Amount** works itself out.
4. Remove a row you do not want with **✕**.
5. Check the totals at the bottom: **Material:**, **Labour:** and **Unit cost:**. The unit cost becomes the line's rate.
6. Click **Done**.

> **Tip:** Put waste into **Qty/unit**. For example, 1.05 m of cable per metre run allows 5% waste. That figure carries through to the Material Schedule.

### Pick items from the Rate Gen library

If you also have an active Rate Gen subscription, the **Rate Build-Up** window shows a **SEARCH RATEGEN LIBRARY** box.

1. Type a material or labour name in the box.
2. Click a result. It is added to the build-up as a new row with its price.
3. Adjust **Qty/unit** for waste or for the way the item is sold.

Without a Rate Gen subscription the box does not appear, and you type every row yourself. Rates themselves are built and kept in [ADLM Rate Gen](/guides/rategen).

### Reuse a build-up on similar lines

Click **Apply to similar lines** in the **Rate Build-Up** window. The same build-up is copied onto every other unpriced line in the same service that has no build-up yet, and SERVIQ tells you how many. Lines that already have a build-up are left alone.

### Take-Off Summary, Budget and Material Schedule

- **Take-Off Summary** shows the **Totals** for the job and a **Details** list of every line, grouped by service.
- **Budget** (the **Budget Breakdown**) shows one row per **DISCIPLINE** with its **LINES** and **SUBTOTAL**, the **OVERHEAD %** and **PROFIT %**, and the roll-up from **Bill Subtotal** to **Budget Total**. Once a line has a build-up, **COST COMPOSITION** splits the bill into **Material**, **Labour** and **Unclassified (rate only)**.
- **Material Schedule** is a procurement list. It multiplies each material in each line's build-up by the line's quantity and adds the same material together across the job: **MATERIAL**, **QTY**, **UNIT**, **UNIT PRICE** and **TOTAL**, with the **Total Material Cost**. Only lines with a build-up appear.

### Keyboard shortcuts in the bill window

Press <kbd>F1</kbd> or <kbd>Ctrl</kbd>+<kbd>/</kbd>, or click **Shortcuts**, to see the list.

| Keys | What they do |
|---|---|
| <kbd>Ctrl</kbd>+<kbd>1</kbd> to <kbd>Ctrl</kbd>+<kbd>4</kbd> | Go to Take-Off Data, Take-Off Summary, Budget, Material Schedule |
| <kbd>Ctrl</kbd>+<kbd>S</kbd> | Save to Cloud |
| <kbd>Ctrl</kbd>+<kbd>E</kbd> | Export all to Excel |
| <kbd>F5</kbd> | Refresh cloud projects |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> | Switch light / dark (Revit 2025 and later) |

## Save to ADLM Cloud

1. Click **Review and save** on the take-off list.
2. Click **Save to ADLM Cloud**.
3. If a project with that name is already on your account, SERVIQ says "A project with this name exists". Click **Save anyway** to use that name, or go back and rename the project.
4. Wait while SERVIQ saves the take-off, checks it arrived, saves the budget and uploads the model.
5. Read the message. "Bill and budget saved together and linked." means everything arrived. Click **Open ADLM Cloud** to see it.

What the save sends:

- **The bill:** every line with its name, level, quantity, rate and build-up.
- **The budget:** each line's material and labour, linked to the bill, so the web **Budget** tab fills in.
- **The 3D model**, for the web **3D Model** viewer.

Saving again updates the same project. If someone changed the project on another computer since you opened it, SERVIQ says "This project changed on another device". Open the latest version from your recent cloud saves, then save again.

> **Important:** If a save fails, SERVIQ says so and adds "Your take-off is still on this computer." Nothing is lost. Try again when your connection is back.

### Reopen a cloud project

On the home screen, click the project under **Recent projects**. Or, in the bill window, click it under **RECENT CLOUD SAVES** and click **Yes** to replace the current take-off. Line names, levels, rates and build-ups come back with it.

### The local backup

SERVIQ keeps a backup of your take-off on your computer and updates it every time you add, delete or price a line. Every Revit session starts with an empty take-off. To get your last take-off back:

1. Click **Prices and budget** (or open the bill window from **Review and save**).
2. Click **Load Latest Local**.
3. Check the project name, the save time and the number of rows, then click **Yes**.

> **Tip:** Revit crashed in the middle of a take-off? Open the bill window and click **Load Latest Local**. **Clear All** does not wipe the backup either, so the same button undoes an accidental clear.

> **Note:** The backup holds one take-off: the last one you worked on on this computer. To keep several jobs, save each to the cloud with its own name.

## Export to Excel

1. Click **Export to Excel** on the **Review and save** screen, or at the top of the bill window (<kbd>Ctrl</kbd>+<kbd>E</kbd>).
2. Choose where to save. The file name starts as "Complete MEP BoQ".
3. Click **Save**. SERVIQ confirms the export.

| Sheet | What is on it |
|---|---|
| One sheet per service | Air Terminals, Cable Works, Lighting, Pipe Works, Plumbing Fixtures, Power Fixtures and the rest. Columns: S/N, Description, Quantity, Unit, Rate (₦) and Amount (₦), with a TOTAL row. |
| **Summary** | Each service with its number of rows, total quantity and total amount, and a GRAND TOTAL. |
| **Budget Summary** | The bill subtotal, overhead %, profit % and the budget total. The total is a live Excel formula, so changing the percentages in Excel updates it. |

Only the services you have measured get a sheet. On ADLM Cloud you can export the same project in more formats; see [ADLM Cloud](/guides/cloud).

## On ADLM Cloud

Projects you save appear on adlmstudio.net under your SERVIQ (Revit MEP) projects, alongside your other ADLM projects. Click **Open ADLM Cloud** on the home screen, or go to [/projects/mep](/projects/mep). There you can open the **Bill of Quantity**, **Budget**, **Valuation**, **Work area** and **3D Model** of each project. The [ADLM Cloud](/guides/cloud) guide explains these pages.

> **Tip:** Keep the services and the building as separate projects. They come from different models, change at different times, and are often valued as different packages. A services project can be linked to its building project on ADLM Cloud so its total joins the building's.

### Price the services on ADLM Cloud

A SERVIQ project on ADLM Cloud has a **Price services from Rate Gen** panel on its **Dashboard** tab. It builds a material and labour rate for every services line from Rate Gen prices, applies your services constants (standard lengths, connectors and fittings), and updates the bill.

1. Open the project on ADLM Cloud.
2. On the **Dashboard** tab, find **Price services from Rate Gen**.
3. Click **Price services**.
4. Read the result, for example "Priced 20 bill lines from 46 build-up lines. Open the Bill tab to review."
5. Open **Bill of Quantity** and check the rates.

How it finds a price:

- It looks first in the **Rate Gen master library** for your state, the same list of services items that Rate Gen and SERVIQ use. Then it looks in your own Rate Gen library.
- Matching is strict. A name must match exactly, or match word for word with the same size both ways (a 25mm pipe never takes a 32mm price) and the same unit. If no item is clearly the best, the line stays unpriced, so the gap is visible rather than wrong.
- An item marked "(installed)" in the master library is an all-in supply-and-fix price, so no labour is added on top.

> **Note:** The button is greyed out on a project shared with you with rates hidden. Rates are built in [ADLM Rate Gen](/guides/rategen): the website picks Rate Gen prices onto your bill, but does not create or edit rates.

**Edit services constants** under the button opens the services constants: for each type, the standard length (6 m for pipe), the connectors per joint and a fitting uplift. Change them there if your supply lengths differ.

### Services carbon and ICMS 3

SERVIQ itself does not show carbon. Carbon for services comes from your Rate Gen rates:

- In Rate Gen 3.0, build 3.0.2610.1, every built-up rate gets an upfront carbon figure in kgCO2e (stages A1 to A5). Building-services rates are listed under **Mechanical**, **Electrical**, **Plumbing** and **Fire**.
- Copper cable and earthing are weighed from their own names (cores × size of conductor). Insulation and sheath are not counted, so a cable's figure is a minimum.
- PP-R pressure pipe and uPVC soil pipe are weighed from their sizes.
- Fittings and manufactured items (AC units, pumps, fans, sanitaryware, light fittings, accessories, fire equipment, tanks) have no carbon figure yet. They need the maker's own figure.

See [ADLM Rate Gen](/guides/rategen) for the **Carbon & Others** screen.

On ADLM Cloud, open the project's **Export** menu and use the **ICMS 3** group ("international cost and carbon report"):

- **ICMS 3 cost and carbon (Excel)**: cost and upfront carbon (A1-A5) by ICMS 3 Group, with every line's code, where its carbon came from, and the lines not yet placed.
- **ICMS 3 cost and carbon (JSON)**: the same report as data. It conforms to the RICS Data Standard 3.3.3.

SERVIQ lines go into Group 05, services and equipment, by type: for example ducts and air conditioners to 05.010 (heating, ventilating and air-conditioning), distribution boards to 05.020 (electrical services), light fittings to 05.030, pipework to 05.050 (water supply and drainage) and WCs and basins to 05.060 (sanitary fittings). External drainage such as inspection chambers goes to Group 06. A line SERVIQ cannot place is listed as not yet placed. The report total equals the contract total: preliminaries go in Group 08, contingency in 09.020 and VAT in 10.020. Carbon per line comes from your Rate Gen rates, so lines priced from an item with no carbon figure show none. Give an IPMS 1 or 2 floor area to see cost and carbon per m².

### Learning samples

Your SERVIQ projects page can show a **Learning samples** strip: worked services projects for sample duplex buildings, covering electrical, plumbing and drainage, and air conditioning. Open one to see a fully filled-in project. Samples are read-only. Click **Hide samples** to fold the strip away, and the **Show** button (for example "Show 3 samples") to bring it back.

## AI in SERVIQ

ADLM's AI features are described in full in [ADLM AI services](/guides/ai-services). For SERVIQ:

| Feature | Where | Availability |
|---|---|---|
| **ADLM AI Review** (the **AI Review** page) | Bill window, under **VIEW** | Not in standard installs |
| **BUILD WITH ADLM AI** | **Rate Build-Up** window | Not in standard installs |
| Auto take-off | Take-off list | On for everyone with 2.0. Uses no AI |
| AI checks in the **Work area** | ADLM Cloud project | On for everyone (see below) |

**ADLM AI Review** and **BUILD WITH ADLM AI** are built into SERVIQ 2.0 but switched off in a normal install. ADLM switches them on only on machines it sets up for testing. If you do not see an **AI Review** item under **VIEW**, or a **BUILD WITH ADLM AI** box in the **Rate Build-Up** window, that is expected.

Where they are switched on:

- **ADLM AI Review** offers **Market check** (every priced line against the Rate Gen library), **Find errors**, **Clean up bill** (wording, units, duplicates and gaps), **Auto-price unpriced** lines from your rate library, **Import supplier catalogue**, **ASK ABOUT THIS BILL** and **PLAN A TAKE-OFF**. Each finding offers **Apply** or **Dismiss**. "Nothing here changes the bill until you apply it."
- **BUILD WITH ADLM AI** drafts a material and labour build-up from a description of the work. Click **Build rate**, check the rows, and keep or change them.

**On ADLM Cloud, for every customer:** open a saved SERVIQ project and click **Work area**. Its **Ada** panel can **Check my rates against the market**, **Scan the bill for errors** and **Build up a rate for the selected line**, and you can ask Ada about the project. These work on SERVIQ samples too. Nothing changes your bill unless you apply it. See [ADLM AI services](/guides/ai-services) for allowances and how your data is handled.

## Troubleshooting

### The SERVIQ tab is missing

| Cause | Fix |
|---|---|
| Installed for a different Revit year | Click **Repair** on the card in the Hub and choose the year you are opening. |
| Revit was open during the install | Close Revit completely and install again. |
| Revit's add-in prompt was answered "Do Not Load" | Install again from the Hub, open Revit, and choose **Always Load** for **ServiQ 2.0**. |

### I still see the ADLM MEP & HVAC tab

You are on version 1.8.3. Update from the Hub when it offers 2.0. See [If you are still on 1.8.3](#if-you-are-still-on-1-8-3).

### The docked panel shows only a short hint

Revit restores the panel when it starts, before SERVIQ is opened. Click **ServiQ** on the ribbon to load it.

### "Invalid email or password."

Check your email and password by signing in at [adlmstudio.net](/). If you have forgotten the password, reset it on the website, then try again in Revit.

### "No active MEP subscription or device mismatch."

Either your SERVIQ subscription is not active, or your licence is in use on another computer. Check your [dashboard](/dashboard). If the subscription is active, free the other computer as described in [Moving to a new computer](/guides/installer-hub#move-a-licence-to-a-new-computer), then sign in again. Remember that QUIV and SERVIQ are separate subscriptions.

### "Internet is required to sign in" or "Network error"

SERVIQ could not reach the ADLM server. Check your internet connection and sign in again. If you use a VPN or a company proxy, try without it.

### An item finds nothing

The elements are probably in a linked model, not the one you have open. Open the linked services file and measure there. Also check you picked a level under **Level**.

### Counts are far below the drawings

The service is probably drawn but not modelled, for example as a single-line diagram. There is nothing to measure. Price that part another way and say so in your bill.

### "Accept the auto take-off results first"

Auto take-off results are waiting. Click **Accept** at the top of the take-off list for the sure ones, and open each of the others and click **Accept and complete**. Then save.

### "Name the project first"

The project has no name. Start a **New project** with a name, or type one under **PROJECT** in the bill window, and save again.

### "Sign in to save to ADLM Cloud" or "Your ADLM session has ended"

Click **Sign in** on the message. Your take-off stays on this computer while you sign in.

### "You are offline"

Your PC has no network. Your take-off is kept on this computer. Save again when you are back online.

### "This project changed on another device"

Someone saved the same project from another computer after you opened it. Open the latest version from **Recent projects**, redo your changes if needed, and save again.

### "The 3D model was not uploaded"

The bill and budget saved, but the model did not go up for the web viewer. Make sure the model is open in Revit, open SERVIQ from the ribbon and save again.

### My take-off is empty when I open Revit

That is normal. Each Revit session starts empty. Open a project from **Recent projects**, or click **Load Latest Local** in the bill window.

### The Rate Gen search box is missing from Rate Build-Up

It only appears with an active Rate Gen subscription. You can still build rates by typing rows with **+ Material** and **+ Labour**.

### Price services priced only a few lines

That is by design. A line is priced only when the Rate Gen master library has a clear match with the same size and unit. Price the rest in Revit before you save, or pick a Rate Gen rate onto each line on the web.

### Something else went wrong

Contact ADLM through [support](/support) with your account email, your Revit year and what you were doing. If asked, SERVIQ keeps a log file at `%AppData%\ADLM\RevitMEP\cloud.log` that helps support see what happened.

## Frequently asked questions

### Is SERVIQ the same as the ADLM Revit MEP Suite?

Yes. SERVIQ is the new name, and 2.0 is the new version. Your subscription, your saved projects and your licence carry over.

### Do I need QUIV to use SERVIQ?

No. SERVIQ works on its own with its own subscription. On a full bill you will usually want both: QUIV for the building and SERVIQ for the services.

### Which Revit versions are supported?

Revit 2024, 2025, 2026 and 2027.

### Can I measure one floor at a time?

Yes. Pick a level under **Level**, click **Add to take-off**, then pick the next level. Choose **All Floors** to measure the whole building in one go.

### Is auto take-off AI?

No. It runs SERVIQ's own measuring on every level of the model, the same as you would by hand. The confidence is the share of levels that measured without a problem, not a guess.

### Do I need a Rate Gen subscription to price?

No. You can type any rate and build rates from material and labour by hand. Rate Gen adds the library search inside **Rate Build-Up**, and gives the prices that **Price services** uses on the web.

### Can I import a services bill from Excel?

Not in SERVIQ. It measures from the Revit model.

## If you are still on 1.8.3

Until the Hub updates you to 2.0, version 1.8.3 works as before. The Revit tab is **ADLM MEP & HVAC**. Sign in with **Sign In** on the **Tools** panel, then use one button per service (such as **Duct Quantity**): pick a level, check **Result Info** and click **Save to Take-Off**. **Show Takeoff Database** opens the same bill window described in [Price the bill inside Revit](#price-the-bill-inside-revit). Version 1.8.3 has no take-off list, no auto take-off and no linked budget save.
