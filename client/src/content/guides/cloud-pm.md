---
id: cloud-pm
title: ADLM Cloud: programme and project management
tagline: Track progress with the PM Dashboard and PM Tracker, and see every project at once on the Portfolio dashboard.
version: "2026.09"
updated: 2026-10-01
platform: Web, any browser (adlmstudio.net)
productKeys: []
pdf: ADLM-Cloud-PM-Guide.pdf
order: 10.4
---

This is one part of the [ADLM Cloud guide](/guides/cloud). It covers the workspace as it is on the live site at the start of October 2026.

## Project management

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

## Troubleshooting

### My model was refused, or a slot says the model does not cover the bill

The model is missing element IDs that priced lines were measured from. It is usually an older revision or the wrong file. Re-export the IFC from the same Revit model the take-off came from, then save again from QUIV or use **Upload manually**.

## Frequently asked questions

### Where do I get help?

Ask Ada, chat with us on WhatsApp, or raise a ticket from **Support** (`/manage/support`).
