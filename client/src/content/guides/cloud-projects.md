---
id: cloud-projects
title: ADLM Cloud: projects and your workspace
tagline: Find your way around the ADLM Cloud, open your projects, and use the project page and its tabs.
version: "2026.10"
updated: 2026-10-07
platform: Web, any browser (adlmstudio.net)
productKeys: []
pdf: ADLM-Cloud-Projects-Guide.pdf
order: 10.1
---

This is one part of the [ADLM Cloud guide](/guides/cloud). It shows you how to find your way around the signed-in website, open a project and use its tabs. It covers the live site on 5 October 2026.

## What's new in 2026.10

- **One menu on every signed-in page.** The left-hand menu has three groups, **Work**, **Learn** and **Manage**, with **Ask Ada** at the top. Signing in takes you to your account **Overview**.
- **Every link now opens the new pages.** Since 4 October the menu, the account menu and every project card take you to the new screens: **Your work**, **Projects**, each tool's page and the new project page. Before that, some links still opened the older screens.
- **A new project page.** A project now opens on one page with tabs: **Overview**, **Bill**, **Rates & budget**, **PM dashboard**, **Activity schedule**, **Valuations**, and **Model**, **Drawings** or **Services** where they apply.
- **Export from the project page.** The **Export** button on the project page gets your Excel bills and PDF reports out without leaving the page.
- **The classic workspace is one click away.** **More actions** > **Open the classic workspace** opens the older project screen for the jobs the new page does not do yet, such as typing a price, the 3D model and the Work area.

## Before you start

### What you need

- **An ADLM account.** Use the same email and password you use in the desktop products.
- **A licence for the product the project came from.** A QUIV project needs an active QUIV licence; a HERON project needs HERON, and so on. A project a colleague shares with you still opens without the product, but you can only view it.
- **A Rate Gen licence (optional but recommended).** Without one you can still see and value a project, but you cannot pick rates from your Rate Gen library, and on projects shared with you the rates stay hidden. See [ADLM Rate Gen](/guides/rategen).
- **A browser.** Any up-to-date browser. The 3D views need WebGL, which every modern desktop browser has.

### How a project gets here

You do not create projects on the website. A project starts in a desktop product:

| Product | Where you measure | How it reaches the cloud |
|---|---|---|
| QUIV | Revit | Measure, then **Save to ADLM Cloud** |
| HERON | PlanSwift | **Take off with HERON**, then **Save to ADLM Cloud** |
| Revit MEP (shown on the website as SERVIQ) | Revit | Extract, then **Save to ADLM Cloud** |
| CIVIQ | Civil 3D | Extract, then **Save to ADLM Cloud** |

Every save from the plugin creates a new version of the project. Re-saving does not throw away the rates, progress or notes you added on the website.

> **Note:** The steps for each plugin are in its own guide: [QUIV for Revit](/guides/quiv), [HERON](/guides/heron) and [Revit MEP](/guides/mep).

## Finding your way around

### The menu

Every signed-in page has a menu down the left side. On a phone, open it with the menu button at the top left. The search box at the top jumps to a page by its name. On the Work pages it reads **Search projects, rates and programmes**.

At the top of the menu is **Ask Ada** (**Your library, answered**). Click it to open Ada, ADLM's assistant. See [Ada, your assistant](/guides/cloud-sharing#ada-your-assistant).

Below it are three groups:

- **Work**: **Overview**, **My tools** and **Projects**.
- **Learn**: **My learning**, **Assignments**, **Certificates**, **Lessons & events** and **Guides & docs**.
- **Manage** (marked **Installer Hub**): **Overview**, **Products & seats**, **Team**, **Billing & invoices**, **Downloads** and **Support**.

**Account settings** and **Sign out** sit at the bottom. The Learn and Manage groups are covered in [Getting started](/guides/getting-started#your-account-area).

Under the top bar, the pages of the group you are in also show as tabs, so you can move between them without opening the menu.

### The account menu

Click your name at the top right to open the account menu. It shows your name and email, then:

- **Dashboard**: your account **Overview** (`/manage`).
- **Account settings**: your settings (`/manage/settings`).
- **Billing & invoices**: your plan and invoices (`/manage/billing`).
- **Sign out**.

### What the Work items open

| Menu item | Opens | Address |
|---|---|---|
| **Overview** | **Your work**, the overview of all your projects | `/work` |
| **My tools** > **QUIV** | The **QUIV** page: your QUIV projects | `/work/tool/quiv` |
| **My tools** > **HERON** | The **HERON** page: your HERON projects | `/work/tool/heron` |
| **My tools** > **RateGen** | Your Rate Gen library on the web | `/work/library` |
| **My tools** > **Constants** | The constants behind every budget | `/work/constants` |
| **My tools** > **SERVIQ** | The **Revit MEP** page: your services projects | `/work/tool/mep` |
| **My tools** > **CIVIQ** | The **CIVIQ** page: your road projects | `/work/tool/civiq` |
| **Projects** | **Projects**, every project on your account | `/work/projects` |

A QUIV, HERON, SERVIQ or CIVIQ entry you have no licence for is greyed and marked **Add**. Clicking it opens that product's page, where you can buy it.

> **Note:** Old bookmarks still work. A saved link to a project in the older screens opens the same project on the new project page.

## Your work: the overview

Click **Overview** under **Work** to open **Your work**: "What needs you today, then everything in hand: projects, money, programme and rates."

![The ADLM Cloud overview: what needs a decision, where you left off and your projects.](shot:cloud-overview.png)

At the top right are your **Zone** and **Currency**. Both are account settings, so changing them here changes them everywhere.

Four figures run across the top. Click one to go to the page behind it:

- **Measured work, all projects**: the value of your measured work, at the rates each project was priced with.
- **Certified to date**: what has been certified, with a bar showing the share of the work's value.
- **Items waiting for a rate**: how many bill lines have no rate yet, and across how many projects. "Everything measured has a rate" means none.
- **Needs a decision**: how many things are waiting on you, and how many are urgent.

Below the figures:

- **Needs a decision** lists what is waiting on you: items that still need a rate, valuations awaiting approval, tasks past their end date and so on. Click **Open** on a row to go to the place where it is resolved. "Nothing is waiting on you." means the list is empty.
- **Continue where you left off** reopens the projects and tabs this browser last had open.
- **Projects** lists your projects, most recently updated first. Click **All projects** to see them all.

![The lower part of the ADLM Cloud overview.](shot:cloud-overview-more.png)

Further down:

- **Valuations and variations**: the latest certificates and variations, most recent first, with their status (**Draft**, **Pending**, **Approved** or **Rejected**).
- **Programme**: tasks that are overdue, due in the next two weeks, or under way.
- **RateGen**: your recently changed rates and where they are used. **Open RateGen** opens your library.
- **Learning**: assignments due and your next lesson.

If you have no projects yet, the page says so and offers **Install the plugins** and **Open the rate library**.

## Your projects

### Projects

Click **Projects** in the menu to open the full list: "Every project starts where its quantities were extracted: QUIV or SERVIQ in Revit, HERON in PlanSwift, CIVIQ in Civil 3D. From then on it lives here."

![The Projects list, filterable by source tool and stage.](shot:cloud-projects.png)

Each project shows its name, its source tool, its stage, its estimated value, its progress and when it was last updated. A project marked **Shared with you** belongs to someone else. **Share link on** means its public dashboard link is turned on. **Money hidden** means the owner's rates are not shown to you.

To find a project:

1. Type in **Search projects**.
2. Narrow the list with **Source** (**All tools**, or one product) and **Stage** (**Every stage**, or one stage).
3. Choose a **Sort**: **Recently updated**, **Name**, **Estimated value** or **Stage**.
4. Switch **Layout** between **Grid** and **List**.

Click a project to open it on the project page.

The stages are **Takeoff**, **Priced**, **Tendered**, **Contract locked**, **Valuations** and **Final account**.

### A tool's page

Click a tool under **My tools**, for example **QUIV**, to open that tool's page. It lists only the projects that started in that tool.

![The QUIV page on ADLM Cloud, listing the projects saved from QUIV.](shot:cloud-tool-quiv.png)

At the top are three figures: **Projects**, **Estimated** (their combined value) and **Last saved**.

**How a project starts** shows the steps in the desktop product, for example for QUIV: **Open the model in Revit**, **Run QUIV and extract**, then **Save to ADLM Cloud**. For HERON: **Open the drawings in PlanSwift**, **Take off with HERON**, then **Save to ADLM Cloud**.

![The HERON page on ADLM Cloud, listing the take-offs saved from HERON.](shot:cloud-tool-heron.png)

Below the steps are your **Learning samples** (see below) and the tool's projects, with the same search, filters and sort as the **Projects** page.

If your account does not have that product, the page says so ("QUIV is not on this account") and offers **Add QUIV**. Projects a consultant shares with you still open from here.

### Storage, merging and deleting

Storage, merging and deleting are done in the tool's classic workspace. On the tool's page, click **Open the QUIV workspace** (or **Open the HERON workspace**, and so on) beside **How a project starts**.

**Cloud Storage** shows how many project slots you have used, for example "12 of 30 projects". Near the limit you see **Upgrade storage**. At the limit you see **Buy more storage**, and you must delete a project or buy more slots before you can save another. Extra slots are sold in blocks of ten.

The other buttons on that page:

- **Refresh projects** reloads the list, for example straight after a save from the plugin.
- **Portfolio Dashboard** opens the roll-up of all your projects (see [Portfolio dashboard](/guides/cloud-pm#the-portfolio-dashboard)).
- **Add shared project** adds a project a colleague shared with you by code.

To delete projects:

1. Click **Select** on each project card you want, or **Select all** for every project shown. **Clear** empties the selection.
2. Click **Delete selected**. You are asked to confirm, and this cannot be undone.
3. To delete one project, click **Delete** on its card. Only the owner sees this button.

**Merge selected** combines two or more projects into one, for example the architectural and structural models of one building, or several buildings on one job.

1. Select two or more projects.
2. Click **Merge selected**.
3. Answer the first question: click **OK** if they are separate buildings on one job (each gets its own sheet in the exported bill), or **Cancel** if they are disciplines of one structure.
4. Type a name for the merged project and confirm.

The originals are kept. Inside the merged project you can change the order of the buildings or disciplines with the up and down arrows.

### Learning samples

On a tool's page you may see **Learning samples**: "Worked projects with every tab filled in on a real-looking job." QUIV and HERON samples are worked duplex jobs, one per foundation type. Revit MEP samples cover the services for those duplexes, and CIVIQ samples are road and drainage jobs.

Each sample card shows its contract value, its lines and its certificates.

To use a sample:

1. Click a sample card. It opens on the project page like any other project.
2. Open any tab, filter or export. Samples are read-only, so nothing can be changed.
3. Click **Hide samples** to fold the strip away, or **Show N samples** to bring it back. This only hides them in this browser.

Samples appear for products you have an active licence for. More on samples is in [Sample projects](/guides/samples).

### Carbon and your own rates on a sample

A sample card can also show:

- **Carbon footprint**: the bill's upfront embodied carbon (A1-A5), in tonnes of CO2e, worked out from your own Rate Gen rates.
- **Covers**: how much of the bill's cost that carbon figure covers, for example "94% of cost".

An open sample in the classic workspace has a **Price with my RateGen rates** panel. It shows the sample's bill priced with your own Rate Gen rates for your state. Nothing is saved.

1. Open a sample, then click **More actions** > **Open the classic workspace**.
2. Click **Price with my rates**. The button reads **Pricing…** while it works.
3. Read the tiles: **Bill as priced (lines your rates cover)**, **With your RateGen rates** (with the difference as a percentage) and **Lines priced**.
4. Read the table. **From** says how each line was priced: **Same item**, **By the work** (marked **assumed** where it assumed something), **Services pricing** or **Not priced**.
5. Click **Price again** after changing your rates in Rate Gen.

Lines no rate fits are listed as not priced rather than guessed. A CIVIQ sample tells you Rate Gen has no civil rates instead of pricing a road from building rates. The panel needs a Rate Gen licence.

## Inside a project

### The project page

Click any project card to open the project page. At the top are:

- The way back: **Projects** › the tool's name.
- The project name and its stage, for example **Priced**.
- The tool and model file, the client ("No client yet" if none is recorded) and the location.

On the right of the header:

- **Saved**, **Saving…**, **Saved just now** or **Not saved**: whether your last change has reached the server. Changes save on their own. If a save fails, click **Try again**. A project you can only view shows no save status.
- **Export**: your Excel bills and PDF reports. See [Exports from the project page](#exports-from-the-project-page).
- **Jump to project**: open another project without going back to the list. Type in **Search projects** and click the one you want. You stay on the same tab where you can.
- **More actions** (the three dots):
  - **Collaborators**: invite colleagues (owner only). See [Collaborators](/guides/cloud-sharing).
  - **Copy project ID**: copies the ID used by **Open from Cloud** in the Windows plugins.
  - **Project report** and **Project management report**: download a PDF report.
  - **Open the full workspace**: the whole job on one screen, on a date you choose (see below).
  - **Open the classic workspace**: the older project screen (see below).

On a project shared with you, a note reads **Shared with you.** "You can see everything and follow progress. Editing needs a seat on the owner's account."

### The tabs

Below the header are the project's tabs. The project reopens on the tab you were on.

![The project Bill, grouped by section, with filters for unpriced items and items changed in the model.](shot:cloud-project-bill.png)

| Tab | What it is for | Where it is explained |
|---|---|---|
| **Overview** | Stage, progress, estimated and actual cost, what needs a decision, value by section, source and people | Below |
| **Bill** | The bill of quantities, grouped by section | [The bill and the budget](/guides/cloud-bill-budget) |
| **Rates & budget** | Pricing lines from your Rate Gen rates, the budget and the buy schedule | [The bill and the budget](/guides/cloud-bill-budget) |
| **PM dashboard** | Tasks, schedule, overdue work, risks and issues | [Programme and project management](/guides/cloud-pm) |
| **Activity schedule** | Labour activities and trades on site, week by week | [Programme and project management](/guides/cloud-pm) |
| **Valuations** | Certificates and variations | [Valuations and contract administration](/guides/cloud-valuation) |
| **Model** | QUIV and Revit MEP projects: the models behind the bill | Below |
| **Drawings** | HERON projects: the drawings the take-off came from | Below |
| **Services** | QUIV and HERON projects: linked services projects | Below |

A dot on **Rates & budget** means lines still need a rate. A dot on **Valuations** means a valuation is awaiting approval, and a dot on **PM dashboard** means tasks are overdue. The **Bill** tab shows how many lines the bill has.

On the **Overview**, **Bill**, **Rates & budget** and **PM dashboard** tabs, a short tip may appear above the tab, pointing you to the next useful step for this project.

### Overview

The **Overview** tab answers three questions: what is the job worth, how much is done, and what is left.

- **Progress**: the share of the work done, weighted by value.
- **Estimated and actual**: the **Estimated total** (measured work, provisional sums, PC sums and approved variations) beside the **Actual to date**. Actual starts once the contract is locked and the first valuation is approved.
- **Needs a decision**: what is waiting on you in this project, for example "4 items still need a rate" with **Price them**, or a valuation awaiting approval with **Open**.
- **Value by section**: what each bill section is worth. A section with no rates reads **Unpriced**.
- **Source**, **Linked services** and **People**: where the project was measured, the services linked to it, and who works on it.

When the project is ready for its next stage, a button such as **Move to Tendered** moves it on. **Continue: Bill ›** takes you to the bill.

### Model, Drawings and Services

- **Model** (QUIV and Revit MEP) shows **Where this was measured**: the models attached to the project, one per discipline, and how many bill items each one gives. If the model no longer covers the whole bill, the tab says so. Uploading a model is done in the classic workspace.
- **Drawings** (HERON) shows the drawings the take-off came from.
- **Services** (QUIV and HERON) shows the Revit MEP projects linked to this building, so their value joins the project total. "No services linked" means none yet. Linking is done in the classic workspace (see [Linking services](#linking-services)).

### The full workspace

**More actions** > **Open the full workspace** shows the whole job on one date: the 3D model, the programme, what is being built, what has to be bought and what it should have cost by then.

1. Click **More actions** > **Open the full workspace**.
2. Drag **Move through the programme** to a date, or click **Play the sequence** to watch the job build. Choose a **Playback speed** of **0.5x**, **1x**, **2x** or **4x**.
3. Read **On this date**: what is **Being built**, **Planned value**, **Committed spend**, **Next spend** and anything **Overdue to buy**.
4. Click **Leave full screen**, or press <kbd>Esc</kbd>, to return to the tabs.

A project with no 3D model shows "No 3D model on this project" in the model area. The rest still works.

### The classic workspace

The new page does not do everything yet. For typing a price on a line, editing the budget, the 3D model viewer, the Work area with Ada's checks, linking services and uploading models, use the classic workspace:

1. Click **More actions** (the three dots).
2. Click **Open the classic workspace**.

The same project opens in the older screen. Its **Views** list down the side has these views:

| Group | View | What it is for |
|---|---|---|
| Overview | **Dashboard** | Overview and progress, linked services |
| Commercial | **Bill of Quantity** | Rates and line items |
| Commercial | **Budget** | Cost plan & procurement |
| Commercial | **Valuation** | Certificates and settings |
| Delivery | **Work area** | Model, bill, schedule and Ada together |
| Delivery | **3D Model** | View & verify the BIM model |
| Delivery | **PM Dashboard** | Schedule, EVM, risks, issues |

> **Important:** In the classic workspace, changes to rates, progress and valuation settings are not kept until you click **Save changes**. Save before you leave the page.

**3D Model** does not appear for HERON projects or for projects imported from an Excel bill, because they are measured from drawings rather than a model.

### Linking services

On QUIV and HERON projects, the classic **Dashboard** has **Linked Services & Works**. Link the Revit MEP services for the same building so the **Linked total** shows the whole job.

1. Open the classic workspace and click **Dashboard**.
2. Click **+ Link a project**.
3. Choose it from **Select a project…**.
4. Click **Link**. **Unlink** removes it later.

The linked project then shows on the new page's **Services** tab.

On Revit MEP projects, **Price services from RateGen** prices the services bill from your Rate Gen library. Click **Price services**. The lengths, joints and fittings it allows for come from your Services Constants (see [Material and Services Constants](/guides/cloud-bill-budget#material-and-services-constants)).

### 3D Model

The classic **3D Model** view opens the attached model in your browser.

1. Pick the discipline (**Architectural** or **Structural**).
2. Click a line in the **Bill of Quantity** panel to light up its elements in the model, or click an element to find the lines it was measured for.
3. **Material breakdown** shows the material lines behind the selection.
4. Click **Clear highlight** to start again.

The model is attached automatically when you save from QUIV.

### Work area

The classic **Work area** puts the model, the priced bill (**Bill of Quantities**) and the **Construction schedule** on one screen, with Ada beside them.

1. Click **Work area** in **Views**.
2. Pick a bill line: its elements light up and the tasks that build it are marked.
3. Pick a task: the lines it builds light up.
4. Click an element: the lines and tasks behind it are found.

Use **Filter bill lines** and **Filter tasks** to narrow the lists.

The **Ada** panel reads **Answering from** your project. It has an **Ask about this project** box and these buttons:

| Button | What it does | AI? |
|---|---|---|
| **Check duration, time, cost & material** | A health check worked out on the page: schedule against the project finish, actual cost, material | No |
| **Check my rates against the market** (or **Check N selected line(s)**) | Compares your priced lines with the Rate Gen library for your zone | Yes |
| **Scan the bill for errors** | Duplicates, wrong units, implausible quantities, rate outliers | Yes |
| **Build up a rate for the selected line** | Suggests a breakdown of one line's rate into material, labour and plant. It is advice only: nothing is saved to your library | Yes |
| **What is this project worth?** | Asks Ada for the value and work done | Yes |

After the health check, **Ask Ada to explain** asks her to talk you through it. The panel reminds you: "Ada only uses items that exist in this account. She proposes; you decide."

To run a market check:

1. Tick lines in **Bill of Quantities** to check only those, or tick nothing to check them all.
2. Click **Check my rates against the market**.
3. Read the answer in the Ada panel. Each line gets a chip in the **Check** column: above market, below market, in range or unit mismatch.

No rate is ever changed by a check. To use a better rate, pick it from your Rate Gen library on the bill. Rates are built only in the ADLM Rate Gen desktop app, never on the website.

## Exports from the project page

Click **Export** in the project header. The menu has five groups:

| Group | Exports |
|---|---|
| **Bill & budget, Excel** | **Bill & budget** (by section) and **Bill & budget by trade** |
| **Elemental BoQ, Excel** (by building element) | **Bungalow** or **Multi-storey** |
| **Trade BoQ, Excel** (by work section, NRM2-style) | **Bungalow** or **Multi-storey** |
| **Milestone BoQ, Excel** (one bill per stage) | **Bungalow** or **Multi-storey** |
| **Reports, PDF** | **Project report** and **Project management report** |

The button reads **Exporting…** while the file is made, and **Downloaded** appears when it is saved. If the server refuses, for example because you can only view the project or have no Rate Gen licence, a message says why.

On a bill imported from Excel, the **Bill & budget** export keeps the bill's own sections and totals. Each export is described in [Exports and reports](/guides/cloud-bill-budget#exports-and-reports).

### ICMS 3 cost and carbon

The ICMS 3 exports are in the classic workspace's **Export** menu, in the **ICMS 3** group ("international cost and carbon report"):

- **ICMS 3 cost and carbon (Excel)**: cost and upfront carbon (A1-A5) by ICMS 3 Group, with every line's code, where its carbon came from, and the lines not yet placed.
- **ICMS 3 cost and carbon (JSON)**: the same report as data, with full ICMS 3 codes, in the RICS Data Standard 3.3.3 format.

To get one, click **More actions** > **Open the classic workspace**, then **Export**. The project page's own **Export** menu does not have the **ICMS 3** group. It works on learning samples too.

## AI in this part of ADLM Cloud

- **Work area checks** (classic workspace): market check, error scan and rate build-up suggestion, as above. On for everyone with an active licence. Each draws on your monthly AI allowance.
- **Ada**: ask about any of your projects from **Ask Ada**. Signed in, she reads only your own account. On a sample, **Ask about this project** in the Work area can comment on the lines you selected, but cannot read the rest of the sample.
- **Tips on the project page** are worked out from rules on the page, not by AI, and cost nothing.

See [ADLM AI services](/guides/ai-services) for how each feature works and what it costs.

## Troubleshooting

### My project is not on the website

Check that the plugin's save finished; the plugin confirms when a project is saved to the cloud. Then refresh the **Projects** page. Make sure you are signed in to the website with the same account as the plugin. If the plugin started offline, sign out and back in with a connection, then save again.

### I cannot save another project: storage is full

Open the tool's classic workspace (**Open the QUIV workspace** on the tool's page). The **Cloud Storage** bar shows you are at your limit. Delete projects you no longer need, or click **Buy more storage** to add slots in blocks of ten.

### The project page says "Not saved"

Your last change did not reach the server, often because the connection dropped. Click **Try again**. If it still fails, the reason is shown beside the button.

### My changes in the classic workspace disappeared

In the classic workspace, rates, progress and settings are only kept when you click **Save changes**. Make your edits again and save before leaving.

### "That project is not on this account"

The link is to a project your account cannot open. It may belong to someone else who has not shared it with you, or it may have been deleted. Open **Projects** to see what you have.

### I cannot find Select, Merge or Delete

They are on the tool's classic workspace. On the tool's page, click **Open the QUIV workspace** (or the one for your tool).

## Frequently asked questions

### Do I need Revit or PlanSwift to use ADLM Cloud?

No. You need the plugin to measure and save a project, but once it is on the cloud you can price, value, programme and share it from any browser.

### Can I still use the old project screen?

Yes. On any project, click **More actions** > **Open the classic workspace**.

### Can I delete a sample project?

No. Samples are read-only and cannot be deleted. Click **Hide samples** to fold them away.

### Can I build or edit a rate on the website?

No. Rates are built only in the ADLM Rate Gen desktop app. On the website you can pick a Rate Gen rate onto a line. See [The bill and the budget](/guides/cloud-bill-budget).

### Why is there no Model tab on my HERON project?

HERON projects are measured from 2D drawings, so they have a **Drawings** tab instead.

### Where do I get help?

Ask Ada, chat with us on WhatsApp on +234 810 650 3524, or raise a ticket from **Support** in the menu.
