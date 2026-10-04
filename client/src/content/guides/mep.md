---
id: mep
title: SERVIQ for Revit MEP
tagline: Measure ductwork, pipework, cable, fixtures and equipment straight from your Revit model, price them, and send the bill to ADLM Cloud.
version: "1.8.3"
updated: 2026-10-01
platform: Revit 2024-2027 add-in (Windows)
productKeys: [mep]
pdf: ADLM-Revit-MEP-User-Guide.pdf
order: 7
---

The ADLM Revit MEP Suite is a Revit add-in for measuring the services in a building: ductwork, pipework, cable and containment, and every terminal, fixture and piece of equipment on them. It reads the quantities from the Revit model you have open, so you do not count symbols on a drawing. It is for services quantity surveyors, main-contract QSs pricing an M&E package, and services engineers who want a quick quantity check. You get a measured take-off, a priced bill with overhead and profit, a material schedule, an Excel workbook, and a project on your ADLM Cloud account.

This guide covers version 1.8.3, the version the Installer Hub installs today. In the Hub the product is listed as **ADLM Revit MEP Plugin**, and in Revit it adds a tab called **ADLM MEP & HVAC**. On the ADLM website the product is now shown as **SERVIQ**: it is the same subscription and the same add-in.

> **Note:** A new version, ServiQ 2.0, is being prepared and is not yet available to customers. Until the Installer Hub offers it, everything in this guide applies.

## Before you start

### What you need

| Item | Requirement |
|---|---|
| Computer | A Windows PC that runs Autodesk Revit |
| Revit | Revit 2024, 2025, 2026 or 2027 |
| Model | A Revit model with the services modelled as real elements (ducts, pipes, cable trays, fixtures and so on) |
| Internet | Needed to sign in, to save to the cloud, and to search the Rate Gen library |
| Subscription | An active Revit MEP subscription on your ADLM account (shown on the website as **SERVIQ**) |
| Optional | An active **Rate Gen** subscription, if you want to pick rates from the Rate Gen library while pricing |

> **Note:** The MEP Suite is a separate subscription from QUIV for Revit. Having QUIV does not give you the MEP Suite, and having the MEP Suite does not give you QUIV. See [QUIV for Revit](/guides/quiv) for measuring the building itself.

### Get a subscription

1. Go to [adlmstudio.net/products](/products) and choose the SERVIQ (Revit MEP) plan.
2. Pay, then check that the subscription shows as active on your [dashboard](/dashboard).

### Install the add-in

The MEP Suite is installed through the ADLM Installer Hub, the same way as every other ADLM product. If you have not used the Hub before, read the [ADLM Installer Hub](/guides/installer-hub) guide first.

1. Close Revit completely. The Hub cannot replace an add-in that Revit is holding open.
2. Open the **ADLM Installer Hub** and sign in with your ADLM account.
3. Find **ADLM Revit MEP Plugin** and click **Install**.
4. When the Hub asks which Revit version you use, pick the year you actually open (2024, 2025, 2026 or 2027).
5. Click **Yes** when Windows asks for permission to make changes.
6. Wait for the Hub to say the install is complete.
7. Open Revit. If Revit asks whether to load the new add-in, choose **Always Load**.

> **Tip:** Use more than one Revit year? Install once for each year you use. Each year has its own copy of the add-in.

### Sign in

All the take-off buttons on the tab stay greyed out until you sign in.

1. Open the services model in Revit.
2. Click the **ADLM MEP & HVAC** tab.
3. On the **Tools** panel, click **Sign In**.
4. Type your ADLM **Email:** and **Password:**, then click **Sign In**.
5. Revit shows "User signed in successfully." Click **Close**.

The take-off buttons are now available, the **Sign In** button greys out, and a **Sign Out** button appears beside it. You sign in once each time you start Revit.

> **Important:** Your subscription is tied to the computer you first sign in on. To move to a new computer, free the old one first. See [Moving to a new computer](/guides/installer-hub#moving-to-a-new-computer) in the Installer Hub guide.

## The ADLM MEP & HVAC tab

Everything the MEP Suite does starts from one ribbon tab with five panels. They follow the way a services bill is written: HVAC, plumbing, electrical, then your stored take-off.

| Panel | Buttons | What they do |
|---|---|---|
| **ADLM** | **View Projects**, **User Guide** | **View Projects** opens your Revit MEP projects on adlmstudio.net. **User Guide** opens the video walkthrough playlist. |
| **HVAC Quantity** | **Air Terminal Quantity**, **Duct Fitting Quantity**, **Duct Quantity**, **HVAC Equipment Quantity** | Measure the air-side services. |
| **Plumbing Quantity** | **Plumbing Fixture Quantity**, **Pipe Works Quantity** | Measure pipework and sanitary fittings. |
| **Electrical Quantity** | **Lighting Quantity**, **Power Quantity**, **Cable Quantity** | Measure lighting, power points, distribution boards, cable and containment. |
| **Tools** | **Show Takeoff Database**, **Dock Take-Off Panel**, **Sign In**, **Sign Out** | Open your stored take-off, dock it inside Revit, and sign in or out. |

> **Note:** Every button on the tab except **Sign In** is greyed out until you have signed in.

## The dockable workspace

The MEP Suite works inside a panel called **ADLM MEP Take-Off** that docks into Revit like the Properties or Project Browser panels. When you click a take-off button, the tool opens in this panel, so you can see the model and the quantities side by side.

### Dock or pop out

At the top of every MEP screen there is a header bar with two buttons:

| Button | What it does |
|---|---|
| **Dock / Pop Out** | Moves the current screen between the Revit side panel and a large floating window. Your work stays as it is when you switch. |
| **Dark / Light** | Switches the MEP screens between light and dark colours (Revit 2025 and later). |

1. Click **Dock / Pop Out** to open the current screen in a full floating window, for example when you want a wide view of a long take-off.
2. Click **Dock / Pop Out** again to put it back in the side panel.

You can also drag, float or tab the docked panel the same way you do with Revit's own panels.

### Open the take-off panel directly

Click **Dock Take-Off Panel** on the **Tools** panel to open your stored take-off (the Take-Off Database, described below) straight into the docked panel.

### Dark mode

On Revit 2025, 2026 and 2027 you can work in dark colours, which suit Revit's own dark theme.

1. Open any MEP screen.
2. Click **Dark / Light** in the header bar.

The MEP Suite remembers your choice for next time. On Revit 2024 the MEP screens are light only and the **Dark / Light** button does not appear.

## Taking off a service

All nine take-off tools work the same way. Learn one and you know them all. Each tool has a narrow sidebar on the left with two pages: a model page (labelled **Model Quantities**, or with the tool's own name, such as **Pipe Works** or **Cables**) and **Result Info**.

### Step by step: measure the ductwork

1. On the **HVAC Quantity** panel, click **Duct Quantity**. The **Duct Work** tool opens in the docked panel on its **Model Quantities** page.
2. Under **Select a Floor Level**, open **Select Level** and choose a level, or **All Floors** for the whole building.
3. Open **Select Duct Type** and choose a duct type found on that level.
4. Read the **Duct Take Off Schedule**. It lists each duct name and size with its total length in metres. The matching ducts are selected in the Revit model so you can see what was measured.
5. Click a line in the schedule. Revit selects and zooms to just those ducts.
6. Click **Result Info** in the sidebar. This page shows every duct on the level you chose, grouped by name, type and size, with the **Total Length** at the top.
7. Click **Save to Take-Off**. A message tells you how many rows were saved to the Take-Off database for that level.
8. Go back to step 2, pick the next level, and repeat until every level is saved.

> **Important:** **Result Info** only opens after you have picked a level on the model page. If clicking it does nothing, go back and choose a level first.

> **Tip:** Saving the same level twice does not double your quantities. Rows already saved for that level, with the same name, type and size, are skipped, and the message tells you how many were skipped.

### Export one tool's results to Excel

On the **Result Info** page of any tool, click **Export to Excel**, choose where to save the file, and click **Save**. The file is named after the tool and the level, for example `Ducts_All`. Use this when you need one service on its own. For the whole job, export from the Take-Off Database instead (see [Export the full bill to Excel](#export-the-full-bill-to-excel)).

### Work in a sensible order

1. Start with the service you know best. You are checking how much you can trust the model as much as measuring it.
2. Look at the model page first. Does the count look like the job? A model with 40 air terminals when the drawings show 200 is telling you something before you measure anything.
3. Move to **Result Info** and check that sizes and types read the way your bill needs them.
4. Save each level, then move to the next tool. Work through HVAC, then plumbing, then electrical, so the bill comes out in a sensible order.

> **Note:** The MEP Suite measures what is modelled. A service that exists only as a single-line diagram, a note or a specification clause is not an element in the model, so it cannot be measured.

## What each tool measures

Anything that runs is measured in metres. Anything that sits on a run is counted. That is how a services bill is written, and it is why the tools are split this way.

| Tool | Ribbon panel | Pages in the sidebar | What it gives you |
|---|---|---|---|
| **Duct Quantity** | HVAC Quantity | Model Quantities, Result Info | Duct name, type and size, with length in metres (m). |
| **Duct Fitting Quantity** | HVAC Quantity | Model Quantities, Result Info | Fitting name, type and size, with the number of fittings (EA). |
| **Air Terminal Quantity** | HVAC Quantity | Model Quantities, Result Info | Diffusers, grilles and other terminals by name, type and size, with the number of terminals (EA). |
| **HVAC Equipment Quantity** | HVAC Quantity | Model Quantities, Result Info | Air handling units, fan coil units, VAV boxes and other equipment by name, type and size, with the number of units (EA). |
| **Pipe Works Quantity** | Plumbing Quantity | **Pipe Works**, **Pipe Fittings**, Result Info | Pipe category, name and size with length in metres, plus pipe fittings counted by name, type and size. |
| **Plumbing Fixture Quantity** | Plumbing Quantity | Model Quantities, Result Info | WCs, basins, sinks and other fixtures by name and size, with the number of fixtures (EA). |
| **Lighting Quantity** | Electrical Quantity | **Lighting Fixtures**, **Light Switches**, Result Info | Lights by category, name and type with the number of lights, plus light switches counted separately. |
| **Power Quantity** | Electrical Quantity | **Power Fixtures**, **Distribution Boards**, Result Info | Sockets, outlets and other power points by category, name and type, plus distribution boards counted separately. |
| **Cable Quantity** | Electrical Quantity | **Cables**, **Cable Trays**, **Conduits**, Result Info | Cable by category, name and size with length in metres; cable tray length in metres; conduit length in metres with the number of conduit fittings. |

> **Tip:** Lines are grouped by the names, types and sizes the model uses. A model where half the supply ductwork is called "Duct 1" gives you a bill that says "Duct 1". Fix the names in Revit and run the tool again, rather than renaming lines every time the design changes.

> **Note:** Duct and pipe fittings come out as a number, not a length, because that is how they are usually priced. If your bill needs fittings as a percentage on the duct run, convert the number once in the bill.

## The Take-Off Database

Everything you save with **Save to Take-Off** collects in one place, the Take-Off Database. This is where you price the job, check the totals and send the bill out of Revit.

### Open it

You can open it two ways:

- Click **Show Takeoff Database** on the **Tools** panel to open it in a floating window.
- Click **Dock Take-Off Panel** to open it in the docked panel.

### Find your way around

The left side of the Take-Off Database has three groups:

| Group | What is in it |
|---|---|
| **PROJECT** | The project name box, **Save to Cloud**, and **Load Latest Local**. |
| **VIEW** | **Take-Off Data**, **Take-Off Summary**, **Budget** and **Material Schedule**: the four ways to look at the job. |
| **RECENT CLOUD SAVES** | Your projects already saved to ADLM Cloud. Click one to reopen it. The refresh button reloads the list. |

Along the top right are **Export to Excel**, which exports the whole job, and **Clear All**, which empties the take-off.

### Take-Off Data

This is the working bill. Each saved line shows its description, quantity and unit, with three columns on the right: **Unit Rate**, **Amount** and a **ƒ** button.

- Tick the box at the start of a line to select it. Tick several to work on them together.
- Click **Delete Selected** to remove the ticked lines. You are asked to confirm first.

### Take-Off Summary

**Take-Off Summary** shows the **Totals** for the whole job and a **Details** list of every line, grouped by service (Air Terminals, Cable Works, Duct Work and so on). Use it for a quick read-through before you price.

### Start a new job

Click **Clear All** to empty the take-off and start again. It does not ask for confirmation, so export or save to the cloud first if you need the old take-off. If you clear by mistake, click **Load Latest Local** straight away to bring the rows back from the local backup.

## Pricing the bill

The MEP Suite turns your quantities into a priced bill and a budget, inside Revit. Prices are shown in naira (₦).

### Type a rate

1. Open the Take-Off Database and click **Take-Off Data**.
2. Click in the **Unit Rate** box on a line and type the rate.
3. Press <kbd>Tab</kbd> or click elsewhere. The **Amount** (quantity x rate) fills in.

A line with an empty **Unit Rate** is treated as unpriced. As you price, the **Bill Total** at the bottom of the list updates.

### Add overhead and profit

At the bottom of **Take-Off Data**:

1. Type your **Overhead %**.
2. Type your **Profit %**.
3. Read the **Budget Total**. It is the **Bill Total** plus overhead and profit.

### Build a rate from material and labour

Instead of typing one figure, you can build a rate up from the materials and labour that go into one unit of the item.

1. On a line in **Take-Off Data**, click the **ƒ** button. The **Rate Build-Up** window opens.
2. Click **+ Material** to add a material row, or **+ Labour** to add a labour row.
3. For each row, fill in the **Description**, **Qty/unit** (how much goes into one unit of the line), **Unit** and **Unit Price**. The **Amount** works itself out.
4. Remove a row you do not want with **✕**.
5. Check the totals at the bottom: **Material:**, **Labour:** and **Unit cost:**. The unit cost becomes the line's rate.
6. Click **Done**.

> **Tip:** Put waste and packing into **Qty/unit**. For example, 1.05 m of cable per metre run allows 5% waste. That figure carries through to the Material Schedule.

#### Pick items from the Rate Gen library

If you also have an active Rate Gen subscription, the **Rate Build-Up** window shows a **SEARCH RATEGEN LIBRARY** box.

1. Type a material or labour name in the box.
2. Click a result. It is added to the build-up as a new row with its price.
3. Adjust **Qty/unit** for waste or for the way the item is sold.

Without a Rate Gen subscription the search box does not appear, and you type every row yourself. See [ADLM Rate Gen](/guides/rategen) for how the library works.

#### Reuse a build-up on similar lines

1. In the **Rate Build-Up** window, click **Apply to similar lines**.
2. The same build-up is copied onto every other line in the same service that has no build-up yet. A message tells you how many lines it was applied to.

> **Note:** Lines that already have a build-up are left alone.

### The Budget page

Click **Budget** under **VIEW** for the priced job broken down by trade.

| Part | What it shows |
|---|---|
| **OVERHEAD %** and **PROFIT %** | The same margins as on Take-Off Data. Change them here or there. |
| **DISCIPLINE**, **LINES**, **SUBTOTAL** | One row per service, with the number of lines and the priced subtotal. |
| **COST COMPOSITION** | How much of the bill is **Material**, how much is **Labour**, and how much is **Unclassified (rate only)**, meaning lines priced with a typed rate and no build-up. Shown once at least one line has a build-up. |
| **Bill Subtotal**, **Overhead**, **Profit**, **Budget Total** | The roll-up from bill to budget. |

### The Material Schedule

Click **Material Schedule** under **VIEW** for a procurement list. It takes each material in each line's build-up, multiplies it by that line's quantity, and adds the same material together across the whole project. You get **MATERIAL**, **QTY**, **UNIT**, **UNIT PRICE** and **TOTAL** for every item, with the **Total Material Cost** at the bottom.

If the page says there are no material build-ups yet, use the **ƒ** button on some lines first. Only lines with a build-up appear here.

## Saving your work

### The local backup

The MEP Suite keeps a backup of your take-off on your computer and updates it every time you add, delete or price a line. You do not have to do anything to make this happen.

Every Revit session starts with an empty Take-Off Database. To get your last take-off back:

1. Open the Take-Off Database.
2. Click **Load Latest Local**.
3. Check the project name, the save time and the number of rows in the message, then click **Yes** to replace what is on screen.

> **Tip:** Revit crashed in the middle of a take-off? Open the Take-Off Database and click **Load Latest Local**. Your rows come back as they were at the last change.

> **Note:** The backup holds one take-off: the last one you worked on on this computer. To keep several jobs, save each one to the cloud with its own name.

### Save to ADLM Cloud

1. Open the Take-Off Database.
2. Under **PROJECT**, replace "Untitled" with a clear project name, for example the job name and "Services".
3. Click **Save to Cloud**.
4. If a project with that name is already on your account, you are asked whether to overwrite it. Click **Yes** to overwrite, or **No** to cancel and rename.
5. Wait for the message that the project was saved to the cloud.

The project then appears under **RECENT CLOUD SAVES** and on the website at [adlmstudio.net/projects/mep](/projects/mep).

> **Important:** You must be signed in to save to the cloud. If the save fails, your work is still in the local backup, so nothing is lost. Try again when your connection is back.

### Reopen a cloud project

1. Open the Take-Off Database.
2. Under **RECENT CLOUD SAVES**, click the refresh button if the list looks out of date.
3. Click the project you want.
4. Click **Yes** to replace the current take-off with that project.

## On the website

Projects you save from Revit appear on adlmstudio.net under **Revit MEP projects**, alongside your other ADLM projects on the same account. Click **View Projects** on the **ADLM** panel to go straight there, or open [/projects/mep](/projects/mep) in your browser.

> **Tip:** Keep the services and the building as separate projects. They come from different models, change at different times, and are often valued as different packages.

### Learning samples

Your Revit MEP projects page can also show a **Learning samples** strip: worked services projects for sample duplex buildings, covering electrical, plumbing and drainage, and air conditioning. Open one to see a fully filled-in project. Samples are read-only, so you cannot change or break them. Click **Hide samples** to fold the strip away, and the **Show** button (for example "Show 3 samples") to bring it back.

## Export the full bill to Excel

1. Open the Take-Off Database.
2. Click **Export to Excel** at the top right.
3. Choose where to save. The file name starts as "Complete MEP BoQ".
4. Click **Save**. A message confirms the export.

The workbook has:

| Sheet | What is on it |
|---|---|
| One sheet per service | Air Terminals, Cable Works, Lighting, Pipe Works, Plumbing Fixtures, Power Fixtures and the rest. Columns: S/N, Description, Quantity, Unit, Rate (₦) and Amount (₦), with a TOTAL row. |
| **Summary** | Each service with its number of rows, total quantity and total amount, and a GRAND TOTAL. |
| **Budget Summary** | The bill subtotal, Overhead %, Profit % and the Budget Total. The Budget Total is a live Excel formula, so if you change the percentages in Excel, the total updates. |

Only the services you have saved lines for get a sheet.

## What's new in 1.8.3

### 1.8.3 (31 July 2026)

- **Sign-in that survives server moves.** The add-in now finds the ADLM server through a setting the Installer Hub puts on your computer, so a future server change does not need a new download.
- **Fixed:** signing in, licence checks and cloud saves failing after ADLM moved its server. Cloud saves and reopening cloud projects work again with this update.

### 1.8.2 (July 2026)

- **Fixed:** "already bound to another device" sign-in lockouts. Your licence used to be linked to whichever network connection was active, so docking a laptop, starting a VPN or switching between Wi-Fi and a cable could make the same computer look new. It now uses fixed hardware details, and your existing licence moves over automatically the first time you sign in.

### 1.2 (June 2026)

- The docked **ADLM MEP Take-Off** panel, with **Dock / Pop Out** to switch to a floating window.
- **Dark / Light** colours on Revit 2025 and later.
- One install covers Revit 2024, 2025, 2026 and 2027.
- Pricing in the Take-Off Database: unit rates, Bill Total, overhead and profit, the **Budget** page, and the Budget Summary sheet in the Excel export.
- Duct take-off now respects the level you choose, so quantities no longer spill across floors.
- Mouse-wheel scrolling works again in the take-off list.


## Troubleshooting

### The ADLM MEP & HVAC tab is missing

| Cause | Fix |
|---|---|
| Installed for a different Revit year | Reinstall from the Hub and choose the year you are opening. |
| Revit was open during the install | Close Revit completely and install again. |
| Revit's add-in security prompt was answered "Do Not Load" | Install again from the Hub, open Revit, and choose **Always Load**. |

### All the buttons on the tab are greyed out

You are not signed in. Click **Sign In** on the **Tools** panel. This is needed each time you start Revit.

### "Sign-in failed: Invalid email or password."

Check the email and password by signing in at [adlmstudio.net](/). If you have forgotten the password, reset it on the website, then try again in Revit.

### "Sign-in failed: No active subscription for 'mep'."

Your account does not have an active Revit MEP subscription. It may have expired, or it may be on a different account. Check your [dashboard](/dashboard). Remember that QUIV and the MEP Suite are separate subscriptions.

### "No active MEP subscription or device mismatch."

Either the subscription is not active, or your licence is in use on another computer. Check your [dashboard](/dashboard) first. If the subscription is active, free the other computer as described in [Moving to a new computer](/guides/installer-hub#moving-to-a-new-computer), then sign in again.

### "Internet required for first sign-in" or "Network error"

The add-in could not reach the ADLM server. Check your internet connection, then click **Sign In** again. If you use a VPN or a company proxy, try without it.

### A tool finds nothing

The elements are probably in a linked model, not the one you have open. Open the linked services file directly and run the tool there. Also check that you picked a level and a type on the model page.

### Clicking Result Info does nothing

Pick a level on the model page first. **Result Info** needs a level to work from.

### Counts are far below the drawings

The service is probably drawn but not modelled, for example as a single-line diagram or annotation. There is nothing to measure. Price that part another way and say so in your bill.

### Lines are named "Duct 1", "Pipe 2" and so on

The model uses default names. Rename the types in Revit and run the tool again.

### Lengths look too long

Check whether risers and drops are modelled as part of the run. They usually should be. Click the line on the model page to see exactly which elements were measured.

### My take-off is empty when I open Revit

That is normal. Each Revit session starts empty. Click **Load Latest Local** in the Take-Off Database to bring back your last take-off, or click a project under **RECENT CLOUD SAVES**.

### "Enter a project name before saving to cloud."

The project name box under **PROJECT** is empty. Type a name and click **Save to Cloud** again.

### "You must be signed in to save to the cloud."

Sign in from the **Tools** panel, then save again. Your rows are kept while you sign in.

### "Cloud save failed"

The message ends with "Your data is still saved locally." Nothing is lost. Check your connection and try again. If it keeps failing, contact support and mention the time of the failure.

### "Not Confirmed" after Save to Cloud

The server accepted the save but the project did not appear in your project list afterwards. This usually means the Revit MEP subscription on your account is not active. Check your [dashboard](/dashboard), then save again. Your data is safe in the local backup.

### "No projects found on your cloud account yet."

You have not saved a project to the cloud from this account yet, or the server is still processing a save you just made. Wait a few seconds and refresh the list.

### The Rate Gen search box is missing from Rate Build-Up

The search box only appears if your account has an active Rate Gen subscription. You can still build rates by typing rows with **+ Material** and **+ Labour**.

### The Dark / Light button is missing

Dark mode is available on Revit 2025, 2026 and 2027 only. On Revit 2024 the MEP screens are light only.

### I cleared the take-off by mistake

Click **Load Latest Local** straight away. **Clear All** does not wipe the local backup, so your rows come back.

### Something else went wrong

Contact ADLM through [support](/support) with your account email, your Revit year, and what you were doing. If asked, the add-in keeps a log file at `%AppData%\ADLM\RevitMEP\cloud.log` that helps support see what happened.

## Frequently asked questions

### Do I need QUIV to use the MEP Suite?

No. The MEP Suite works on its own with its own subscription. On a full bill you will usually want both: QUIV for the building and the MEP Suite for the services. They save as separate projects under the same account.

### Which Revit versions are supported?

Revit 2024, 2025, 2026 and 2027. When you install, the Hub asks which year you use and installs the right copy.

### Can I measure one floor at a time?

Yes. Pick a level under **Select Level** on the model page, save it with **Save to Take-Off**, then pick the next level. Choose **All Floors** to measure the whole building in one go.

### Will saving the same level twice double my quantities?

No. Rows already saved for that level with the same name, type and size are skipped, and the message tells you how many.

### Can I change a description before it goes into the bill?

Descriptions come from the names, types and sizes in the model. The best fix is to rename them in Revit and run the tool again, so the change sticks through every revision.

### Do I need a Rate Gen subscription to price?

No. You can type any rate, and you can build rates from material and labour by hand. Rate Gen only adds the library search inside the **Rate Build-Up** window.

### What currency are prices in?

Naira (₦).

### Does the MEP Suite work offline?

You need the internet to sign in and to save to the cloud. Once you are signed in, measuring and pricing happen on your computer, and your work is kept in the local backup.

### Where is my local backup kept?

On your computer, in your Windows user folder under `%AppData%\ADLM\RevitMEP`. You do not need to open it; use **Load Latest Local** instead.

### How do I move my licence to a new computer?

Free the old computer on the website, then install and sign in on the new one. The steps are in [Moving to a new computer](/guides/installer-hub#moving-to-a-new-computer).

### Can I import a services bill from Excel?

Not in the MEP Suite. It measures from the Revit model.

### Where are the video tutorials?

Click **User Guide** on the **ADLM** panel. It opens the ADLM video playlist in your browser.
