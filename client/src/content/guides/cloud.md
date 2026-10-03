---
id: cloud
title: ADLM Cloud
tagline: Price, value, programme and share the projects you measure in QUIV, HERON, Revit MEP, CIVIQ and ArchiCAD, from any browser.
version: "2026.09"
updated: 2026-10-01
platform: Web, any browser (adlmstudio.net)
productKeys: []
pdf: ADLM-Cloud-User-Guide.pdf
order: 10
---

ADLM Cloud is the web side of your ADLM products. When you save a take-off to the cloud from QUIV, HERON, Revit MEP or CIVIQ, the project appears on adlmstudio.net. There you price the bill, plan the purchases, value the work done, issue interim certificates, run the programme and share progress with your client. You can do all of this from any computer or phone, without Revit or PlanSwift installed.

This guide covers the project workspace as it is on the live site at the start of October 2026.

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

Each card shows the product, the stage, whether the project is **Yours** or **Shared with you**, its version, how much is valued, the estimated value and when it was last updated. Flags tell you when a **Share link on** is active, when a project carries a **Material schedule**, or when **Money hidden** applies (see [Sharing and collaborators](#sharing-and-collaborators)).

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
- **Portfolio Dashboard** opens the roll-up of all your projects (see [Portfolio dashboard](#portfolio-dashboard)).
- **PM Tracker · QUIV** (QUIV list only) opens the standalone [PM Tracker](#pm-tracker).
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
- **Export** (**Workbooks**): Excel exports, described in [Exports and reports](#exports-and-reports).
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

On Revit MEP projects, **Price services from RateGen** prices the services bill from your Rate Gen library. Click **Price services**. The lengths, joints and fittings it allows for come from your Services Constants (see [Material and Services Constants](#material-and-services-constants)).

The **Share dashboard** button on this view creates a public link for your client. See [Sharing a dashboard with your client](#sharing-a-dashboard-with-your-client).

### Bill of Quantity

The bill lists every measured line with its quantity, unit and rate. Above it are the totals (**Measured**, **PC**, **Variations**, **Project total**) and a ribbon of bill tools. Click **Hide tools** or **Show tools** to fold the ribbon.

The ribbon has six tabs:

| Tab | What is on it |
|---|---|
| **Home** | **Only fill empty rates**, **Show actual qty / rate**, and grouping **By element** or **By trade** |
| **Rates** | Rate Gen tools: **Auto-sync rates**, **Sync rates**, **Follow RateGen changes** and **Load RateGen rates** |
| **Navigate** | Jump to a category or trade, and **Top** / **Bottom** of the bill |
| **Contract** | **Lock contract** or **Unlock**, **Preliminaries %** and the contract sum |
| **Variations** | **Add variation**, **Go to list** and **Approve / reject** |
| **Provisional** | **Add PC sum**, **Add provisional sum** and **Go to Summary** |

To find a line, type in **Search items (description / group / S/N)...**.

**Grouping.** Group the bill by building element (Substructure, Superstructure and so on) or by trade (Concrete Works, Formwork, Masonry and so on). To move a line to another group, drag it onto that category, or change its **Category:** or **Trade:**. ADLM remembers the change for next time. Use **+ New category** to add your own.

**Rows.** You can move a row up or down, or drag it into a new place. **Delete row (you'll be able to undo)** removes a line; the undo bar lets you bring it back.

**Summary.** The **Summary** box at the foot of the bill adds up measured work, **Preliminaries**, **PC sums**, **Provisional sums**, **Contingency**, **Approved variations** and **VAT** to an **Estimated total**. Contingency and VAT are percentages you can change there. When the priced bill goes out, click **Mark as tendered** so the project shows at the Tendered stage. **Not tendered after all** reverses it.

**Preliminaries.** **Preliminaries %** on the **Contract** tab sets the preliminaries as a percentage of measured work plus the sums (typically 5 to 10%). Under the bill, the preliminary items checklist shares that pool between items: set each **Alloc %**, record **Actual ₦** and tick **Done** as each item is executed. **Even split** shares the pool equally.

**PC and provisional sums.** On the **Provisional** tab, **Add PC sum** adds a prime-cost sum for a nominated supplier or subcontractor, and **Add provisional sum** adds an allowance for work not yet defined. Tick each one once it has been executed, so it counts towards earned value.

### Pricing lines and picking Rate Gen rates

Click a line's **Rate** cell. You can do three things there:

- **Type a number** for the rate.
- **Type a formula** starting with `=`, for example `=1.2*1.5*95000`. Only numbers and `+ - * / ( ) %` are allowed. Press <kbd>Enter</kbd> or click away to apply it.
- **Type a name** to search your Rate Gen library (needs a Rate Gen licence). Pick a rate from the list.

When you pick a Rate Gen rate on the bill, ADLM prices that line's material, labour and plant in the Budget at the same time. The budget build-up reproduces the rate you picked, so the bill and the budget agree. If the rate has no build-up, the rate still goes on the line and a message tells you the budget could not be priced.

Rates you type or pick stay fixed on the line. To let the budget set the rate again, clear the cell. The line then says the rate has been released and will be priced from the budget build-up when you save.

On the **Rates** tab:

- **Load RateGen rates** loads your library so searches are fast.
- **Sync rates** fills rates from the library. With **Only fill empty rates** ticked (on the **Home** tab), lines you have already priced are left alone.
- **Follow RateGen changes**: while this is on, a rate you change in your Rate Gen library is applied to this bill too. Turn it off before the bill goes out, so the prices stay as issued.

> **Tip:** To price many similar lines at once, link them. A line marked "Linked: rate changes propagate to similar items" passes its rate on to the others.

### Budget

The Budget is the **Material & Labour breakdown** of every bill item, laid out in the same order and sections as the bill. For each bill item:

**Bill Rate = Material + Labour + O&P**

Each row is a resource: **Material**, **Labour**, **Plant**, **Equipment** or **Consumable**.

1. Price a row by typing a rate, entering a `=` formula, or searching Rate Gen in the rate cell.
2. Set Overhead and Profit for the item, or use **Global Overhead & Profit** and click **Apply to all** to write the same figures onto every item.
3. Click **Save changes**. The new bill rate flows up to the Bill of Quantity.

**Marking purchases.** A bill item only counts as complete when every line under it is marked procured or done. Buying the materials is not enough until the labour is done too.

- Tick a line to mark it procured.
- Use **Mark all** for a whole bill item, or **Unmark all** to undo.

**Buy schedule.** Switch from **Breakdown** to **Buy schedule** to see what to buy and when:

- **Should already be bought**: late purchases.
- **Buy this week**: what is due now.
- **Not yet scheduled**: materials for work with no dates yet.
- **Lead time**: how many days before work starts each material should be bought (14 days unless you change it).

The buy schedule takes its dates from the tasks on the PM Dashboard, so plan the programme first.

> **Note:** Once the contract is locked, procurement marking on the Budget is frozen. Bill items you mark complete on the Bill of Quantity still show as done here.

### Valuation

The Valuation view is where you value work done and run the contract.

**Recording progress.** Progress is recorded on the Bill of Quantity:

1. Tick a line's box to mark it fully done (**Mark as completed**), or type a percentage in its **Done** box. Partial values are paid pro rata.
2. Click **Save changes**. Each save is logged against that day in the daily valuation log.

**Valuation workspace.** At the top of the Valuation view:

- **Valuation basis**: choose **By Bill of Quantity** (each line valued by its own % complete) or **By Budget (Material & Labour)** (each line valued from its material and labour lines marked on the Budget).
- **Show daily valuation log** and **Show valuation settings** turn those sections on and off.

**Valuation settings.** These are saved per project:

| Setting | Default | What it does |
|---|---|---|
| **Client / Employer** | blank | The client's name on the valuation and exported bill |
| **Retention %** | 5 | Held back from the gross value |
| **VAT %** | 7.5 | Added to the subtotal |
| **Withholding tax %** | 2.5 | Deducted from the subtotal |

Set these once, when the contract is agreed, so every later valuation is worked out the same way.

**The daily valuation log.**

1. Choose a day in **Valuation date**.
2. Read down the figures: **Gross value of works to date**, **Net valuation to date** (after retention), **Less previous payments** ("Not applicable for first valuation" on the first one), **Subtotal before taxes**, and **Total amount due for payment**.
3. Click **Print valuation** for the formal Interim Payment Application, or **Export Excel** for an editable workbook.

### Contract administration

Below the valuation is **Contract administration**, with four views: **Certificates**, **Variations**, **Final account** and **BIM models**.

**Locking the contract.** Locking freezes the priced bill as the contract sum. After that, new items become variations and re-measured quantities are recorded as actuals, so the contract figure never moves.

1. Open the **Bill of Quantity** and click the **Contract** tab on the ribbon.
2. Click **Lock contract**.
3. Choose a 4-digit PIN and type it twice. If your account uses email verification for sensitive actions, you enter the code sent to your email instead.

> **Important:** Keep the PIN safe. You need the same 4 digits to unlock the contract, and a lost PIN cannot be recovered without asking ADLM support.

To unlock, click **Unlock** on the same tab and enter the PIN (or the emailed code).

**Interim certificates.**

1. Open **Certificates**.
2. Click **Issue certificate**. It certifies the current value to date as the next IPC.
3. Set each certificate's status as it moves along: **Draft**, **Approved**, **Paid**.
4. Download any certificate as an Excel workbook.

Each certificate row shows **Cumulative**, **Less prev.**, **This cert**, **Retention**, VAT, withholding tax and **Net payable**. Only the latest certificate can be deleted, which keeps the sequence honest.

> **Tip:** Lock the contract before the first certificate, so every certificate is measured against the same baseline.

**Variations.**

1. Open **Variations** and click **Add variation**.
2. Fill in **What changed**, the **Instruction reference**, the **Type** (**Addition** or **Omission**) and the **Value (₦)**.
3. A new variation waits for approval and is not counted yet. Open it and click **Approve** or **Reject**.

Only approved variations move the project total. The tiles show **Approved, net**, **Additions**, **Omissions** and **Waiting for approval**. Lines added to a locked contract from the plugin are raised as variations for you.

**Final account.** This shows the closing settlement: **Measured work**, **Preliminaries**, **Provisional and PC sums**, contingency and **Approved variations**, set against the **Contract sum**, with **Certified so far**. The movement reads as an over-run, **Under-run (savings)** or **On budget**.

1. When the job is finished, click **Close the final account**. The contract must be locked first.
2. Confirm. Items, variations and certificates are frozen.
3. Click **Download** for the final account workbook.

To make an adjustment later, click **Reopen**. No new certificate can be issued while the final account is closed.

**BIM models** (QUIV, Revit MEP and CIVIQ projects). When you save from QUIV, the model is exported to IFC and attached to the project automatically, one slot each for **Architectural**, **Structural** and MEP. Each slot shows whether it is **Attached** and whether its element IDs match the bill. If the model does not cover the bill, the missing element IDs are listed.

If the plugin was not used, click **Advanced: manual upload** and then **Upload manually** (or **Replace manually**) to attach an IFC file yourself. Files can be up to 100 MB.

### 3D Model

The 3D Model view opens the attached model in your browser.

1. Pick the discipline (**Architectural** or **Structural**).
2. Click a line in the **Bill of Quantity** panel to light up its elements in the model, or click an element to find the lines it was measured for.
3. **Material breakdown** shows the material lines behind the selection.
4. Click **Clear highlight** to start again.

### Work area

The Work area puts the model, the priced bill and the construction schedule on one screen. Pick a bill line and its elements light up. Pick a task and the lines it builds light up. Click an element and the lines and tasks behind it are found.

Ada sits beside them. Type a question in **Ask about this project**, or click **Ask Ada to explain** on the duration, time, cost and material summary. Ada only uses items that exist in your account; she proposes and you decide.

### PM Dashboard

The PM Dashboard is the programme for the project, tied to the bill.

To build the task list, use one of these buttons:

- **Generate from BoQ** creates one task per bill item.
- **Import MS Project** brings in a programme from a Microsoft Project file (.xml or .mpp). Once tasks exist, the button reads **Update MS Project**, which refreshes the schedule and keeps your progress and links. **Delete imported tasks** removes the imported tasks again.
- **Add Task**, **Add Risk** and **Add Issue** add items by hand.

The dashboard shows tiles for **Progress**, **Budget Used**, **Overdue**, **CPI**, **SPI** and **Tasks Done**. Below them are charts for **Tasks**, **Budget**, **Tasks by priority** and **Burndown**, and an **Earned Value Summary**.

**Earned value in plain terms:**

| Figure | Meaning |
|---|---|
| **BAC** | Budget at completion: what the job is meant to cost in total. |
| **PV** | Planned value: what should have been done by now. |
| **EV** | Earned value: the budget value of the work actually done. |
| **AC** | Actual cost of that work. |
| **EAC** | Estimate at completion: what the whole job now looks likely to cost. |
| **VAC** | Variance at completion: EAC against BAC. |
| **CPI / SPI** | Cost and schedule performance. Below 1 means over budget or behind. |

Click **View Details** for **WBS / Tasks**, **Risk Register** and **Issue Log**.

- In the task table, set each task's **%**, its status (**Not started**, **In progress**, **Completed** or **Blocked**) and its actual days. Setting 100% marks the task Completed.
- **Export calendar** downloads the tasks as a calendar file.
- **Reschedule** moves the tasks after a date changes.
- Click **Save changes** when you are done.

## PM Tracker

The PM Tracker (`/pm-tracker`) is for jobs you want to programme without a bill: tasks, risks and issues only. It is a QUIV feature, so you need an active QUIV licence.

1. Open your **QUIV projects** list and click **PM Tracker · QUIV**.
2. Click **New Project**, type a **Project name** and click **Create project**.
3. Open the project. Use **Dashboard** for the PM dashboard described above and **Details** for the task, risk and issue tables.

You can keep up to 10 PM Tracker projects. Delete one to add another.

**Sharing a PM Tracker project.** Click **Share**.

- **View Only**: tick **Enable public link** and copy the link. Your client sees a read-only dashboard without signing in. Untick it to switch the link off.
- **Invite Editor**: type a colleague's email and click **Send Invite Email**. They receive a single-use join link, tied to that email address, that lets them edit tasks, risks and issues.

## Portfolio dashboard

**Portfolio Dashboard** (`/portfolio-dashboard`) rolls up every project you can see, across all products. Open it from the button on any project list.

- **Overview** shows the overall progress ring and tiles for **Total projects**, **Completed items**, **Remaining items**, **Total work items**, **Planned total**, **Completed to date**, **Outstanding balance** and **Overall progress**. The **Project breakdown** table lists each project with its product, status, items, BoQ total, completed value and progress.
- **Charts** compares products: **BoQ Total vs Completed, by Product**, **Projects by Product**, **Overall Delivery** and **Progress by Product**.
- **Report** gives an executive summary and a breakdown by product.

Buttons in the header:

- **Refresh** reloads the figures.
- **Export Excel** downloads the portfolio as a workbook.
- **Management report** opens a PDF report across your whole organisation, which you can preview and download.

## Exports and reports

**Excel workbooks.** Click **Export** in a project's top bar and choose:

| Group | Options |
|---|---|
| **Bill & Budget** | **Export bill & budget workbook**: your bill with its own sections and totals, plus separate Material, Labour and Plant schedules, a Schedule of Current Prices and a Material Summary. **Export bill & budget (by trade)**: the same, sectioned by trade. |
| **Generic BoQ** | **Export generic BoQ (by category)** and **Export generic BoQ (by trade)** |
| **Elemental BoQ** | **Bungalow** or **Multi-storey**, grouped by building element |
| **Trade BoQ** | **Bungalow (Trade format)** or **Multi-storey (Trade format)**, one bill per work section |
| **Milestone BoQ** | **Bungalow (Milestone format)** or **Multi-storey (Milestone format)**, one priceable bill per construction stage, as the basis for a payment schedule |

**PDF reports.**

- **Project report**: the Project Progress Report for the open project.
- **PM report**: the Project Management Report (schedule and earned value), from the PM Dashboard.
- **Management report**: across all your projects, from the Portfolio Dashboard.

Each opens a preview first. Click **Download PDF** to save it.

**Valuations and certificates.** **Print valuation** and **Export Excel** in the daily valuation log, the certificate downloads in **Certificates**, and the final account **Download** are described above.

## Sharing and collaborators

There are two ways to let someone else see a project. They are not the same.

| | Public dashboard link | Collaborator |
|---|---|---|
| Who it is for | A client with no ADLM account | A colleague or consultant who will work on the project |
| Sign-in needed | No | Yes, with their own account and the matching product licence |
| What they see | A summary dashboard only | The whole project, at **View only** or **Full access** |
| Can edit | No | Only with **Full access** |

### Sharing a dashboard with your client

1. Open the project's **Dashboard**.
2. Click **Share dashboard**.
3. Tick **Enable public link**.
4. Click **Copy link** and send it to your client.

The button then reads **Shared · link on**. Your client sees a read-only Project Dashboard: overall status, progress, the contract sum and its make-up, cost to date and forecast, interim certificate totals, and the planned and actual spend. They cannot edit anything.

> **Important:** Anyone who has the link can open the dashboard. When you no longer want it shared, untick **Enable public link**. Ticking it again brings back the same link.

Only the project owner can turn the public link on or off.

### Inviting collaborators

1. Open the project and click **Collaborators**.
2. Under **Access level**, choose **View only** or **Full access**.
3. Optionally fill in **Label (optional)** (for example the firm's name), **Restrict to emails (optional)** and **Max uses (0 = unlimited)**.
4. Click **Generate code**.
5. Under **Active codes**, click **Copy** to copy the code, or **Link & QR** for a join link and QR code. **Copy link** copies the link and **Download QR** saves the QR image.

Send the code or link to your colleague. **People with access** lists everyone who has joined. You can change each person between **View only** and **Full access**, or click **Remove**. **Revoke** stops a code being used again.

### Joining a project someone shared with you

You can use either a link or a code.

- **With a link or QR code:** open it. Sign in if asked. The page shows **Joining project…** and then opens the project.
- **With a code:** open the project list for that product, click **Add shared project**, type the **Share code** and click **Add project**.

If you do not have the matching product, you see **Subscription required** and a button to get it. A code that has been revoked, has reached its use limit or is restricted to other emails is refused.

### What collaborators can see and do

| | Owner | Full access | View only |
|---|---|---|---|
| Edit rates and progress | Yes | Yes | No |
| Download exports and reports | Yes | Yes | No |
| Invite people, delete, public link | Yes | No | No |
| See rates and money | Yes | Only with a Rate Gen licence | Only with a Rate Gen licence |

A collaborator without an active Rate Gen licence sees the message **Rates hidden. A RateGen subscription is required to view rates.** For them, rates and money totals show as a dash (on project cards this appears as **Money hidden**), bill and budget exports are refused, and they cannot raise variations, rebuild the schedule or price services.

## Material and Services Constants

**Material Constants** (**Constants** under **My tools**, `/work/constants`) are the factors behind every material and labour schedule, such as how many bags of cement go into a cubic metre of concrete. They are the same constants QUIV and HERON use on the desktop.

1. Find a constant with **Search constants…**.
2. Change its value. The **ADLM default** column shows the starting figure.
3. Click **Save changes**. **Reset** on a row, or **Reset all to defaults**, puts the ADLM figures back.

New schedules use your constants straight away. An existing project keeps its figures until its schedule is rebuilt.

**Services Constants** (`/rategen/services-constants`) are your house standards for pricing MEP services: standard lengths, how connectors are counted and the fitting uplift. They feed **Price services** on Revit MEP projects. Choose the **Unit system**, edit the rows and click **Save constants**.

## Team

**Team** under Manage (`/manage/team`) shows your account's seats and the machines they are activated on.

- **Members** lists the account holder. Adding colleagues to one account is not available yet, so each person signs in with their own ADLM account. To work together on a project, use [collaborators](#inviting-collaborators).
- **Machines** lists the computers holding a seat. To move a seat to a new computer, click **Free the seat** on the old one and then install on the new one. Nothing is deleted.
- **Seats per product** and **Free activations** show how many seats you own and how many are free right now. **Buy more seats** opens the purchase page.

## Ada, your assistant

Ada is ADLM's assistant. Click **Ask Ada** at the bottom of any page, or in the left-hand menu.

- Anyone can ask Ada about products, prices, trainings, downloads and material quantities. The suggestion buttons **Products**, **Trainings**, **Software downloads** and **Material quantities** are a quick start.
- When you are signed in, Ada can also answer questions about your own projects and account, for example which projects have a 3D model, or what a project's bill or budget comes to. She only reads your own data.
- Ada answers from what ADLM publishes. If she does not know, she says so.
- To talk to a person, choose **Chat on WhatsApp** in one of her answers.

Ada is not a quote. Use the quote page for prices you can rely on.

> **Note:** ADLM can set a usage allowance for Ada. If you reach it, she tells you and offers WhatsApp instead until the allowance resets.

## What's new in 2026.09

**September 2026**

- **Picking a Rate Gen rate prices the whole line.** A rate picked on the bill now prices the line's material, labour and plant in the Budget at the same time, and the build-up reproduces the rate to the kobo.
- **Learning samples.** Read-only worked projects for QUIV and HERON, then Revit MEP and CIVIQ, with every tab filled in.
- **New project screens.** A views sidebar you can hide, and a new **Work area** that joins the model, the bill, the schedule and Ada.
- **Continue where you left off.** Projects reopen on the tab you were last using.
- **Contract administration in the Valuation view.** **Certificates**, **Variations** and **Final account** sit together, and only approved variations change the contract.
- **A redesigned buy schedule.** Purchases can be ticked off, and the lead time is remembered.
- **A Summary box on the bill.** It totals the bill and adds **Mark as tendered**.
- **Your work is safer.** Re-saving a project from the plugin no longer wipes the rates, purchase marks and supplier notes you added on the website.
- **Money on shared projects is protected.** Collaborators without Rate Gen now see dashes instead of totals on project lists and cannot download priced exports. Certificates on merged contracts count in **Certified to date** again.

**July 2026**

- PDF project, PM and management reports.
- Ada replaces the old help bot.
- Extra project storage slots in blocks of ten.
- The portfolio dashboard includes every project type.

## Troubleshooting

### My project is not on the website

Check that the plugin's save finished. The plugin confirms when a project is saved to the cloud. Then click **Refresh projects** on the product's list. Make sure you are signed in to the website with the same account as the plugin. If the plugin started offline, sign out and back in with a connection, then save again.

### I cannot save another project: storage is full

The **Cloud Storage** bar shows you are at your limit. Delete projects you no longer need, or click **Buy more storage** to add slots in blocks of ten.

### I cannot change rates or delete lines

The contract is probably locked: the top bar says **Contract locked**. Raise a variation instead, or unlock the contract from the **Contract** tab on the bill ribbon. If the project is shared with you at **View only**, you cannot edit it at all; ask the owner for **Full access**.

### Rates show as dashes on a shared project

You are a collaborator without an active Rate Gen licence. Rates and money stay hidden until you have one. The project owner always sees them.

### I forgot the contract PIN

The PIN cannot be recovered on the website. Contact ADLM support from **Support** (`/manage/support`) to have it reset.

### "Subscription required" when I open a share link

You need an active licence for the product the project was made in (for example HERON for a HERON project). Click the button on the page to get it, then open the link again.

### The share code does not work

The code may have been revoked, reached its use limit, or been limited to other email addresses. Ask the owner for a new code.

### The budget says "Re-save this project from the plugin"

The project was saved before the material and labour breakdown was sent. Open it in the plugin and save it to the cloud again.

### My model was refused, or a slot says the model does not cover the bill

The model is missing element IDs that priced lines were measured from. It is usually an older revision or the wrong file. Re-export the IFC from the same Revit model the take-off came from, then save again from QUIV or use **Upload manually**.

### Picking a rate did not price the Budget

The rate has no build-up in Rate Gen, it is no longer in your library, or you only have view access. The rate still goes on the line; price the Budget rows yourself, or choose a rate that has a build-up.

### My changes disappeared

Rates, progress and settings are only kept when you click **Save changes**. Make your edits again and save before leaving the project.

## Frequently asked questions

### Do I need Revit or PlanSwift to use ADLM Cloud?

No. You need the plugin to measure and save a project, but once it is on the cloud you can price, value, programme and share it from any browser, on any computer or phone.

### Can my client see the project without an ADLM account?

Yes. Turn on **Share dashboard** and send the link. Your client sees a summary dashboard and cannot change anything.

### What is the difference between View only and Full access?

**View only** collaborators can look but cannot edit or download. **Full access** collaborators can edit rates and progress and download exports. Neither can invite others, delete the project or share it publicly; only the owner can.

### Does re-saving from the plugin overwrite my prices?

No. Each save is a new version. Rates, purchase marks, supplier details and notes you added on the website are kept.

### What happens when I lock the contract?

The priced bill becomes the contract sum and stops moving. New items become variations, re-measured quantities are recorded as actuals, and certificates are measured against the locked figure. HERON shows the lock too and saves your edits as actuals.

### Can I delete a sample project?

No. Samples are read-only and cannot be deleted. Click **Hide samples** to fold them away.

### Why is the 3D Model view missing?

HERON projects are measured from 2D drawings, so they have no model to show.

### Can I add colleagues to my account?

Not yet. Each person uses their own ADLM account. Share individual projects with them as collaborators.

### Where do I get help?

Ask Ada, chat with us on WhatsApp, or raise a ticket from **Support** (`/manage/support`).
