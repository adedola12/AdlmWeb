---
id: timepro
title: ADLM Time Pro
tagline: Record what your gangs really produce on site, then turn a bill quantity into a duration, a crew size and a Microsoft Project programme.
version: "1.0"
updated: 2026-10-07
platform: Windows 10 and 11 desktop app
productKeys: [qs-takeoff]
pdf: ADLM-TimePro-User-Guide.pdf
order: 9
---

ADLM Time Pro is a Windows app for quantity surveyors, site engineers and project managers who need durations they can defend. You log what each gang actually produced on site, day by day. Time Pro averages those records for every item of work. Then you type in a quantity from your bill, and it tells you how many days the work will take and how many skilled and unskilled hands you need to finish in the time you want. When you are happy, you send the result to Excel or to Microsoft Project.

## What's new in the August 2026 release

Time Pro 1.0 is the current version, and it keeps that version through 2026: releases change only the build number. The August 2026 release is the one the Installer Hub installs for every subscriber.

- **Dark mode on every screen.** Follows your Windows setting at first, then remembers your choice. Switch from the bottom of the side menu.
- **Sign out from the side menu.** **Sign Out** now sits under the theme switch.
- **Choose your currency for Microsoft Project.** Thirteen currencies, starting from your Windows region. Costs show in Project in the same currency you typed.
- **Microsoft Project files now open.** The exported file previously could be rejected by Project. It now opens straight from **File**, then **Open**.
- **Tasks chain in Microsoft Project.** Each item is linked finish-to-start to the one before it.
- **Labour and equipment cost correctly.** Labour is now an hourly resource and equipment a per-use resource, so rates land in the right place.
- **Rates accept normal money formats** such as `1,500.00` and `₦1500`.
- **Clearer messages when an item cannot be exported.** Time Pro names the items with no duration and tells you what they need.
- **A readable side menu.** Every button shows its icon and name, with the current screen in ADLM orange.

An earlier Time Pro 1.0 release made Time Pro a paid subscription: you sign in with your ADLM account, Time Pro checks for an active subscription, and your licence is tied to your computer.

> **Note:** The keyboard shortcuts and the connection signal indicator added to other ADLM products in September 2026 are not in Time Pro 1.0. Nothing newer than the August 2026 build has been released.

## Before you start

### What you need

| Item | Requirement |
|---|---|
| Computer | A Windows 10 or Windows 11 PC |
| Other software | None. Time Pro runs on its own and does not need Revit, ArchiCAD or PlanSwift |
| Microsoft Project | Only if you want to open the programme file Time Pro exports. Any recent desktop version that opens Project XML files will do |
| Internet | Needed for your first sign-in, for fetching weather, and for checking your licence. After that you can record tasks offline |
| Subscription | An active **ADLM Time Pro** subscription on your ADLM account |

### Get a subscription

Time Pro is a paid subscription. An ADLM account on its own is not enough.

1. Go to the Time Pro product page on [adlmstudio.net](/products) and choose a plan.
2. Pay and wait for the subscription to show as active on your [dashboard](/dashboard).

If you do not yet have an ADLM account, create one first with **Sign up** on the website.

### Install Time Pro

Time Pro is installed through the ADLM Installer Hub, the same way as the other ADLM products. If you have not used the Hub before, see the [ADLM Installer Hub](/guides/installer-hub) guide.

1. Open the **ADLM Installer Hub** and sign in with your ADLM account.
2. Click **Installation Center** in the sidebar.
3. Find the **ADLM Time Pro** card. With an active subscription it reads **Ready to install**.
4. Click **Install**.
5. Click **Yes** when Windows asks for permission to make changes.
6. Wait until the card shows **Installed**.
7. Open Time Pro from the **ADLM Time Pro** shortcut on your desktop.

> **Note:** Updates come through the Hub too. When a new version is out, the card reads **Update available**: close Time Pro and click the update button on the card. Updating does not delete your Task Log.

### Sign in

The first window you see is **Sign in to ADLM Time Management**.

1. Type your ADLM username or email address into **Username or Email**.
2. Type your **Password**.
3. Click **Sign in**.

Time Pro checks your account and your subscription, then opens on the **Task Log**.

- If you do not have an account yet, click **Sign up** under "Don't have an ADLM account?". It opens the sign-up page on the website.
- If your account is fine but has no active Time Pro subscription, you will see a message saying so and a **Subscribe to ADLM Time Pro** button that opens the product page.

### One computer per licence

Your Time Pro licence is tied to the computer you sign in on. Once you have signed in online on that PC, Time Pro remembers your licence, so:

- it can reopen without asking you to sign in again for up to about a day and a half (after that you will see **Session expired. Please sign in again.**);
- if the PC has no internet when you sign in, Time Pro can still let you in, as long as you have signed in online on this same PC before and your licence is still valid.

If you move to a new computer, contact [ADLM support](/support) so the licence can be released from the old one.

## How Time Pro works

Time Pro has one simple idea, and it helps to understand it before you start typing.

1. **Record.** Every day, for every gang, you log the item of work, the crew, the hours and the output. This is the **Task Log**.
2. **Average.** Time Pro groups your records by item of work and works out the average output per day and the average crew that produced it. This is the **Duration Summary**.
3. **Forecast.** You type the quantity from your bill. Time Pro divides it by your average output to give the expected number of days, and tells you the crew needed for the number of days you actually want.
4. **Export.** You send the result to Excel, or to Microsoft Project as a ready-made programme.

> **Important:** A brand-new Time Pro has no history, so it cannot forecast anything yet. Every expected duration will show as 0 until you have logged some tasks for that item of work. Start recording on site before you need the forecast. A week of honest records is enough to begin.

### What Time Pro does not do

Time Pro builds the durations and crews. It does not draw a Gantt chart, track progress against a baseline, or let you set your own task links. Those jobs happen in Microsoft Project after you export: see "Working with the programme in Microsoft Project" below. Time Pro also does not open or import Microsoft Project files. It only exports to them.

## Finding your way around

### The side menu

The side menu on the left takes you between the three screens. Use them in this order:

| Button | What it is for |
|---|---|
| **Current Weather** | Look up a town and fetch today's weather, so it can be stamped on your task records |
| **Task Log** | Your daily site records. Everything Time Pro knows comes from here |
| **Duration Summary** | One row per item of work, with averages and your forecast. Exports start here |

At the bottom of the side menu are two more buttons:

- **Dark Mode** (or **Light Mode** when dark mode is on) switches the colour theme.
- **Sign Out** signs you out of Time Pro on this computer.

The screen you are on is highlighted in ADLM orange.

> **Tip:** If you make the Time Pro window narrow, the side menu shrinks to a strip of icons to give the tables more room. Hover over an icon to see its name. Widen the window again and the labels come back.

### The top bar

Across the top of the window you will find:

- **Search here...**: a search box. Start typing an item of work, a trade, a piece of equipment or a weather condition and Time Pro filters the table on the current screen and offers suggestions underneath. Click a suggestion to use it.
- A help button (the question mark). It shows a short note and a link to [adlmstudio.net](/) for more ADLM software and training.
- Your name and email. Click them to open a small menu with **Logout**.

### Dark mode

Time Pro has a full dark theme that covers every screen, dialog and export window.

- The first time you open Time Pro, it follows your Windows light or dark setting.
- To switch, click **Dark Mode** or **Light Mode** at the bottom of the side menu.
- Time Pro remembers your choice the next time you open it.

## Fetching the weather

Weather changes what a gang produces. Time Pro lets you attach real conditions to each record so that later you can tell a wet-season output from a dry-season one. The weather comes from the free Open-Meteo service, so you need an internet connection at the moment you fetch it.

### Fetch today's weather

1. Click **Current Weather** in the side menu.
2. Type your town into the box under **SEARCH CITY** and click **Search**.
3. Choose the right place under **SELECT CITY**. Many town names exist in more than one country, so check the result.
4. Click **Fetch Weather**.

Time Pro shows the temperature and condition, with **Wind Speed**, **Humidity**, **Rainfall** and **Cloud Cover**. Your last few readings are listed under **Weather Snapshots**.

### Attach weather to your tasks

There are two ways:

- **Automatically.** Once you have fetched the weather, every new task you add picks up the current reading when you save it.
- **By hand.** Select a task in the **Task Log**, then click **Apply Current Weather to Selected Task** on the Task Log, or **Apply to Selected Task** on the **Current Weather** screen.

> **Tip:** Fetch the weather once at the start of the day. The reading stays in place while you move between screens, so every task you add that day gets it.

> **Note:** Weather does not change Time Pro's arithmetic. It applies no wet-weather factor. It simply records the conditions so you can judge whether an average fits the job you are planning.

## Recording site work in the Task Log

The **Task Log** is where you record daily site work: items of work, labour, hours and outputs. One row is one gang, on one item of work, for one day.

### Add a task

1. Click **Task Log** in the side menu.
2. Click **Add Task**. The **Add Task** window opens with today's date already filled in.
3. Type the **Item of Work**, for example "Blockwork 225mm".
4. Pick the **Trade** from the list, for example "Blockwork / Masonry / Bricklaying".
5. Enter the number of **Skilled Labour** and **Unskilled Labour** on this item for the day.
6. Enter the **Hours Worked** and the **Break Hours**. **Net Hours (auto)** fills itself in: hours worked minus breaks.
7. Type the **Equipment Used**, for example "Mixer", if any.
8. Enter the **Output** the gang produced and its **Output Unit**, for example 18 and m2.
9. Check the **Start Date** and **End Date**.
10. Click **Save Task**.

The new row appears in the table straight away and is saved on this computer.

> **Important:** The Item of Work must be typed exactly the same way every time. Time Pro groups your records by this text. "Blockwork 225mm" and "225 blockwork" become two separate items, each with half the history. If you work in a team, agree the item names before anyone starts recording.

> **Tip:** Keep the output unit the same as the unit in your bill. If your bill measures blockwork in m2, record the output in m2, or the forecast will be wrong by the conversion.

### What each field is for

| Field | What to enter |
|---|---|
| **Item of Work** | The work being done. This is the field that drives all the averages |
| **Trade** | The trade, chosen from the list. It is for your reference and does not change the arithmetic |
| **Skilled Labour** / **Unskilled Labour** | How many of each worked on this item that day. Count the gang, not the whole site |
| **Hours Worked** | Hours on the item for the day |
| **Break Hours** | Hours not worked out of those. Cannot be more than the hours worked |
| **Net Hours (auto)** | Worked out for you. You cannot type into it |
| **Equipment Used** | The plant used, such as a mixer, vibrator or hoist |
| **Output** / **Output Unit** | What the gang actually produced, and in what unit |
| **Start Date** / **End Date** | The days this record covers. The end date cannot be before the start date |

> **Important:** Time Pro treats each row as one day's output when it works out **Avg Output / Day**. Record one row per gang per day. If you put a whole week's output into one row, that item's daily output will look far higher than it really is.

### The Task Log table

The table shows your records with these columns: **ID**, **Item of Work**, **Trade**, **Skilled**, **Unskilled**, **Hours**, **Break**, **Net**, **Equipment**, **Output**, **Unit**, **Start** and **End**. Time Pro numbers the **ID** for you. The table is for reading only: to change a record, use **Edit Selected**.

### Edit a task

1. Click the row you want to change.
2. Click **Edit Selected**. The **Edit Task** window opens with the record filled in.
3. Make your changes.
4. Click **Save Changes**.

The Duration Summary updates on its own. There is nothing to recalculate by hand.

### Delete a task

1. Click the row you want to remove.
2. Click **Delete Selected**.

> **Important:** **Delete Selected** removes the row at once. Time Pro does not ask you to confirm and there is no undo. Check you have the right row selected first.

### If Save will not work

If the save button stays greyed out, or you see **Please fill Item of Work, check dates, and confirm hours/break values.**, check that:

- the **Item of Work** is not empty;
- the **End Date** is not before the **Start Date**;
- **Break Hours** is not more than **Hours Worked**;
- no number is negative.

## Turning records into durations: the Duration Summary

The **Duration Summary** turns your site records into durations from your BOQ quantities. It shows one row per item of work. The averages come from your Task Log. Three columns are yours to type in: **BOQ Qty (Requested)**, **Planned Duration (days)** and **Weather Scenario**. Everything else is worked out for you.

### Get a duration from a BOQ quantity

1. Click **Duration Summary** in the side menu.
2. Find the item of work.
3. Click the cell that says **Click to enter BOQ Qty…** in the **BOQ Qty (Requested)** column.
4. Type the quantity from your bill, for example the measured quantity from [QUIV for Revit](/guides/quiv), and press <kbd>Enter</kbd>.

**Expected Duration (days)** fills in at once, and **Planned Duration (days)** starts at the same figure. **Required Skilled / Day** and **Required Unskilled / Day** show the crew needed.

### Squeeze or stretch the programme

If the client needs the work finished sooner, or you can only put a small gang on it:

1. Click the **Planned Duration (days)** cell for that item.
2. Type the number of days you want and press <kbd>Enter</kbd>.

**Required Skilled / Day** and **Required Unskilled / Day** change to the crew needed to finish in that time.

### Weather Scenario

**Weather Scenario** starts with the **Predominant Weather** for that item. Overwrite it with a short note of the conditions you are planning for, such as "Rainy season". It is a note only and does not change any figure.

### What each column means

| Column | How it is worked out |
|---|---|
| **SN** | Row number |
| **Item of Work** | One row for each distinct item in your Task Log |
| **BOQ Qty (Requested)** | You type it: the quantity from your bill |
| **Expected Duration (days)** | BOQ Qty divided by Avg Output / Day. How long the work takes at the rate you have really been achieving |
| **Planned Duration (days)** | You can change it. Starts equal to the expected duration |
| **Required Skilled / Day** | Skilled workers per day needed to finish in the planned duration, rounded up to whole people |
| **Required Unskilled / Day** | The same for unskilled workers |
| **Weather Scenario** | You can type here. A note of the conditions you are assuming |
| **Avg Output / Day** | The average output across your Task Log rows for this item |
| **Avg Net Hrs / Day** | Average hours actually worked, after breaks |
| **Avg Skilled / Day** / **Avg Unskilled / Day** | The average crew that produced that output |
| **Predominant Weather** | The weather recorded most often against this item |

### The arithmetic, with an example

Time Pro keeps the total effort the same and spreads it over the number of days you ask for:

- Expected duration = BOQ quantity ÷ average output per day
- Skilled man-days = average skilled per day × expected duration
- Required skilled per day = skilled man-days ÷ planned duration, rounded up

Say your records for "Blockwork 225mm" average 18 m2 a day from 3 skilled and 2 unskilled workers, and the bill says 540 m2.

- Expected duration: 540 ÷ 18 = 30 days.
- Effort: 3 × 30 = 90 skilled man-days, and 2 × 30 = 60 unskilled man-days.
- Set **Planned Duration (days)** to 20, and the crew becomes 5 skilled (90 ÷ 20 = 4.5, rounded up) and 3 unskilled (60 ÷ 20 = 3).

> **Note:** Halving the duration roughly doubles the crew. Time Pro does not know the point where a gang starts getting in its own way on a small workface. That judgement stays with you. A planned duration far below the expected one is a risk worth flagging.

### Enter quantities and export in one sitting

> **Important:** In Time Pro 1.0, Time Pro does not keep the figures you type on the Duration Summary. **BOQ Qty (Requested)**, **Planned Duration (days)** and **Weather Scenario** clear when you leave the Duration Summary for another screen, when you add, edit or delete a task, and when you close Time Pro. Enter your quantities, then export to Excel or Microsoft Project before you move away. Keep your bill quantities handy (for example in your BOQ spreadsheet) so you can type them in again.

## Exporting your work

Two buttons sit at the top right of the **Duration Summary**: **Excel** and **MS Project**.

### Export to Excel

The Excel export is your record and your evidence. Use it when someone asks where a duration came from.

1. Open the **Duration Summary** and enter any BOQ quantities you want included.
2. Click **Excel**.
3. Choose where to save the file. Time Pro suggests a name such as `ADLM_Time_Export_20261001_0930.xlsx`.
4. Click save. You will see **Export complete.**

The workbook has two sheets:

| Sheet | What is on it |
|---|---|
| **Summary** | One row per item of work: the averages, predominant weather, requested quantity, weather scenario, expected and planned durations and the required crews |
| **DataInput** | Every Task Log row exactly as recorded, including equipment, output, unit, dates and the weather attached to it |

The sheets are set up to print neatly, with "Generated by ADLM Studios" and the print date in the page footer.

> **Tip:** The Excel export is also the easiest way to keep a backup of your Task Log, or to send your records to a colleague.

### Export to Microsoft Project

The **MS Project** button builds a programme file that Microsoft Project opens directly, with tasks, durations, links, resources and costs already in place.

The button only becomes active once at least one item has a BOQ quantity.

1. On the **Duration Summary**, enter a **BOQ Qty (Requested)** for each item you want in the programme.
2. Click **MS Project**. The **Export to MS Project** window opens.
3. Set the **Project Start Date**. It starts on today's date.
4. Choose the **Currency** your rates are in.
5. Under **Resource Rates (enter 0 to fill in MS Project later)**, type:
   - **Skilled Labour – Rate per person/hour**
   - **Unskilled Labour – Rate per person/hour**
   - **Equipment – Rate per use**
6. Click **Export**.
7. Choose where to save the file. Time Pro suggests a name such as `ADLM_Project_20261001_0930.xml`.
8. Click save. Time Pro tells you how many work items it exported.

> **Note:** The file is a Microsoft Project XML file (`.xml`), not an `.mpp` file. Microsoft Project opens it from **File**, then **Open**. Once it is open, save it as an `.mpp` from inside Project if you want.

#### Currencies you can choose

Nigerian Naira, US Dollar, Pound Sterling, Euro, Ghanaian Cedi, Kenyan Shilling, South African Rand, West African CFA Franc, UAE Dirham, Saudi Riyal, Indian Rupee, Canadian Dollar and Australian Dollar. Time Pro starts on the currency of your Windows region and remembers the one you pick. The currency goes into the file, so Microsoft Project shows costs in the same money you typed.

#### Typing rates

You can type rates the way you normally write money, for example `1,500.00` or `₦1500`. Enter 0 for any rate you would rather fill in later inside Microsoft Project.

#### Which items are exported

An item goes into the programme only if it has both a BOQ quantity and a planned duration above zero.

- If an item has a quantity but no logged output history, its expected duration is 0. Time Pro names these items and either skips them (telling you how many it skipped) or, if nothing can be exported, shows **Nothing to Export**.
- To include such an item, either type a number of days into its **Planned Duration (days)**, or log some tasks for it in the Task Log first.
- Items with no BOQ quantity are left out.

## Working with the programme in Microsoft Project

When you open the exported file in Microsoft Project, you get:

| In Project | Where it comes from |
|---|---|
| A project summary task, "ADLM Project Summary" | Added by Time Pro |
| One task per exported item of work | The item's **Planned Duration (days)** |
| Tasks linked finish-to-start, in the order of the Duration Summary | Added by Time Pro, starting on your **Project Start Date** |
| Up to three resources per item, such as "Blockwork 225mm – Skilled Labour", "Blockwork 225mm – Unskilled Labour" and "Blockwork 225mm – Mixer" | Labour as hourly work resources, equipment as a per-use material resource |
| Resource assignments | The crew from **Required Skilled / Day** and **Required Unskilled / Day** |
| Costs | Your rates, in your chosen currency |
| Task notes | The BOQ quantity, expected and planned durations, average output, crew, equipment and predominant weather for each item |
| Calendar | A standard Monday to Friday calendar, 08:00 to 12:00 and 13:00 to 17:00 (8 hours a day) |

From here, use Microsoft Project for everything Time Pro does not do:

- **Gantt chart:** the file opens in Project's Gantt view.
- **Dependencies:** the finish-to-start chain is a starting point. Change or add links in Project where trades can overlap.
- **Rescheduling:** because the tasks are linked, moving the first task moves the whole programme.
- **Baselines and progress:** set a baseline and record progress in Project as usual.

> **Tip:** If your quantities change, export again and rebuild the programme rather than patching the old one by hand. It keeps your Time Pro figures and your programme in step.

## Your data

- Your Task Log is saved on this computer as you work, so closing Time Pro never loses a day's records. It is still there the next time you sign in on this PC.
- Signing out does not delete your Task Log.
- The Duration Summary figures you type (quantities, planned durations, scenarios) are not saved. See "Enter quantities and export in one sitting" above.
- Excel and Microsoft Project files are snapshots. Changing them does not change Time Pro.

## AI in Time Pro

Time Pro 1.0 has no AI features. Every figure it shows is arithmetic on your own Task Log, and nothing is sent to an AI service. For the AI features in other ADLM products, see [ADLM AI services](/guides/ai-services).

### How this relates to "Estimate the outputs" on ADLM Cloud

ADLM Cloud is gaining a web **Programme** for cloud projects, built on Time Pro's idea: it divides each quantity on a project's bill by a gang output per day and sequences the trades. Under **Where the time comes from**, an **Estimate the outputs** button asks ADLM AI to propose an output per trade from the wording of your bill lines. You then check and edit the **Output** column, or click **Estimate again**. It does not change your bill.

Keep in mind how it differs from Time Pro:

| | Time Pro (desktop) | Estimate the outputs (web) |
|---|---|---|
| Where outputs come from | Your own site records in the Task Log | An AI estimate from the bill's wording, which you edit |
| Uses AI | No | Yes, within your monthly AI allowance |
| Reads your Task Log | Yes | No. Time Pro's records stay on your computer |
| Exports | Excel and Microsoft Project | On the web page |

> **Note:** At the time of writing, the web Programme with **Estimate the outputs** is part of ADLM Cloud's new workspace, which is still being opened up to customers. If your account opens the older programme page, you will not see the button yet. An estimated output is a starting point; an output measured on your own site, as Time Pro records it, is the stronger evidence.

## Troubleshooting

### "Your ADLM account does not have an active ADLM Time Pro subscription"
Your username and password are correct, but the account has no active Time Pro subscription. Click **Subscribe to ADLM Time Pro**, complete the purchase, then sign in again. If you have just paid, check your [dashboard](/dashboard) shows the subscription as active. If you bought it under a different email address, sign in with that one.

### "Sign in failed. Please check your username/email and password."
Check the spelling of your email or username and your password. If you have forgotten your password, reset it on the website, then try again.

### "Internet is required for your first sign-in."
Your PC is offline and you have never signed in to Time Pro on it before. Connect to the internet and sign in once. After that, Time Pro can work offline on this PC.

### "No valid offline licence was found. Connect to the internet and sign in again."
You are offline and the licence saved on this PC has run out, or it belongs to another computer. Connect to the internet and sign in.

### "Session expired. Please sign in again."
Time Pro keeps you signed in for about a day and a half. Sign in again. Your Task Log is still there.

### Time Pro is not in my Installer Hub, or reads "Not on your plan"
The card only reads **Ready to install** once your subscription is active. If it reads **Not on your plan**, your account has no active Time Pro subscription: subscribe on the website, then click **Refresh** in the Hub. If you have just paid and it still does not change, sign out of the Hub and back in. If it still does not appear, contact [support](/support).

### Every Expected Duration shows 0
The item has no output recorded in the Task Log, or its rows have an output of 0. Log some tasks for that exact item of work, spelled exactly the same way. If you need to export it before you have records, type a number of days into **Planned Duration (days)**.

### The same item appears twice in the Duration Summary
The item has been typed two different ways in the Task Log, for example with an extra space or different wording. Edit the rows so they all use the same text, and the two lines will merge into one.

### My BOQ quantities disappeared
Time Pro clears the Duration Summary entries when you leave that screen, change the Task Log, or close the app. Type them in again and export before moving away.

### The MS Project button is greyed out
No item has a BOQ quantity yet. Enter at least one quantity in **BOQ Qty (Requested)** and press <kbd>Enter</kbd>.

### "Nothing to Export"
Either no item has a BOQ quantity, or the items with a quantity have no duration because there are no logged tasks for them. Follow the message: enter quantities, or type a **Planned Duration (days)** for the items it lists.

### Microsoft Project will not open the file
Make sure you have the latest Time Pro 1.0 build (update through the Installer Hub). Earlier builds produced files that Project could reject. Open the file from **File**, then **Open** in Project, and choose XML files in the file type list if the file does not show.

### Costs in Microsoft Project are zero
You left a rate at 0 in the export window. Either export again with your rates, or type the rates for each resource in Project's Resource Sheet.

### "Search failed" or "No cities found" on the weather screen
Check your internet connection and the spelling of the town. Try a larger nearby town if a small one is not found.

### The side menu only shows icons
The window is narrow, so the menu has shrunk to give the tables more room. Widen or maximise the window to bring the labels back.

### I deleted a task by mistake
There is no undo. Add the task again with **Add Task**. If you exported to Excel recently, the **DataInput** sheet has the old values to copy from.

## Frequently asked questions

### Does Time Pro draw a Gantt chart?
No. Time Pro works out durations and crews from your site records. Export to Microsoft Project to get the Gantt chart, change links, set baselines and track progress.

### Can I import a Microsoft Project file into Time Pro?
No. Time Pro exports to Microsoft Project but does not open or import Project files.

### Can I export to PDF?
Time Pro does not export PDF directly. Export to Excel and use Excel's print or Save as PDF, or print from Microsoft Project after exporting there. The Excel sheets are already set up to print.

### Do I need internet all the time?
No. You need it for your first sign-in and to fetch weather. After that you can record tasks on site without a connection, on the PC where you signed in.

### Can I use Time Pro on two computers?
Your licence is tied to one computer. To move it, contact [support](/support) to release it from the old PC.

### Where does my Task Log live?
On the computer you use Time Pro on, in your Windows user profile. If two people share one Windows login on the same PC, they share one Task Log. Export to Excel regularly to keep a copy.

### How many days of records do I need?
There is no minimum, but more is better. A week of daily records on a live site is enough to start forecasting that trade. Records from different weather and different gangs make the average more reliable.

### Does the weather change my durations?
No. Time Pro records the weather so you can see it, but applies no adjustment. Use the **Weather Scenario** column to note what conditions your forecast assumes.

### Where do my BOQ quantities come from?
From your bill. You can measure them with [QUIV for Revit](/guides/quiv) or another ADLM takeoff tool, or take them from any bill of quantities, and type them into **BOQ Qty (Requested)**. Keep the unit the same as the unit you recorded output in.

### Does Time Pro have keyboard shortcuts or a connection indicator?
Not in Time Pro 1.0. Those arrived in other ADLM products in September 2026 but have not been released for Time Pro.

### Does Time Pro use AI?
No. See [AI in Time Pro](#ai-in-time-pro) for how it relates to the AI output estimate on ADLM Cloud.

### How much does Time Pro cost?
See the Time Pro page on [adlmstudio.net](/products) for current monthly and yearly prices.
