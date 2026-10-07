---
id: cloud-bill-budget
title: ADLM Cloud: the bill and the budget
tagline: Read and price the bill, pick Rate Gen rates, see the budget and buy schedule, and export your bills and reports.
version: "2026.10"
updated: 2026-10-07
platform: Web, any browser (adlmstudio.net)
productKeys: []
pdf: ADLM-Cloud-Bill-and-Budget-Guide.pdf
order: 10.2
---

This is one part of the [ADLM Cloud guide](/guides/cloud). It covers a project's **Bill** and **Rates & budget** tabs, picking Rate Gen rates, your constants, and every export, including the ICMS 3 cost and carbon report. It was last checked against the site on 7 October 2026.

## What's new in 2026.10

- **Projects open on the new project page.** The bill is now the **Bill** tab, and pricing, the budget and the buy schedule are on the **Rates & budget** tab. The older screen is still there: **More actions** > **Open the classic workspace**.
- **Export from the project page.** The **Export** button beside **Jump to project** gets your Excel bills and PDF reports out of the new page.
- **Rates are built in ADLM Rate Gen only.** On the website you pick a Rate Gen rate onto a bill line, or type a price on a bill line in the classic workspace. You cannot build, edit or delete a rate on the website, or change library prices. Do that in the Rate Gen desktop app; see [ADLM Rate Gen](/guides/rategen).
- **ICMS 3 cost and carbon export**, in Excel and as JSON data. See [The ICMS 3 cost and carbon report](#the-icms-3-cost-and-carbon-report).
- **QUIV budgets are priced on save.** QUIV 4 sends its material and labour schedule as quantities. If your account has Rate Gen, the cloud adds the prices when the project is saved.
- **Constants agree across products.** Pipe stock length 6 m, POP board 1.44 m², emulsion paint 0.026 drum per m², blockwork waste 1.03, tile waste 1.10 and rebar weight d²/162.

## Before you start

- Open the project: see [Projects and your workspace](/guides/cloud-projects).
- To pick rates you need an active **Rate Gen** licence and a Rate Gen library. Your library is priced for the **Zone** shown at the top of **Your work**.
- To change anything you must own the project or have **Full access**, and the contract must not be locked for the change you want to make.

## The Bill tab

Click **Bill** on the project page. The tab shows how many lines the bill has.

![The project Bill, grouped by section, with filters for unpriced items and items changed in the model.](shot:cloud-project-bill.png)

The bill lists every measured line with its reference, description, quantity, unit, rate and amount, grouped into sections. Each section shows how many items it has and what it is worth.

Along the top of the bill:

- **Filters**: **All**, **Unpriced**, **Changed in model** and **In progress**. Each shows how many lines it holds.
- **Group by**: **By element** (Substructure, Frame, Walls and so on) or **By trade**.
- **Collapse all** or **Expand all**: fold or open every section.
- **Search the bill**: type in **Search descriptions and elements** to find a line.
- **Show actuals** or **Hide actuals**: show what was measured on site beside what the contract says. Actuals count once the contract is locked.

Lines marked **Needs rate** have no rate yet, so they are not counted in the estimated total. Lines marked **Model changed** have a different quantity in the latest model save.

### Sections

If you can edit the project:

- Click **Add a section** and name it to add your own section.
- Drag a section by its handle to move it.
- Click **Suggest an arrangement** to put the sections back in the order the bill normally files them.
- To move a line to another section, open the line and change its section.

### The summary

The **Summary** at the foot of the bill adds up the measured work, provisional sums, PC sums and approved variations to the **Estimated total**. **See variations** opens the variations list.

> **Note:** The preliminaries, contingency and VAT percentages and the sums are edited in the classic workspace for now. See [In the classic workspace](#in-the-classic-workspace).

### Opening a line

Click any line to open its panel on the right. It shows where its quantity came from, its rate and its progress.

- **Element**: what the line was measured from. If the model has changed, the panel says **The model changed** and gives the latest quantity.
- **Rate**: the rate on the line, and where to find a better one (see below).
- **Progress**: **Set progress** records how much is done. It feeds the next valuation and the PM dashboard. Progress counts once the contract is locked.
- **Actual quantity**: after the lock, record what was measured on site.

Use **Previous line** and **Next line** to step through the bill without closing the panel.

## Pricing with Rate Gen rates

Rates come from your Rate Gen library: the ADLM master rates for your zone, plus the prices and rates you set in the Rate Gen desktop app. On the website you choose which rate goes on a line. You do not build rates here.

### Price one line

1. Open the line from the **Bill** tab.
2. Under **Price it from your own rates**, look at the rates offered. Each shows its price per unit and its description.
3. Click the rate you want. It sets this line's rate.
4. If none is right, type under **Or find a rate by name** (**Search your rates in m²**, or whatever the line's unit is) and click a rate from the results.

If the rate you pick is in a different unit from the line, **Convert the rate** asks for the size that links them, for example **Depth (mm)**, **Thickness (mm)**, **Width (mm)** or **Weight (kg per metre)**. Fill it in and click **Apply**, or click **Cancel**.

If nothing in your library fits, the panel says so: "Nothing in your rate library matches this line". Build the rate in Rate Gen and it will be offered here after the next sync.

### Price the same item on other lines

When the same item appears on other lines with no rate, the panel lists them under **Also price the same item on** (**Same item, no rate yet**). They are ticked. "Picking a rate below prices this line and every ticked one. Untick any that should differ."

1. Untick any line that should not take this rate.
2. Pick the rate. The button reads **Price N similar lines at this rate**.
3. Read the note that follows: it says how many lines were priced and why any were skipped.

### The Rates view

Click **Rates & budget** on the project page. It opens on **Rates**, with **Budget** and **Buy schedule** beside it. The tab reads **Priced with RateGen**, and **Open in RateGen** opens your library.

- **Needs a rate** lists every unpriced line. Where your library has a rate for the same work in the same unit, it is suggested with its price and the reason. Click **Use this rate** to apply it, or **Open the line** to choose another.
- Where there is no suggestion, the line says so. Open the line and search your rates by name.
- **Priced** lists every priced line with its source, and the **Estimated total**. A line marked **Rate released** or **Differs from build-up** has a rate that no longer matches its budget build-up.

When you pick a Rate Gen rate, ADLM prices that line's material, labour and plant in the budget at the same time, so the bill and the budget agree. If the rate has no build-up, the rate still goes on the line and a message tells you why the budget could not be priced.

On a project shared with you where the owner's rates are hidden, the tab says "Rates are not shown on this project" and offers no suggestions.

## The budget

Click **Rates & budget**, then **Budget**. The budget is what the job costs you, beside what it is billed at. It comes from the Material & Labour schedule sent by QUIV or HERON.

- **Materials**, **Labour** and **Plant** each list their rows with **Quantity**, rate and **Amount**. Plant includes hire and running.
- **What this adds up to** shows the **Total cost**: cost, not price, before overheads and profit.
- If you can edit the project, tick a material row to mark it **Procured** ("Tick what has been bought").

If no row has a cost rate yet, a note says every figure is a quantity rather than money. Price the bill and the budget follows. A project with no schedule says **No budget yet**; click **Back to the bill**.

> **Note:** Typing a cost rate on a budget row, and setting overhead and profit, are done in the classic workspace's **Budget** view for now.

### QUIV budgets priced for you

QUIV 4 measures the material and labour schedule from your Revit model and sends it as quantities, with no prices. When the project is saved and your account has Rate Gen, the cloud prices it:

- A material row with no price gets one from your Rate Gen library, or the ADLM master list where your library has none.
- A labour row with no price gets one from your **Labour Rates** constants, on its bill line's own quantity and unit.
- A bill line priced this way with no overhead or profit gets your **Markup** constants (10% overhead and 25% profit unless you change them), so its bill rate is a selling rate.

A row that already has a price, typed on the website or kept from an earlier save, is never changed. Without Rate Gen, the budget stays as quantities only. This applies to QUIV projects; HERON budgets are unchanged.

### Buy schedule

Click **Rates & budget**, then **Buy schedule**, to see what to buy and when:

- **Should already be bought**: late purchases, with their value.
- **Buy this week**: what is due now.
- **Not yet scheduled**: materials whose lines are in no task yet.
- **Lead time**: how many days before work starts each material should be bought (14 days unless you change it). If you can edit the project, type a new number.

Each material shows its **Buy by** date. The buy schedule takes its dates from the tasks on the **PM dashboard**, so plan the programme first. "Nothing to buy yet" means the project has no budget; click **Open the budget**.

## Your rate library on the web

Click **RateGen** under **My tools** to see your library (`/work/library`): "One library for the practice."

The tabs are **Item of works**, **Materials**, **Labour** and **Plant**.

1. Type in the search box: a rate, a material, a gang or a description.
2. Narrow with **Trade** or **Category**, and choose **Sort by**: **Recently changed**, **Name, A to Z**, **Price, low to high** or **Price, high to low**.
3. On a rate, click **Open the build-up** to see what it is made of.

![A rate build-up showing the materials, labour and plant behind one rate.](shot:cloud-rate-build-up.png)

A rate's page shows **What this rate is**, **The build-up** (each component with its quantity, unit price and amount, then net cost, overhead, profit and the rate) and where it is used. **← RateGen** returns to the library. **Full library** at the top opens the older library page.

> **Important:** The page reads "Build and edit rates in ADLM Rate Gen". The library on the website is for viewing. New rates, changes to a rate, and material or labour prices are made in Rate Gen on your computer, and appear here after its next sync.

## Material and Services Constants

### Material Constants

**Material Constants** are the factors behind every material and labour schedule, such as how many bags of cement go into a cubic metre of concrete or how many blocks into a square metre. They are the same constants QUIV and HERON use on the desktop. Open them from **Constants** under **My tools** (`/work/constants`).

1. Find a constant with **Search constants…**, or open a group: **Waste Factors**, **Concrete**, **Blinding**, **Blockwork**, **Formwork**, **Reinforcement**, **Structural Steel**, **Coverage**, **Finishes**, **Ceiling & Roof**, **Filling**, **Measurement**, **Labour Rates**, **Lumpsum Items**, **MEP – Cost Split**, **Plant** and **Markup**.
2. Change its **Value**. The **ADLM default** column shows the starting figure.
3. Click **Save changes**. **Reset** on a row, or **Reset all to defaults**, puts the ADLM figures back.

New schedules use your constants straight away. An existing project keeps its figures until its schedule is rebuilt.

**Constants that now agree across ADLM products** (October 2026):

| Constant | ADLM default | Which means |
|---|---|---|
| **Pipe stock length** | 6 m/length | One pipe length is 6 m |
| **POP ceiling board coverage** | 1.44 m²/board | One POP board covers 1.44 m² |
| **Emulsion paint (20L drum)** | 0.026 drums/m² | 0.52 litres per m² |
| **Blockwork waste factor** | 1.03 | 3% waste on blocks |
| **Tiles per area** | 1.1 m²/m² | 10% waste on tiles |
| **Rebar unit weight coefficient** | 0.00617 kg/m/mm² | Rebar weight per metre is d²/162 |

> **Note:** HERON keeps a 1.10 waste factor on rebar and formwork on purpose, so a HERON budget can show slightly more of both than a QUIV one for the same work.

### Services Constants

**Services Constants** (`/rategen/services-constants`) are your house standards for pricing MEP services: the standard length (**Std length**), how connectors are counted (**Per stick** or **Per joint (sticks − 1)**) and the **Fitting uplift %**. They feed **Price services** on Revit MEP projects.

1. Choose **Metric** or **Imperial**.
2. Edit the rows.
3. Click **Save constants**.

## In the classic workspace

Some bill and budget work is still done in the classic workspace. On the project page, click **More actions** > **Open the classic workspace**. There:

> **Important:** In the classic workspace, changes are not kept until you click **Save changes**.

### The bill ribbon

The classic **Bill of Quantity** has a ribbon of tools. Click **Hide tools** or **Show tools** to fold it.

| Tab | What is on it |
|---|---|
| **Home** | **Only fill empty rates**, **Show actual qty / rate**, and grouping **By element** or **By trade** |
| **Rates** | Rate Gen tools: **Auto-sync rates**, **Sync rates**, **Follow RateGen changes** and **Load RateGen rates** |
| **Navigate** | Jump to a category or trade, and **Top** / **Bottom** of the bill |
| **Contract** | **Lock contract** or **Unlock**, **Preliminaries %** and the contract sum |
| **Variations** | **Add variation**, **Go to list** and **Approve / reject** |
| **Provisional** | **Add PC sum**, **Add provisional sum** and **Go to Summary** |

### Type a price

You can put your own figure on a bill line by clicking its **Rate** cell:

- **Type a number** for the rate.
- **Type a formula** starting with `=`, for example `=1.2*1.5*95000`. Only numbers and `+ - * / ( ) %` are allowed. Press <kbd>Enter</kbd> or click away to apply it.

A price you type stays on this project's line only. It does not change your Rate Gen library. To let the budget set the rate again, clear the cell. The line then says the rate has been released and will be priced from the budget build-up when you save.

### Fill many lines at once

On the **Rates** tab of the ribbon:

1. Click **Load RateGen rates** so searches are fast.
2. Tick **Only fill empty rates** on the **Home** tab if you want lines you have already priced left alone.
3. Click **Sync rates** to fill rates from your library.

**Follow RateGen changes**: while this is on, a rate you change in your Rate Gen library (in the desktop app) is applied to this bill too. Turn it off before the bill goes out, so the prices stay as issued.

### Summary, preliminaries and sums

- The classic **Summary** box adds up measured work, **Preliminaries**, **PC sums**, **Provisional sums**, **Contingency**, **Approved variations** and **VAT** to an **Estimated total**. Contingency and VAT are percentages you can change there. When the priced bill goes out, click **Mark as tendered**. **Not tendered after all** reverses it.
- **Preliminaries %** on the **Contract** tab sets the preliminaries as a percentage of measured work plus the sums (typically 5 to 10%). Under the bill, the preliminary items checklist shares that pool: set each **Alloc %**, record **Actual ₦** and tick **Done**. **Even split** shares the pool equally.
- On the **Provisional** tab, **Add PC sum** adds a prime-cost sum and **Add provisional sum** adds an allowance for work not yet defined. Tick each one once executed, so it counts towards earned value.

### The budget editor

The classic **Budget** is the **Material & Labour breakdown** of every bill item. For each bill item: **Bill Rate = Material + Labour + O&P**.

1. Price a row by typing a rate, entering a `=` formula, or searching your Rate Gen library in the rate cell.
2. Set Overhead and Profit for the item, or use **Global Overhead & Profit** and click **Apply to all**.
3. Click **Save changes**. The new bill rate flows up to the bill.

Use **Mark all** or **Unmark all** to mark a whole bill item procured. Once the contract is locked, procurement marking is frozen.

## Exports and reports

### The Export menu

Click **Export** in the project header, beside **Jump to project**. The button reads **Exporting…** while the file is made, and **Downloaded** appears when it is saved.

| Group | Options |
|---|---|
| **Bill & budget, Excel** | **Bill & budget**: your bill with its own sections and totals, plus the material, labour and plant schedules. **Bill & budget by trade**: the same, sectioned by trade. |
| **Elemental BoQ, Excel** (by building element) | **Bungalow** or **Multi-storey** |
| **Trade BoQ, Excel** (by work section, NRM2-style) | **Bungalow** or **Multi-storey** |
| **Milestone BoQ, Excel** (one bill per stage) | **Bungalow** or **Multi-storey**: one priceable bill per construction stage, as the basis for a payment schedule |
| **Reports, PDF** | **Project report** and **Project management report** |

On a bill imported from Excel, the menu notes that the **Bill & budget** export keeps the bill's own sections and totals.

If the server refuses an export, for example because you can only view the project, or the export needs Rate Gen and you have none, a message says why.

> **Note:** The **Generic BoQ** exports (**Export generic BoQ (by category)** and **Export generic BoQ (by trade)**) and the **ICMS 3** exports are on the classic workspace's **Export** menu only. The project page's **Export** menu does not have them.

### The ICMS 3 cost and carbon report

ICMS 3 is the International Cost Management Standard. It lets a client compare your project's cost and carbon with other projects anywhere, because every line sits in the same standard Groups. ADLM builds the report from your bill.

The ICMS 3 exports are on the classic workspace's **Export** menu, in the **ICMS 3** group ("international cost and carbon report").

1. Open the project and click **More actions** > **Open the classic workspace**.
2. Click **Export**.
3. Under **ICMS 3**, click **ICMS 3 cost and carbon (Excel)**.
4. Open the downloaded file, named after the project with "_ICMS3" on the end.

The workbook has five sheets:

| Sheet | What it shows |
|---|---|
| **ICMS 3 report** | The project details, each marked **Stated** or **Assumed**, the carbon method, how much of the cost has a carbon figure behind it, and how much is placed in an ICMS Group |
| **Cost by Group (G-2)** | Cost by ICMS 3 Group with the share of the total, and cost per m² when a floor area is known |
| **Carbon by Group (H-1, H-2)** | Upfront carbon (A1-A5) by Group in tCO2e, with a low-end figure, and kgCO2e per m² when a floor area is known |
| **Lines** | Every bill line with its ICMS code, Sub-Group, quantity, rate, cost, kgCO2e, where its carbon came from, anything assumed, and why it was placed where it is |
| **Not placed** | Lines not yet placed in an ICMS Group, largest first, with the reason |

How the figures are worked out:

- **The report total equals your contract total.** Preliminaries go in Group 08, contingency in 09.020 and VAT in 10.020, so nothing in the bill is left out.
- **Carbon per line comes from your Rate Gen rates.** Every built-up rate in Rate Gen carries a carbon figure (kgCO2e). Where a line has no matching rate, its carbon is worked out from the work it measures, and the **Lines** sheet says what was assumed.
- **Cost and carbon per m²** appear only when the project has an IPMS 1 (gross external) or IPMS 2 (gross internal) floor area recorded. ADLM Cloud has no screen to record a floor area yet, so for now these figures are left out and you divide by the floor area yourself.
- Details the bill does not carry, such as the country (Nigeria), currency (NGN) and base date (the day you export), are filled in and marked **Assumed** on the first sheet.

**ICMS 3 cost and carbon (JSON)** gives the same report as data, with full ICMS 3 codes. It conforms to the RICS Data Standard 3.3.3, so a client's cost database can read it directly.

> **Tip:** The ICMS 3 export works on learning samples too. Export one from a sample to see a finished report before you send your own.

> **Note:** The ICMS 3 report is not AI. Lines are placed by fixed rules, and carbon comes from your Rate Gen rates and published carbon factors.

### PDF reports

- **Project report**: the Project Progress Report for the project. On the project page it is in **Export** and in **More actions**.
- **Project management report**: schedule and earned value. On the project page it is in **Export** and in **More actions**, when the project has a PM dashboard.
- **Management report**: across all your projects, from the Portfolio Dashboard.

A report Ada opens for a date range adds a **This Period** page: work valued, certified, procured, actual against planned, and what happened on the programme in that window.

### Valuations and certificates

**Print valuation** and **Export Excel** in the daily valuation log, the certificate downloads in **Certificates**, and the final account **Download** are described in [Valuations and contract administration](/guides/cloud-valuation).

## AI in the bill and the budget

| Feature | Where | What it does | Availability |
|---|---|---|---|
| Ada prices your bill | **Ask Ada**: "Price my bill" | Proposes a rate for every unpriced line from your own Rate Gen library, unit as a hard rule, rates you chose before first. You tick lines on the **Proposed rates** card and press **Apply N rates** | On for everyone, on projects you can edit and whose rates you can see |
| **Check my rates against the market** | Classic workspace, **Work area** | Benchmarks priced lines against the Rate Gen library for your zone: above market, below market, in range or unit mismatch | On for everyone with an active licence |
| **Scan the bill for errors** | Classic workspace, **Work area** | Duplicates, wrong units, odd quantities, rate outliers | On for everyone with an active licence |
| **Build up a rate for the selected line** | Classic workspace, **Work area** | Suggests one line's breakdown into material, labour and plant, each part marked as looked up or estimated. Advice only | On for everyone with an active licence |

None of these changes a rate by itself, and none of them builds or saves a rate in your library. The rate suggestions on the **Rates & budget** tab are not AI: they match your own rates by description and unit. See [ADLM AI services](/guides/ai-services).

## Troubleshooting

### I cannot change rates or set progress

The contract may be locked, in which case changes go through variations. If the project is shared with you at **View only**, you cannot edit it at all and the project page shows **Shared with you.** Ask the owner for **Full access**.

### I cannot find a button to build or edit a rate

There is none on the website. Rates are built and edited only in the ADLM Rate Gen desktop app. On the website, pick a Rate Gen rate onto the line, or type a price on the bill line in the classic workspace.

### No rate is offered for my line

Your library has no rate for that work in the line's unit. Search by name under **Or find a rate by name**; a rate in another unit can be converted with **Convert the rate**. If nothing fits, build the rate in Rate Gen and sync.

### "Your rate library could not be read just now"

The library did not load, which is not the same as having no match. Refresh the page and try again.

### The budget says "No budget yet"

The project was saved without a material and labour schedule. Open it in the plugin and save it to the cloud again.

### Picking a rate did not price the budget

The rate has no build-up in Rate Gen, it is no longer in your library, the line has no quantity, or you only have view access. The message after you pick says which. The rate still goes on the line.

### My QUIV budget has quantities but no prices

Your account has no active Rate Gen licence, or the project was saved before your library had prices for those materials. Get Rate Gen and save from QUIV again, or price the rows in the classic budget editor.

### The export says it could not be made

Read the message: you may only have view access, or the export needs a Rate Gen licence. Ask the project owner, or check your products under **Products & seats**.

### The ICMS 3 report has no cost per m²

The project has no IPMS 1 or IPMS 2 floor area recorded, so per-m² figures are left out. ADLM Cloud has no screen to record a floor area yet, so divide the totals by the floor area yourself and say which area you used.

### Most of my bill is on the Not placed sheet

The descriptions did not match an ICMS 3 Group. Each line on that sheet says why. Clearer descriptions in the plugin give better placement on the next save.

## Frequently asked questions

### Does re-saving from the plugin overwrite my prices?

No. Each save is a new version. Rates, purchase marks, supplier details and notes you added on the website are kept, and prices already on budget rows are never replaced.

### Does a price I type on the bill change my Rate Gen library?

No. It stays on that project's line. Your library only changes in the Rate Gen desktop app.

### Why do I still need the classic workspace?

The new project page is taking over the classic one a step at a time. Typing prices, editing the budget, the summary percentages, the Generic BoQ and ICMS 3 exports are still done there.

### Where does the carbon in the ICMS 3 report come from?

From the carbon figure on each of your Rate Gen rates, which Rate Gen works out from published factors (ICE, CIBSE TM65, IStructE, manufacturer EPDs and others). The **Carbon from** column on the **Lines** sheet shows the source line by line.

### Where do I get help?

Ask Ada, chat with us on WhatsApp on +234 810 650 3524, or raise a ticket from **Support** in the menu.
