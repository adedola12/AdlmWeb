---
id: cloud-pm
title: ADLM Cloud: programme and project management
tagline: Plan and track each project from its bill, programme a job from gang outputs, and see every project at once on the Portfolio dashboard.
version: "2026.10"
updated: 2026-10-05
platform: Web, any browser (adlmstudio.net)
productKeys: []
pdf: ADLM-Cloud-PM-Guide.pdf
order: 10.4
---

This is one part of the [ADLM Cloud guide](/guides/cloud). It covers the **PM dashboard** and **Activity schedule** tabs on each project, the programme page that works out durations from your bill, the classic PM Dashboard, the standalone PM Tracker and the Portfolio dashboard across all your projects. It describes the live site on 5 October 2026.

## What's new in 2026.10

- **PM dashboard and Activity schedule tabs.** Projects now open on the new project page. Its **PM dashboard** tab plans the work from the bill in one click and shows the timeline, risks and issues. The **Activity schedule** tab shows labour activities and the trades on site week by week.
- **The programme page is open to everyone.** `/work/programme` turns each project's bill into a programme from gang outputs, and **Estimate the outputs** proposes those outputs with AI. Since 4 October every signed-in customer can open it.
- **Ada as your project manager.** Ask Ada "What should I do next on this job?" or "Is it behind programme?" and she answers from the PM figures: tasks done and overdue, CPI, SPI and the planned finish.
- **Reports for a date range.** Ask Ada for a report on any period. The PDF adds a **This Period** page with tasks finished, tasks due but not finished, risks raised and issues opened or resolved in that window.

## Before you start

- Open the project: see [Projects and your workspace](/guides/cloud-projects).
- Planning works best on a priced bill, because each task carries the value of the work it covers.
- The buy schedule takes its dates from the project's tasks, so plan the work early. See [The bill and the budget](/guides/cloud-bill-budget#buy-schedule).

## The PM dashboard tab

Click **PM dashboard** on the project page. A dot on the tab means tasks are overdue.

### Plan the work from the bill

A project with no tasks yet shows **Plan the work for** the project: "Tasks come from the bill's sections, so each one already knows what it is worth. Progress on the bill moves them."

1. Click **Plan the work from the bill**. The button reads **Planning…** while it works.
2. ADLM creates one task per bill section, dated in bill order.
3. Move the tasks afterwards as your site needs.

Planning again never touches a task you have already changed. If you can only view the project, the tab says "No tasks have been planned yet." **Back to the bill** returns to the **Bill** tab.

### Read the dashboard

Once there are tasks, five figures run across the top:

- **Complete**: how much of the work is done.
- **Schedule**: whether the job is on time.
- **Bill not in any task**: bill value no task covers yet. "Every line is in a task" means none.
- **Overdue tasks**: tasks past their end date. "None past their end date" means none.
- **Open risks · issues**: how many risks and issues are still open.

Switch the view at the top:

- **Timeline**: the tasks on a timeline with today's date marked. Tasks with no start or finish show "No dates to draw".
- **Risks**: the risk register.
- **Issues**: the issue log.

Each view shows how many items it holds. An empty register reads "Add one when something could affect time or cost."

Progress you set on bill lines moves the tasks. See [Recording progress](/guides/cloud-valuation#recording-progress).

> **Note:** Importing a Microsoft Project file, editing task details by hand, and the earned value figures are in the classic PM Dashboard for now. See [The classic PM Dashboard](#the-classic-pm-dashboard).

## The Activity schedule tab

Click **Activity schedule** on the project page. It shows the labour behind the job.

- The figures at the top give the **Labour activities**, the **Labour cost** across every activity, and the **Busiest week**.
- The table lists each **Activity** with its **Trade**, **Quantity**, **Days**, **Cost**, **Starts** and **Finishes**. An activity with no dates reads **Not programmed**.
- **Trades on site, week by week** shows which trades are working each week. Two trades at once is a face to check, not necessarily a clash.

"No labour in the budget yet" means the project has no labour rows. Labour comes from the project's budget; see [The budget](/guides/cloud-bill-budget#the-budget).

## The programme page

The programme page (`/work/programme`) works out how long a job will take from its bill: the quantity of each item of work, divided by what a gang produces in a day. It is open to every signed-in customer. It is not on the menu yet, so type the address into your browser while signed in.

1. Open `/work/programme`. "Every project you have measured, sequenced from its own quantities." Your projects are listed with their bill value.
2. Click **Open** on a project, or choose it under **Project**.
3. Read the headline: **Duration** in weeks, **Start on site**, **Practical completion** and **Peak gangs on site**.

![The Programme for a project, built from site productivity.](shot:cloud-programme.png)

Under **The programme**, each trade is listed with its **Gangs**, **Dates** and **Value**. "Add or remove a gang and the whole chain moves": change the number of gangs on a trade and every later date follows.

Under **Where the time comes from**, each item of work shows its **Trade**, **Quantity**, **Output** (what one gang does in a day), **Gang-days** and **Cost**.

![The lower part of the Programme, showing where the time comes from.](shot:cloud-programme-more.png)

1. Click **Estimate the outputs** to have AI propose an output for each trade. It also runs once by itself the first time you open a project here.
2. Check the **Output** column and change any figure that does not match your site.
3. Click **Estimate again** to rerun it after the bill changes.

If a bill has no priced quantities, the page says "Nothing on this bill can be sequenced". With no projects yet, it reads "Nothing to programme yet".

## The classic PM Dashboard

The classic PM Dashboard is the full programme for one project, tied to its bill. On the project page, click **More actions** > **Open the classic workspace**, then **PM Dashboard** in **Views**.

> **Important:** In the classic workspace, changes are not kept until you click **Save changes**.

### Build the task list

Use one of these buttons:

- **Generate from BoQ** creates one task per bill item.
- **Import MS Project** brings in a programme from a Microsoft Project file (.xml or .mpp). Once tasks exist, the button reads **Update MS Project**, which refreshes the schedule and keeps your progress and links. **Delete imported tasks** removes the imported tasks again.
- **Add Task**, **Add Risk** and **Add Issue** add items by hand.

### Read the dashboard

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

### Update tasks, risks and issues

1. Click **View Details** for **WBS / Tasks**, **Risk Register** and **Issue Log**.
2. In the task table, set each task's **%**, its status (**Not started**, **In progress**, **Completed** or **Blocked**) and its actual days. Setting 100% marks the task Completed.
3. Click **Save changes** when you are done.

**Export calendar** downloads the tasks as a calendar file. **Reschedule** moves the tasks after a date changes.

Tasks you build here show on the new page's **PM dashboard** tab too.

### The PM report

The Project Management Report (schedule and earned value) is a PDF. On the new project page, get it from **Export** > **Project management report**, or **More actions** > **Project management report**.

## The PM Tracker

The PM Tracker (`/pm-tracker`) is for jobs you want to programme without a bill: tasks, risks and issues only. It is a QUIV feature, so you need an active QUIV licence.

1. Click **My tools** > **QUIV**, then **Open the QUIV workspace**.
2. Click **PM Tracker · QUIV**.
3. Click **New Project**, type a **Project name** and click **Create project**.
4. Open the project. Use **Dashboard** for the PM dashboard and **Details** for the task, risk and issue tables.

You can keep up to 10 PM Tracker projects. Delete one to add another.

**Sharing a PM Tracker project.** Click **Share**.

- **View Only**: tick **Enable public link** and copy the link. Your client sees a read-only dashboard without signing in. Untick it to switch the link off.
- **Invite Editor**: type a colleague's email and click **Send Invite Email**. They receive a single-use join link, tied to that email address, that lets them edit tasks, risks and issues.

## The Portfolio dashboard

**Portfolio Dashboard** (`/portfolio-dashboard`) rolls up every project you can see, across all products. To open it, click a tool under **My tools**, then **Open the QUIV workspace** (or the one for your tool), then **Portfolio Dashboard**.

- **Overview** shows the overall progress ring and tiles for **Total projects**, **Completed items**, **Remaining items**, **Total work items**, **Planned total**, **Completed to date**, **Outstanding balance** and **Overall progress**. The **Project breakdown** table lists each project with its product, status, items, BoQ total, completed value and progress.
- **Charts** compares products: **BoQ Total vs Completed, by Product**, **Projects by Product**, **Overall Delivery** and **Progress by Product**.
- **Report** gives an executive summary and a breakdown by product.

Buttons in the header:

- **Refresh** reloads the figures.
- **Export Excel** downloads the portfolio as a workbook.
- **Management report** opens a PDF report across your whole organisation, which you can preview and download.

> **Tip:** For a quick view across every project, the **Programme** panel on **Your work** (**Work** > **Overview**) lists tasks that are overdue, due in the next two weeks, or under way.

## AI in programme and project management

| Feature | Where | What it does | Availability |
|---|---|---|---|
| **Estimate the outputs** | Programme page, under **Where the time comes from** | Groups your bill lines by trade and unit and proposes a daily gang output per trade. The outputs are stored for the project; your bill is not changed | On for everyone |
| Ada as project manager | **Ask Ada** | Reads tasks finished, due and overdue, risks and issues, CPI, SPI and the planned finish, and suggests what to do next, most urgent first | On for everyone, signed in |
| Ada reports | **Ask Ada**: "a report for last month" | A **Project report** card, and a PDF with a **This Period** page for that window | On for everyone, signed in |

**Plan the work from the bill** is not AI: it makes one task per bill section by fixed rules. Ada has no forecasting tool: she explains the planned finish, CPI and SPI but does not produce a final-cost forecast. At the monthly AI limit, **Estimate the outputs** says the allowance is spent, and the outputs stay editable by hand. See [ADLM AI services](/guides/ai-services).

## Troubleshooting

### Plan the work from the bill is greyed out

The bill has no lines yet. Save the project from the plugin first.

### The buy schedule says everything is Not yet scheduled

The project has no tasks with dates. Click **Plan the work from the bill** on the **PM dashboard** tab, or use **Generate from BoQ** or **Import MS Project** in the classic PM Dashboard.

### The Timeline says No dates to draw

The tasks have no start or finish. Plan the work from the bill, or set dates in the classic PM Dashboard.

### I cannot open the programme page from the menu

It is not on the menu yet. Type `/work/programme` after the site address while signed in.

### My model was refused, or a slot says the model does not cover the bill

The model is missing element IDs that priced lines were measured from. It is usually an older revision or the wrong file. Re-export the IFC from the same Revit model the take-off came from, then save again from QUIV or use **Upload manually** in the classic workspace.

### I cannot create another PM Tracker project

You have 10 already. Delete one you no longer need.

### Estimate the outputs gives figures that are too high for my site

They are a starting point. Type your own figures into the **Output** column; the programme follows them.

## Frequently asked questions

### What is the difference between the PM dashboard tab and the PM Tracker?

The PM dashboard tab sits inside a project and is tied to its bill, so each task knows what it is worth. The PM Tracker is a separate list of up to 10 programmes with no bill behind them.

### Will planning again overwrite my changes?

No. Planning again never touches a task you have already changed.

### Can my client see the programme?

Share the PM Tracker project with **View Only**, or share the project dashboard. See [Sharing, team and Ada](/guides/cloud-sharing).

### Where do I get help?

Ask Ada, chat with us on WhatsApp on +234 810 650 3524, or raise a ticket from **Support** in the menu.
