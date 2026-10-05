---
id: cloud
title: ADLM Cloud (overview)
tagline: Price, value, programme and share the projects you measure in QUIV, HERON, Revit MEP, CIVIQ and ArchiCAD, from any browser.
version: "2026.10"
updated: 2026-10-05
platform: Web, any browser (adlmstudio.net)
productKeys: []
pdf: ADLM-Cloud-User-Guide.pdf
order: 10
---
ADLM Cloud is the web side of your ADLM products. When you save a take-off to the cloud from QUIV, HERON, Revit MEP or CIVIQ, the project appears on adlmstudio.net. There you price the bill with your Rate Gen rates, plan the purchases, value the work done, issue interim certificates, run the programme, export an ICMS 3 cost and carbon report and share progress with your client. You can do all of this from any computer or phone, without Revit or PlanSwift installed.

This guide covers ADLM Cloud as it is on the live site on 5 October 2026, after the new website design went live on 1 October.

## What's new in 2026.10

**October 2026**

- **The new website design is live.** Signing in now takes you to your **Overview** (`/manage`), and every signed-in page has the same menu down the left side. The old `/dashboard` address opens the Overview too.
- **Every link opens the new pages.** Since 4 October the menu, the account menu and every project card take you to the new screens: **Your work** (`/work`), **Projects** (`/work/projects`), each tool's page and the account pages under `/manage`. Old bookmarks to a project open it on the new project page.
- **A new project page.** A project opens on one page with tabs: **Overview**, **Bill**, **Rates & budget**, **PM dashboard**, **Activity schedule**, **Valuations**, and **Model**, **Drawings** or **Services** where they apply. Its **Export** button gets your Excel bills and PDF reports out. For the jobs it does not do yet, **More actions** > **Open the classic workspace** opens the older screen. See [Projects and your workspace](/guides/cloud-projects#inside-a-project).
- **The programme page is open to everyone.** `/work/programme` sequences a project's bill into a programme. See [Programme and project management](/guides/cloud-pm#the-programme-page).
- **ICMS 3 cost and carbon report.** The classic workspace's **Export** menu has a new **ICMS 3** group. **ICMS 3 cost and carbon (Excel)** gives cost and upfront carbon (A1-A5) by ICMS 3 Group, and **ICMS 3 cost and carbon (JSON)** gives the same report as data in the RICS Data Standard 3.3.3 format. It works on learning samples too. See [Exports and reports](/guides/cloud-bill-budget#exports-and-reports).
- **Price a sample with your own rates.** An open learning sample in the classic workspace has **Price with my RateGen rates**, which shows the bill re-priced with your own Rate Gen rates, line by line. Nothing is saved.
- **Carbon on sample cards.** Each learning sample card shows its **Carbon footprint** in tCO2e and how much of the bill's cost that figure covers.
- **Rates are built in ADLM Rate Gen only.** The website shows your rate library and lets you pick a Rate Gen rate onto a bill or budget line, or type a price on a bill line. Building, editing or deleting a rate, and changing library prices, are done in the Rate Gen desktop app. See [ADLM Rate Gen](/guides/rategen).
- **QUIV budgets are priced for you.** When QUIV 4 saves a project, the cloud prices the material and labour schedule from your Rate Gen library and your constants, if your account has Rate Gen. Prices you set on the website are never changed.
- **Constants agree across products.** Pipe stock length 6 m, POP board 1.44 m², emulsion paint 0.026 drum per m², blockwork waste 1.03, tile waste 1.10, and rebar weight d²/162. See [Material and Services Constants](/guides/cloud-bill-budget#material-and-services-constants).
- **Certificates state their period.** **Issue certificate** now asks for **Period from**, **Period to**, **Release retention** and **Notes on this certificate**.
- **Ada can price and report.** Ask Ada to price your unpriced lines and she shows a **Proposed rates** card for you to tick and apply. Ask for a report for a date range and she shows a **Project report** card with **Open the report**.
- **Payment documents agree.** The interim certificate and the printed Interim Payment Application now use the same figure for re-measured lines, and **Less previous payments** shows the net figure everywhere.

**September 2026**

- Picking a Rate Gen rate on the bill prices the line's material, labour and plant in the Budget at the same time.
- Learning samples for QUIV, HERON, Revit MEP and CIVIQ.
- New project screens: a **Views** list you can hide, and the **Work area**, which joins the model, the bill, the schedule and Ada.
- Projects reopen on the view you were last using.
- **Certificates**, **Variations** and **Final account** together under **Contract administration**.
- A redesigned buy schedule, a **Summary** box on the bill with **Mark as tendered**, and re-saving from a plugin no longer wipes your website rates and notes.

## The ADLM Cloud guides

The Cloud guide comes in five parts. Read them in order the first time, or jump to the one you need.

| Guide | What it covers |
|---|---|
| [Projects and your workspace](/guides/cloud-projects) | The menu, **Your work**, the project lists, samples, the project page and its tabs, the classic workspace, the 3D model and the Work area. |
| [The bill and the budget](/guides/cloud-bill-budget) | The **Bill** and **Rates & budget** tabs, picking Rate Gen rates, the budget and buy schedule, constants, and every export including ICMS 3. |
| [Valuations and contract administration](/guides/cloud-valuation) | The **Valuations** tab, valuing work done, interim certificates, variations, the final account and the contract lock. |
| [Programme and project management](/guides/cloud-pm) | The **PM dashboard** and **Activity schedule** tabs, the programme page, the PM Tracker and the Portfolio dashboard. |
| [Sharing, team and Ada](/guides/cloud-sharing) | Client dashboard links, collaborators, who sees money, and Ada. |

To learn on real data first, open a learning sample: see [Sample projects](/guides/samples).

## Before you start

- **An ADLM account.** The same email and password you use in the desktop products. See [Getting started](/guides/getting-started).
- **A licence for the product the project came from.** A QUIV project needs QUIV, a HERON project needs HERON, and so on.
- **A Rate Gen licence (recommended).** Without one you can still open and value a project, but you cannot pick rates from your Rate Gen library, the cloud does not price your QUIV budgets, and on projects shared with you the rates and money stay hidden.
- **A browser.** Any up-to-date browser on a computer, tablet or phone. The 3D model needs WebGL, which every modern desktop browser has.

## How ADLM Cloud fits together

1. **Measure** in a desktop product: QUIV or Revit MEP in Revit, HERON in PlanSwift, CIVIQ in Civil 3D.
2. **Save to ADLM Cloud** from the plugin. Each save makes a new version of the project.
3. **Open the project** on adlmstudio.net from **My tools** or **Projects** in the menu. It opens on the project page.
4. **Price** the bill with your Rate Gen rates on the **Bill** and **Rates & budget** tabs, check the budget, and export.
5. **Run the job**: lock the contract, record progress, issue certificates, decide variations and follow the programme.
6. **Share** a read-only dashboard with your client, or invite colleagues to work on the project.

Signing in takes you to your **Overview**: your products, anything that needs your attention, the Installer Hub and recent activity.

![The account Overview you land on after signing in: your products, what needs your attention, the Installer Hub and recent activity.](shot:dash-home.png)

Click **Overview** under **Work** to see **Your work**: what needs a decision, where you left off, and your projects, money, programme and rates in one place.

![The ADLM Cloud overview: what needs a decision, where you left off and your projects.](shot:cloud-overview.png)

## AI in ADLM Cloud

ADLM Cloud has these AI features today. Each one proposes; you decide. Nothing writes to your bill without your confirmation. Full details are in [ADLM AI services](/guides/ai-services).

| Feature | Where | What it does | Availability |
|---|---|---|---|
| **Ask Ada** | The round button at the bottom corner of every page, and **Ask Ada** at the top of the menu | Answers about products, and, when you are signed in, about your own projects, bills, budgets, valuations and programme | On for everyone |
| Ada as estimator | Ask Ada, for example "Price my bill" | Proposes rates for unpriced lines from your own Rate Gen library, on a **Proposed rates** card; you tick lines and press **Apply N rates** | On for everyone, on projects you can edit |
| Ada reports | Ask Ada, for example "a report for September" | A **Project report** card for a date range, with **Open the report** for the PDF | On for everyone |
| **Check my rates against the market** | The classic workspace's **Work area** | Benchmarks your priced lines against the Rate Gen library for your zone | On for everyone with an active licence |
| **Scan the bill for errors** | Classic **Work area** | Finds duplicates, wrong units, odd quantities and rate outliers | On for everyone with an active licence |
| **Build up a rate for the selected line** | Classic **Work area** | Suggests a breakdown of one line's rate into material, labour and plant. Advice only: nothing is saved to your library | On for everyone with an active licence |
| **Estimate the outputs** | The programme page (`/work/programme`) | Proposes a daily gang output per trade so quantities become durations | On for everyone |

> **Note:** The ICMS 3 report, the carbon figures, **Price with my RateGen rates**, the rate suggestions on **Rates & budget** and **Plan the work from the bill** are not AI. They work from fixed rules, your Rate Gen rates and published carbon factors.

The AI checks draw on a monthly allowance (200 units at the time of writing): a market check costs 2 units, an error scan or a rate build-up 1, and the same check repeated within a week costs nothing. At the limit you see a plain message, and the rest of ADLM Cloud keeps working.

## Troubleshooting

### My project is not on the website

Check that the plugin's save finished, then refresh the **Projects** page. Make sure the website and the plugin are signed in with the same account. See [Projects and your workspace](/guides/cloud-projects#troubleshooting).

### Rates show as dashes

You are a collaborator on someone else's project and your account has no active Rate Gen licence. See [Sharing, team and Ada](/guides/cloud-sharing#troubleshooting).

### I need the older project screen

Open the project, then click **More actions** > **Open the classic workspace**. Typing a price, the budget editor, the 3D model, the Work area, locking the contract and issuing certificates are still done there.

## Frequently asked questions

### Do I need Revit or PlanSwift to use ADLM Cloud?

No. You need the plugin to measure and save a project. Once it is on the cloud you can price, value, programme and share it from any browser.

### Can I build or edit a rate on the website?

No. Rates are built and edited only in the ADLM Rate Gen desktop app. On the website you can view your library, pick a Rate Gen rate onto a line, or type a price on a bill line.

### Is the ICMS 3 report AI?

No. Each line is placed in an ICMS 3 Group by fixed rules, and its carbon comes from your Rate Gen rates and published carbon factors.

### Where do I get help?

Ask Ada, chat with us on WhatsApp on +234 810 650 3524, or raise a ticket from **Support** in the menu. See [Getting started](/guides/getting-started#getting-support).
