---
id: samples
title: Sample projects
tagline: Twenty finished, read-only jobs you can open on ADLM Cloud to see a bill, a budget, valuations and a programme filled in from start to finish.
version: "2026.10"
updated: 2026-10-04
platform: Web, any browser (adlmstudio.net)
productKeys: []
pdf: ADLM-Sample-Projects-Guide.pdf
order: 15
---

Sample projects are complete, worked jobs that ADLM Studio has put on ADLM Cloud for you to learn from. Each one is a real-looking Nigerian job: a priced bill of quantities, a budget with suppliers, a locked contract, interim certificates, variations, a programme with risks and issues, and, for the model-based products, a 3D model. When your own first project has only a bill in it, a sample shows you what every other tab will look like once the job is running.

There are four samples for each product that has a cloud project screen: QUIV for Revit, HERON for PlanSwift, SERVIQ for Revit MEP, CIVIQ for Civil 3D and QUIV for ArchiCAD. Every sample is read-only. You can open it, read it, filter it and export it, but nobody can change it, save over it or delete it.

This guide lists every sample, says what is in it and what it teaches, shows how to price a sample with your own Rate Gen rates and export it as an ICMS 3 cost and carbon report, and ends with six short exercises.

## Before you start

### What you need

- **An ADLM account.** Sign in at adlmstudio.net.
- **An active licence for the product.** Samples appear only for products you hold an active licence for. A QUIV licence shows you the QUIV samples, a HERON licence the HERON samples, and so on. If your licence has expired, the samples for that product disappear with your own projects until you renew. See [Getting started](/guides/getting-started) and **Products** at [/manage](/manage).
- **Nothing else.** You do not need Revit, PlanSwift, Civil 3D or ArchiCAD installed to open a sample. A Rate Gen licence is not needed either: samples show every rate to everyone.

### What a sample is, and what it is not

- A sample is **learning material**. The figures are worked properly (rates come from a material and labour build-up, the contract sum is calculated the same way as on your own jobs, and the certificates add up), but the clients, sites and suppliers are made up.
- A sample is **not a template**. You cannot copy it into your account or start your own project from it. Your own projects still start in the desktop plugin.
- A sample is **not yours**. It does not appear in your project list or gallery, it does not use any of your cloud storage slots, and it is not counted in your totals on the Overview page.

## Finding the samples

### On a product's project list

1. Sign in at adlmstudio.net.
2. Open the product's project list, for example **QUIV projects** (`/projects/revit`), **HERON projects** (`/projects/planswift`), **Revit MEP projects** (`/projects/mep`) or **CIVIQ projects** (`/projects/civil3d`).
3. Above your own project cards, look for the **Learning samples** strip. It reads, for example, "Worked duplex projects, one per foundation type, each measured from its own 3D model. Open one to see every tab filled in. Samples are read-only."
4. Click a sample card to open it.

### On a tool's page

1. Under **My tools**, click the tool, for example **QUIV** (`/work/tool/quiv`).
2. Scroll past **How a project starts**. The **Learning samples** strip sits there too.
3. Click a sample card to open it.

### For QUIV for ArchiCAD

ArchiCAD samples are on the **QUIV for ArchiCAD** page (`/archicad`), above **Your ArchiCAD projects**. See [Early-access products](#early-access-products-civiq-and-quiv-for-archicad).

### Reading a sample card

Each card shows:

| On the card | What it means |
|---|---|
| The flag at the top left | The foundation type, pavement type or building the sample is about, for example **Raft foundation** or **Interlocking paving** |
| **Read-only** (with an eye) | You can look but not change |
| The name | The job, for example "5-Bedroom Duplex - Raft Foundation" |
| The two short lines under the name | The site, then the stage the job has reached |
| **Contract** | The locked contract sum, in millions of naira |
| **Lines** | How many priced lines are in the bill |
| **Certificates** | How many interim certificates have been issued |
| **3D model** | Shown when the sample has a model you can open |
| **Carbon footprint** | The upfront carbon (A1-A5) of the sample's bill in tCO2e, worked out from your own Rate Gen rates |
| **Covers** | The share of the bill's cost that the carbon footprint is worked out on |

### Hiding and showing the strip

- Click **Hide samples** to fold the strip away once you no longer need it.
- Click **Show 4 samples** to bring it back. The number is how many samples that product has.

> **Note:** Hiding the strip only hides it in the browser you are using. On another computer or phone it starts open again.

## Read-only: what you can and cannot do

When a sample opens, an orange banner across the top reads **Sample project · Read-only learning material**, followed by the foundation or job type and the stage. Under it is a one-line summary of the job and the ground conditions, and a fold-out list called **What to look at in this sample**. The banner ends: "You can open every tab, filter, and export, but nothing can be changed. Sync your own model from the plugin to start a project of your own."

| You can | You cannot |
|---|---|
| Open every view: **Dashboard**, **Bill of Quantity**, **Budget**, **Valuation**, **Work area**, **3D Model** (where there is one) and **PM Dashboard** | Change a rate, a quantity, a percentage done or a setting |
| Search and filter the bill and the budget | Save changes. The server refuses with "Sample projects are read-only learning material." |
| See every rate and every money total, with or without Rate Gen | Delete the sample, merge it with another project or select it for bulk actions |
| Price the bill with your own Rate Gen rates, without saving anything | Save the new prices to the sample |
| Download the Excel workbooks and reports, including the ICMS 3 cost and carbon report | Add certificates, variations, tasks, risks or issues |
| Open the 3D model and pick elements | Invite collaborators or share it with a code |

A few more points:

- **Nobody can edit a sample.** It is the same for every customer, and ADLM Studio does not edit it by hand either. If one is ever updated, it is replaced as a whole.
- **Samples never reach the desktop plugins.** The project list the plugins read never includes samples, so you cannot open a sample in Revit or PlanSwift and save your work over it.

> **Tip:** Because you cannot break a sample, it is the safest place to try things. Click every tab, open every certificate, and download every export. Then do the same on your own project.

## Pricing and carbon on a sample

From October 2026, a sample can show you what your own Rate Gen rates make of its bill, and its carbon footprint. None of this changes the sample.

### Price with my RateGen rates

Under the orange banner of an open sample is a panel called **Price with my RateGen rates**. It re-prices the sample's bill with the Rate Gen rates your account prices with, for the state on your profile: ADLM's rates for that state, with your own changes and custom rates on top. Nothing is saved.

1. Open a sample.
2. In the **Price with my RateGen rates** panel, click **Price with my rates**.
3. Read the three tiles: **Bill as priced (lines your rates cover)**, **With your RateGen rates** with the percentage difference, and **Lines priced**, which shows how many lines your rates covered and what share of the bill's cost that is.
4. Read the table under them. Each line shows the **Bill rate** beside **Your rate**, and **From** says how your rate was found (see the table below).
5. The table shows 25 lines. Click **Show all** and the number of lines to see the rest.
6. After changing your rates, click **Price again**.

| From | Meaning |
|---|---|
| **Same item** | Your rate with the line's own description and unit |
| **By the work** | Your rate for the work the line measures, such as concrete of that mix or blockwork of that thickness, with the unit converted. "assumed" after it means the bill did not say something and it was assumed: hover over it to see what |
| **Services pricing** | A SERVIQ line priced from the services rates |
| **Not priced** | No rate of yours fits. The line is left out rather than guessed |

On the building samples, your rates usually cover most of a bill's cost (87 to 98% on the live samples). The CIVIQ road samples cannot be priced this way: the panel says "RateGen has no civil works rates yet", because pricing roads from building rates would give a confident wrong answer.

> **Tip:** A large difference on one trade is worth a look in [ADLM Rate Gen](/guides/rategen). Rates are built and edited there, not on the website.

### The carbon footprint on a sample card

Sample cards show a **Carbon footprint** in tCO2e and how much of the cost it **Covers**. It is the upfront embodied carbon (A1-A5) of the bill: the materials, their transport to site and site waste. It is worked out from your own Rate Gen rates, the same way as the ICMS 3 export, so two accounts can see slightly different figures. If you have no Rate Gen library of your own, ADLM's rates for your state are used.

On the duplex samples the footprint usually covers 90 to 98% of the cost. The PC and provisional sums, and services items with no carbon factor, make up most of the rest. See Carbon in cost planning in the [QS handbook](/guides/qs-handbook) for what the figure means.

### Export a sample as an ICMS 3 report

Every sample can be exported as an ICMS 3 cost and carbon report:

1. Open the sample and click **Export**.
2. Under **ICMS 3**, click **ICMS 3 cost and carbon (Excel)** or **ICMS 3 cost and carbon (JSON)**.

The report sorts the bill's cost and upfront carbon into the 13 ICMS 3 Groups and adds up to the contract sum. A sample states no floor area, base date or location, so those details show as **Assumed** and the per-m² columns are blank. The [QS handbook](/guides/qs-handbook) explains ICMS 3 and works through the raft duplex.

## How samples relate to your own projects

A sample is laid out exactly like one of your own projects. The same views, the same columns, the same tiles. The difference is that a sample has already been through the whole job.

| Stage of a job | Your new project | A sample |
|---|---|---|
| Takeoff | Lines arrive from the plugin | Done |
| Priced | You price the bill, or let the budget build the rates | Done: every line priced from a material and labour build-up |
| Contract locked | You lock the contract sum | Done: locked at the agreed sum |
| Valuations | You record progress and issue certificates | One to four certificates already issued |
| Final account | You agree the final account | Done on the pile duplex, its MEP services and the laterite road |

To start a project of your own:

1. Open your model or drawings in the desktop product.
2. Measure with the plugin.
3. Save to ADLM Cloud. The project appears on the same page as the samples, below the **Learning samples** strip.

The product guides explain each step: [QUIV](/guides/quiv), [HERON](/guides/heron), [SERVIQ for Revit MEP](/guides/mep), and the cloud workspace in [ADLM Cloud](/guides/cloud).

## The four duplexes

QUIV, HERON and QUIV for ArchiCAD all use the same four duplex designs, one for each common foundation type. SERVIQ uses the services for the same four buildings. Learning one duplex once helps you read it in every product.

| Duplex | Client | Site | Ground | Stage reached |
|---|---|---|---|---|
| 4-Bedroom Duplex - Strip Foundation | Mr & Mrs Adebayo Ogunleye | Oluyole Estate, Ibadan | Firm lateritic clay, 150 kN/m2 | Interim Certificate 1 issued: substructure complete, ground floor frame under way |
| 4-Bedroom Duplex with Family Lounge - Pad & Strip Foundation | Engr. Chidi Nwosu | Lokogoma District, Abuja | Stiff sandy clay over weathered rock, 200 kN/m2 | Interim Certificate 2 issued: first floor slab cast, first floor walls rising |
| 5-Bedroom Duplex - Raft Foundation | Mrs Funmilayo Bakare | Lekki Phase 1, Lagos | Soft silty clay, 60 kN/m2, water table 1.8 m | Interim Certificate 3 issued: roofed, doors and windows going in, finishes started |
| 4-Bedroom Terrace Duplex - Bored Pile Foundation | Harbourview Homes Ltd | Ikate, Lekki, Lagos | Loose reclaimed sand over peat to 9 m | Practical completion reached and final account agreed |

Every duplex job is priced the same way: bill rates come from a material and labour build-up with 10% overhead and 15% profit. The contract adds 7.5% preliminaries, 5% contingency and 7.5% VAT. Valuations hold 5% retention, add 7.5% VAT and deduct 2.5% withholding tax. Each duplex also carries the same three PC and provisional sums: electrical installation (₦4.5m), plumbing and water supply (₦3.8m), and external works, soakaway and septic tank (₦2.6m).

The programme on the **PM Dashboard** follows seven phases: Substructure; Ground floor frame and blockwork; First floor slab, beams and staircase; First floor frame, blockwork and roof beam; Roof carpentry and covering; Doors and windows; and Finishes. Each phase is broken down into the trades a planner would draw, such as formwork, reinforcement and the concrete pour, rather than one long bar.

## QUIV samples (Revit)

QUIV samples are measured from their own 3D Revit models. Each has an **Architectural** and a **Structural** model attached, and every bill line remembers the elements it was measured from. The strip reads "Worked duplex projects, one per foundation type, each measured from its own 3D model."

The bill uses QUIV's own descriptions, for example "Foundations – Excavation (trench)", grouped into the work sections Earthworks, Concrete Works, Formwork, Reinforcement, Masonry, Damp-proofing, Carpentry & Roofing, Joinery, the three finishes sections (wall, floor and ceiling) and Decoration.

### Strip foundation

- **Name on the card:** 4-Bedroom Duplex - Strip Foundation. Flag: **Strip foundation**.
- **The job:** a two-storey, four-bedroom duplex in Ibadan on firm clay.
- **What is in it:** 65 bill lines (12 concrete, 11 reinforcement, 9 formwork, 7 earthworks and the rest across masonry, roofing, joinery and finishes), 222 budget lines, a contract sum of about ₦127.6m, one approved certificate (about 19% of the contract valued), and two variations: AI-01 deepens the strip footing at the rear wall after a soft spot was found, and AI-02 adds a concrete apron round the building.
- **What it teaches:** the start of a job. Substructure is complete, the ground floor frame is under way, and only one certificate has been issued, so you can see what a first valuation looks like and how a variation found during excavation is priced at the bill rate.

### Pad and strip foundation

- **Name on the card:** 4-Bedroom Duplex with Family Lounge - Pad & Strip Foundation. Flag: **Pad and strip foundation**.
- **The job:** a larger four-bedroom duplex with a family lounge in Abuja, with pad bases under the columns and strips under the walls.
- **What is in it:** 67 bill lines (including separate excavation to trenches and to pits), 228 budget lines, a contract sum of about ₦157.4m, two certificates (the first paid, the second approved, about 42% valued), and two variations: a cantilever balcony to the master bedroom, and burglary-proof laminated glass to the ground floor windows.
- **What it teaches:** how one certificate follows another. Look at **Less previous payments** on certificate 2. The risk register also shows a risk that has been closed (weathered rock met at 1.2 m).

### Raft foundation

- **Name on the card:** 5-Bedroom Duplex - Raft Foundation. Flag: **Raft foundation**.
- **The job:** a five-bedroom duplex in Lekki Phase 1 on soft clay with a high water table, so it sits on a raft.
- **What is in it:** 64 bill lines (including excavation to reduce levels for the raft and disposal of surplus material), 221 budget lines, a contract sum of about ₦209.0m, three certificates (two paid, one approved, about 68% valued), and three variations: dewatering during the raft excavation, porcelain floor tiles to the living room, and extra rainwater goods to the rear. The electrical PC sum has been executed.
- **What it teaches:** a job well into finishes. The budget shows materials for later phases being bought ahead of time, and the issue log has three issues at different stages (resolved, in progress and open).

### Bored pile foundation

- **Name on the card:** 4-Bedroom Terrace Duplex - Bored Pile Foundation. Flag: **Pile foundation**.
- **The job:** a terrace duplex in Ikate, Lekki, on reclaimed sand over peat, carried on bored piles.
- **What is in it:** 72 bill lines (the most of the four, because piling adds concrete, reinforcement and formwork lines), 246 budget lines, a contract sum of about ₦146.6m, four certificates (all paid, about 90% valued), and three variations: pile integrity testing, extending the piles on grid A by 2 m after deeper peat was found, and a granite kitchen worktop. All three PC and provisional sums are executed.
- **What it teaches:** the end of a job. The last certificate releases half the retention at practical completion, and the **Final account** is agreed, with a final contract value of about ₦132.4m, roughly ₦14.2m under the contract sum.

## HERON samples (PlanSwift)

HERON samples are the same four duplexes, measured from PDF drawings in PlanSwift instead of from a model. The strip reads "Worked duplex projects, one per foundation type, measured from PDF drawings."

| Name on the card | Flag | Bill lines | Budget lines | Contract | Certificates | Final account |
|---|---|---|---|---|---|---|
| 4-Bedroom Duplex - Strip Foundation | **Strip foundation** | 65 | 222 | about ₦127.6m | 1 | No |
| 4-Bedroom Duplex with Family Lounge - Pad & Strip Foundation | **Pad and strip foundation** | 67 | 228 | about ₦157.4m | 2 | No |
| 5-Bedroom Duplex - Raft Foundation | **Raft foundation** | 64 | 221 | about ₦209.0m | 3 | No |
| 4-Bedroom Terrace Duplex - Bored Pile Foundation | **Pile foundation** | 72 | 246 | about ₦146.6m | 4 | Yes |

The quantities, rates, certificates, variations, risks and issues match the QUIV sample of the same duplex. What differs is how the bill reads:

- **Descriptions are written out in full**, the way a QS writes them from drawings. "Foundations – Excavation (trench)" in QUIV becomes "Excavate trenches for foundations, not exceeding 2.00m deep" in HERON.
- **Lines are grouped by takeoff folder**: Substructure, Frame, Blockwork, Roofing, Doors & Windows and Finishes.
- **There is no 3D model**, so the **3D Model** view does not appear.

**What they teach:** that a drawing-based takeoff ends up in exactly the same commercial workflow as a model-based one. Open the HERON and QUIV samples of the same duplex side by side and compare the bill descriptions against the identical totals.

## SERVIQ samples (Revit MEP)

SERVIQ samples are the building services for the same four duplexes: electrical, plumbing and drainage, and air conditioning. Each has an MEP model attached, so you can pick a bill line and see the fittings and pipe runs it was measured from. On the website the product appears as **Revit MEP**. The strip reads "Services for the worked duplexes: electrical, plumbing and drainage, and air conditioning."

Every MEP sample has 45 bill lines in three sections (17 Electrical Installations, 24 Plumbing & Drainage and 4 HVAC) and 110 budget lines. The PC and provisional sums are a utility meter and service connection (₦0.85m), a borehole and submersible pump (₦2.4m) and a solar inverter with battery backup (₦4.2m). The programme has six phases: electrical first fix, plumbing and drainage rough-in, electrical second fix, sanitary fittings and pumping, air conditioning and ventilation, and testing and commissioning.

### Strip duplex services

- **Name on the card:** 4-Bedroom Duplex - Strip Foundation - MEP Services. Flag: **Strip duplex**.
- **What is in it:** 36 light points, 36 sockets, 7 split units and 16 sanitary fittings. Contract about ₦29.7m, one approved certificate (about 6% valued), one variation (an outdoor socket and garden light circuit).
- **What it teaches:** services at their earliest stage, with conduits cast into the first floor slab and plumbing sleeves in. A first certificate on a services contract is small; this one shows why.

### Pad and strip duplex services

- **Name on the card:** 4-Bedroom Duplex with Family Lounge - Pad & Strip Foundation - MEP Services. Flag: **Pad and strip duplex**.
- **What is in it:** 40 light points, 42 sockets, 9 split units and 22 sanitary fittings. Contract about ₦34.9m, two certificates (about 21% valued), two variations (a rain shower upgrade and CCTV conduit for six cameras).
- **What it teaches:** first fix complete and pipework pressure-tested. The issue log records a leak found during the pressure test and resolved.

### Raft duplex services

- **Name on the card:** 5-Bedroom Duplex - Raft Foundation - MEP Services. Flag: **Raft duplex**.
- **What is in it:** 48 light points, 52 sockets, 9 split units and 22 sanitary fittings. Contract about ₦35.9m, three certificates (about 55% valued), two variations (lifting the pump chamber above flood level and an extra split unit). The utility connection sum is executed.
- **What it teaches:** second fix and sanitary fittings going in, and how site conditions (a high water table) turn into a services variation.

### Pile duplex services

- **Name on the card:** 4-Bedroom Terrace Duplex - Bored Pile Foundation - MEP Services. Flag: **Pile duplex**.
- **What is in it:** 28 light points, 32 sockets, 7 split units and 10 sanitary fittings. Contract about ₦26.5m, four paid certificates (about 90% valued), two variations (relocated inspection chambers and surge protection). All three sums are executed.
- **What it teaches:** services complete, commissioned and the final account agreed, at about ₦23.8m, roughly ₦2.7m under the contract sum.

## Early-access products: CIVIQ and QUIV for ArchiCAD

CIVIQ and QUIV for ArchiCAD are not on general sale yet. Their samples appear only for accounts that have early access to those products. If you do not have early access, you will not see these samples, and nothing is wrong with your account.

### CIVIQ samples (Civil 3D)

CIVIQ samples are four road jobs, one for each common pavement type. Each carries a corridor model: pavement layers, kerbs, drains and culverts between 20 m stations, which you can open in **3D Model**. Lines are measured per chainage band, the way CIVIQ extracts them. They appear on **CIVIQ projects** (`/projects/civil3d`). The strip reads "Worked road and drainage jobs, measured chainage by chainage from the corridor."

The bill has two sections, Earthworks and External Works. The PC and provisional sums are relocation of existing services (₦3.5m), street lighting (₦6.0m) and materials testing for CBR, compaction and cores (₦1.2m). The programme has six phases: site clearance and topsoil strip; earthworks; drainage and culverts; sub-base and base course; surfacing; and kerbs, markings and road furniture. Variations on road jobs are site instructions (SI-01, SI-02).

| Name on the card | Flag | Site and client | Road | Bill lines | Budget lines | Contract | Certificates | Stage |
|---|---|---|---|---|---|---|---|---|
| Estate Access Road - Asphalt Pavement | **Flexible pavement (asphalt)** | Akobo, Ibadan, for Greenfield Court Residents Association | 480 m long, 7.3 m carriageway, 322 m3 cut, 317 m3 fill | 39 | 116 | about ₦352.2m | 2 (about 45% valued) | Drains and culvert in, sub-base being laid |
| Industrial Estate Road - Rigid Concrete Pavement | **Rigid pavement (concrete)** | Agbara Industrial Estate, Ogun, for Agbara Logistics Park Ltd | 360 m long, 7.3 m carriageway, 218 m3 cut, 327 m3 fill | 49 | 168 | about ₦315.2m | 1 (about 10% valued) | Earthworks and drainage under way |
| Housing Estate Street - Interlocking Paving Stones | **Interlocking paving** | Gwarinpa, Abuja, for Cedar Grove Homes Ltd | 300 m long, 6 m carriageway, 178 m3 cut, 464 m3 fill | 30 | 100 | about ₦130.9m | 3 (about 78% valued) | Paving laid, kerbs and markings going in |
| Rural Feeder Road - Laterite with Culverts | **Laterite feeder road** | Ikire-Apomu, Osun, for Osun State Rural Access Agency | 1,200 m long, 6 m carriageway, 90 m3 cut, 1,927 m3 fill, two stream crossings | 20 | 48 | about ₦170.8m | 4 (all paid, about 90% valued) | Road handed over and final account agreed |

What each one teaches:

- **Asphalt road:** a big jump between certificates once drainage goes in. The variation SI-01 replaces soft material at Ch 0+300 with laterite, priced at the bill rate for filling.
- **Concrete road:** the most detailed bill of the four (49 lines), and an early job with one certificate. SI-01 thickens the slab at the loading bay, not yet executed.
- **Interlocking street:** a nearly finished job with both site instructions executed and the services relocation sum spent.
- **Laterite feeder road:** a long, mostly fill road with culverts. An extra culvert barrel was added after a flood survey, half the retention is released on the last certificate, and the final account closes at about ₦154.4m, roughly ₦16.4m under the contract sum.

### QUIV for ArchiCAD samples

ArchiCAD samples are the same four duplexes, measured from the ArchiCAD model and costed as an ArchiCAD bill. They appear on the **QUIV for ArchiCAD** page (`/archicad`). The strip reads "Worked duplex projects, one per foundation type, measured from the ArchiCAD model."

Clicking a card opens the sample's ArchiCAD bill page, with the same orange **Sample project · Read-only learning material** banner. The bill is grouped into the ArchiCAD work sections: Substructure, Frame, Upper Floors, External Walls, Internal Walls, Roof, Windows & External Doors and Internal Doors. Each line keeps the elements it came from, and the costed bill is saved as a BoQ version. **Dashboard** opens the cost breakdown with **Cost by category** and the **Budget tracker**.

| Name on the card | Flag | Bill lines | Bill total | Contract | Certificates |
|---|---|---|---|---|---|
| 4-Bedroom Duplex - Strip Foundation | **Strip foundation** | 55 | about ₦70.3m | about ₦98.5m | 1 |
| 4-Bedroom Duplex with Family Lounge - Pad & Strip Foundation | **Pad and strip foundation** | 57 | about ₦88.4m | about ₦120.5m | 2 |
| 5-Bedroom Duplex - Raft Foundation | **Raft foundation** | 54 | about ₦126.9m | about ₦167.2m | 3 |
| 4-Bedroom Terrace Duplex - Bored Pile Foundation | **Pile foundation** | 62 | about ₦90.3m | about ₦122.8m | 4 |

ArchiCAD bills have fewer lines than QUIV for the same building, because they cover the model's structure, walls, roof and openings rather than every finish. The clients, sites, variations, risks and issues match the duplex of the same name.

**What they teach:** how an ArchiCAD model becomes a costed, sectioned bill, and how the cost of each work section compares. Substructure is the biggest section on the raft and pile duplexes, which is exactly what you would expect on poor ground.

## Exercises

These six exercises take ten to fifteen minutes each. Any product's samples work, but the steps below use the QUIV samples. On HERON the steps are the same without the 3D model.

### Exercise 1: Open a sample

1. Go to **QUIV projects** (`/projects/revit`).
2. In the **Learning samples** strip, click **5-Bedroom Duplex - Raft Foundation**.
3. Read the orange banner. Note the stage: "Interim Certificate 3 issued".
4. Click **What to look at in this sample** and read the list.
5. Under **Views**, click each view in turn, from **Dashboard** to **PM Dashboard**.
6. Click **Projects** to go back to the list.

### Exercise 2: Read the bill

1. Open **4-Bedroom Duplex - Strip Foundation**.
2. Click **Bill of Quantity**.
3. Find the first lines under Earthworks, for example "Foundations – Excavation (trench)". Note the quantity in m3 and the rate.
4. Scroll through the work sections and note which section carries the most money.
5. Click **3D Model**, then pick a bill line to see the elements it was measured from.
6. Now open the HERON sample of the same duplex and find the same excavation line. It reads "Excavate trenches for foundations, not exceeding 2.00m deep", with the same quantity and rate.

> **Tip:** This is the best way to see that QUIV and HERON produce the same bill. Only the descriptions and grouping differ.

### Exercise 3: Compare the budget

1. Open **4-Bedroom Duplex with Family Lounge - Pad & Strip Foundation**.
2. Click **Budget**.
3. Pick one bill item and read the rows under it: the **Material**, **Labour** and **Plant** lines that make up its rate. Check that **Bill Rate = Material + Labour + O&P** (10% overhead and 15% profit).
4. Look at which rows are ticked as procured and which are only part bought. Materials for phases already started are bought; later phases are not.
5. Switch to **Buy schedule** and read **Should already be bought** and **Buy this week**.

### Exercise 4: Follow the valuation

1. Open **4-Bedroom Terrace Duplex - Bored Pile Foundation**.
2. Click **Valuation**.
3. Under **Contract administration**, open **Certificates**. There are four, all paid.
4. For each certificate, read the value this period, the retention held, VAT added and withholding tax deducted.
5. On certificate 4, find the retention released: half the retention comes back at practical completion.
6. Open **Variations** and read AI-01 to AI-03. Note that AI-02 (extending the piles) is priced at the bill rate for piling.
7. Open **Final account** and compare the final contract value with the contract sum.

### Exercise 5: See the PM dashboard

1. Open **5-Bedroom Duplex - Raft Foundation**.
2. Click **PM Dashboard**.
3. Read the tiles: **Progress**, **Budget Used**, **Overdue**, **CPI**, **SPI** and **Tasks Done**.
4. Read the **Earned Value Summary**. A CPI or SPI below 1 means over budget or behind programme.
5. Click **View Details** and open **WBS / Tasks**. See how the Substructure phase is split into trades.
6. Open **Risk Register** and **Issue Log**. Find the risk about the high water table (closed) and the issue about window frames out of square (in progress).

### Exercise 6: Export a sample as an ICMS 3 cost and carbon report

1. Open **5-Bedroom Duplex - Raft Foundation**.
2. Click **Export**, and under **ICMS 3** click **ICMS 3 cost and carbon (Excel)**.
3. Open the workbook. On **ICMS 3 report**, see which details are **Stated** and which are **Assumed**, and read the carbon coverage.
4. Open **Cost by Group (G-2)**. Check that the total is the contract sum, about ₦209.0m. Substructure (2.02) is about a quarter of it, because the raft sits on soft clay.
5. Find preliminaries in 2.08, contingency in 2.09 and VAT in 2.10.
6. Open **Carbon by Group (H-1, H-2)**. Note which Group carries the most carbon, and that 2.10 reads **Not used**.
7. Open **Lines** and find the roof beam lines. Read **Placed by** and **Why**, and decide whether you agree with the Group they were given.

## What's new in 2026.10

- **September 2026:** sample projects arrived for QUIV and HERON, four duplexes each.
- **Late September 2026:** samples added for Revit MEP, CIVIQ and QUIV for ArchiCAD, and the **Learning samples** strip added to each tool's page under **My tools**.
- **End of September 2026:** the sample programmes now show each phase broken into trades (formwork, reinforcement, pours and so on), the way a real programme of works is drawn, instead of one bar per phase.
- **October 2026:** **Price with my RateGen rates** on an open sample, a **Carbon footprint** on each sample card, and the **ICMS 3** cost and carbon export on every sample. Exports from samples now open reliably.

## Troubleshooting

### I cannot see the Learning samples strip

- **Check your licence.** Samples only appear for a product you hold an active licence for. Open **Products** at [/manage](/manage) and check the product is active and not expired.
- **Check you are on the right page.** The strip is on a product's project list (for example `/projects/revit`), on the tool's page under **My tools**, and on `/archicad` for ArchiCAD. It is not on the **Projects** gallery (`/work/projects`) or the **Overview**.
- **Check whether you hid it.** If you see a button reading **Show 4 samples**, click it.
- **CIVIQ and ArchiCAD:** these samples appear only with early access to those products.
- If none of these apply, click **Refresh projects** or reload the page.

### I changed a rate in a sample and it will not save

That is expected. Samples are read-only. The message "Sample projects are read-only learning material." means the server refused the change. Try the same thing on one of your own projects.

### I want to use a sample as a starting point for my job

You cannot copy a sample. Download its workbooks from **Export** if you want a reference, then measure your own job in the plugin and save it to ADLM Cloud.

### The sample has no 3D Model view

HERON samples are measured from PDF drawings and have no model. QUIV, Revit MEP and CIVIQ samples do. ArchiCAD samples open on the ArchiCAD bill page instead of the project screen.

### There is no carbon footprint on a sample card

The card shows a footprint only when your Rate Gen rates give the bill a carbon figure. Check the state on your profile, then reload the page. The figure is refreshed every few minutes, so a change to your rates can take a short while to show.

### I cannot find a sample from inside the plugin

Samples are kept out of the desktop plugins on purpose, so nobody can save over them. Open them on the website.

## Frequently asked questions

**Do samples count towards my cloud storage?**
No. Your project slots count only the projects you own.

**Do samples show up in my totals on the Overview page?**
No. The **Overview** and the **Projects** gallery count only your own projects and projects shared with you.

**Can my colleagues see the same samples?**
Yes. Every customer with the product sees the same samples. Because nobody can change them, what you see is what they see.

**Can I see the rates without Rate Gen?**
Yes. Samples show every rate and money total to everyone. On your own projects and shared projects, the normal Rate Gen rules apply. See [ADLM Rate Gen](/guides/rategen).

**Can I download a sample?**
Yes. The Excel workbooks and reports work on samples just as they do on your projects, including the ICMS 3 cost and carbon report.

**Does Price with my RateGen rates change the sample?**
No. It shows your prices beside the bill's own and saves nothing. The sample is the same for everyone afterwards.


**Are the clients and sites real?**
No. The names, sites and suppliers are made up. The quantities are measured from real models of the four duplexes and four roads, and the money is worked out the same way the website works out your own jobs.

**Why are the QUIV and HERON figures identical?**
They are the same buildings measured two ways. That is the point: a drawing takeoff in HERON and a model takeoff in QUIV lead to the same bill, budget and valuations.

**Why do the ArchiCAD figures differ from QUIV?**
The ArchiCAD bill covers what the ArchiCAD model holds (structure, walls, roof and openings) and is grouped into ArchiCAD's work sections, so it has fewer lines and a lower total.

**Will the samples change?**
ADLM Studio may refresh a sample to show a new feature. It is replaced as a whole and keeps the same name and link.

**I need help.**
Contact us through [/support](/support).
