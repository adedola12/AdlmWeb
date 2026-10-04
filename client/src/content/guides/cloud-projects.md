---
id: cloud-projects
title: ADLM Cloud: projects and your workspace
tagline: Find your way around the ADLM Cloud, open your projects, and use the project dashboard, 3D model and work area.
version: "2026.09"
updated: 2026-10-01
platform: Web, any browser (adlmstudio.net)
productKeys: []
pdf: ADLM-Cloud-Projects-Guide.pdf
order: 10.1
---

This is one part of the [ADLM Cloud guide](/guides/cloud). It covers the workspace as it is on the live site at the start of October 2026.

## Before you start

### What you need

- **An ADLM account.** Use the same email and password you use in the desktop products. Sign in at adlmstudio.net.
- **A licence for the product the project came from.** To open a QUIV project you need an active QUIV licence; a HERON project needs HERON, and so on. Projects a colleague shares with you also need the matching product licence.
- **A Rate Gen licence (optional but recommended).** Without one you can still see and value a project, but you cannot pull rates from the Rate Gen library, and on projects shared with you the rates stay hidden. See [ADLM Rate Gen](/guides/rategen).
- **A browser.** Any up-to-date browser works. The 3D model viewer needs a browser with WebGL, which every modern desktop browser has.

### How a project gets here

You do not create projects on the website. A project starts in a desktop product:

| Product | Where you measure | How it reaches the cloud |
|---|---|---|
| QUIV | Revit | **Run QUIV and extract**, then **Save to ADLM Cloud** |
| HERON | PlanSwift | **Take off with HERON**, then **Save to ADLM Cloud** |
| Revit MEP (shown on the website as SERVIQ) | Revit | **Run SERVIQ and extract**, then **Save to ADLM Cloud** |
| CIVIQ | Civil 3D | **Run CIVIQ and extract**, then **Save to ADLM Cloud** |

Every save from the plugin creates a new version of the project. Re-saving does not throw away the rates, purchase marks or supplier notes you added on the website.

> **Note:** The steps for each plugin are in its own guide: [QUIV for Revit](/guides/quiv), [HERON](/guides/heron) and [Revit MEP](/guides/mep).

### Finding your way around

The signed-in pages have a menu down the left side. On a phone, open it with the menu button at the top.

- **Work**
  - **Overview** (`/work`): what needs you today, across all your projects.
  - **My tools**: one page each for **QUIV**, **HERON**, **RateGen**, **Constants**, **SERVIQ** (the website's name for Revit MEP) and **CIVIQ**. A tool you have no licence for is greyed out and marked **Add**.
  - **Projects** (`/work/projects`): every project on your account, whichever tool it came from.
- **Learn**: your courses, assignments, certificates and guides.
- **Manage**: **Overview**, **Products & seats**, **Team**, **Billing & invoices**, **Downloads** and **Support**.
- **Account settings** and **Sign out** sit at the bottom.

The search box at the top (**Search projects, rates and programmes**) jumps to a page by name. The bell next to it shows assignment reminders.

Signing in takes you to **Overview** under Manage (`/manage`). The old `/dashboard` address now opens the same page.

## Your work overview

**Overview** (`/work`) is one page, read from top to bottom, that answers "what am I in the middle of?".

The headline figures across the top:

| Figure | What it shows |
|---|---|
| **Measured work, all projects** | The value of measured work across every project (quantity times rate). |
| **Certified to date** | The total of your approved and paid interim certificates. |
| **Items waiting for a rate** | Bill lines that have no rate yet. Click to go to the rate library. |
| **Needs a decision** | How many things are waiting on you, and how many are urgent. |

Below the figures are these panels:

- **Needs a decision**: one table of things to act on, such as lines to price, variations to decide or overdue tasks. Each row has a button that opens the exact place where you deal with it (for example **Price**, **Decide** or **See task**). When the table is clear it says **Nothing is waiting on you.**
- **Continue where you left off**: the projects you last had open in this browser, reopening on the tab you were using.
- **Projects**: every project with its source, stage, how much is priced and complete, the measured value and the certified value. **All projects** opens the full gallery.
- **Valuations and variations**: your latest certificates and variations, most recent first, with their status (**Draft**, **Approved**, **Paid**, **Pending** or **Rejected**).
- **Programme**: tasks that are overdue, due in the next two weeks, or under way.
- **RateGen**: rates you changed recently and where they are used.
- **Learning**: assignments due.

If your account has no projects yet, the page says so and offers **Install the plugins** and **Open the rate library**.

## Projects

### The projects gallery

**Projects** (`/work/projects`) shows every project on your account as cards.

1. Type in **Search projects** to find a project by name.
2. Use **Source** (**All tools** or one product) to show one product's projects.
3. Use **Stage** to show projects at one stage: **Takeoff**, **Priced**, **Tendered**, **Contract locked**, **Valuations** or **Final account**.
4. Sort by **Recently updated**, **Estimated value**, **Name** or **Stage**.
5. Switch between **Grid** and **List** with the layout buttons. Your choice is remembered in this browser.
6. Click a card to open the project.

Each card shows the product, the stage, whether the project is **Yours** or **Shared with you**, its version, how much is valued, the estimated value and when it was last updated. Flags tell you when a **Share link on** is active, when a project carries a **Material schedule**, or when **Money hidden** applies (see [Sharing and collaborators](/guides/cloud-sharing#sharing-and-collaborators)).

### A tool's page

Click a tool under **My tools**, for example **QUIV**, to see only that tool's projects. The page shows **Projects**, **Estimated** and **Last saved**, and a short **How a project starts** section with the three steps for that plugin. If you do not have that product, the page says so and offers a link to add it. Projects a consultant shares with you still open here.

### A product's project list

Each product also has a full project list:

| Product | Page title | Address |
|---|---|---|
| QUIV | **QUIV projects** | `/projects/revit` |
| HERON | **HERON projects** | `/projects/planswift` |
| Revit MEP | **Revit MEP projects** | `/projects/mep` |
| CIVIQ | **CIVIQ projects** | `/projects/civil3d` |

At the top of the list are summary tiles: the combined value of the visible projects, **Completed to date** with the share of lines marked, and **Outstanding balance**.

Under the tiles, **Cloud Storage** shows how many project slots you have used, for example "12 of 30 projects". At 80% you see **Upgrade storage**. When you reach the limit you see **Buy more storage**, and you must delete a project or buy more slots before you can save another. Extra slots are sold in blocks of ten on the purchase page.

The header buttons on this page:

- **Refresh projects** reloads the list, for example straight after a save from the plugin.
- **Portfolio Dashboard** opens the roll-up of all your projects (see [Portfolio dashboard](/guides/cloud-pm#portfolio-dashboard)).
- **PM Tracker · QUIV** (QUIV list only) opens the standalone [PM Tracker](/guides/cloud-pm#pm-tracker).
- **Add shared project** adds a project a colleague shared with you by code.

### Selecting, merging and deleting

1. Click **Select** on each project card you want, or **Select all** for every project shown. **Clear** empties the selection.
2. Click **Delete selected** to delete them, or **Delete all** to delete every project in the list. You are asked to confirm, and this cannot be undone.
3. To delete one project, click **Delete** on its card. Only the owner sees this button; shared projects cannot be deleted by collaborators.

**Merge selected** combines two or more projects into one, for example the architectural and structural models of one building, or several buildings on one job.

1. Select two or more projects.
2. Click **Merge selected**.
3. Answer the first question: click **OK** if they are separate buildings on one job (each gets its own sheet in the exported bill), or **Cancel** if they are disciplines of one structure.
4. Type a name for the merged project and confirm.

The originals are kept and still open on their own in the plugin. Inside the merged project you can change the order of the buildings or disciplines with the up and down arrows.

### Sample projects

Above your own projects you may see **Learning samples**: worked projects with every tab filled in, so you can see what a priced, valued and certified job looks like before your own gets there. QUIV and HERON samples are worked duplex jobs, one per foundation type. Revit MEP samples cover the services for those duplexes, and CIVIQ samples are road jobs (asphalt, concrete, interlock and laterite).

- Click a sample card to open it. A banner reads **Sample project · Read-only learning material**, and **What to look at in this sample** lists the things worth looking at.
- You can open every tab, filter and export, but nothing can be changed.
- Click **Hide samples** to fold the strip away, or **Show N samples** to bring it back. This only hides them in this browser.

Samples appear for products you have an active licence for.

## Inside a project

### The project screen

When you open a project, the bar at the top holds:

- **Projects**: back to the list.
- The contract status: **Draft (editable)** or **Contract locked**.
- **Copy project ID**: copies the ID used by **Open from Cloud** in the Windows plugins.
- **Collaborators**: invite colleagues (owner only).
- **Delete**: delete the project (owner only).
- **Project report**: preview and download a PDF progress report. On the PM Dashboard this button reads **PM report**.
- **Export** (**Workbooks**): Excel exports, described in [Exports and reports](/guides/cloud-bill-budget#exports-and-reports).
- **Save changes**: saves your rates, progress and settings. It reads **Saved** when there is nothing new to save.

> **Important:** Changes to rates, progress and valuation settings are not kept until you click **Save changes**. Save before you leave the page.

Down the side is **Views**, the list of the project's screens in three groups. Click **Hide** to give the bill the full width, and **Views** to bring the list back.

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

### Dashboard

The Dashboard answers three questions: what is the job worth, how much is done, and what is left.

- **Estimated total**: measured work, sums, preliminaries, contingency, VAT and approved variations.
- **Completed to date**: completed items plus executed PC sums, preliminaries and variations.
- **Outstanding balance**: the estimated total less what has been earned.
- **Progress**: the share of the work done.

**Progress overview** counts completed, remaining and total work items. If you record actual quantities or rates, **Actual vs planned performance** compares them with the plan. Switch the chart between **Donut**, **Bars** and **Trend**.

On QUIV and HERON projects, **Linked Services & Works** lets you link another project, such as the Revit MEP services for the same building, so the **Linked total** shows the whole job. Click **+ Link a project**, choose it from **Select a project…**, then click **Link**. **Unlink** removes it.

On Revit MEP projects, **Price services from RateGen** prices the services bill from your Rate Gen library. Click **Price services**. The lengths, joints and fittings it allows for come from your Services Constants (see [Material and Services Constants](/guides/cloud-bill-budget#material-and-services-constants)).

The **Share dashboard** button on this view creates a public link for your client. See [Sharing a dashboard with your client](/guides/cloud-sharing#sharing-a-dashboard-with-your-client).

### 3D Model

The 3D Model view opens the attached model in your browser.

1. Pick the discipline (**Architectural** or **Structural**).
2. Click a line in the **Bill of Quantity** panel to light up its elements in the model, or click an element to find the lines it was measured for.
3. **Material breakdown** shows the material lines behind the selection.
4. Click **Clear highlight** to start again.

### Work area

The Work area puts the model, the priced bill and the construction schedule on one screen. Pick a bill line and its elements light up. Pick a task and the lines it builds light up. Click an element and the lines and tasks behind it are found.

Ada sits beside them. Type a question in **Ask about this project**, or click **Ask Ada to explain** on the duration, time, cost and material summary. Ada only uses items that exist in your account; she proposes and you decide.

## Troubleshooting

### My project is not on the website

Check that the plugin's save finished. The plugin confirms when a project is saved to the cloud. Then click **Refresh projects** on the product's list. Make sure you are signed in to the website with the same account as the plugin. If the plugin started offline, sign out and back in with a connection, then save again.

### I cannot save another project: storage is full

The **Cloud Storage** bar shows you are at your limit. Delete projects you no longer need, or click **Buy more storage** to add slots in blocks of ten.

### My changes disappeared

Rates, progress and settings are only kept when you click **Save changes**. Make your edits again and save before leaving the project.

## Frequently asked questions

### Do I need Revit or PlanSwift to use ADLM Cloud?

No. You need the plugin to measure and save a project, but once it is on the cloud you can price, value, programme and share it from any browser, on any computer or phone.

### Can I delete a sample project?

No. Samples are read-only and cannot be deleted. Click **Hide samples** to fold them away.

### Why is the 3D Model view missing?

HERON projects are measured from 2D drawings, so they have no model to show.

### Where do I get help?

Ask Ada, chat with us on WhatsApp, or raise a ticket from **Support** (`/manage/support`).
