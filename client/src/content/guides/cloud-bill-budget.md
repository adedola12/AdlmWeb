---
id: cloud-bill-budget
title: ADLM Cloud: the bill and the budget
tagline: Price the Bill of Quantity, pick Rate Gen rates, plan materials and labour in the Budget, and export reports.
version: "2026.10"
updated: 2026-10-04
platform: Web, any browser (adlmstudio.net)
productKeys: []
pdf: ADLM-Cloud-Bill-and-Budget-Guide.pdf
order: 10.2
---

This is one part of the [ADLM Cloud guide](/guides/cloud). It covers pricing a project's Bill of Quantity, the Budget (material and labour), your constants, and every export, including the new ICMS 3 cost and carbon report. It describes the live site on 4 October 2026.

## What's new in 2026.10

- **Rates are built in ADLM Rate Gen only.** On the website you pick a Rate Gen rate onto a bill line or a Budget row, or type a price on a bill line. You cannot build, edit or delete a rate on the website, or change library prices. Do that in the Rate Gen desktop app; see [ADLM Rate Gen](/guides/rategen).
- **ICMS 3 cost and carbon export**, in Excel and as JSON data, on the **Export** menu. See [The ICMS 3 cost and carbon report](#the-icms-3-cost-and-carbon-report).
- **QUIV budgets are priced on save.** QUIV 4 sends its material and labour schedule as quantities. If your account has Rate Gen, the cloud adds the prices when the project is saved.
- **Constants agree across products.** Pipe stock length 6 m, POP board 1.44 m², emulsion paint 0.026 drum per m², blockwork waste 1.03, tile waste 1.10 and rebar weight d²/162.

## Before you start

- Open the project: see [Projects and your workspace](/guides/cloud-projects).
- To pick rates you need an active **Rate Gen** licence and a Rate Gen library. Your library uses the zone of the state you chose under **Pricing location (State)** on your Profile.
- To change anything you must own the project or have **Full access**, and the contract must not be locked for the change you want to make.

## The Bill of Quantity

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

## Pricing the bill with Rate Gen rates

Rates come from your Rate Gen library: the ADLM master rates for your zone, plus the prices and custom rates you set in the Rate Gen desktop app. On the website you choose which rate goes on a line. You do not build rates here.

### Pick a rate for one line

1. Click the line's **Rate** cell.
2. Type part of the rate's name, for example "blockwork 225". Your Rate Gen library is searched (this needs a Rate Gen licence).
3. Pick a rate from the list.

When you pick a Rate Gen rate on the bill, ADLM prices that line's material, labour and plant in the Budget at the same time. The budget build-up reproduces the rate you picked, so the bill and the budget agree. If the rate has no build-up, the rate still goes on the line and a message tells you why the budget could not be priced.

### Type a price instead

You can also put your own figure on a bill line:

- **Type a number** for the rate.
- **Type a formula** starting with `=`, for example `=1.2*1.5*95000`. Only numbers and `+ - * / ( ) %` are allowed. Press <kbd>Enter</kbd> or click away to apply it.

A price you type stays on this project's line only. It does not change your Rate Gen library.

Rates you type or pick stay fixed on the line. To let the budget set the rate again, clear the cell. The line then says the rate has been released and will be priced from the budget build-up when you save.

### Fill many lines at once

On the **Rates** tab:

1. Click **Load RateGen rates** so searches are fast.
2. Tick **Only fill empty rates** on the **Home** tab if you want lines you have already priced left alone.
3. Click **Sync rates** to fill rates from your library.

**Follow RateGen changes**: while this is on, a rate you change in your Rate Gen library (in the desktop app) is applied to this bill too. Turn it off before the bill goes out, so the prices stay as issued.

> **Tip:** To price many similar lines at once, link them. A line marked "Linked: rate changes propagate to similar items" passes its rate on to the others.

> **Tip:** Ada can propose rates for every unpriced line from your own library. See [AI in the bill and budget](#ai-in-the-bill-and-the-budget).

### Your rate library on the web

Click **RateGen** under **My tools** to see your Rate Gen library on the web (`/rategen`). Its tabs are **Master Materials**, **Master Labour**, **My Materials**, **My Labour**, **My Custom Rates** and **Effective Rates**. Use it to look up a price or a rate before you pick it on a bill.

> **Important:** The library on the website is for viewing. To build a new rate, change a build-up, change a material or labour price, or delete a rate, open the ADLM Rate Gen desktop app. Your changes reach the website when Rate Gen syncs.

## The Budget

The Budget is the **Material & Labour breakdown** of every bill item, laid out in the same order and sections as the bill. For each bill item:

**Bill Rate = Material + Labour + O&P**

Each row is a resource: **Material**, **Labour**, **Plant**, **Equipment** or **Consumable**.

1. Price a row by typing a rate, entering a `=` formula, or searching your Rate Gen library in the rate cell.
2. Set Overhead and Profit for the item, or use **Global Overhead & Profit** and click **Apply to all** to write the same figures onto every item.
3. Click **Save changes**. The new bill rate flows up to the Bill of Quantity.

### QUIV budgets priced for you

QUIV 4 measures the material and labour schedule from your Revit model and sends it as quantities, with no prices. When the project is saved and your account has Rate Gen, the cloud prices it:

- A material row with no price gets one from your Rate Gen library, or the ADLM master list where your library has none.
- A labour row with no price gets one from your **Labour Rates** constants, on its bill line's own quantity and unit.
- A bill line priced this way with no overhead or profit gets your **Markup** constants (10% overhead and 25% profit unless you change them), so its bill rate is a selling rate.

A row that already has a price, typed on the website or kept from an earlier save, is never changed. Without Rate Gen, the budget stays as quantities only. This applies to QUIV projects; HERON budgets are unchanged.

### Marking purchases

A bill item only counts as complete when every line under it is marked procured or done. Buying the materials is not enough until the labour is done too.

- Tick a line to mark it procured.
- Use **Mark all** for a whole bill item, or **Unmark all** to undo.

### Buy schedule

Switch from **Breakdown** to **Buy schedule** to see what to buy and when:

- **Should already be bought**: late purchases.
- **Buy this week**: what is due now.
- **Not yet scheduled**: materials for work with no dates yet.
- **Lead time**: how many days before work starts each material should be bought (14 days unless you change it).

The buy schedule takes its dates from the tasks on the PM Dashboard, so plan the programme first.

> **Note:** Once the contract is locked, procurement marking on the Budget is frozen. Bill items you mark complete on the Bill of Quantity still show as done here.

## Material and Services Constants

### Material Constants

**Material Constants** are the factors behind every material and labour schedule, such as how many bags of cement go into a cubic metre of concrete or how many blocks into a square metre. They are the same constants QUIV and HERON use on the desktop. Open them from **Constants** under **My tools** (`/rategen/material-constants`).

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

## Exports and reports

### Excel workbooks

Click **Export** in a project's top bar and choose:

| Group | Options |
|---|---|
| **Bill & Budget** | **Export bill & budget workbook**: your bill with its own sections and totals, plus separate Material, Labour and Plant schedules, a Schedule of Current Prices and a Material Summary. **Export bill & budget (by trade)**: the same, sectioned by trade. |
| **Generic BoQ** | **Export generic BoQ (by category)** and **Export generic BoQ (by trade)** |
| **Elemental BoQ** | **Bungalow** or **Multi-storey**, grouped by building element |
| **Trade BoQ** | **Bungalow (Trade format)** or **Multi-storey (Trade format)**, one bill per work section |
| **Milestone BoQ** | **Bungalow (Milestone format)** or **Multi-storey (Milestone format)**, one priceable bill per construction stage, as the basis for a payment schedule |
| **ICMS 3** | **ICMS 3 cost and carbon (Excel)** and **ICMS 3 cost and carbon (JSON)** |

### The ICMS 3 cost and carbon report

ICMS 3 is the International Cost Management Standard. It lets a client compare your project's cost and carbon with other projects anywhere, because every line sits in the same standard Groups. ADLM builds the report from your bill.

1. Open the project and click **Export**.
2. Under **ICMS 3** ("international cost and carbon report"), click **ICMS 3 cost and carbon (Excel)**.
3. Open the downloaded file, named after the project with "ICMS 3" on the end.

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
- **Cost and carbon per m²** appear when the project has an IPMS 1 (gross external) or IPMS 2 (gross internal) floor area recorded. Without one, those columns stay empty.
- Details the bill does not carry, such as the country (Nigeria), currency (NGN) and base date (the day you export), are filled in and marked **Assumed** on the first sheet.

**ICMS 3 cost and carbon (JSON)** gives the same report as data, with full ICMS 3 codes. It conforms to the RICS Data Standard 3.3.3, so a client's cost database can read it directly.

> **Tip:** The ICMS 3 export works on learning samples too. Export one from a sample to see a finished report before you send your own.

> **Note:** The ICMS 3 report is not AI. Lines are placed by fixed rules, and carbon comes from your Rate Gen rates and published carbon factors.

### PDF reports

- **Project report**: the Project Progress Report for the open project.
- **PM report**: the Project Management Report (schedule and earned value), from the PM Dashboard.
- **Management report**: across all your projects, from the Portfolio Dashboard.

Each opens a preview first. Click **Download PDF** to save it. A report Ada opens for a date range adds a **This Period** page: work valued, certified, procured, actual against planned, and what happened on the programme in that window.

### Valuations and certificates

**Print valuation** and **Export Excel** in the daily valuation log, the certificate downloads in **Certificates**, and the final account **Download** are described in [Valuations and contract administration](/guides/cloud-valuation).

## AI in the bill and the budget

| Feature | Where | What it does | Availability |
|---|---|---|---|
| Ada prices your bill | **Ask Ada**: "Price my bill" | Proposes a rate for every unpriced line from your own Rate Gen library, unit as a hard rule, rates you chose before first. You tick lines on the **Proposed rates** card and press **Apply N rates** | On for everyone, on projects you can edit and whose rates you can see |
| **Check my rates against the market** | **Work area** | Benchmarks priced lines against the Rate Gen library for your zone: above market, below market, in range or unit mismatch | On for everyone with an active licence |
| **Scan the bill for errors** | **Work area** | Duplicates, wrong units, odd quantities, rate outliers | On for everyone with an active licence |
| **Build up a rate for the selected line** | **Work area** | One line's rate from material, labour and plant, each part marked as looked up or estimated | On for everyone with an active licence |

None of these changes a rate by itself, and none of them builds a rate in your library. See [ADLM AI services](/guides/ai-services).

## Troubleshooting

### I cannot change rates or delete lines

The contract is probably locked: the top bar says **Contract locked**. Raise a variation instead, or unlock the contract from the **Contract** tab on the bill ribbon. If the project is shared with you at **View only**, you cannot edit it at all; ask the owner for **Full access**.

### I cannot find a button to build or edit a rate

There is none on the website. Rates are built and edited only in the ADLM Rate Gen desktop app. On the website, pick a Rate Gen rate onto the line, or type a price on the bill line.

### The budget says "Re-save this project from the plugin"

The project was saved before the material and labour breakdown was sent. Open it in the plugin and save it to the cloud again.

### Picking a rate did not price the Budget

The rate has no build-up in Rate Gen, it is no longer in your library, the line has no quantity, or you only have view access. The message under the line says which. The rate still goes on the line; price the Budget rows yourself, or choose a rate that has a build-up.

### My QUIV budget has quantities but no prices

Your account has no active Rate Gen licence, or the project was saved before your library had prices for those materials. Price the rows yourself, or get Rate Gen and save from QUIV again.

### The ICMS 3 report has no cost per m²

The project has no IPMS 1 or IPMS 2 floor area recorded, so per-m² figures are left out.

### Most of my bill is on the Not placed sheet

The descriptions did not match an ICMS 3 Group. Each line on that sheet says why. Clearer descriptions in the plugin give better placement on the next save.

## Frequently asked questions

### Does re-saving from the plugin overwrite my prices?

No. Each save is a new version. Rates, purchase marks, supplier details and notes you added on the website are kept, and prices already on budget rows are never replaced.

### Does a price I type on the bill change my Rate Gen library?

No. It stays on that project's line. Your library only changes in the Rate Gen desktop app.

### Where does the carbon in the ICMS 3 report come from?

From the carbon figure on each of your Rate Gen rates, which Rate Gen works out from published factors (ICE, CIBSE TM65, IStructE, manufacturer EPDs and others). The **Carbon from** column on the **Lines** sheet shows the source line by line.

### Where do I get help?

Ask Ada, chat with us on WhatsApp on +234 810 650 3524, or raise a ticket from **Support** in the menu.
