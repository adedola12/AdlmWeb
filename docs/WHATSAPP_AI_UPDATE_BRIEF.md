# ADLM WhatsApp AI — Update Brief

**Version:** 2026.08 · **Prepared:** 11 August 2026 · **Covers:** everything shipped up to and including HERON 2.9.2 (9 Aug 2026), RateGen 2.8.0 and Time Pro 1.1.1 (Aug 2026).

This is the knowledge pack the **ADLM WhatsApp AI** answers from. It carries what changed on the website and in the products, the live price list, and — for every "can I see it work?" question — a specific video on the ADLM YouTube channel or a page in the website's Learn section to send instead of booking a call.

**Sources of truth.** Product releases: `client/src/data/changelogs/*.md`, published at `adlmstudio.net/whats-new`. Prices and catalogue: the live API (`/products`, `/learn/courses`). Demo videos: the Learn library (`/learn`, `/learn/free/:id`). If this brief and those disagree, they win — say so and check.

---

## 1. How the WhatsApp AI should use this

1. **Ground every answer here.** Never invent a feature, a price, a date, a discount or a release. If it is not in this brief or on the site, say you will check with the team.
2. **Prices are per seat.** Nigerian contacts are quoted in ₦, everyone else in $. Organisation licences start at **two seats — except RateGen, which can be bought for one**.
3. **Send a video before offering a call.** Most "how does it work" questions are answered by a video below. A live demo is the fallback, not the opener.
4. **Never ask for a password or card details on WhatsApp.** Checkout happens on the site.
5. **CIVIQ is not purchasable.** It is in development. Take the contact's details and log the interest.
6. Keep messages short. WhatsApp is a conversation, not a brochure — one idea, one link, one next step.
7. **Hand off to a human** (Adedolapo / admin@adlmstudio.net / WhatsApp **+234 810 650 3524**) whenever someone asks for a person, a quotation, a proposal, or a firm-wide rollout.

---

## 2. The headline: what to lead with in August 2026

If someone asks "what's new at ADLM?", these are the things worth saying, in this order.

0. **If they have priced lighting since the start of August, tell them before anything else.** The MEP light fittings shipped in 2.7.0 were priced at up to **48 times** what the fitting costs — a 12W LED ceiling fitting that sells for about ₦3,500 was in the library at ₦169,000. 2.8.0 rebuilds every installed light fitting from the supply price plus fixings plus electrician time. **Any job priced with lighting between 2.7.0 and now was priced too high and the bill needs revisiting.** This is not a "by the way" — raise it unprompted with anyone who does electrical work. See §8 for how to say it.
1. **RateGen has had its first full price refresh since launch, and it now prices by state.** Cement moved ₦4,300 → ₦11,500 a bag, reinforcement ₦350,000 → ₦1,700,000 a tonne. A new MEP tab computes 35 build-ups, structural steel is priced for the first time, and roof carpentry finally prices the timber under the sheets. Your profile now takes a **state** (all 36 + FCT) rather than a geopolitical zone.
2. **Your edited prices are now safe.** Until 2.8.0, a price you corrected on a shipped row was wiped every time you signed in. That is fixed, the whole library has **Undo** (last 20 restore points), and when ADLM publishes a new price for a row you edited, you choose which one wins.
3. **AI is now in the products, not just on the website.** QUIV has an AI Assistant that measures from a plain-English request and an AI Match Labour button. RateGen drafts build-ups with **Build with AI**, priced from *your* library. On the website, **Ada** answers about the catalogue and — signed in — about your own projects, budgets and subscription.
4. **The web platform grew up.** Card payments, auto-renewing subscriptions, downloadable receipts, PDF project/PM/management reports, a full project activity log, and Excel BoQ import for QUIV.

---

## 3. Product-by-product updates

### 3.1 RateGen — 2.8.0, August 2026
*Rate build-ups and market pricing. 500+ materials, 200+ labour items.*

**Fixed — the lighting recall comes first**
- **The MEP light fittings in 2.7.0 were priced at up to 48× what the fitting costs.** The lighting rates came from a priced bill whose electrical section was billed far above the cost of the goods, and they were published without being checked against what the fittings actually sell for. A 12W LED ceiling fitting selling for about ₦3,500 sat in the library at ₦169,000; a 7W LED spot selling for ₦2,500 was at ₦110,000. Every installed light fitting is rebuilt as supply price + 10% for flex, connectors and fixings + electrician and mate time, using the labour rates already in the user's library. A complete lighting point with a 600 × 600mm LED panel and switch was ₦111,900 and is now ₦75,900. **Anyone who priced lighting between 2.7.0 and now needs to revisit that bill.**
- **Point wiring has been rebuilt from its components too** — this one was closer to right than it looked. There is no supply price to check point wiring against, so it was built from 20mm PVC conduit and single-core copper at current supplier prices plus electrician, mate and labourer at the library's own day rates. The lighting point came out at ₦30,500 against ₦35,000, the socket point at ₦35,000 against ₦47,500. The whole electrical section now rests on one set of evidence.
- **Four materials were priced at zero, and a roofing sheet had been corrupted.** A material at zero doesn't fail loudly — it quietly under-prices every rate that uses it, and the rate still looks like a rate. Someone editing "0.55mm (24SWG) sheet, coloured" typed an extra letter into the name and lost the price, so the correctly named row read zero while the real price sat under the typo. Recovered. Bitumen 60/70 and two Peacock paints are now priced from their nearest neighbour in the same category, marked as estimates rather than quotations.
- Prices you edited were wiped on every sign-in. The library was being rebuilt from published prices plus your own added rows — an edit to a shipped row was in neither, so it was overwritten silently with no way back. Fixed. *(This also means 2.7.0's claim that "your own prices survive the update" was only true of the installer, not of signing in. Own that if it comes up.)*
- An empty or failed price response could empty the library. It now leaves the library alone and reports the failure.

**New**
- **Undo for the whole library** — 20 restore points, taken before any sign-in, price sync or location change. Restoring takes a copy first, so an undo can be undone.
- **You decide on conflicts** — when ADLM publishes a new price for a row you edited, your figure stays and a note shows what changed and by how much. Keep yours or take the published one, one click. No nagging if nothing changed.
- **Price by state** — all 36 states and the FCT. It is set in **one place only, the profile on the website**, and RateGen picks it up on the next sign-in. There is deliberately no second picker in the app: two places to set the same thing means two answers that can disagree with nothing on screen to say which won. Be honest about the limit: **prices are evidenced at zone level today**, so Kano and Katsina read the same because both are North West. What it buys you is that a state can be priced on its own the moment there is evidence, with nothing to do on your side.
- **Set your own prices, on the website, for your location.** On the RateGen page, click any price in Master Materials or Master Labour and type what you actually pay. Your figure is used by RateGen, QUIV and HERON from your next sign-in, and reset puts the published price back. It applies to the state on your profile, so a correction made for Kano does not follow you to a job in Lagos.
- **Open a rate's components straight from its breakdown.** When a rate looks wrong it is nearly always one line that is wrong, and finding it meant hunting through 600 rows. Click a component name in any breakdown and the library opens filtered to it, ready to edit. Totals, sub-totals and "add for waste" rows are arithmetic rather than library items, so those stay plain text.

**From 2.7.0 — the price refresh (still the biggest talking point)**
- Calibrated against 3 recently priced BoQs from 2 independent QS firms — 494 checked lines covering ₦5.31bn of work — with primary commodities set from current market prices rather than the bills.
- **MEP:** 98 new library items and a **MEP Works** tab computing 35 build-ups (lighting, power points, cable runs 4–70mm² incl. armoured and fibre, sanitary fixtures, split units, detectors). Pipework, valves, storage and pumps are supply-only for now. Every category is marked `(supply)` or `(installed)` — do not add fixing labour on top of an installed rate.
- **Plumbers and electricians added to the labour library** (it had 15 trades and not one of them).
- **Roof carpentry:** 6 build-ups — wall plate, rafters at 600mm, purlins at 900mm, noggings, fascia, and a complete roof carpentry rate. Spacing is editable, so the timber quantity follows.
- **Structural steelwork:** 9 new items, each per tonne *and* per kg (UB, UC, angle, channel, plate, 6mm fillet weld). Universal sections come out around ₦2,956,000/tonne. Previously the library carried one steel row at ₦150,000/tonne — a ninth of cost.
- **26 rates in Carbon & Others read from ADLM Cloud, not the app** — 16 MEP plus 10 HVAC/fire (split AC 1HP & 2HP incl. the 20A isolator and electrician time, extractor and ceiling fans, smoke/heat detector, sounder, 8-zone panel, extinguisher, hydrant with hose reel). These arrive on your next sign-in **whether or not you update**.
- **Confidence is now stated:** 197 items are backed by evidence in those bills or observed market prices; 438 (mostly paints, ceilings, aluminium, glazing, timber) moved on a documented index — a better starting point, not a quotation.
- Fixed: category filter returned nothing (broken since July), column sorting did nothing, door ironmongery costed zero, mixing labour charged ~8× (concrete rates drop), fuel priced off a labourer's day rate instead of diesel (now ₦1,215/litre), granite and hardcore measured in tonnes but costed per m³, softwood and hardwood collapsed into one grade.
- Earlier in the cycle: **Build with AI** on the Custom Rate form; **master price library sync** so RateGen, QUIV, HERON and ADLM MEP price from one source; your custom rates now feed your own library automatically; organisations can buy RateGen for a single seat.

### 3.2 QUIV for Revit — 3.1.7, 31 July 2026
*Model-based takeoff, priced budgets, dockable inside Revit. Revit 2024, 2026 & 2027.*

- **QUIV AI Assistant** — "generate the entire beam and slab quantity for the first floor" maps to the right module and real level name and measures with the same engines you use by hand. It never invents a quantity: every result reports element count, level, type and key quantities, and highlights and zooms the measured elements in your view.
- **AI Match Labour** — sends every labour row still at zero for matching against your real labour library and the labour portion of your rate build-ups. Only genuine library rates are applied; anything uncertain is offered as a suggestion, not applied silently.
- **Budgets that balance to your rate** — RateGen rates decompose into named materials plus an "Other Materials" balancing line plus labour, so the build-up adds back to the rate you priced. A rate cap stops the components implying a higher rate.
- **Finishes factor & labour-rate library** — a full constants library from a reference QS schedule (rendering, POP, tiling, screed, emulsion, soil poisoning, filling density, roof sheeting) plus labour rates per bill unit. Every constant is editable.
- **QS-format Excel export** — Revit names become an SMM-style preamble plus a terse measured description, each trade group gets an unpriced italic preamble row, and a **General Summary** sheet totals to Estimated Construction Cost with editable Preliminaries, Contingency and VAT.
- Fixed: DEVICE_MISMATCH sign-in lockouts (device identity is now network-independent, licences migrate themselves); the Budget price refresh no longer wipes rates.

### 3.3 HERON for PlanSwift — 2.9.2, 9 August 2026
*2D takeoff → automatic material + labour budget → linked Excel BoQ. PlanSwift 10+.*

- **The Excel Takeoff Link now actually appears.** The add-in was installed with HERON all along, but the registration step was missing from the package, so Excel never loaded it. Reinstalling 2.9.1 did not help — **updating to 2.9.2 is the fix.** You can also re-run it yourself: `C:\ProgramData\Planswift Plugin\Register-ExcelAddin.cmd`.
- **Sign-in restored (2.9.1)** after the server move — HERON now reads `ADLM_API_BASE_URL` from the machine. If HERON told anyone their subscription could not be verified in that window, that was this fault, not their licence.
- **Specifications (2.5)** — every measured template carries a free-text Specification; blank keeps HERON's default QS wording, filled in prints verbatim in the cloud review, the Excel BoQ export and the Takeoff Link. A **Specifications tab** lists every item in the job side by side with search and filtering.
- **Excel Takeoff Link & Steel Tonnage (2.4)** — a Rates tab and full Material & Labour breakdown straight from the Budget, multi-item cell sums, auto-refresh on return to Excel, and a Steel Tonnage tool that converts measured lengths to net/allowance/gross tonnage (including roof and truss members with no section size in the name).
- **The Budget release (2.3)** — automatic material + labour schedule for every BoQ item, labour taken from the matched RateGen rate rather than guessed, profit and margin per item, an **over-budget guardrail** that blocks saving so you never quote below cost, editable prices with inline rate search, and a fully-linked multi-sheet Excel export.

### 3.4 ADLM MEP for Revit — 1.8.3, 31 July 2026
*Nine MEP disciplines, dockable, Revit 2024–2027.*

- Sign-in and cloud saves restored after the server move (the address was hard-coded in three places).
- DEVICE_MISMATCH lockouts gone — same stable hardware identity as every other ADLM product, migrated automatically.
- From 1.2: dockable side panel, Revit-native dark mode, pricing engine and budget dashboard with rate provenance (RateGen / manual / carried), and a formula-linked Budget Summary Excel export.

### 3.5 ADLM Time Pro — 1.1.1, August 2026
*Site productivity logging → realistic durations and crew sizes → priced MS Project programme.*

- **Dark mode everywhere**, following your Windows setting the first time.
- **The MS Project export now opens.** It previously produced a file Project rejected. Built to Microsoft's published spec and validated before release.
- **Currency on export** — 13 currencies; the currency travels into the file so Project shows costs in the money you typed.
- Fixed: labour was written as materials and equipment as labour (rates landed in the wrong column); the side menu buttons were unreadable blank blocks; "No BOQ quantity entered" when one had been entered — Time Pro now names the items it cannot schedule and what they need.
- Improved: tasks chain finish-to-start, so moving the first task reschedules the programme.

### 3.6 ADLM Installer Hub — 1.0, July 2026
*One signed-in app that installs, updates and licences everything you own. Windows 10 & 11.*

- **21-page illustrated user guide**, one click from the sidebar.
- Ships the **PlanSwift import package** for HERON onto your desktop for a safe merge-import.
- Latest builds for every product from one place. Uninstall now cleans every Windows profile and asks before deleting settings.

### 3.7 ADLM Cloud (the website) — 2026.07
- **Pay by card** alongside bank transfer, and **auto-renewing subscriptions** — your card is charged before expiry and the entitlement extends without a ticket. Saved card, auto-renew toggle and card removal all live in Profile → Billing.
- **Downloadable receipts** on every paid invoice.
- **Project, PM and Management PDF reports** from any open project.
- **Project activity log** — a full trail of contract locks, variations, rate and budget edits, certificates, final accounts, model uploads, collaborator changes and PM updates, exportable as a branded PDF.
- **Ada, the AI assistant** — grounded in the real catalogue, and once signed in, in your own projects and subscriptions. Hands over to a human on WhatsApp on request.
- **Extra project storage slots** in blocks of ten, priced live before you pay.
- **Excel BoQ import for QUIV** — turns a real-world QS workbook into a full project with budget, valuation, variation, PC-sum and dashboard behind it. Re-importing a newer copy updates in place without losing procurement marks or completion history. *Available on request for accounts with a live QUIV subscription.*
- **QUIV for ArchiCAD workspace** on the web — BoQ, element detail, budget dashboard, unit switching, versioned exports.
- **Four illustrated PDF user guides** on your dashboard (Installer Hub, QUIV for Revit, RateGen, and the combined Installer Hub & HERON book).
- Buying from outside Nigeria now shows USD and leads with bank transfer, because Naira card charges are usually declined abroad.

### 3.8 CIVIQ — in development
Civil & infrastructure takeoff inside AutoCAD Civil 3D 2024+. **Not on sale.** Log the interest and the team will come back when there is a date.

---

## 4. Price list (live, per seat)

| Product | Monthly | 6 months | Yearly | Installation |
|---|---|---|---|---|
| **RateGen** | ₦8,000 / $10 | ₦35,000 / $45 | ₦70,000 / $100 | — |
| **HERON** (PlanSwift) | ₦12,000 / $10 | ₦65,000 / $50 | ₦120,000 / $100 | ₦15,000 / $5 |
| **ADLM MEP** (Revit) | ₦18,000 / $15 | ₦90,000 / $60 | ₦180,000 / $120 | ₦20,000 / $6 |
| **QUIV** (Revit) | ₦50,000 / $30 | — | ₦500,000 / $200 | ₦25,000 / $25 |
| **ADLM Time Pro** | ₦2,000 / $2 | — | ₦20,000 / $20 | — |
| **CIVIQ** | *not purchasable — in development* | | | |

**Courses** (one-off, twelve months' access)

| Course | Nigeria | International |
|---|---|---|
| BIM Course on Building Works | ₦125,000 | $149.99 |
| BIM Course on Building Services (MEP & HVAC) | ₦105,000 | $99.98 |

Also available: **extra project storage slots** in blocks of ten, per product, priced live on the purchase page.

> ⚠️ **Do not quote Time Pro in dollars until the site is showing $2 and $20.** The site currently advertises **$2,000/month and $20,000/year** for it. Nothing is wrong with the product record — its USD fields are empty, which is the normal setting, and the server converts from the Naira price. The conversion itself was broken: it was reading a currency's rate against itself, always 1, so every price with an empty USD field was served at one dollar to the naira. Time Pro is the only product with empty USD fields, which is why it was the only one visibly wrong.
>
> Two things clear it: the conversion fix ships (`server/util/fx.js`), and the deliberate $2/$20 is entered under **Admin → Products → ADLM Time Pro → Edit → Tier Pricing** — *Actual USD / month* `2`, *Actual USD / year* `20`. Without the second, the price is correct but floats with the exchange rate (about $1.47 today). Delete this note once the site agrees.

---

## 5. Demo routing — send a video, not a calendar invite

Every link below is live. The `/learn/free/...` URL is the ADLM website page (keeps them on the site, shows related products); the `youtu.be` URL is the same video on the **ADLM Studio YouTube channel** — use whichever suits the conversation.

### QUIV / Revit

| They ask about | Send |
|---|---|
| "Show me QUIV working" / first look | **Generate Accurate Bill of Quantities in Minutes with ADLM Revit Plugin** — https://youtu.be/BH_KuHFgXHQ · https://www.adlmstudio.net/learn/free/68f4863091c64c576f5d15fa |
| Architectural takeoff — walls, windows, doors | **Master Architectural Quantity Takeoff with ADLM Revit Plugin** — https://youtu.be/7WR-9DUo1c0 · https://www.adlmstudio.net/learn/free/698b4b3678544f107cd1c687 |
| Structural takeoff — columns, beams, slabs | **Simplify Your Quantity Takeoff with ADLM Revit Plugin** — https://youtu.be/xqlslf_k9CQ · https://www.adlmstudio.net/learn/free/698b4a1578544f107cd1c681 |
| Structural works generally | **ADLM Revit Plugin for Structural Works** — https://youtu.be/s6HBnk_H9rU · https://www.adlmstudio.net/learn/free/698b497c78544f107cd1c67d |
| The QS Calculator | **ADLM Revit Plugin — TheQSCalculator** — https://youtu.be/jLml5XWioRE · https://www.adlmstudio.net/learn/free/6984b79a78544f107cd1c00c |

### HERON / PlanSwift

| They ask about | Send |
|---|---|
| "I'm new — where do I start?" | **Getting Started with the ADLM PlanSwift Plugin** — https://youtu.be/Q6zCmwRdKdY · https://www.adlmstudio.net/learn/free/68f485fa91c64c576f5d15f6 |
| A full job, end to end | **Complete BoQ and Material Schedule for a Bungalow** — https://youtu.be/BVgF58siHHg · https://www.adlmstudio.net/learn/free/68f4865091c64c576f5d15fe |
| Foundation / substructure | **BoQ Using PlanSwift — Foundation Takeoff** — https://youtu.be/4cuQjd3w11Q · https://www.adlmstudio.net/learn/free/6984b9d378544f107cd1c030 |
| Frame — columns and beams | **BoQ Using PlanSwift — Frame Takeoff** — https://youtu.be/sOCtukl3AkA · https://www.adlmstudio.net/learn/free/6984b95978544f107cd1c02c |
| Walls, windows and doors | **BoQ Using PlanSwift — Walls, Windows and Doors** — https://youtu.be/UibPcyLIvHg · https://www.adlmstudio.net/learn/free/6984b90d78544f107cd1c024 |
| Roof works | **BoQ Using PlanSwift — Roof Works** — https://youtu.be/88RLCoO2bnw · https://www.adlmstudio.net/learn/free/6984b8bb78544f107cd1c01a |

### ADLM MEP

| They ask about | Send |
|---|---|
| HVAC, plumbing, electrical takeoff | **ADLM Revit MEP Plugin: 1-Click Quantity Takeoff** — https://youtu.be/XFtGw2n1hB8 · https://www.adlmstudio.net/learn/free/68f4866e91c64c576f5d1602 |

### Where there is no video yet — be straight about it

**RateGen, Time Pro, the Installer Hub and CIVIQ have no demo video in the Learn library.** Do not imply one exists. Route them like this instead:

| Product | Send |
|---|---|
| RateGen | The release notes — https://www.adlmstudio.net/whats-new/rategen — plus the product page https://www.adlmstudio.net/product/rategen, then offer a live walkthrough |
| Time Pro | https://www.adlmstudio.net/whats-new/timepro · product page https://www.adlmstudio.net/product/qs-takeoff |
| Installer Hub | https://www.adlmstudio.net/whats-new/hub — and the 21-page illustrated guide, downloadable from the Hub sidebar or the dashboard |
| CIVIQ | https://www.adlmstudio.net/whats-new/civiq — take their details, no demo to give yet |
| Anything on the web platform | https://www.adlmstudio.net/whats-new/cloud |

> **Open action for the team:** a RateGen demo video is the single biggest gap in the Learn library — it is the product with the most to show this month and nothing to show it with. A "Build with AI in RateGen" and a "price by state / undo your library" clip would both convert.

### Useful site links

- All videos and courses — https://www.adlmstudio.net/learn
- What's new, every product — https://www.adlmstudio.net/whats-new
- Products and pricing — https://www.adlmstudio.net/products
- Trainings and events — https://www.adlmstudio.net/trainings
- Free resources — https://www.adlmstudio.net/freebies
- Support — https://www.adlmstudio.net/support

---

## 6. Courses and training

**BIM Course on Building Works** — ₦125,000 / $149.99. Project setup done properly (EIR → BEP → MIDP/TIDP → MPDT) in a real CDE; coordinate Arch/Struct/MEP with clash and issue tracking; auditable BoQs and 5D cost from model data; 4D sequencing; COBie handover; Power BI dashboards. Graduates leave with a portfolio: BEP pack, federated model, 4D/5D clip, BoQ, COBie and a dashboard. Taught with ADLM tools (HERON, RateGen, COBie Exporter).

**BIM Course on Building Services (MEP & HVAC)** — ₦105,000 / $99.98. 100% online on the ADLM Studio platform, self-paced, over a 6-week roadmap (foundations → 3D → 4D → 5D → analytics → capstone). Revit MEP, ADLM Revit MEP plugin, Navisworks Manage, MS Project, Excel, RateGen, PlanSwift/CostX, Power BI, optional Python/AI. Weekly assessments, a "BIM Manager" capstone, certificate of completion, and the top 3 projects featured on ADLM channels.

Both have preview videos on their course pages: https://www.adlmstudio.net/learn/course/bim-bld-arch and https://www.adlmstudio.net/learn/course/BIM-MEP-25

**Track record to quote when it helps:** 30 events delivered, 12 online sessions, 7 office trainings, 11 conferences, 3,103 attendees. Physical and online cohorts, plus in-house training for firms and universities — https://www.adlmstudio.net/trainings

---

## 7. Ready-to-send WhatsApp messages

Copy, adjust the name, send. Keep them short; do not paste more than one link at a time.

**Anyone who priced lighting since 2.7.0 — send this first, unprompted**
> Hi [Name] — something you need to know, and it was our mistake.
>
> The light fittings we shipped in RateGen 2.7.0 were priced far too high — up to 48× what the fitting actually costs. A 12W LED ceiling fitting that sells for about ₦3,500 was in the library at ₦169,000.
>
> If you priced any job with lighting since the start of August, those rates were too high and the bill will need revisiting. I'm sorry — we published rates from a bill without checking them against what the goods sell for.
>
> 2.8.0 rebuilds every light fitting from the supply price plus fixings plus the electrician time to connect it. A complete lighting point with a 600×600 LED panel and switch was ₦111,900 and is now ₦75,900. Update from the Installer Hub.
>
> Can I help you check which jobs are affected?
>
> — Adedolapo | ADLM Studio

**Broadcast — August update (existing customers)**
> Hi [Name] 👋 Quick August update from ADLM Studio.
>
> RateGen 2.8.0 fixes something important: any price you edited in your library was being wiped every time you signed in. Your edits now stay, the whole library has an Undo button, and you can price against your own state instead of a zone.
>
> 2.7.0 also refreshed every price in the library — cement is now ₦11,500/bag, reinforcement ₦1.7m/tonne — and added MEP, structural steel and roof carpentry.
>
> Update from the Installer Hub. Full notes: adlmstudio.net/whats-new/rategen
>
> — Adedolapo | ADLM Studio

**RateGen lead**
> Hi [Name], RateGen builds up your rates automatically from 500+ materials and 200+ labour items, priced for the Nigerian market and now selectable by state. ₦8,000/month or ₦70,000/year, and a firm can buy a single seat.
>
> Here's what shipped this month: adlmstudio.net/whats-new/rategen — happy to walk you through it live if that's easier?

**HERON lead (PlanSwift user)**
> Hi [Name], HERON turns your PlanSwift 2D takeoff into a full BoQ with a material and labour budget priced from your own rates, and links it live into Excel.
>
> Here's a 2D job start to finish: https://youtu.be/BVgF58siHHg
>
> ₦12,000/month, ₦65,000 for 6 months, or ₦120,000/year (+₦15,000 one-off installation). Want me to set you up?

**QUIV lead (Revit user)**
> Hi [Name], QUIV measures straight from your Revit model — architectural and structural — and turns it into a priced BoQ and budget without leaving Revit. It now has an AI assistant you can just ask for a takeoff.
>
> Two minutes on it: https://youtu.be/BH_KuHFgXHQ
>
> ₦50,000/month or ₦500,000/year (+₦25,000 installation). Which Revit version are you on?

**HERON customer whose Excel link never appeared**
> Hi [Name] — if the Excel Takeoff Link never showed up in Excel for you, that was our packaging, not your machine. The add-in was installed but Excel was never registered to load it. Update to HERON 2.9.2 from the Installer Hub and it appears on its own. Reinstalling 2.9.1 won't help.

**Anyone who hit a sign-in failure in late July**
> Hi [Name] — apologies, that was on us. Our servers moved and HERON, RateGen and ADLM MEP were still calling the old address, so sign-in failed and some people were told their subscription couldn't be verified. Your licence was always fine. Update from the Installer Hub and you're back in.

---

## 8. Objections and awkward questions — answer honestly

| They say | Answer |
|---|---|
| "I already billed a job with your lighting rates." | Then that bill was priced too high and needs revisiting — up to 48× on the fitting itself. It was our error: we published rates from a priced bill without checking them against what the fittings sell for. Offer to help them identify the affected jobs, and escalate to Adedolapo. Do not minimise it and do not wait to be asked. |
| "How do I know the rest of your rates aren't wrong too?" | Fair question. 2.8.0 also rebuilt point wiring from its components and found four materials priced at zero, including a roofing sheet whose price was lost to a typo in its name. The electrical section now rests on one set of evidence. Across the library, 197 items are backed by evidence and 438 moved on a documented index — we publish which is which, and this is the first month we have. |
| "I've been re-entering my corrected prices after every sign-in." | That was a real bug, fixed in RateGen 2.8.0. Your edits now survive, and Undo can roll the library back to any of the last 20 restore points. |
| "You said my prices survived the 2.7.0 update, and they didn't." | Correct, and that was our error. It was true of the installer but not of signing in. 2.8.0 fixes the sign-in path. |
| "Does picking my state actually change my rates?" | Not yet, and we say so on the release notes. Prices are still evidenced at zone level, so Kano and Katsina read the same today. The picker names the zone your state prices from. What it buys you is that your state can be priced on its own the moment we have evidence — with nothing to do on your side. |
| "Are your rates reliable?" | 197 items are backed by evidence from 494 checked lines across 3 recently priced BoQs from 2 independent QS firms (₦5.31bn of work), plus current market prices for primary commodities. The remaining 438 moved on a documented index — treat those as a better starting point than what you had, not as a quotation. |
| "Is the AI going to make up numbers?" | No. In QUIV the AI measures with the same engines you use by hand and reports element count, level and type so you can check. In RateGen the AI drafts a build-up but prices it from *your* library — anything it invented stays tagged `[AI]` for your review, and nothing saves automatically. |
| "I couldn't sign in in July." | Our servers moved and three plugins had the old address built in. All fixed as of end-July. If you were told your subscription couldn't be verified, that was the fault, not your licence. |
| "Can I try before buying?" | Watch the walkthrough for your product (links above), then we can do a live session on your own drawing or model. |
| "Can I get CIVIQ?" | Not yet — it's in development for Civil 3D 2024+. Can I take your details so you're first to know? |
| "Do you do firm-wide / team licences?" | Yes — organisation licences from two seats (RateGen from one), with cloud sync and team management. Let me put you through to Adedolapo for a proposal. |

---

## 9. Escalate to a human when

- Someone wants a **quotation, proposal or invoice**.
- A **firm, university or NIQS** enquiry, or anything multi-seat.
- A **licence, refund, or billing dispute**.
- A technical fault not covered above — point them at https://www.adlmstudio.net/support or `admin@adlmstudio.net`.
- Anyone who asks for a person.

**Human handoff:** Adedolapo | ADLM Studio · WhatsApp **+234 810 650 3524** · admin@adlmstudio.net

---

## 10. Keeping this brief current

Refresh it whenever a `client/src/data/changelogs/*.md` file gains a release, a price changes in the admin product editor, or a video is published to the Learn library.

Pull the live figures with:

```
curl https://api.adlmstudio.net/products
curl https://api.adlmstudio.net/learn/courses
curl "https://api.adlmstudio.net/learn/free?page=1&pageSize=100"
```

**Known gaps in this edition**
- No demo video exists for RateGen, Time Pro, the Installer Hub or CIVIQ (§5).
- Time Pro still shows $2,000/$20,000 on the site until the currency-conversion fix ships and the agreed $2/$20 is entered (§4).
- Content from the Obsidian vault has **not** been merged into this edition — the vault is not reachable from where this was assembled. Everything here comes from the website, the live API and Notion. Hand over the relevant notes and they can be folded in.
