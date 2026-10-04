---
id: cloud-bill-budget
title: ADLM Cloud: the bill and the budget
tagline: Price the Bill of Quantity, pick Rate Gen rates, plan materials and labour in the Budget, and export reports.
version: "2026.09"
updated: 2026-10-01
platform: Web, any browser (adlmstudio.net)
productKeys: []
pdf: ADLM-Cloud-Bill-and-Budget-Guide.pdf
order: 10.2
---

This is one part of the [ADLM Cloud guide](/guides/cloud). It covers the workspace as it is on the live site at the start of October 2026.

## The bill and the budget

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

## Material and Services Constants

**Material Constants** (**Constants** under **My tools**, `/work/constants`) are the factors behind every material and labour schedule, such as how many bags of cement go into a cubic metre of concrete. They are the same constants QUIV and HERON use on the desktop.

1. Find a constant with **Search constants…**.
2. Change its value. The **ADLM default** column shows the starting figure.
3. Click **Save changes**. **Reset** on a row, or **Reset all to defaults**, puts the ADLM figures back.

New schedules use your constants straight away. An existing project keeps its figures until its schedule is rebuilt.

**Services Constants** (`/rategen/services-constants`) are your house standards for pricing MEP services: standard lengths, how connectors are counted and the fitting uplift. They feed **Price services** on Revit MEP projects. Choose the **Unit system**, edit the rows and click **Save constants**.

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

## Troubleshooting

### I cannot change rates or delete lines

The contract is probably locked: the top bar says **Contract locked**. Raise a variation instead, or unlock the contract from the **Contract** tab on the bill ribbon. If the project is shared with you at **View only**, you cannot edit it at all; ask the owner for **Full access**.

### The budget says "Re-save this project from the plugin"

The project was saved before the material and labour breakdown was sent. Open it in the plugin and save it to the cloud again.

### Picking a rate did not price the Budget

The rate has no build-up in Rate Gen, it is no longer in your library, or you only have view access. The rate still goes on the line; price the Budget rows yourself, or choose a rate that has a build-up.

## Frequently asked questions

### Does re-saving from the plugin overwrite my prices?

No. Each save is a new version. Rates, purchase marks, supplier details and notes you added on the website are kept.

### Where do I get help?

Ask Ada, chat with us on WhatsApp, or raise a ticket from **Support** (`/manage/support`).
