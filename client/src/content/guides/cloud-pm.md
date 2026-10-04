---
id: cloud-pm
title: ADLM Cloud: programme and project management
tagline: Track progress with the PM Dashboard and PM Tracker, and see every project at once on the Portfolio dashboard.
version: "2026.10"
updated: 2026-10-04
platform: Web, any browser (adlmstudio.net)
productKeys: []
pdf: ADLM-Cloud-PM-Guide.pdf
order: 10.4
---

This is one part of the [ADLM Cloud guide](/guides/cloud). It covers the PM Dashboard inside each project, the standalone PM Tracker, the Portfolio dashboard across all your projects, and the programme page that works out durations from your bill. It describes the live site on 4 October 2026.

## What's new in 2026.10

- **Ada as your project manager.** Ask Ada "What should I do next on this job?" or "Is it behind programme?" and she answers from the PM Dashboard's own figures: tasks done and overdue, CPI, SPI and the planned finish.
- **Reports for a date range.** Ask Ada for a report on any period. The PDF adds a **This Period** page with tasks finished, tasks due but not finished, risks raised and issues opened or resolved in that window.
- **The programme page.** `/work/programme` turns each project's bill into a programme from gang outputs, and **Estimate the outputs** proposes those outputs with AI.

## Before you start

- Open the project: see [Projects and your workspace](/guides/cloud-projects).
- The PM Dashboard works best on a priced bill, because earned value is measured in money.
- The buy schedule on the Budget takes its dates from the PM Dashboard's tasks, so build the programme early. See [The bill and the budget](/guides/cloud-bill-budget#buy-schedule).

## The PM Dashboard

The PM Dashboard is the programme for one project, tied to its bill. Click **PM Dashboard** in the project's **Views**.

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

The top bar's report button reads **PM report** on this view. It opens the Project Management Report (schedule and earned value) as a PDF preview; click **Download PDF** to save it.

## The PM Tracker

The PM Tracker (`/pm-tracker`) is for jobs you want to programme without a bill: tasks, risks and issues only. It is a QUIV feature, so you need an active QUIV licence.

1. Open your **QUIV projects** list (**My tools** > **QUIV**) and click **PM Tracker · QUIV**. You can also click the PM Tracker note on **All Projects**.
2. Click **New Project**, type a **Project name** and click **Create project**.
3. Open the project. Use **Dashboard** for the PM dashboard described above and **Details** for the task, risk and issue tables.

You can keep up to 10 PM Tracker projects. Delete one to add another.

**Sharing a PM Tracker project.** Click **Share**.

- **View Only**: tick **Enable public link** and copy the link. Your client sees a read-only dashboard without signing in. Untick it to switch the link off.
- **Invite Editor**: type a colleague's email and click **Send Invite Email**. They receive a single-use join link, tied to that email address, that lets them edit tasks, risks and issues.

## The Portfolio dashboard

**Portfolio Dashboard** (`/portfolio-dashboard`) rolls up every project you can see, across all products. Open it with the **Portfolio Dashboard** button on any product's project list.

- **Overview** shows the overall progress ring and tiles for **Total projects**, **Completed items**, **Remaining items**, **Total work items**, **Planned total**, **Completed to date**, **Outstanding balance** and **Overall progress**. The **Project breakdown** table lists each project with its product, status, items, BoQ total, completed value and progress.
- **Charts** compares products: **BoQ Total vs Completed, by Product**, **Projects by Product**, **Overall Delivery** and **Progress by Product**.
- **Report** gives an executive summary and a breakdown by product.

Buttons in the header:

- **Refresh** reloads the figures.
- **Export Excel** downloads the portfolio as a workbook.
- **Management report** opens a PDF report across your whole organisation, which you can preview and download.

## The programme page

The programme page (`/work/programme`) works out how long a job will take from its bill: the quantity of each item of work, divided by what a gang produces in a day. Type the address into your browser while signed in. It is not on the menu yet.

1. Open `/work/programme`. Your projects are listed with their bill value.
2. Click **Open** on a project, or choose it under **Project**.
3. Read the headline: **Duration** in weeks, **Start on site**, **Practical completion** and **Peak gangs on site**.

![The programme for one project: duration, start, completion and the trades in order.](shot:cloud-programme.png)

Under **The programme**, each trade is listed with its **Gangs**, **Dates** and **Value**. "Add or remove a gang and the whole chain moves": change the number of gangs on a trade and every later date follows.

Under **Where the time comes from**, each item of work shows its **Trade**, **Quantity**, **Output** (what one gang does in a day), **Gang-days** and **Cost**.

![Where the time comes from: each item of work with its output and gang-days.](shot:cloud-programme-more.png)

1. Click **Estimate the outputs** to have AI propose an output for each trade. It also runs once by itself the first time you open a project here.
2. Check the **Output** column and change any figure that does not match your site.
3. Click **Estimate again** to rerun it after the bill changes.

If a bill has no priced quantities, the page says "Nothing on this bill can be sequenced".

## AI in programme and project management

| Feature | Where | What it does | Availability |
|---|---|---|---|
| **Estimate the outputs** | Programme page, under **Where the time comes from** | Groups your bill lines by trade and unit and proposes a daily gang output per trade. The outputs are stored for the project; your bill is not changed | On for everyone |
| Ada as project manager | **Ask Ada** | Reads tasks finished, due and overdue, risks and issues, CPI, SPI and the planned finish, and suggests what to do next, most urgent first | On for everyone, signed in |
| Ada reports | **Ask Ada**: "a report for last month" | A **Project report** card, and a PDF with a **This Period** page for that window | On for everyone, signed in |

Ada has no forecasting tool: she explains the planned finish, CPI and SPI but does not produce a final-cost forecast. At the monthly AI limit, **Estimate the outputs** says the allowance is spent, and the outputs stay editable by hand. See [ADLM AI services](/guides/ai-services).

## Troubleshooting

### My model was refused, or a slot says the model does not cover the bill

The model is missing element IDs that priced lines were measured from. It is usually an older revision or the wrong file. Re-export the IFC from the same Revit model the take-off came from, then save again from QUIV or use **Upload manually**.

### The buy schedule says everything is Not yet scheduled

The PM Dashboard has no tasks with dates. Click **Generate from BoQ** or **Import MS Project**, set the dates, and save.

### I cannot create another PM Tracker project

You have 10 already. Delete one you no longer need.

### Estimate the outputs gives figures that are too high for my site

They are a starting point. Type your own figures into the **Output** column; the programme follows them.

## Frequently asked questions

### What is the difference between the PM Dashboard and the PM Tracker?

The PM Dashboard sits inside a project and is tied to its bill, so earned value is in money. The PM Tracker is a separate list of up to 10 programmes with no bill behind them.

### Can my client see the programme?

Share the PM Tracker project with **View Only**, or share the project dashboard. See [Sharing, team and Ada](/guides/cloud-sharing).

### Where do I get help?

Ask Ada, chat with us on WhatsApp on +234 810 650 3524, or raise a ticket from **Support** in the menu.
