---
id: rategen
title: ADLM Rate Gen
tagline: Build defensible rates from material, labour and plant prices for your location, see the upfront carbon of every rate, price a client's own bill, and price QUIV, HERON, SERVIQ and ADLM Cloud projects from one library.
version: "3.0, build 3.0.2610.2"
updated: 2026-10-07
platform: Windows desktop app, plus the read-only RateGen pages on adlmstudio.net
productKeys: [rategen]
pdf: ADLM-RateGen-User-Guide.pdf
order: 6
---

ADLM Rate Gen is ADLM's rate build-up tool for quantity surveyors and estimators. It holds a library of material prices, labour day rates and plant hire rates, priced for the part of Nigeria you work in, and builds up a rate for every item of work: ground works, concrete, blockwork, finishes, roofs, painting, steel, windows and doors, and the four building services. Every rate shows exactly what it is made of, so you can check it, change it and defend it. Every priced rate also carries an upfront carbon figure in kgCO2e. **Price a bill** prices a client's own Excel bill from those same rates. Your library lives on your ADLM account, so QUIV, HERON, SERVIQ and your ADLM Cloud projects all price from the same rates.

This guide covers **Rate Gen 3.0, build 3.0.2610.2**, the new suite design. Rate Gen keeps the version 3.0 through 2026; each release changes only its build number. Build 3.0.2610.2 reaches you through the Installer Hub. If your Hub still offers build 3.0.2610.1, you do not have **Price a bill** or **Save to ADLM Cloud** yet. Where a feature arrived with a build, this guide says so.

> **Important:** Rates are built only in the Rate Gen desktop app. The RateGen pages on the ADLM website are **read-only**. They show your library and every rate's build-up, but they cannot build a rate, edit a rate, delete a rate or change a material or labour price. To change anything, open Rate Gen on your computer. Your change appears on the website after Rate Gen's next sync.

## What's new in build 3.0.2610.2

- **Price a bill.** Open any client's bill of quantities in Excel, in their own layout. ADLM AI proposes one of your rates for each measured item, in the same unit only, and nothing is priced until you accept it. **Download Excel** saves a priced copy in the client's layout; the client's file is never changed. See [Price a bill](#price-a-bill).
- **Save to ADLM Cloud.** Keep a bill you are pricing, priced and unpriced lines, as a RateGen project in your ADLM account. Saving again from the same bill updates it. See [Save a priced bill to ADLM Cloud](#save-a-priced-bill-to-adlm-cloud).
- **Signal bars beside the sync button** show how well this PC reaches ADLM Cloud. See [Connection and working offline](#connection-and-working-offline).

### Also in build 3.0.2610.1

- **Custom rates now download.** Before build 3.0.2610.1, Rate Gen never downloaded your custom rates. A rate made on another PC, or on the website before the website became read-only, could be removed from your account at the next sync. Rate Gen now brings every custom rate on your account into **Saved Rates**, at sign-in and at every sync, with its own prices, unit and section. A rate is deleted from your account only when you delete it in Rate Gen. See [Custom rates and sync](#custom-rates-and-sync).
- **Carbon for services cables and pipes.** Copper cable and earthing, PP-R pressure pipe and uPVC soil pipe are now weighed from their own names, so services rates that use them get a carbon figure.
- **Build with AI is on by default** for everyone signed in. See [AI in Rate Gen](#ai-in-rate-gen).

For everything that changed in the 3.0 launch release, see [What's new in 3.0](#what-s-new-in-3-0).

## Before you start

### What you need

| You need | Notes |
|---|---|
| A Windows PC | Rate Gen runs on Windows. The window fits any screen size and scaling, down to 860 pixels wide. |
| An ADLM account with a Rate Gen subscription | The same email and password you use on the ADLM website. See [Getting started](/guides/getting-started) to buy one. |
| A pricing location on your profile | Your state decides which regional prices you get. See [Your location and price zones](#your-location-and-price-zones). |
| An internet connection | For your first sign-in and every sync. After that you can work offline. |

### Installing or updating Rate Gen

Rate Gen is installed from the ADLM Installer Hub, never from a loose download. See [ADLM Installer Hub](/guides/installer-hub).

1. Open the Installer Hub and sign in.
2. Open **Installation Center** and find **RateGen**.
3. Click **Install**, or the **Update to** button if you have an older version.
4. Accept the Windows permission prompt.
5. Wait for the Hub to report that the install has finished.

> **Note:** Updating keeps your data. Your library, your saved rates and your edits are kept in your own Windows profile and on your account, and an update never touches them.

### The order to do things in

You only do steps 1 to 3 once.

1. Set your **Pricing location (State)** on your profile on the ADLM website.
2. Install Rate Gen from the Hub.
3. Open Rate Gen and sign in. Rate Gen loads the prices for your location.
4. Check prices in the **Library**, then check the rates in each trade.
5. Build custom rates for anything the library does not cover.
6. Price your projects in QUIV, HERON, SERVIQ or ADLM Cloud, or price a client's own bill with **Price a bill**.

## Signing in

1. Open **ADLM RateGen** from the desktop or the Start menu. The splash screen shows **Starting up…**.
2. Type your email or username in **Email or username**.
3. Type your password in **Password**. The eye button shows or hides it.
4. Click **Log in**, or press <kbd>Enter</kbd>. The button reads **Signing in…** while it works.

Rate Gen checks your subscription, then loads the prices for your location. You will see **Sign in successful!** If your profile's location has changed since you last used Rate Gen, it asks whether to update your prices to that zone. Click **Yes**.

**Forgot password?** and **Create account** open the website.

### Signing out

Click **Log out** at the foot of the rail. Rate Gen sends any unsynced edits first. You do not need to sign out each day.

## A tour of the Rate Gen window

Rate Gen 3.0 uses the same suite design as every ADLM product: a rail on the left, a top bar, and the screen you are working on.

### The rail

| Entry | What it opens |
|---|---|
| **Library** | Your material and labour library, with plant in the labour list. |
| **ITEM OF WORKS** | A heading over the eight trades: **Ground**, **Concrete**, **Block Works**, **Finishes**, **Roofs**, **Painting**, **Steel** and **Window and Door**. |
| **SERVICES** | **Mechanical** (air conditioning and ventilation), **Electrical** (lighting, power, cables, earthing, containment, security), **Plumbing** (water supply, soil and waste, rainwater, sanitary) and **Fire** (fire protection and alarm). |
| **MORE** | **Price a bill**, to price a client's own bill from your rates; **Carbon & Others**, the upfront carbon of every priced rate; and **Saved Rates**, your custom rates, with a count beside it. |
| **Open ADLM Cloud** | Opens RateGen on the website, where your rates price your projects. |
| **Export** | Saves every rate to Excel. |
| **Help** | Opens an email to ADLM support with your account email filled in. |
| **Log out** | Signs you out. |

Click the button at the top of the rail, or press <kbd>Ctrl</kbd>+<kbd>B</kbd>, to fold it to icons and back. Below 1,100 pixels wide it folds by itself.

### The top bar

| Control | What it does |
|---|---|
| **Search every rate in the library** | Searches every trade and service. Type part of a rate's name and pick a result to open it. Press <kbd>Ctrl</kbd>+<kbd>F</kbd> to jump here. |
| Currency | Shows prices in NGN, USD, EUR, QAR, GHS or ZAR. This changes how prices are shown only. |
| Signal bars | How well this PC reaches ADLM Cloud (from build 3.0.2610.2). Hover for details; click to check again. |
| Sync button | **Sync from Cloud (F5)**. Fetches the latest rates and prices and sends your edits up. Hover over it to see the last sync result. |
| Banner (eye) | Shows or hides the welcome banner, for more room for rates. |
| Light or dark | Switches the theme. |
| Keyboard | Shows the keyboard shortcuts. |
| Reset all rate edits | Puts every build-up you have edited, in every trade, back to the shipped quantities, and syncs the reset to QUIV and HERON. It asks first. |
| Undo library changes | Opens **Restore an earlier library**. |
| Bell | **Notifications**: sync results, new published prices and updates from ADLM. |
| Profile | Opens your ADLM profile on the website, where you set your pricing location. |

## Your location and price zones

Materials and labour cost different amounts in different parts of the country, so Rate Gen prices your library for your location.

- **You choose a state.** Your profile on the ADLM website asks for your **Pricing location (State)**: any of the 36 states or the FCT.
- **Prices come from the zone your state is in.** ADLM prices six zones: South West, South East, South South, North Central, North East and North West.
- **There is one place to set it.** Rate Gen has no location picker. You change your state on the website, and Rate Gen picks it up at your next sign-in or sync.

The **Library** shows where its prices came from, for example **Lagos: priced from south west rates. Set this on your ADLM profile.**

## The Library: materials, labour and plant

Click **Library** in the rail. It has two tabs, **Material** and **Labour**. Every rate in every trade is priced from these two lists, so a price you change here flows into every rate that uses it.

- **Material** lists each item's **MATERIAL NAME**, **UNIT**, **PRICE** and **CATEGORY**.
- **Labour** lists trades and plant together, with **LABOUR NAME**, **UNIT**, **PRICE** and **CATEGORY**. Labour is a day rate. Plant (excavators, rollers, mixers, generators, cranes and so on) has its own categories, so the category filter narrows the list properly.

### Finding an item

- Type in **Search the material library** or **Search the labour library**.
- Pick a category to show one category.
- Use the sort box: **Sort by · library order**, **Sort by · most expensive** or **Sort by · A to Z**.

### Changing a price

1. Click the item's row, or select it and press <kbd>Enter</kbd>. The **Edit material** or **Edit labour** form opens.
2. Type your price in **Price**.
3. Click **Update the library**.

Every rate using the item is repriced at once, and no sync overwrites your price.

For labour and plant, the form also shows **Specification and expected output**: what the item is, what it typically produces in a day, and what it runs on. The figures are indicative only, a sense check on your rate rather than a guarantee.

### Adding an item

1. Click **Add Material +** on the **Material** tab, or **Add Labour +** on the **Labour** tab.
2. Fill in **Name of material** (or **Name of labour**), **Unit**, **Price** and **Category**.
3. For labour and plant you can add a **Note**: what it is and what it produces in a day.
4. Click **Save to the library**.

To remove an item you added, select it and press <kbd>Delete</kbd>, or use **Delete** on its row. ADLM's own items cannot be removed, only repriced.

### Fetching the latest prices

Click **Update prices** to bring the library's prices up to date from ADLM. Your own prices are offered, not overwritten.

### When ADLM publishes a new price for something you changed

Your price stays in use, and a review card appears at the top of the library with the **Item**, **Unit**, **Your price**, the **Published** price and the **Change**.

1. Tick the rows you want to decide on, or tick the header box for all of them.
2. Click **Keep mine** to keep your figures and stop being asked, or **Use published** to take the published price.

Unticked rows stay pending. Reopen a hidden card from the bell with **Review**.

### Undoing library changes

Rate Gen copies your material and labour libraries before anything rewrites them: a sign-in, a sync, a change of location, or taking published prices.

1. Click the undo library changes button in the top bar.
2. Under **Restore an earlier library**, pick the point to go back to.
3. Click **Restore** and confirm.

Your current library is copied first, so a restore can itself be undone.

## Rates by trade

Every trade and service uses the same screen. At the top is the trade's name and **Add Custom Rate +**. Below is a bar and the table.

| Column | Meaning |
|---|---|
| **S/N** | The item number. |
| **DESCRIPTION** | The item of work, written to the Standard Method of Measurement. |
| **UNIT** | The unit the rate is for, such as m², m³ or No. |
| **NET COST** | Materials, labour and plant for one unit. |
| **PROFIT** | The profit added to the net cost. |
| **OVERHEAD** | The overhead added to the net cost. |
| **TOTAL COST** | The rate: net cost plus overhead plus profit. |

On the bar:

- **Overhead** and **Profit** set the percentages for every rate in the trade. See [Overheads and profit](#overheads-and-profit).
- **Search this trade** filters the rows.
- The sort box offers **Sort by · order in the bill**, **Sort by · most expensive** and **Sort by · A to Z**.

Click a row, or select it and press <kbd>Enter</kbd>, to open its build-up.

> **Note:** Services rates say whether a library item is a supply price or an installed price. A supply price is the material only, so allow for fixing. An installed price already includes fixing, so do not add a labour line on top.

## Building a rate: reading and changing a build-up

Opening a rate shows its **Rate Composition**. Each line is a component: a material, a labour gang or an item of plant.

| Column | Meaning |
|---|---|
| **COMPONENT** | What the line is. Click a material or labour name to open it in the library, ready to check or change its price. |
| **QUANTITY** | How much of it one unit of work uses. |
| **UNIT** | The component's unit. |
| **UNIT PRICE** | Its price from your library. |
| **AMOUNT** | Quantity times unit price. |

Totals, sub-totals and waste allowances are arithmetic, not library items, so they are not links.

### How a rate is built

- **Materials:** each material's quantity per unit of work, at your library price, with waste as its own line.
- **Labour and plant:** the gang's or machine's day rate, and any fuel, divided by what it produces.
- **Reused rates:** mortar in a wall is the mortar rate; the mixer in concrete is the mixing rate. Change the reused rate and every rate using it follows.

### Changing quantities

When a rate is wrong for how you work, it is usually one quantity: a different mix, a different spacing, a different gang output.

1. Click a **QUANTITY** and type the new figure.
2. Press <kbd>Enter</kbd> or click away. The sub-totals refresh.
3. Click **Save**. You will see **Rate saved**: your quantities are kept on this PC, used everywhere the rate appears, and synced to QUIV and HERON.

The other buttons:

- **Cancel** throws away changes since the last save.
- **Reset this rate** puts every quantity back to what ADLM published.
- **‹** goes back to the table, and **×** closes the build-up.

> **Important:** Change prices in the library and quantities in the build-up. A price lives in one place and is shared by every rate that uses it. A quantity belongs to one rate.

If you are offline when you save, you will see **Cloud Sync Pending**. Your edit is saved on the PC and syncs the next time you are connected.

## Overheads and profit

A rate is built in two steps:

**Net cost = materials + labour + plant**

**Rate = net cost + overhead + profit**

Overhead and profit are each a percentage of the net cost.

- **In a trade,** the **Overhead** and **Profit** boxes set the percentages for every rate in that trade. They start at 10% overhead and 25% profit.
- **In a custom rate,** you set them for that rate alone. They start at 10% and 10%, as a percentage of the material and labour total.

> **Tip:** Set overhead and profit to match how your firm prices before you rely on the totals.

## Custom rates

A custom rate is a rate you build yourself, for an item the library does not cover or one you price your own way. Custom rates are saved in **Saved Rates**. They stay on this PC, travel with your account, and are never sent into the ADLM library.

### Building a custom rate

1. Open any trade and click **Add Custom Rate +**. The form opens: "Name it, set overhead and profit, then list what goes into it."
2. Type the **Name of rate**.
3. Set **Overhead** and **Profit**.
4. Type the description: the wording that goes on the bill.
5. Under **Materials** (everything that is bought), click **Add material**. Type or pick a **Name of material**. A name from your library fills in its **Rate** and **Unit**. Type the **Quantity** one unit of work uses.
6. Under **Labour** (everything that is worked), click **Add labour** and do the same. Plant is in the labour library, so add plant here too.
7. Check the totals: **Material total**, **Labour total**, **Overall**, the overhead and profit, and the **Grand total**.
8. Click **Save this rate**.

You will see **New Rate Saved**. If you typed a priced line that is not in your library yet, Rate Gen adds it and says how many items it added. It never overwrites a price you already have.

To start from a sentence instead, use **Build with AI** at the top of the same form. See [AI in Rate Gen](#ai-in-rate-gen).

### Saved Rates

Click **Saved Rates** in the rail to see **Saved Custom Rates**, with **TITLE**, **DESCRIPTION**, **OVERHEAD %**, **PROFIT %**, **GRAND TOTAL** and **CREATED**.

- Click a rate's wording to open it, change it, then click **Update this rate**.
- Select a rate and click **Delete selected rate**, or use the delete button on its row.
- Use **Search your saved rates**, **Filter** and **Sort by** to find a rate.

Custom rates are priced from your library, so they follow when you change a library price.

### Custom rates and sync

From build 3.0.2610.1, custom rates sync both ways:

- Rates on your account that this PC does not have are **downloaded** into **Saved Rates**, at sign-in and at every sync.
- A rate is deleted from your account **only when you delete it in Rate Gen**.
- Only rates you changed on this PC are uploaded.
- A rate missing from your account but still on this PC is uploaded again, unless you deleted it in Rate Gen on another PC.

So a new PC, or a fresh install, brings back all your custom rates when you sign in.

> **Note:** Rate Gen has no plant group on a custom rate yet. If an older rate made on the website has a plant line, the line does not show in Rate Gen, but it is kept on your account and the rate keeps its full value.

## Price a bill

**Price a bill** prices a client's own bill of quantities from your Rate Gen rates. It arrived in build 3.0.2610.2. You open the client's Excel bill as it is, in their layout. Rate Gen reads every item with the section and headings above it, ADLM AI proposes one of your rates for each measured item, and you decide. Nothing is priced until you accept it, and the client's file is never changed: the priced bill is saved as a copy.

### What you need

- To be signed in to Rate Gen, with an internet connection. ADLM AI runs on ADLM's servers.
- The client's bill as an Excel workbook: **.xlsx**, or **.xls** on a PC with Microsoft Excel installed. Any layout and any number of sheets.
- Your rates loaded. If Rate Gen says it has no priced rates loaded yet, open a trade once so its rates load, then try again.

Matching uses your account's monthly AI allowance. See [AI in Rate Gen](#ai-in-rate-gen).

### Opening a client's bill

1. Click **Price a bill** in the rail, under **MORE**. The screen opens on **Open a client's bill**.
2. Click **Open a bill**.
3. Pick the client's workbook in the **Open a bill of quantities** window, then click **Open**.
4. Wait while Rate Gen works through **Reading the bill**, **Matching to your rates** and **Pricing**. The line under the steps says how far it has got, for example "Matched 40 of 112 bill lines…". Click **Cancel** to stop.

Rate Gen finds the description, unit and quantity columns on each sheet by itself. Summary sheets and sheets it cannot read are skipped; a note at the top of the screen lists them under **Sheets not read**.

> **Note:** For an old-format **.xls** file, Rate Gen uses Excel on your PC to read it. If Excel is not installed, save the file as .xlsx on a PC with Excel and open that copy.

### Reading the priced bill

The bill opens as a table, one row per line of the client's bill. Headings and titles are shown in bold.

| Column | Meaning |
|---|---|
| **ITEM** | The client's item reference. |
| **DESCRIPTION** | The client's wording. Hover over it to see the line as Rate Gen read it, with the section and headings above it. |
| **UNIT** and **QTY** | The client's unit and quantity. |
| **YOUR RATE** | The Rate Gen rate proposed or chosen for the line, with its status underneath. |
| **SURE** | How sure ADLM AI is of its proposal, as a percentage. |
| **RATE** | The rate. |
| **AMOUNT** | Quantity times rate, shown once the line is priced. |

The status under each rate tells you where the line stands:

| Status | Meaning |
|---|---|
| **Suggested, check it** | ADLM AI proposed a rate. It is not priced until you accept it. |
| **Priced** | You accepted or chose a rate. |
| **Priced, no quantity in the bill** | Priced, but the client's bill has no quantity for the line, so it adds nothing to the total. |
| **No match: choose a rate** | No good match was found. Choose a rate yourself or leave it unpriced. |
| **Sum: price in the bill** | A lump sum or provisional sum. Price it in the client's bill yourself. |
| **Not a measured item** | A line with no unit Rate Gen can price, such as a note. |

Use **All**, **Needs attention** and **Priced** above the table to show every line, only the lines still to decide, or only the priced lines. Each shows its count.

### Accepting suggestions

To accept every confident proposal at once:

1. Click **Accept the sure matches**. The button shows how many lines have a suggestion, for example "(36 suggested)".
2. Rate Gen accepts every suggestion ADLM AI is at least 85% sure of. You can still change any of them.

To decide one line at a time:

1. Click the line. The side panel shows **THE LINE, AS READ**, with its quantity, unit and sheet, and **YOUR RATE**, with the rate's trade, how sure ADLM AI is (for example "ADLM AI 92% sure") and its reason.
2. Click **Accept** to price the line with that rate, or **Leave unpriced** to clear a priced line.

### Choosing another rate

1. Click the line.
2. Under **CHOOSE ANOTHER RATE**, the side panel lists your rates that fit the line best. Type in **Search your rates** to look for others.
3. Double-click a rate, or select it and press <kbd>Enter</kbd>. The line is priced with it.

Only rates in the line's own unit are offered. Steel billed by the kg is offered your per-tonne steel rates, worked out per kg.

### Totals

With no line selected, the side panel shows **BY SECTION**: each sheet and section, how many of its items are priced, and its total. Under the table, Rate Gen shows how many items are priced (for example "84 of 112 items priced") and the **BILL TOTAL**. Totals count accepted lines only.

The rates are Rate Gen's all-in rates: net cost, overhead and profit.

### Downloading the priced bill

1. Click **Download Excel**. It is available once at least one line is priced.
2. In **Save the priced bill**, choose where to save. Rate Gen suggests the bill's own name with "(RateGen priced)" on the end. You cannot save over the client's original.
3. Click **Save**. **Priced bill saved** shows how many lines were priced and the bill total.
4. Click **Show in folder** to find the file, or **Close**.

The copy keeps the client's layout with your rates and amounts filled in:

- If the bill has no rate or amount column, Rate Gen adds **Rate** and **Amount** beside the bill's own columns.
- Each rate carries a note naming the Rate Gen rate behind it, its trade and its unit.
- A **RateGen summary** sheet lists each section with **Items priced**, **Items** and **Total**, and the bill total.
- A rate cell that holds the client's own formula is left as it was.
- Rates and amounts are written in the currency chosen in the top bar.

> **Tip:** If the save fails, the file may be open in Excel. Close it and click **Download Excel** again.

### Starting another bill

Click **Open another bill**. If you have accepted rates, Rate Gen asks **Start again?** first: the rates you accepted are not kept unless you download the priced bill (or save it to ADLM Cloud) first. Click **Start again** or **Keep working**.

## Save a priced bill to ADLM Cloud

From build 3.0.2610.2, you can keep a bill you are pricing in your ADLM account as a RateGen project. The project holds every measured line, priced and unpriced, and each priced line keeps the Rate Gen rate that priced it. It is named after the client's file.

1. Open and review the bill in **Price a bill**.
2. Click **Save to ADLM Cloud**. The button reads **Saving…** while it works.
3. **Saved to ADLM Cloud** confirms it: "The bill is saved as a RateGen project in your ADLM account. Saving again from here updates the same project." It shows the **Project** name and the **Lines**, with how many are priced.
4. Click **Open in ADLM Cloud** to open the project on the website, or **Close**.

After the first save the button reads **Save changes to ADLM Cloud**. Click it after more pricing and the same project is updated; you will see **Changes saved to ADLM Cloud**. Opening another bill and saving it makes a new project.

> **Note:** The ICMS 3 cost and carbon export for a bill saved from Rate Gen comes in a later release.

If Rate Gen says **Sign in to save to ADLM Cloud**, your session has ended: sign in again, then save. If it says **Could not save to ADLM Cloud**, check your connection and try again. The priced bill stays on screen, so nothing is lost.

## Carbon: kgCO2e on every rate

From version 3.0, every priced rate has an upfront carbon figure, worked out from the same materials and quantities as its price. Change a quantity and the price and the carbon move together.

### What the figure is

- **Upfront embodied carbon, modules A1-A5** (RICS Whole life carbon assessment, 2nd edition, 2023), in **kgCO2e per unit** of the rate: making the materials, transport to site, site waste and the fuel plant burns on site.
- **Labour and plant hire carry no material carbon.** The fuel the plant burns does, as site fuel.
- **Cement shows a range.** The low end takes the Nigerian producers' own cement figure (Dangote 570 and Lafarge Africa 537 kg CO2 per tonne, 2024, kiln only, so a floor). The high end takes the full cradle-to-gate figure, 0.83 kgCO2e per kg.
- **Reinforcement** uses scrap-based electric-furnace steel (0.821 kgCO2e per kg), the route Nigeria's own rebar mills use.
- **Nothing is guessed.** A line with no published factor, or a weight that cannot be read, is left out and lowers the rate's coverage instead.

### The Carbon & Others screen

1. Click **Carbon & Others** in the rail. The screen is headed **Carbon Computation**.
2. Read the table. Beside each rate's **TRADE**, **UNIT** and **TOTAL COST** are **KGCO2E / UNIT** and **COVERAGE**.
3. Use **Search this trade** to find a rate by name or trade, and **Sort by · most expensive** to put the highest carbon first.
4. Click a rate to open its **Rate Composition**. The **KGCO2E** column gives each line's carbon. Hover over a figure to see its factor and the factor's published source.

**COVERAGE** is the share of the build-up's cost whose carbon is accounted for. A star (*) marks a rate that uses an assumed weight. The overhead and profit boxes step aside on this screen, because carbon does not use them.

> **Tip:** To change a rate's carbon, change its quantities in its own trade. The carbon follows.

### Services carbon factors

From build 3.0.2610.1, services rates that use these materials get a carbon figure:

| Material | How it is weighed |
|---|---|
| Copper cable and earthing | The copper conductor, from the number of cores and the size in mm². Insulation, sheath and armour are not counted, so the figure is a floor and marked as an assumed weight. |
| PP-R pressure pipe | From standard PN10 pipe sizes. A "15mm" pipe is taken as the 20mm (1/2 inch) size. |
| uPVC soil pipe | 110 mm by 3.2 mm. |

Rainwater and waste pipe, fittings and manufactured items (air conditioners, pumps, sanitaryware, lights, tanks) have no carbon yet; they need the maker's own figure. Nor do windows and doors, asbestos sheets and ceilings.

### Where carbon goes next: ICMS 3 on ADLM Cloud

Rate Gen's carbon travels with your rates to ADLM Cloud. On a project, click **More actions** > **Open the classic workspace**, open the **Export** menu and look in the **ICMS 3** group, labelled "international cost and carbon report":

- **ICMS 3 cost and carbon (Excel):** cost and upfront carbon (A1-A5) by ICMS 3 Group, every line's code and carbon source, and the lines not yet placed.
- **ICMS 3 cost and carbon (JSON):** the same report as data, conforming to the RICS Data Standard 3.3.3.

The carbon on each line comes from your Rate Gen rates. The report total equals the contract total: preliminaries go in Group 08, contingency in 09.020 and VAT in 10.020. Cost and carbon per m² need an IPMS 1 or 2 floor area, and ADLM Cloud has no screen to record one yet. The export works on sample projects too. For SERVIQ projects, ADLM Cloud uses a wider set of building-services carbon factors. See [ADLM Cloud](/guides/cloud).

## AI in Rate Gen

ADLM AI suggests; you decide. Nothing it drafts is saved until you save it. For every AI feature across ADLM, see [ADLM AI services](/guides/ai-services).

### Build with AI

**Availability:** on for everyone signed in, from build 3.0.2610.1, on by default. It draws on your account's monthly AI allowance (a rate build-up costs 1 unit).

Describe an item of work in one sentence and ADLM AI drafts a full build-up into the custom rate form, for you to check, edit and save.

1. Open a trade (for example **Block Works**) and click **Add Custom Rate +**.
2. In **Build with AI**, type a request with the words "rate" and "build" in it, for example "Build a rate for 225mm blockwork in cement mortar (1:6)".
3. Click **Build with AI**. Rate Gen shows each step: **Reading your sentence**, **Asking ADLM AI for a build-up**, **Filling in materials and labour** and **Checking it against ADLM's rules**.
4. Read the status, for example "AI draft ready (confidence 85%). Review every line before saving."
5. Check and correct every line.
6. Click **Save this rate**.

How it works:

- Rate Gen sends your sentence, your zone and the names of items in your library, your own first.
- Components found in your library are priced from **your** library at your price. Only components your library lacks keep an AI estimate, tagged **[AI]**.
- If the draft fails ADLM's checks, an amber block reads **This build-up did not pass ADLM's checks** and lists what to fix: "Correct the flagged lines before saving: the quantities, not just the prices."
- If every line came back at 0.00, Rate Gen says so. Enter the rates yourself, or pick items from the library so their prices apply.

> **Important:** "An AI draft is an advisory estimate from the ADLM library and market data. It is not a professional opinion and not for contract use until you have checked every line."

### Carbon is not AI

**Carbon & Others** works out carbon from each rate's own build-up and published factors, by fixed rules. No AI is involved.

### Price a bill

**Availability:** for everyone signed in, from build 3.0.2610.2. **Price a bill** is in the rail for every user. Each request to ADLM AI covers up to 40 bill lines and uses 1 unit of your account's monthly AI allowance, so a 120-line bill uses 3 units. Matching the same lines again within a week costs nothing.

ADLM AI reads each measured item of a client's bill with the section and headings above it, and picks which of your rates is the same work, from a short list of your rates in the same unit. It only picks: the price always comes from your own Rate Gen rate. It shows how sure it is and why, and a line it is not sure about stays unpriced. Nothing is priced until you accept it. See [Price a bill](#price-a-bill) for the steps.

- Rate Gen sends ADLM AI the bill's descriptions, units, sections and headings, and a short list of your rates for each line (name, trade, unit and rate). It does not send the client's file itself.
- If ADLM AI cannot be reached, or your allowance is used up, a note at the top of the screen says so and you can still price each line by choosing a rate yourself.
- If the note says "ADLM AI's bill matcher is not live yet, so the general matcher answered", the suggestions came from ADLM's general matcher and are weaker. Check every one.

## Exporting your rates

1. Click **Export** in the rail, or press <kbd>Ctrl</kbd>+<kbd>E</kbd>.
2. Choose where to save the file. It is named `ADLM_Rates_` followed by the date and time.
3. Click **Save**. You will see **Export completed.**

The workbook has a sheet per trade (**Ground**, **Concrete**, **Block Works**, **Finishes**, **Roofs**, **Painting**, **Steel**, **Window & Door**), a **Carbon & Others** sheet and a **Saved Rates** sheet.

> **Note:** **Export** is not always in the rail. It appears on the day you first sign in each calendar month, and again 20 days later.

## Syncing with the cloud

Your library is kept on your ADLM account as well as on your PC. That is what lets QUIV, HERON, SERVIQ and ADLM Cloud price from the same rates as Rate Gen.

Rate Gen syncs when you sign in. Click the sync button in the top bar, or press <kbd>F5</kbd>, to sync at any time. A sync:

1. Fetches the rate library ADLM publishes for every trade.
2. Fetches the rates calculated on ADLM Cloud.
3. Fetches the master material and labour prices for your location, keeping every price you set yourself.
4. Syncs your edited build-ups and your custom rates with your account.

When you sync by hand, a **Library checked** box lists each step, for example **Rates: OK**, **Compute: OK** and **Master prices (south_west): OK**, with the number of materials and labour items. If ADLM cannot be reached, you see **The library could not be checked**, and Rate Gen keeps working with the prices already on the PC.

> **Note:** A project you have already priced keeps the rates it was priced with. A change in your library reaches a project only when that line is priced again.

## Connection and working offline

From build 3.0.2610.2, signal bars beside the sync button show how well this PC reaches ADLM Cloud: green when the connection is good, amber when it is slow or ADLM Cloud cannot be reached, and red when it is poor. A slash across the bars means this PC is offline. Hover over the bars for details, or click them to check again. Build 3.0.2610.1 has no signal bars.

You can also tell how your connection is doing in these ways:

- **Hover over the sync button.** It shows the last result, such as **Cloud sync: done** or **Cloud sync: failed**.
- **At start-up,** if ADLM Cloud cannot be reached, a **Working offline** message says that Rate Gen works with the library already on the PC, and that sign-in and sync will work again once the connection allows. It ends with a line for your IT support.

After one successful online sign-in, Rate Gen can sign you in without the internet. You will see **Signed in (offline) via cached license.** Everything on the PC works offline. Syncing, new prices and sending your edits wait until you are back online.

## Keyboard shortcuts

Press <kbd>F1</kbd> or <kbd>Ctrl</kbd>+<kbd>/</kbd> to show the shortcut sheet. The same keys mean the same thing in every ADLM product.

| Keys | What they do |
|---|---|
| <kbd>F1</kbd> or <kbd>Ctrl</kbd>+<kbd>/</kbd> | Show keyboard shortcuts |
| <kbd>Ctrl</kbd>+<kbd>1</kbd> | Go to **Library** |
| <kbd>Ctrl</kbd>+<kbd>2</kbd> to <kbd>Ctrl</kbd>+<kbd>9</kbd> | Go to **Ground**, **Concrete**, **Block Works**, **Finishes**, **Roofs**, **Painting**, **Steel**, **Window and Door** |
| <kbd>Ctrl</kbd>+<kbd>F</kbd> | Search |
| <kbd>F5</kbd> | Sync from Cloud |
| <kbd>Ctrl</kbd>+<kbd>E</kbd> | Export all rates (when **Export** is showing) |
| <kbd>Ctrl</kbd>+<kbd>B</kbd> | Fold or unfold the rail |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> | Switch light or dark theme |
| <kbd>Enter</kbd> or <kbd>Space</kbd> | In a trade table, open the selected rate |
| <kbd>Enter</kbd> | In a build-up, keep the quantity you typed. In the library, edit the selected item. |
| <kbd>Delete</kbd> | In the library, delete the selected item you added |

## The RateGen pages on the website (read-only)

The ADLM website shows the same library your Rate Gen app works on. **The website is read-only for rates.** It cannot create, edit or delete a rate, and it cannot change a material or labour price. Every page carries a note headed **Build and edit rates in ADLM Rate Gen**: new rates, changes to a rate and material or labour prices are made in Rate Gen on your computer, and appear on the website after its next sync. Rates already made on the website before this rule stay in your library.

Open the website library with **Open ADLM Cloud** in the Rate Gen rail, or **RateGen** in the website's menu.

### The library (`/work/library`)

The **RateGen** page shows your whole library in one list: published rates, your own corrections and your own rates.

- The tabs are **Item of works**, **Materials**, **Labour** and **Plant**.
- Type in the search box to find a rate, material, gang or description, then narrow with **Trade** (or **Category**) and **Sort by**.
- On **Item of works**, each rate shows its **Unit**, **Net cost**, **Overhead**, **Profit** and **Total**.
- On **Materials** and **Labour**, **Used in** tells you how many rates use each item. Prices you set in Rate Gen are marked **your price**.

Click a rate to see its **Rate composition**, then **Open the build-up** for the full page. **Full library** at the top opens the account view (`/rategen`).

### A rate's build-up page

![A rate's build-up on the website, showing the materials, labour and plant behind one rate.](shot:cloud-rate-build-up.png)

The build-up page lays one rate out in full under **The build-up**: its materials, labour and plant as groups, each line with its **Component**, **Quantity**, **Unit price** and **Amount**, then the **Net cost**, overhead, profit and the **Rate**. A note says where it is priced for, for example **Priced for** your zone. The side panel, **What this rate is**, gives the **Item number**, **Section**, **Unit**, **Priced for**, **Components**, any **Plant** and when it was **Last changed**.

If a rate's stored net cost is more than its lines add up to, the difference is shown as **Not itemised**. It is part of the rate and is never dropped.

Under **Changing it**, the page explains that it reads the rate and does not change it. The **Open in Rate Gen** link there does not open Rate Gen (build 3.0.2610.2) yet. Open Rate Gen yourself and search for the rate's name.

### The account view (`/rategen`)

This page shows everything your account holds. Cards at the top show your **Pricing Location**, **My Library**, **My Rates** and the **Master Catalog**. Click **Refresh now** to reload.

| Tab | What it shows |
|---|---|
| **Master Materials** | The published material prices for your location. |
| **Master Labour** | The published labour and plant rates for your location. |
| **My Materials** | Materials you added in Rate Gen. |
| **My Labour** | Labour and plant you added in Rate Gen. |
| **My Rate Overrides** | Published rates you changed in Rate Gen. |
| **My Custom Rates** | Your custom rates, with their totals. |
| **Effective Rates** | The rates your other ADLM products read, with their **Source**. |

Type in **Search this view...** to filter any tab. Your own prices are marked as yours, but they cannot be changed here.

### RateGen Updates (`/rategen/updates`)

Click **Updates** on the account view to see rates ADLM has recently added. Open an update, click **Copy rate name**, then press <kbd>F5</kbd> in Rate Gen and search for the name. **Mark all as read** clears the count.

## How your rates reach QUIV, HERON, SERVIQ and ADLM Cloud

Your Rate Gen library is one library for your account. The other ADLM products read it directly, so there is nothing to export or import. Each product needs your account to hold Rate Gen to price from the library.

| Product | How it uses your rates |
|---|---|
| **ADLM Cloud** | A project's **Rates & budget** tab is Rate Gen inside the project. Each unpriced item gets a suggested rate from your own library; click **Use this rate** to apply it, or **Open the line** to choose. A rate can only price a line in the same unit. You can still type a price on a project bill line. See [ADLM Cloud](/guides/cloud). |
| **QUIV for Revit** | QUIV's bill is quantities only until you price it. With a Rate Gen licence, QUIV prices it from your library and you can map a Rate Gen rate onto a line. See [QUIV for Revit](/guides/quiv). |
| **HERON** | **Load rates** prices the bill and the budget from your library for your zone; it then reads **Refresh rates**. You can also search Rate Gen for one row. See [ADLM HERON](/guides/heron). |
| **SERVIQ for Revit MEP** | In the **Rate Build-Up** window, **SEARCH RATEGEN LIBRARY** finds items in your library. See [SERVIQ for Revit MEP](/guides/mep). |

Edited quantities you save in Rate Gen sync to QUIV and HERON. Your Rate Gen carbon figures feed the ICMS 3 cost and carbon export on ADLM Cloud. A client's bill priced in **Price a bill** can be saved to ADLM Cloud as a RateGen project; see [Save a priced bill to ADLM Cloud](#save-a-priced-bill-to-adlm-cloud).

> **Note:** These products pick rates from Rate Gen; they never build or edit them.

## What's new in 3.0

- **The ADLM suite design.** A rail on the left with the Library, every trade, a **SERVICES** group, **Carbon & Others** and **Saved Rates** with a count. The rail folds to icons below 1,100 pixels wide, or with <kbd>Ctrl</kbd>+<kbd>B</kbd>.
- **One layout for every trade.** Find, sort (order in the bill, most expensive, A to Z), and a table you open with a click or <kbd>Enter</kbd>. Quantities are edited in place.
- **The Library, dialogs, splash and sign-in in the same design**, with loading that names the step it is on, and Rate Gen's own icon.
- **Open ADLM Cloud** replaces "To CM App" and opens RateGen on the website.
- **Services in four disciplines:** **Mechanical**, **Electrical**, **Plumbing** and **Fire**. A 35% uplift was being added twice to some cloud services rates, so they come down.
- **Carbon on every priced rate,** with each line's factor and source.
- **Keyboard shortcuts**, the same in every ADLM product.
- **Mortar fixed.** A 225 mm wall carried 0.054 bags of cement per m², about a quarter of real practice. It now takes 0.195 bags per m², and 12 mm render 0.146, so blockwork and render rates go up.
- **Also fixed:** refreshing one trade no longer wipes the others' cached rates.

## Troubleshooting

### "Sign in failed. Please verify your credentials."

Check your email or username and password. If you have forgotten your password, click **Forgot password?** and reset it on the website.

### "No active subscription for 'rategen'."

The account you used does not hold an active Rate Gen subscription. Check the account, or renew Rate Gen at [/manage](/manage).

### "Internet required for first sign-in (no valid offline license found)."

The first sign-in on a PC must be online. Connect and sign in again.

### "Your profile does not have a zone assigned."

Set your **Pricing location (State)** on your profile on the website, then sign out of Rate Gen and sign in again.

### "The library could not be checked" or a step shows FAIL

Check your connection and sync again. If a step keeps failing, send support a screenshot of the box.

### My rates look wrong for my location

1. Look at the location line at the top of the **Library**.
2. If it names the wrong state or zone, change your **Pricing location (State)** on the website.
3. Press <kbd>F5</kbd>, or sign out and in again, and click **Yes** when Rate Gen offers to update your prices.

### A rate looks far too high or too low

It is nearly always one line. Open the rate, find the line, and click its name to open it in the library. Check the price there, then the quantity in the build-up.

### A material or labour line is priced at zero

The name does not match a library item. Pick the name from the list, or add the item to your library.

### A rate has no carbon figure, or low coverage

A line has no published factor or no readable weight, so it is left out rather than guessed. Services fittings, manufactured services items, windows and doors and ceilings have no carbon yet.

### A price I changed was replaced

Use the undo library changes button in the top bar to restore an earlier copy.

### The Export button is missing

That is expected on most days. **Export** appears on the day you first sign in each calendar month, and again 20 days later.

### "Cloud Sync Pending" after saving

You were offline, or the server did not answer. Your edit is saved on the PC and will sync when you are connected.

### A custom rate is missing on a new PC

Update to Rate Gen 3.0, build 3.0.2610.1 or later, and sign in. From build 3.0.2610.1, Rate Gen downloads every custom rate on your account into **Saved Rates**. Older versions did not.

### Build with AI turns my request away

The request must contain the words "rate" and "build". Start with "Build a rate for…".

### I cannot see Price a bill in the rail

**Price a bill** arrived in build 3.0.2610.2. Update Rate Gen through the Installer Hub. If the Hub still offers build 3.0.2610.1, the new build has not reached you yet.

### "No bill items found"

Rate Gen could not find measured items (a description, a unit and a quantity) in the workbook. The message lists any sheets it could not read. Check that the bill has description, unit and quantity columns, and that the file is the bill rather than a summary or a cover sheet.

### "This is an old-format .xls workbook, and Excel is not installed here to convert it."

Open the file on a PC with Excel, save it as .xlsx, and open that copy in **Price a bill**.

### "Your account does not include ADLM AI. Contact ADLM to add it."

Your account cannot use ADLM AI, so no rates are proposed. You can still price each line by choosing a rate. Contact [support](/support) to add ADLM AI.

### "Could not save the priced bill"

The file may be open in Excel. Close it and click **Download Excel** again.

### I cannot change a price or build a rate on the website

That is by design. The website is read-only for rates. Make the change in Rate Gen and sync; the website shows it after the sync.

## Frequently asked questions

### Does Price a bill change the client's file?

No. The priced bill is always saved as a new file, and Rate Gen will not save over the original.

### Do I need the desktop app, or is the website enough?

You need the desktop app to build or change anything: prices, quantities, overhead and profit, and custom rates. The website lets you read your library and every rate's build-up, and pick rates onto your project bills.

### Where is my data kept?

On your PC and on your ADLM account. Updating Rate Gen does not touch it, and signing in on another PC brings it back.

### Does changing a price change my existing projects?

No. A project keeps the rates it was priced with until a line is priced again.

### How accurate is the carbon figure?

It is an estimate from published factors and your own quantities, good for comparing options, not a certified assessment. Check its coverage.

### Does Rate Gen send my drawings or projects anywhere?

No. Rate Gen sends your library edits, custom rates and prices to your own ADLM account. Build with AI sends only your sentence, your zone and the names of items in your library. **Price a bill** sends ADLM AI the bill's descriptions, units and headings with a short list of your rates, never the client's file; **Save to ADLM Cloud** saves the bill's lines to your own account only when you click it.

### How do I get help?

Click **Help** in the rail to email ADLM support, or raise a ticket at [/support](/support). Send the trade, the item number and a screenshot of the build-up.
