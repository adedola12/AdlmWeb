---
id: cloud-projects
title: ADLM Cloud: projects and your workspace
tagline: Find your way around the ADLM Cloud, open your projects, and use the project dashboard, 3D model and work area.
version: "2026.10"
updated: 2026-10-04
platform: Web, any browser (adlmstudio.net)
productKeys: []
pdf: ADLM-Cloud-Projects-Guide.pdf
order: 10.1
---

This is one part of the [ADLM Cloud guide](/guides/cloud). It shows you how to find your way around the signed-in website, open a project and use its screens. It covers the live site on 4 October 2026.

## What's new in 2026.10

- **One menu on every signed-in page.** Since 1 October the left-hand menu has three groups, **Work**, **Learn** and **Manage**, with **Ask Ada** at the top. Signing in takes you to your **Overview**.
- **Carbon footprint on sample cards.** Each learning sample card shows its upfront carbon (A1-A5) in tCO2e, and how much of the bill's cost that figure covers.
- **Price with my RateGen rates** on an open sample: see the sample's bill priced with your own Rate Gen rates, without saving anything.
- **ICMS 3 cost and carbon export** on every project you can export, samples included. See [Exports](#exports-from-the-project-screen).
- **QUIV budgets priced on save.** For accounts with Rate Gen, a QUIV 4 save arrives with its material and labour schedule already priced.

## Before you start

### What you need

- **An ADLM account.** Use the same email and password you use in the desktop products.
- **A licence for the product the project came from.** A QUIV project needs an active QUIV licence; a HERON project needs HERON, and so on. A project a colleague shares with you also needs the matching product licence.
- **A Rate Gen licence (optional but recommended).** Without one you can still see and value a project, but you cannot pick rates from your Rate Gen library, and on projects shared with you the rates stay hidden. See [ADLM Rate Gen](/guides/rategen).
- **A browser.** Any up-to-date browser. The 3D model needs WebGL, which every modern desktop browser has.

### How a project gets here

You do not create projects on the website. A project starts in a desktop product:

| Product | Where you measure | How it reaches the cloud |
|---|---|---|
| QUIV | Revit | Measure, then **Save to ADLM Cloud** |
| HERON | PlanSwift | **Take off with HERON**, then **Save to ADLM Cloud** |
| Revit MEP (shown on the website as SERVIQ) | Revit | Extract, then **Save to ADLM Cloud** |
| CIVIQ | Civil 3D | Extract, then **Save to ADLM Cloud** |

Every save from the plugin creates a new version of the project. Re-saving does not throw away the rates, purchase marks or supplier notes you added on the website.

> **Note:** The steps for each plugin are in its own guide: [QUIV for Revit](/guides/quiv), [HERON](/guides/heron) and [Revit MEP](/guides/mep).

## Finding your way around

### The menu

Every signed-in page has a menu down the left side. On a phone, open it with the menu button at the top left. The search box at the top (**Search projects, rates and programmes**) jumps to a page by its name.

At the top of the menu is **Ask Ada** (**Your library, answered**). Click it to open Ada, ADLM's assistant. See [Ada, your assistant](/guides/cloud-sharing#ada-your-assistant).

Below it are three groups:

- **Work**: **Overview**, **My tools** and **Projects**.
- **Learn**: **My learning**, **Assignments**, **Certificates**, **Lessons & events** and **Guides & docs**.
- **Manage** (marked **Installer Hub**): **Overview**, **Products & seats**, **Team**, **Billing & invoices**, **Downloads** and **Support**.

**Account settings** and **Sign out** sit at the bottom. The Learn and Manage groups are covered in [Getting started](/guides/getting-started#your-account-area).

### What the Work items open

| Menu item | Opens | Address |
|---|---|---|
| **Overview** | Your account **Overview**, the page you land on after signing in | `/manage` |
| **My tools** > **QUIV** | **QUIV projects** | `/projects/revit` |
| **My tools** > **HERON** | **HERON projects** | `/projects/planswift` |
| **My tools** > **RateGen** | Your Rate Gen library on the web | `/rategen` |
| **My tools** > **Constants** | **Material Constants** | `/rategen/material-constants` |
| **My tools** > **SERVIQ** | **Revit MEP projects** | `/projects/mep` |
| **My tools** > **CIVIQ** | **CIVIQ projects** | `/projects/civil3d` |
| **Projects** | **All Projects**, every project on your account | `/portfolio` |

A tool you have no licence for is marked **Add**. Click it to see the product and buy it.

## Your projects

### All Projects

Click **Projects** in the menu to open **All Projects** ("Projects synced from your ADLM desktop plugins"). Projects are grouped by product. Each card shows the project name, the product, the number of items and when it was last updated. A card marked **Shared** has a public dashboard link turned on.

1. Find the project under its product.
2. Click the card. The project opens in that product's workspace.

If you have QUIV, a note at the top links to the **PM Tracker**. **Back to Dashboard** returns you to your Overview.

### A product's project list

Click a tool under **My tools**, for example **QUIV**, to open that product's full project list:

| Product | Page title | Address |
|---|---|---|
| QUIV | **QUIV projects** | `/projects/revit` |
| HERON | **HERON projects** | `/projects/planswift` |
| Revit MEP | **Revit MEP projects** | `/projects/mep` |
| CIVIQ | **CIVIQ projects** | `/projects/civil3d` |

At the top are summary tiles: the combined value of the projects shown, **Completed to date** with the share of lines marked, and **Outstanding balance**.

**Cloud Storage** shows how many project slots you have used, for example "12 of 30 projects". Near the limit you see **Upgrade storage**. At the limit you see **Buy more storage**, and you must delete a project or buy more slots before you can save another. Extra slots are sold in blocks of ten.

The header buttons:

- **Refresh projects** reloads the list, for example straight after a save from the plugin.
- **Portfolio Dashboard** opens the roll-up of all your projects (see [Portfolio dashboard](/guides/cloud-pm#the-portfolio-dashboard)).
- **PM Tracker · QUIV** (QUIV list only) opens the standalone [PM Tracker](/guides/cloud-pm#the-pm-tracker).
- **Add shared project** adds a project a colleague shared with you by code.

### Selecting, merging and deleting

1. Click **Select** on each project card you want, or **Select all** for every project shown. **Clear** empties the selection.
2. Click **Delete selected** to delete them. You are asked to confirm, and this cannot be undone.
3. To delete one project, click **Delete** on its card. Only the owner sees this button.

**Merge selected** combines two or more projects into one, for example the architectural and structural models of one building, or several buildings on one job.

1. Select two or more projects.
2. Click **Merge selected**.
3. Answer the first question: click **OK** if they are separate buildings on one job (each gets its own sheet in the exported bill), or **Cancel** if they are disciplines of one structure.
4. Type a name for the merged project and confirm.

The originals are kept. Inside the merged project you can change the order of the buildings or disciplines with the up and down arrows.

### Learning samples

Above your own projects you may see **Learning samples**: worked projects with every view filled in, so you can see a priced, valued and certified job before your own gets there. QUIV and HERON samples are worked duplex jobs, one per foundation type. Revit MEP samples cover the services for those duplexes, and CIVIQ samples are road jobs.

Each sample card shows its value, progress and certificates. New in October, a card can also show:

- **Carbon footprint**: the bill's upfront embodied carbon (A1-A5), in tonnes of CO2e, worked out from your own Rate Gen rates.
- **Covers**: how much of the bill's cost that carbon figure covers, for example "94% of cost". Hover over the figure to see the basis.

The carbon figure appears only when your account has a Rate Gen library to work it out from.

To use a sample:

1. Click a sample card. A banner reads **Sample project** and **Read-only learning material**.
2. Open **What to look at in this sample** for the things worth looking at.
3. Open any view, filter or export. Nothing can be changed.
4. Click **Hide samples** on the list to fold the strip away, or **Show N samples** to bring it back. This only hides them in this browser.

Samples appear for products you have an active licence for. More on samples is in [Sample projects](/guides/samples).

### Price a sample with your own Rate Gen rates

An open sample has a **Price with my RateGen rates** panel: "See this bill priced with your own RateGen rates for" your state. Nothing is saved.

1. Open a sample.
2. Click **Price with my rates**. The button reads **Pricing…** while it works.
3. Read the three tiles:
   - **Bill as priced (lines your rates cover)**: the sample's own total for the lines your library could price.
   - **With your RateGen rates**: the same lines at your rates, with the difference as a percentage.
   - **Lines priced**: how many lines your rates priced, for example "212 of 240", and the share of the bill's cost they make up.
4. Read the table: **Item**, **Qty**, **Unit**, **Bill rate**, **Your rate** and **From**. **From** says how each line was priced: **Same item**, **By the work** (matched by the work the line measures, marked **assumed** where it assumed something), **Services pricing** (SERVIQ lines) or **Not priced**.
5. Click **Show all N lines** to see every line. Click **Price again** after changing your rates in Rate Gen.

Lines no rate fits are listed as not priced rather than guessed. A CIVIQ sample tells you Rate Gen has no civil rates instead of pricing a road from building rates. The panel needs a Rate Gen licence.

## Inside a project

### The project screen

When you open a project, the bar at the top holds:

- **Projects**: back to the list.
- The contract status: **Draft (editable)** or **Contract locked**.
- **Copy project ID**: copies the ID used by **Open from Cloud** in the Windows plugins.
- **Collaborators**: invite colleagues (owner only).
- **Delete**: delete the project (owner only).
- **Project report**: preview and download a PDF progress report. On the PM Dashboard this button reads **PM report**.
- **Export** (**Workbooks**): the Excel and ICMS 3 exports.
- **Save changes**: saves your rates, progress and settings. It reads **Saved** when there is nothing new to save.

> **Important:** Changes to rates, progress and valuation settings are not kept until you click **Save changes**. Save before you leave the page.

Down the side is **Views**, the project's screens in three groups. Click **Hide** to give the bill the full width, and **Views** to bring the list back. The project reopens on the view you last used.

| Group | View | What it is for |
|---|---|---|
| Overview | **Dashboard** | Overview and progress |
| Commercial | **Bill of Quantity** | Rates and line items |
| Commercial | **Budget** | Cost plan & procurement |
| Commercial | **Valuation** | Certificates and settings |
| Delivery | **Work area** | Model, bill, schedule and Ada together |
| Delivery | **3D Model** | View & verify the BIM model |
| Delivery | **PM Dashboard** | Schedule, EVM, risks, issues |

**3D Model** does not appear for HERON projects or for projects imported from an Excel bill, because they are measured from drawings rather than a model.

The Bill of Quantity and Budget are covered in [The bill and the budget](/guides/cloud-bill-budget). Valuation is in [Valuations and contract administration](/guides/cloud-valuation), and the PM Dashboard in [Programme and project management](/guides/cloud-pm).

### Dashboard

The Dashboard answers three questions: what is the job worth, how much is done, and what is left.

- **Estimated total**: measured work, sums, preliminaries, contingency, VAT and approved variations.
- **Completed to date**: completed items plus executed PC sums, preliminaries and variations.
- **Outstanding balance**: the estimated total less what has been earned.
- **Progress**: the share of the work done.

**Progress overview** counts completed, remaining and total work items. If you record actual quantities or rates, **Actual vs planned performance** compares them with the plan. Switch the chart between **Donut**, **Bars** and **Trend**.

On QUIV and HERON projects, **Linked Services & Works** lets you link another project, such as the Revit MEP services for the same building, so the **Linked total** shows the whole job.

1. Click **+ Link a project**.
2. Choose it from **Select a project…**.
3. Click **Link**. **Unlink** removes it later.

On Revit MEP projects, **Price services from RateGen** prices the services bill from your Rate Gen library. Click **Price services**. The lengths, joints and fittings it allows for come from your Services Constants (see [Material and Services Constants](/guides/cloud-bill-budget#material-and-services-constants)).

The **Share dashboard** button on this view creates a public link for your client. See [Sharing a dashboard with your client](/guides/cloud-sharing#sharing-a-dashboard-with-your-client).

### 3D Model

The 3D Model view opens the attached model in your browser.

1. Pick the discipline (**Architectural** or **Structural**).
2. Click a line in the **Bill of Quantity** panel to light up its elements in the model, or click an element to find the lines it was measured for.
3. **Material breakdown** shows the material lines behind the selection.
4. Click **Clear highlight** to start again.

The model is attached automatically when you save from QUIV. See **BIM models** in [Valuations and contract administration](/guides/cloud-valuation#bim-models).

### Work area

The Work area puts the model, the priced bill (**Bill of Quantities**) and the **Construction schedule** on one screen, with Ada beside them.

1. Click **Work area** in **Views**.
2. Pick a bill line: its elements light up and the tasks that build it are marked.
3. Pick a task: the lines it builds light up.
4. Click an element: the lines and tasks behind it are found.

Use **Filter bill lines** and **Filter tasks** to narrow the lists. With nothing picked, the screen says "Pick a bill line, a task or an element to see how they join up."

The **Ada** panel reads **Answering from** your project. It has an **Ask about this project** box and these buttons:

| Button | What it does | AI? |
|---|---|---|
| **Check duration, time, cost & material** | A health check worked out on the page: schedule against the project finish, actual cost, material | No |
| **Check my rates against the market** (or **Check N selected line(s)**) | Compares your priced lines with the Rate Gen library for your zone | Yes |
| **Scan the bill for errors** | Duplicates, wrong units, implausible quantities, rate outliers | Yes |
| **Build up a rate for the selected line** | One line's rate from material, labour and plant | Yes |
| **What is this project worth?** | Asks Ada for the value and work done | Yes |

After the health check, **Ask Ada to explain** asks her to talk you through it. The panel reminds you: "Ada only uses items that exist in this account. She proposes; you decide."

To run a market check:

1. Tick lines in **Bill of Quantities** to check only those, or tick nothing to check them all.
2. Click **Check my rates against the market**.
3. Read the answer in the Ada panel. Each line gets a chip in the **Check** column: above market, below market, in range or unit mismatch.

No rate is ever changed by a check. To use a better rate, pick it from your Rate Gen library on the bill.

## Exports from the project screen

Click **Export** in the top bar. The groups are **Bill & Budget**, **Generic BoQ**, **Elemental BoQ**, **Trade BoQ**, **Milestone BoQ** and **ICMS 3** ("international cost and carbon report"). Each is described in [Exports and reports](/guides/cloud-bill-budget#exports-and-reports).

The ICMS 3 group has two exports:

- **ICMS 3 cost and carbon (Excel)**: cost and upfront carbon (A1-A5) by ICMS 3 Group, with every line's code, where its carbon came from, and the lines not yet placed.
- **ICMS 3 cost and carbon (JSON)**: the same report as data, with full ICMS 3 codes, in the RICS Data Standard 3.3.3 format.

The export menu is on every project you can export, including learning samples. Collaborators with **View only** access, and collaborators without Rate Gen on priced exports, cannot download.

## AI in this part of ADLM Cloud

- **Work area checks**: market check, error scan and rate build-up, as above. On for everyone with an active licence. Each draws on your monthly AI allowance.
- **Ada**: ask about any of your projects from **Ask Ada**. Signed in, she reads only your own account. On a sample, **Ask about this project** in the Work area can comment on the lines you selected, but cannot read the rest of the sample.

See [ADLM AI services](/guides/ai-services) for how each feature works and what it costs.

## Troubleshooting

### My project is not on the website

Check that the plugin's save finished; the plugin confirms when a project is saved to the cloud. Then click **Refresh projects** on the product's list. Make sure you are signed in to the website with the same account as the plugin. If the plugin started offline, sign out and back in with a connection, then save again.

### I cannot save another project: storage is full

The **Cloud Storage** bar shows you are at your limit. Delete projects you no longer need, or click **Buy more storage** to add slots in blocks of ten.

### My changes disappeared

Rates, progress and settings are only kept when you click **Save changes**. Make your edits again and save before leaving the project.

### The sample card shows no carbon footprint

The figure is worked out from your own Rate Gen rates. Without a Rate Gen library on your account, the card leaves it out.

### Price with my rates says nothing could be priced

Your library has no rate for that kind of work in your state, or the sample is a CIVIQ road job, which Rate Gen does not price. Check your state under **Pricing location (State)** on your Profile.

## Frequently asked questions

### Do I need Revit or PlanSwift to use ADLM Cloud?

No. You need the plugin to measure and save a project, but once it is on the cloud you can price, value, programme and share it from any browser.

### Can I delete a sample project?

No. Samples are read-only and cannot be deleted. Click **Hide samples** to fold them away.

### Does Price with my rates change the sample?

No. Nothing is saved. It only shows what your rates would make of that bill.

### Why is the 3D Model view missing?

HERON projects and Excel imports are measured from 2D drawings or a spreadsheet, so they have no model to show.

### Where do I get help?

Ask Ada, chat with us on WhatsApp on +234 810 650 3524, or raise a ticket from **Support** in the menu.
