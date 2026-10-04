---
id: rategen
title: ADLM Rate Gen
tagline: Build defensible rates from material, labour and plant prices for your location, keep your own library in step with the cloud, and price QUIV, HERON and ADLM Cloud projects from it.
version: "2.9.0"
updated: 2026-10-03
platform: Windows desktop app, plus the RateGen pages on adlmstudio.net
productKeys: [rategen]
pdf: ADLM-RateGen-User-Guide.pdf
order: 6
---

ADLM Rate Gen is ADLM's rate build-up tool for quantity surveyors and estimators. It holds a library of material prices, labour day rates and plant hire rates, priced for the part of Nigeria you work in, and uses them to build up a rate for every item of work: ground works, concrete, blockwork, finishes, roofs, painting, steel, windows and doors, and more. Every rate shows exactly what it is made of, so you can check it, change it and defend it. You can also build rates of your own. Your library lives on your ADLM account, so QUIV, HERON and your ADLM Cloud projects all price from the same rates. Rate Gen comes as a Windows desktop app and as RateGen pages on the ADLM website. This guide covers Rate Gen 2.9.0, the version the Installer Hub installs today, and the website as it is now.

## Before you start

### What you need

| You need | Notes |
|---|---|
| A Windows PC | The Rate Gen desktop app runs on Windows. |
| An ADLM account with a Rate Gen subscription | The same email and password you use on the ADLM website. See [Getting started](/guides/getting-started) to buy one. |
| A pricing location on your profile | Your state decides which regional prices you get. See [Your location and price zones](#your-location-and-price-zones). |
| An internet connection | Needed for your first sign-in and for every sync. Once you have signed in online, you can open Rate Gen and work offline. |
| A web browser (optional) | For the RateGen pages on adlmstudio.net. |

### Installing Rate Gen

Rate Gen is installed from the ADLM Installer Hub, never from a loose download. See [ADLM Installer Hub](/guides/installer-hub) for the Hub itself.

1. Open the Installer Hub and sign in.
2. Find **ADLM RateGen** and click **Install** (or **Update** if you already have an older version).
3. Accept the Windows permission prompt. The Hub needs it to install into the shared programs folder.
4. Wait for the Hub to report that the install has finished.

The Hub installs Rate Gen into `C:\ProgramData\ADLM RateGen` and puts an **ADLM RateGen** shortcut on the desktop.

> **Note:** Updating keeps your data. Your library, your saved rates and your edits are stored in your own Windows profile, not in the program folder, and an update never touches them.

### The order to do things in

You only do steps 1 to 3 once.

1. Set your **Pricing location (State)** on your profile on the ADLM website.
2. Install Rate Gen from the Hub.
3. Open Rate Gen and sign in. Rate Gen loads the prices for your location.
4. Open a work section, check the rates, and change any build-up that does not match how you work.
5. Build custom rates for anything the library does not cover.
6. Price your projects in HERON or ADLM Cloud from the same library.

## Signing in

1. Open **ADLM RateGen** from the desktop shortcut.
2. Type your email or username in **Email or username**.
3. Type your password in **Password**.
4. Click **Log in**, or press <kbd>Enter</kbd> in either box.

Rate Gen checks your subscription, then loads the latest prices for your location. You will see **Sign in successful!** If your profile's location is different from the one Rate Gen last used, it asks **Update your RateGen prices to this zone now?** Click **Yes** to load that location's prices.

The sign-in screen has two links:

- **Forgot password?** opens the ADLM website, where you can reset your password. There is no password reset inside Rate Gen.
- **Create account** opens the sign-up page on the ADLM website.

### Working offline

After one successful online sign-in on a PC, Rate Gen can sign you in without the internet. You will see **Signed in (offline) via cached license.** Everything you have on the PC works offline. Syncing, loading new prices and sending your edits to the cloud wait until you are back online.

### Signing out

Click **Log out** at the bottom of the sidebar. Before it signs you out, Rate Gen sends any edits it has not yet synced to the cloud. You do not need to sign out at the end of each day. Just close the window.

## A tour of the Rate Gen window

### The sidebar

The sidebar on the left takes you around the app. Click the button at the top to fold it to icons and back, or drag its edge to resize it.

| Entry | What it opens |
|---|---|
| **Library** | Your material and labour library, with plant in the labour list. See [The material and labour libraries](#the-material-and-labour-libraries). |
| *Item of works* | A heading over the work sections below. Each section is a list of built-up rates. |
| **Ground** | Ground works: excavation, filling, hardcore and similar. |
| **Concrete** | Concrete works. |
| **Block Works** | Blockwork and walling. |
| **Finishes** | Floor, wall and ceiling finishes. |
| **Roofs** | Roof coverings and roof carpentry. |
| **Painting** | Painting and decoration. |
| **Steel** | Structural steelwork. |
| **Window and Door** | Windows, doors and ironmongery. |
| **Saved Rates** | The custom rates you have built. See [Custom rates](#custom-rates). |
| **Carbon & Others** | Further rates, including mechanical, electrical and plumbing items, HVAC and fire protection. These reach you from ADLM Cloud on your next sync, without an app update. |
| **Export** | Exports every section and your saved rates to Excel. See [Exporting your rates](#exporting-your-rates). |
| **Help** | Opens an email to ADLM support with your account email filled in. |
| **Log out** | Signs you out. |

### The header

| Control | What it does |
|---|---|
| **Search here...** | Searches across every section, including the mechanical, electrical and plumbing build-ups. Type part of a rate's name and pick a result to open it. |
| Currency | Shows prices in NGN, USD, EUR, QAR, GHS or ZAR. This changes how prices are shown only. Your library is held in naira. |
| **Sync from Cloud** | Fetches the latest rates and prices for your location and sends your edits up. See [Syncing with the cloud](#syncing-with-the-cloud). |
| Banner arrow | Folds the welcome banner away so the rate tables get more room. Rate Gen remembers your choice. |
| Light or dark | Switches between the light and dark theme. |
| Reset all rate edits | Puts every build-up you have edited, in every section, back to the shipped quantities. |
| Undo library changes | Restores an earlier copy of your material and labour libraries. See [Undoing library changes](#undoing-library-changes). |
| Bell | Notifications: sync results, new published prices and updates from ADLM. |
| Profile | Opens your ADLM profile on the website, where you set your pricing location. |

## Your location and price zones

Materials and labour cost different amounts in different parts of the country, so Rate Gen prices your library for your location.

- **You choose a state.** Your profile on the ADLM website asks for your **Pricing location (State)**: any of the 36 states or the FCT. See "Your profile and WhatsApp number" in [Getting started](/guides/getting-started).
- **Prices come from the zone your state is in.** ADLM prices six geopolitical zones: South West, South East, South South, North Central, North East and North West. Kano and Katsina read the same today because both are North West. When ADLM has evidence for a single state, that state can be priced on its own without you doing anything.
- **There is one place to set it.** Rate Gen has no location picker of its own. You change your state on the website, and Rate Gen picks it up the next time you sign in or sync.

The library tells you where its prices came from, for example **Lagos: priced from south west rates. Set this on your ADLM profile.**

> **Tip:** If your rates look wrong for where you are, check the location line at the top of the library first. Then check the state on your profile.

## The material and labour libraries

Click **Library** in the sidebar. The library has two tabs, **Material** and **Labour**. Every rate in every section is priced from these two lists, so a price you change here flows into every rate that uses it.

### Material

The **Material** tab lists every material with its **Material Name**, **Material Unit**, **Price** and **Category**. Items with a size are sorted by size, so 12mm comes before 100mm.

### Labour and plant

The **Labour** tab lists trades and plant together, with **Labour Item**, **Labour Unit**, **Price** and **Category**. Labour is priced as a day rate. Plant (excavators, dozers, rollers, mixers, generators, cranes and so on) is in the same list, filed under its own categories such as earthmoving, compaction, lifting, haulage and power generation. There are 24 categories in all, so the **Category** filter narrows the list properly.

Open any labour or plant item to see a **Specification & expected output** panel. It says what the item is, what it typically produces in a day or an hour, what that output assumes, and what it burns in fuel or who staffs it. Outputs are given as ranges because soil, haul distance and gang size move them a long way.

> **Note:** The expected output is a sense check on your rate, not a guarantee. It does not feed any calculation.

### Finding an item

- Type in the search box above the table.
- Pick a **Category** to narrow the list.
- Click **Sort by** to change the order, or click a column heading.

### Changing a price

1. Find the item and click its **Edit** button.
2. Type your price.
3. Click **Update Library**.

Every rate that uses the item is priced again straight away. Your price stays yours: a sync or a sign-in never overwrites it.

### Adding an item

1. On the **Material** tab click **Add Material +**, or on the **Labour** tab click **Add Labour +**.
2. Fill in the name, unit, price and category.
3. For labour and plant you can also write a **Specification / notes (optional)**: what the item is and what it produces in a day. Your note shows beside the rate on the website too.
4. Click **Save to Database**.

To remove an item you added, click its **Delete** button. Only items you added can be deleted. Items that came with the library cannot be removed, but you can change their price.

### Fetching the latest prices

**Update Prices** fetches the latest published prices for your location. Prices you have set yourself are kept.

### When ADLM publishes a new price for something you changed

If ADLM publishes a new price for an item you have priced yourself, your price stays in use and a review card appears above the library. Each row shows the **Item**, **Unit**, **Your price**, the **Published** price and the **Change** between them.

1. Tick the rows you want to decide on, or use the box in the header to tick them all.
2. Click **Keep mine** to keep your figures and stop being asked about those rows, or **Use published** to take the published price.
3. Rows you leave unticked stay pending, and the card stays up with what is left.

Closing the card hides it without deciding. Reopen it from the bell: the notification has a **Review** button. If ADLM has not changed the price of an item you edited, you are never asked.

### Undoing library changes

Rate Gen copies your material and labour libraries before anything rewrites them: a sign-in, a sync, a change of location, or taking published prices. It keeps the last 20 copies.

1. Click the undo library changes button in the header.
2. Under **Restore an earlier library**, pick the point to go back to.
3. Click **Restore** and confirm.

Your current library is copied first, so a restore can itself be undone.

## Rates by section

Each work section (**Ground**, **Concrete**, **Block Works** and the rest) is a table of built-up rates:

| Column | Meaning |
|---|---|
| **S/N** | The item number. |
| **Description** | The item of work. Click it to open the build-up. |
| **Unit** | The unit the rate is for, such as m², m³ or nr. |
| **Net Cost** | Materials, labour and plant for one unit. |
| **Overhead** | The overhead added to the net cost. |
| **Profit** | The profit added to the net cost. |
| **Total Cost** | The rate: net cost plus overhead plus profit. |

Above the table:

- **Search description…** filters the rows.
- **Filter** orders the rows by net cost.
- **Sort by** cycles between the original order, overhead and total cost.
- **Overhead** and **Profit** boxes set the percentages for the whole section. See [Overheads and profit](#overheads-and-profit).
- **Add Custom Rate +** opens the custom rate form. See [Custom rates](#custom-rates).

Every rate is priced from your library, so when you change a price in the library the rates follow.

> **Note:** The mechanical, electrical and plumbing rates say whether a library item is `(supply)` or `(installed)`. A supply price is the material only, so allow for fixing. An installed price already includes fixing, so do not add a labour line on top.

## Reading and changing a build-up

Click a rate's **Description** to open its **Rate Composition**. Each line is a component: a material, a labour gang or an item of plant.

| Column | Meaning |
|---|---|
| **Component** | What the line is. Click a component's name to open it in the library, ready to check or change its price. |
| **Quantity** | How much of it one unit of work uses. |
| **Unit** | The component's unit. |
| **Unit Price** | Its price from your library. |
| **Total Cost** | Quantity times unit price. |

Totals, sub-totals and waste allowances are arithmetic, not library items, so they are not links.

### Changing quantities

When a rate is wrong for how you work, it is usually one quantity: a different mix, a different spacing, a different gang output.

1. Double-click a **Quantity** cell and type the new figure.
2. Click away from the cell. Sub-totals refresh straight away.
3. Click **Save**. You will see **Rate saved successfully. Your edits will sync to QUIV and HERON.**

The other buttons:

- **Cancel** throws away edits you have not saved and closes the build-up.
- **Reset This Rate** puts that item's quantities back to the shipped defaults, and sends the reset to the cloud.

To reset every edited rate in every section at once, click the reset all rate edits button in the header. It asks first, and it cannot be undone.

> **Important:** Change prices in the library, and quantities in the build-up. A price lives in one place and is shared by every rate that uses it. A quantity belongs to one rate.

If you are offline when you save, you will see **Cloud Sync Pending**. Your edit is saved on the PC and goes to the cloud the next time you are connected.

## Overheads and profit

A rate is built in two steps:

**Net cost = materials + labour + plant**

**Rate = net cost + overhead + profit**

Overhead and profit are each a percentage of the net cost.

- **In a work section,** the **Overhead** and **Profit** boxes above the table set the percentages for every rate in that section. They start at 10% overhead and 25% profit. Type new figures and every row is worked out again.
- **In a custom rate,** you set the percentages for that rate alone. They start at 10% and 10%.
- **On the website,** a custom rate where you leave the boxes empty uses 10% and 10%.

> **Tip:** Set overhead and profit to match how your firm prices before you rely on the section totals.

## Custom rates

A custom rate is a rate you build yourself, for an item the library does not cover or one you price your own way. Custom rates are saved to your account, and HERON and ADLM Cloud price from them like any other rate.

### Building a custom rate in the desktop app

1. Click **Add Custom Rate +** in any section. The **Build New Custom Rate** form opens.
2. Type the **Name of Rate**.
3. Set **Overhead** and **Profit** as percentages of the material and labour total.
4. Type a **Description**: the measured description a client reads.
5. Under **Materials**, click **Add Material**. Type or pick a **Name of Material**. A name that is in your library fills in its **Rate** and **Unit**. Type the **Quantity** one unit of work uses.
6. Under **Labour**, click **Add Labour** and do the same. Plant is in the labour library, so add plant here too.
7. Check the totals at the foot of the form: **Material Total**, **Labour Total**, **Overall Total**, the overhead and profit, and the **Grand Total**.
8. Click **Save**.

You will see **New Rate Saved**. If you typed a priced material or labour line that is not in your library yet, Rate Gen adds it, and the message says how many items were added to your library. It never overwrites a price you already have.

### Saved Rates

Click **Saved Rates** in the sidebar to see every custom rate, with its **Title**, **Description**, **Overhead (%)**, **Profit (%)**, **Grand Total** and **Created Date**.

- Click a rate's title to open it and change it, then click **Save**.
- Select a rate and click **Delete Selected Rate** to remove it.
- Use **Search description…**, **Filter** and **Sort by** to find a rate.

Custom rates are priced from your library, so they follow when you change a library price.

### Building a custom rate on the website

You can also build a custom rate on the RateGen library page (`/work/library`). Click **Build a custom rate**, then:

1. Type the **Name of rate** and its **Unit**, and pick a **Trade** if you want it filed under one.
2. Set overhead and profit, or leave them empty to use 10% and 10%.
3. Type the **Description**.
4. Add lines under **Materials** (quantity per unit), **Labour** (gang days per unit) and **Plant** (hours per unit). Materials and labour are picked from your library. A plant line takes the machine's name and your own price per hour.
5. Check the total strip, then click **Save rate**.

After saving, click **Open the build-up** to see the rate laid out line by line.

> **Important:** Build each custom rate in one place. The desktop app keeps the cloud copy of your custom rates in step with its own **Saved Rates** list, and it does not download rates built elsewhere. So if you use the desktop app, build your custom rates there. A rate built on the website, or on another PC, can be removed from your account the next time the desktop app syncs.

### Plant lines on a rate

A plant line added to a custom rate on the website is kept when Rate Gen desktop syncs that rate, and the rate keeps its full value. The desktop app does not show a separate plant group, but it does not remove the line.

## Exporting your rates

Click **Export** in the sidebar to save your rates as an Excel workbook.

1. Click **Export**.
2. Choose where to save the file. It is named `ADLM_Rates_` followed by the date and time.
3. Click **Save**. You will see **Export completed.**

The workbook has one sheet per section (**Ground**, **Concrete**, **Block Works**, **Finishes**, **Roofs**, **Painting**, **Steel**, **Window & Door**, **Carbon & Others**) and a **Saved Rates** sheet.

> **Note:** The **Export** button is not always in the sidebar. It appears on the day you first sign in each calendar month, and again 20 days later.

## Syncing with the cloud

Your library is kept on your ADLM account as well as on your PC. That is what lets QUIV, HERON and ADLM Cloud price from the same rates as Rate Gen.

### What happens when you sync

Rate Gen syncs on its own when you sign in. Click **Sync from Cloud** in the header to sync at any time. A sync:

1. Fetches the rate library ADLM publishes for every section.
2. Fetches the rates that are calculated on ADLM Cloud, including **Carbon & Others**.
3. Fetches the master material and labour prices for your location, keeping every price you set yourself.
4. Sends your edited build-ups and your custom rates up to your account.

When you click **Sync from Cloud** yourself, a box lists each step and its result, for example **Rates: OK**, **Compute: OK** and **Master prices (south_west): OK** with the number of materials and labour items. If a step fails, the box says why.

### What goes where

| You change it in | It reaches |
|---|---|
| The desktop library (a price) | Every rate on that PC straight away. |
| A build-up in a desktop section (a quantity) | Your account on **Save**, then HERON and ADLM Cloud. |
| A desktop custom rate | Your account on the next sync, then HERON and ADLM Cloud. |
| A price on the website (`/rategen`) | Rate Gen, QUIV and HERON from your next sign-in. |
| Your state on your profile | Rate Gen on your next sign-in or sync. |

> **Note:** A project you have already priced keeps the rates it was priced with. A change in your library reaches a project only when that line is priced again, or when the project is set to follow Rate Gen changes. See [Using your rates in projects](#using-your-rates-in-projects).

## The RateGen pages on the website

The ADLM website has two RateGen pages. Both need you to be signed in with an account that holds Rate Gen.

### The RateGen cloud dashboard (`/rategen`)

This is where you set your own prices on the web, and see everything your account holds. **RateGen** in the left-hand menu brings you here.

The cards at the top show your **Pricing Location**, the size of **My Library**, **My Rates** (overrides and custom saved rates), the **Master Catalog**, and when the page was **Last Loaded**. Click **Refresh now** to reload, or tick **Auto refresh** to keep the page current.

The tabs:

| Tab | What it shows |
|---|---|
| **Master Materials** | The published material prices for your location. |
| **Master Labour** | The published labour and plant rates for your location. |
| **My Materials** | Materials you added in Rate Gen desktop. |
| **My Labour** | Labour and plant items you added in Rate Gen desktop. |
| **My Custom Rates** | Your custom rates, with their totals. |
| **Effective Rates** | The rates your other ADLM software reads, with a **Source** of `master` (published), `user-override` (a published rate you edited) or `user-custom` (your own). |

Type in **Search this view...** to filter any tab.

#### Setting your own price on the web

1. Open **Master Materials** or **Master Labour**.
2. Click a price.
3. Type what you actually pay and press <kbd>Enter</kbd>. Press <kbd>Esc</kbd> to cancel.

Your price is marked as yours. Click **reset** beside it to go back to the published price. Your price applies to the state on your profile only, so a correction you make for Kano does not follow you to a job in Lagos. If you have no state set, it applies everywhere.

### The RateGen library page (`/work/library`)

This page shows your whole library in one list: published rates, your edited copies and your own rates side by side. Open it from **Open RateGen** on your Overview, or go to `/work/library`.

- The tabs are **Item of works**, **Materials**, **Labour** and **Plant**.
- Use the search box to find a rate, material, gang or description, then narrow with **Trade** (or **Category**) and **Sort by**.
- On **Item of works**, each rate shows its **Net cost**, **Overhead**, **Profit** and **Total**. Your own rates are marked **yours**, and published rates you have edited are marked **yours · edited**.
- On **Materials** and **Labour**, **Used in** tells you how many rates use each item. Prices you have set are marked **your price**.
- On **Plant**, each machine is read from the rates that use it, with its price and how many rates use it.

Click a rate to see its **Rate composition**: each line with its quantity and price, the net cost, the overhead and profit, and the rate per unit. Click **Open the build-up** to open the full rate page.

#### Changing many material prices at once

Market prices move. To move a whole category by a percentage:

1. Open the **Materials** tab and click **Update prices**.
2. Pick a **Category**, or **All materials**.
3. Type the percentage to **Change by**. Use a negative figure to reduce.
4. Click **Apply**.

A message says how many prices changed. Click **Undo** in that message to put them back. These are your own prices, not the published ones. Rates already built keep the cost they were built at until they are priced again.

**Edit the library** at the top takes you to the cloud dashboard (`/rategen`).

### A rate's build-up page

The build-up page lays one rate out in full: its materials, labour and plant as separate groups, each line with its quantity, unit price and amount, and the date each price was taken. Below the lines are the **Net cost**, **Overhead**, **Profit** and the **Rate**. The side panel, **What this rate is**, gives the item number, section, unit, the location it is priced for, and the total of any plant.

If a rate's stored net cost is more than its lines add up to, the difference is shown as **Not itemised**. It is part of the rate and is never dropped.

This page reads a rate. It does not change it. Quantities, overhead and profit are changed in the desktop app. The page has an **Open in Rate Gen** button, but Rate Gen 2.9.0 does not answer it yet. Open Rate Gen yourself and type the rate's name in **Search here...**.

### RateGen Updates (`/rategen/updates`)

Click **Updates** on the cloud dashboard to see rates ADLM has recently added. Search, filter by **Section** and sort by date or amount. Open an update to see its amounts, then click **Copy rate name**, open Rate Gen desktop, click **Sync from Cloud**, and search for the name. **Mark all as read** clears the count.

## Using your rates in projects

Your Rate Gen library is one library for your account. The other ADLM products read it directly, so there is nothing to export or import.

### In ADLM Cloud projects

In a project's **Bill of Quantity**, click a line's **Rate** cell and type part of a rate's name. Pick a rate from your library and it goes on the line.

Picking a Rate Gen rate also writes the line's build-up into the **Budget**: the materials at your library prices, one labour row and one plant row, with overhead and profit set so the budget reproduces the rate you picked. It replaces any budget rows ADLM had generated for that line, so nothing is counted twice. If the rate has no build-up, the rate still goes on the line and a message tells you the budget could not be priced.

A rate can only price a line measured in the same unit. A rate per m³ is shown but cannot be picked for a line in m².

The bill's **Rates** tab also has **Load RateGen rates**, **Sync rates**, **Auto-sync rates** and **Follow RateGen changes**. See [ADLM Cloud](/guides/cloud) for the full bill and budget.

> **Tip:** Turn **Follow RateGen changes** off before a bill goes out, so later changes in your library do not move the prices you issued.

### In QUIV

QUIV measures your Revit model and saves the quantities to ADLM Cloud. You price the bill there, from your Rate Gen library, as above. See [QUIV for Revit](/guides/quiv).

### In HERON

HERON prices your PlanSwift takeoff straight from your Rate Gen library:

- In **Quantity Take Off**, click **Load rates** to price the bill, or use **Search Rate:** to apply a rate to one row.
- In the **Budget**, click **Load rates** to price materials and labour, or type a name in a **Price** cell to search Rate Gen.

**Load rates** and **Search Rate:** appear only when your account holds Rate Gen. See [ADLM HERON](/guides/heron).

### Material and Services Constants

Rates say what work costs. The constants say what it takes: how many bags of cement go into a cubic metre of concrete, the waste allowances, formwork re-use, and the labour and plant outputs. They turn a bill into a material and labour schedule in HERON, QUIV and ADLM Cloud.

- **Material Constants** (`/rategen/material-constants`): search for a constant, change its value, and click **Save changes**. The **ADLM default** column shows the starting figure, and **Reset** puts it back.
- **Services Constants** (`/rategen/services-constants`): your standard lengths, joints and fitting uplift for pricing MEP services.

See "Material and Services Constants" in the [ADLM Cloud](/guides/cloud) guide.

## What's new in 2.9.0

**Rate Gen 2.9.0**

- **What an item is, and what it produces.** Every labour and plant item has a specification and expected output panel, given as a range with the assumptions written beside it.
- **Your own notes on items you add.** Labour and plant you add can carry a specification of your own, and it shows on the website.
- **24 labour and plant categories** instead of 3, and the library sorts by size rather than by spelling.
- **Published prices one row at a time.** The review card shows your price, the published price and the change, and you decide row by row.
- **Sync moved to the header**, and tells you why a step failed.
- **More room for the rate tables.** Fold the welcome banner away from the header, and the last row of every table is no longer cut in half.
- **Screenshots carry the ADLM mark**, applied to the captured image, never to your screen.
- **Fixes:** sync failing on duplicated library rows, the library naming the wrong location, text hidden in dark mode, and misspelled plant names.

**On the website**

- **Plant on a rate.** Custom rates built on the website can carry plant lines, and a desktop sync keeps them.
- **A Plant row in the Budget.** Plant from a Rate Gen rate is costed as plant, not counted as profit.
- **A picked rate prices the whole line.** Picking a Rate Gen rate on a bill writes the line's materials, labour and plant into the Budget, and replaces the budget rows it generated before instead of adding to them.

## Troubleshooting

### "Sign in failed. Please verify your credentials."

Check your email or username and password. If you have forgotten your password, click **Forgot password?** and reset it on the website, then sign in with the new one.

### "No active subscription for 'rategen'."

The account you signed in with does not hold an active Rate Gen subscription. Check you used the right account, or renew Rate Gen from your account on the ADLM website. See "Buying a product or subscription" in [Getting started](/guides/getting-started).

### "Internet required for first sign-in (no valid offline license found)."

The first sign-in on a PC must be online. Connect to the internet and sign in again.

### "Your profile does not have a zone assigned."

You have not set a pricing location. Set your **Pricing location (State)** on your profile on the ADLM website, then sign out of Rate Gen and sign in again.

### "Signed in, but zone sync failed"

You are signed in, but the prices for your location could not be loaded. Check your connection, then click **Sync from Cloud**.

### Sync says "Please sign in again."

Your session has expired. Click **Log out**, then sign in again and sync.

### A sync step shows FAIL

The box names the step and the reason. Check your connection and try **Sync from Cloud** again. If the same step keeps failing, send ADLM support a screenshot of the box.

### My rates look wrong for my location

1. Look at the location line at the top of the **Library**.
2. If it names the wrong state or zone, change your **Pricing location (State)** on your profile on the website.
3. Click **Sync from Cloud**, or sign out and in again, and click **Yes** when Rate Gen offers to update your prices.

### A rate looks far too high or too low

It is nearly always one line. Open the rate, find the line that looks wrong, and click its component name to open it in the library. Check the price there, then check the quantity in the build-up.

### A material or labour line is priced at zero

The name on the line does not match any item in your library, so it has no price. In a custom rate, pick the name from the list rather than typing it, or add the item to your library with a price.

### A price I changed was replaced

Rate Gen keeps prices you set yourself through every sync and sign-in. If ADLM publishes a new price for that item, your price stays in use and the review card asks you to decide. If a price was replaced by mistake, use the undo library changes button in the header to restore an earlier copy.

### The Export button is missing

That is expected on most days. **Export** appears on the day you first sign in each calendar month, and again 20 days later.

### "Cloud Sync Pending" after saving a build-up

You were offline, or the server did not answer. Your edit is saved on the PC and will sync the next time you are connected. Click **Sync from Cloud** once you are back online.

### A custom rate I built on the website has gone

Rate Gen desktop keeps your account's custom rates in step with its own **Saved Rates** list, and does not download rates built elsewhere. Build the rate again in the desktop app, so it is in **Saved Rates** and stays on your account.

### Open in Rate Gen does nothing

Rate Gen 2.9.0 does not answer that button yet. Open Rate Gen yourself and type the rate's name in **Search here...**.

### A rate cannot be picked on a bill line

The rate's unit is different from the line's unit. Pick a rate in the same unit, or build a custom rate in that unit.

## Frequently asked questions

### Do I need the desktop app, or is the website enough?

The desktop app is where rates are built and changed: build-up quantities, overhead and profit, custom rates and your library. The website lets you set your own prices, change material prices by category, build custom rates, and see every rate and its build-up. Most users work in the desktop app and use the website to look things up.

### Where is my data kept?

Your library, edits and saved rates are kept on your PC, in your Windows profile, and on your ADLM account. Reinstalling or updating Rate Gen does not touch them. Signing in on another PC brings back your edited build-ups and prices from your account.

### Does changing a price change my existing projects?

No. A project keeps the rates it was priced with. A change reaches a project only when a line is priced again, or when the project has **Follow RateGen changes** turned on.

### Does my price change affect other users?

No. Prices, build-ups and custom rates you change are yours. The published master prices are changed only by ADLM.

### Can I use rates for a different state?

Rate Gen prices for the state on your profile. To price a job elsewhere, change your **Pricing location (State)** on the website and sync. Prices you set on the website apply to the state they were set for.

### Why does my rate total differ from the line totals?

Overhead and profit are added to the net cost, and some published rates include an amount that is not itemised. On the website that amount is shown as **Not itemised**.

### Can I see what an item of plant should produce?

Yes. Open the item in the **Labour** tab of the library and read the **Specification & expected output** panel.

### Does Rate Gen send my drawings or projects anywhere?

No. Rate Gen sends your library edits, custom rates and prices to your own ADLM account, so your other ADLM products can use them.

### How do I get help?

Click **Help** in the Rate Gen sidebar to email ADLM support, or raise a ticket at [/support](/support). Tell us the section and item number, what you expected the rate to be, and the exact wording of any message. A screenshot of the rate's build-up answers most questions at once.
