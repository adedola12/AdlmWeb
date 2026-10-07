---
id: ai-services
title: "ADLM AI services"
tagline: Every AI feature across ADLM's software, what it does for you, how it works, and what it will never do on its own.
version: "2026.10"
updated: 2026-10-04
platform: Web (adlmstudio.net), Revit, PlanSwift, Rate Gen desktop and WhatsApp
productKeys: []
pdf: ADLM-AI-Services-Guide.pdf
order: 19
---

ADLM's software has a family of AI helpers: **Ada** on the website, who answers product questions and works beside you as an estimator and project manager; AI checks on your bill in ADLM Cloud; and AI reviews, rate matching and take-off help in the desktop products. This guide lists each one, where to find it, how it works and who can use it today.

One rule runs through all of them: **the AI suggests, you decide.** Quantities come from your model or drawings, rates from a rate library. Where an AI feature can change your bill, it shows a proposal first and waits. Every answer is advisory, and the quantity surveyor checks it before it goes into a contract.

## Before you start

### What you need

- **To be signed in** for anything beyond product questions to Ada.
- **An active ADLM licence.** At the time of writing, any active ADLM product licence opens the AI tools; there is no separate AI add-on. See **Products** at [/manage](/manage).
- **An internet connection.** The AI runs on ADLM's servers. Offline, the rest of each product keeps working.

### Availability labels

| Label | Meaning |
|---|---|
| **On for everyone** | In the current release for any signed-in user with an active licence. |
| **Beta** | Only in a beta build or on the beta channel. |
| **Not in standard installs** | In the product but switched off in a normal install; ADLM switches it on only on machines it sets up for testing. |
| **Switched off** | Shown but disabled for everyone in this release. |
| **Coming** | Built, not yet in any release. |

## Every AI feature at a glance

| Feature | Product | Availability | Needs |
|---|---|---|---|
| Ada, the website chat (product questions) | Website | On for everyone | Nothing; guests share a monthly limit |
| Ada on your account and projects | Website | On for everyone | Signed in |
| Ada as your estimator and project manager | Website | On for everyone | Signed in, a project you own |
| Ada in the **Work area** of a project | ADLM Cloud | On for everyone | Signed in, access to the project |
| **Check my rates against the market** | ADLM Cloud | On for everyone | Signed in, active licence, priced lines |
| **Scan the bill for errors** | ADLM Cloud | On for everyone | Signed in, active licence |
| **Build up a rate for the selected line** | ADLM Cloud | On for everyone | Signed in, active licence |
| **Estimate the outputs** (programme gang outputs) | ADLM Cloud | Being opened up to customers (the /work/programme page) | Signed in, a project with a bill |
| **AI Rate Check** | QUIV 3 (classic workspace) | Not in the QUIV 4.0 panel | Signed in, priced bill lines |
| **✦ Run the whole takeoff** / **Auto take-off** | QUIV 3.1.9 and later; **Auto take-off** in QUIV 4.0 | On for everyone | Signed in, a take-off list. Uses no AI model |
| **QUIV AI Assistant**, the AI prompt bar and **AI Assist** | QUIV | Not in standard installs | Set up by ADLM |
| **AI Match Labour** and **AI Match Materials** | QUIV | Not in standard installs | Set up by ADLM |
| **AI Review** (**AI Bill Review**) | HERON 2.9 and 3.0 | On for everyone | Signed in, active licence |
| **Auto take-off** | HERON | Beta in 2.9; switched off in 3.0 | Beta channel (2.9 only) |
| **Build with AI** | Rate Gen 3.0, build 3.0.2610.1 | On for everyone | Signed in, active licence |
| **Price a bill** (price a client's bill with ADLM AI) | Rate Gen | Coming | Not released |
| **ADLM AI Review** and **BUILD WITH ADLM AI** | SERVIQ (Revit MEP) | Not in standard installs | Set up by ADLM |
| WhatsApp sales assistant | WhatsApp | Rolling out | A WhatsApp number |

> **Note:** Rate Gen's **Carbon & Others** screen, HERON's description library and Specifications, and the ICMS 3 cost and carbon export are not AI features. They work from fixed rules, factors and your own data. They are mentioned here only because people ask.

## How ADLM AI works, in plain words

1. **Your product gathers the facts:** bill lines, rates, your model's level names. The AI never measures anything.
2. **The facts go to ADLM's AI service**, on **Amazon Bedrock in ADLM's own AWS account**, using Anthropic's Claude models: a fast model for most jobs, a stronger one when it is unsure.
3. **Answers are grounded in the Rate Gen library** for your region of Nigeria. Library figures are marked as such; estimates are marked too (**[AI]** in Rate Gen).
4. **You get a proposal, not a change,** with a reason and often a confidence figure.

No feature invents a quantity, uses another firm's data, or gives a professional opinion. Answers from the AI cost tools carry the same note: an advisory estimate from the Rate Gen library and market data, to be checked before contractual use. Nothing writes to your bill, budget or library without your confirmation, except QUIV's **AI Match** (not in standard installs), which fills confident matches with real library prices and marks each for review.

## Ada, the ADLM assistant on the website

### What Ada does for you

Ada is the chat on adlmstudio.net. For anyone, she answers what a product does, what it costs and which one your drawings need, and can add a product to your cart or point you to a training. Signed in, she also answers questions about your own account and projects.

### Where to find her

1. Click the round **Ask Ada** button at the bottom corner of any page. The panel opens with **Ada** and **Answers from ADLM, not the internet**.
2. Type in **Ask about a product, a price, training…** and press <kbd>Enter</kbd>, or tap a suggestion: **Products**, **Trainings**, **Software downloads** or **Material quantities**. The last one starts "How many bags of cement do I need for " for you to finish.

> **Note:** Ada's page at **/ada** describes her in places she is not yet, such as inside the desktop products and the mobile app. This guide lists only where she is today.

### How she works

- **What she sends:** your message, the recent conversation and, if you are signed in, the page you are on, so "this project" means the one you have open.
- **What she reads:** ADLM's live catalogue and, when you are signed in, only your own account and projects. Naming someone else's project finds nothing.
- **Which model:** Claude, on Amazon Bedrock in ADLM's AWS account.
- **What she never does:** invent a price, product, date or project figure, or ask for a password or card details. If a tool finds nothing, she says what she searched.
- **Confirmation:** she only reads. Rate proposals go through a card you confirm (see the next section).

### What she can tell you about your account

| Ask about | What she reads |
|---|---|
| Your projects | Count, combined value, work done, outstanding, progress, which have a 3D model |
| One project | Value, work done, actual cost, progress, contract locked or not, CPI and SPI, tasks done and overdue, planned finish |
| Your subscriptions | What you own, active or expired, expiry, project slots used |
| A material or trade | Total quantity and cost of, say, cement, 12mm rebar or masons, in one project or all |
| The bill | Each line's quantity, unit, rate, amount and % complete, optionally filtered |
| The budget | Material vs Labour vs Plant, procured vs still to buy, the biggest resources |
| What to buy next | Materials still to order, soonest first, with order dates from the programme (14 days' lead time unless you say otherwise) |

She keeps each quantity in its own unit and never converts units unless you give her the factor.

### Limits

- Up to 1,000 characters per message, and about 40 messages every 10 minutes.
- A monthly allowance per signed-in account; guests share one monthly limit (see "AI allowances" below).
- If Ada is offline, she says so and offers **Browse products** and **Chat on WhatsApp**.

## Ada as your project manager and cost manager

Signed in and chatting from the **Ask Ada** button, Ada works like a senior QS and site PM beside you. She reads the project; she does not run it.

### What she can read on a project

- **The bill**: every line's quantity, unit, rate, amount and progress.
- **The budget**: the Material & Labour breakdown, procured and still to buy.
- **Valuations**: certificates issued in a date range, what was certified (approved or paid) and what was paid.
- **The programme**: tasks finished, due but not finished, overdue, risks and issues, and the planned finish.
- **Earned value**: CPI (cost) and SPI (schedule), as the PM dashboard works them out.
- **Variations**: raised and decided in a period.

### Cost questions and variances

Ask the value of a project, what is done, what a line costs, the biggest items, the material and labour split, or what you have budgeted for a material. She quotes the stored figures exactly; if a bill has no rates, she says so. She points out variances the data shows: lines over budget, actual cost against planned, CPI or SPI below 1, and tasks past their dates. She does not invent one the data does not show.

### What needs attention

Ask "What should I do next on this job?" She runs the same checks as the tip strip on your project's tabs, most urgent first: unpriced lines, contract not locked, no recent progress, overdue tasks, lines over budget, budget rows with no price, no programme. Each tip names its tab: **PM dashboard**, **Rates & budget**, **Valuations** or **Bill**.

### Forecasting

Ada has no forecasting tool. She gives the planned finish, CPI, SPI and what is still to buy, and explains what they suggest, but she does not produce a final-cost forecast. Open the project's **PM Dashboard** for the full earned-value picture.

### Reports and notes

Ask for "a report for last month" or "what happened between 1 and 30 September". She works out the dates in Lagos time and reads what moved: work valued, lines completed, actual against planned, certificates, variations, purchases, late tasks, risks, issues and the activity log. A **Project report** card shows **Work valued**, **Certified**, **Bought** and **Activity entries**; **Open the report** opens the PDF. She can draft a short note from those figures for you to copy and edit. She never sends anything.

### Pricing unpriced lines, with your confirmation

Ask "Price my bill". Ada proposes a rate for every unpriced line from **your own** Rate Gen library (master rates plus your overrides and custom rates), matched by description, with the unit as a hard rule and rates you chose before ranked first.

1. Read the **Proposed rates** card: one line per proposal with a tick box, quantity, rate and amount.
2. Untick any line you disagree with, and check **Adds to the bill**.
3. Press **Apply N rates** (it reads **Tick a line to apply** when nothing is ticked).

Nothing is priced until you press the button. If you can only view a project, or cannot see its rates, she says she cannot propose rates for it.

### What she cannot change

Ada cannot change a quantity, rate, budget row, valuation, certificate, variation or programme task, lock a contract or issue a certificate. Apart from **Apply N rates**, which you press, nothing she does writes to a project.

### The AI cost checks Ada can run

Ada can also run three AI cost tools on your project's real bill lines: **check my rates** against the market, **find errors**, and **suggest a rate** for any described item of work (no project needed). They work as described under "AI checks in ADLM Cloud". She uses a region only when you name one.

## Prompts to try with Ada

These prompts use ADLM's learning sample projects, so you can see what to ask and what a good answer looks like.

> **Important:** Ada reads **your own** projects only. Samples belong to no account, so if you name "5-Bedroom Duplex - Raft Foundation" in the chat she will ask which of your projects you mean. On a sample, use the AI buttons in its **Work area**, or ask questions that need no project, such as rate build-ups. Ask whole-project questions about your own project.

To open a sample, find the **Learning samples** strip on a product's project list (the Sample projects guide explains it), open one, then click the **Work area** tab.

### Cost manager

Ask these about your own project, for example your own raft or strip duplex.

| Ask | What Ada should answer |
|---|---|
| "What is my raft duplex worth, and how much work is done?" | Total value, work done, actual cost recorded and progress % |
| "Is the contract locked, and what is the contract sum?" | Locked or not, and the sum if locked |
| "What are the ten biggest items in my strip duplex bill?" | The largest lines by amount, with quantity, unit and rate |
| "Split my budget into material, labour and plant." | The split, and what is procured versus still to buy |
| "What changed on my pad and strip duplex between 1 and 30 September?" | Work valued, certificates and amounts certified and paid, variations, purchases and late tasks, with a report card |
| "What do I still need to buy, and when must I order it?" | Materials still to order, soonest first, anything overdue |
| "The gross floor area is 420 m². What is the cost per m²?" | The project value divided by the area you gave. Ada does not store floor areas, so give her one |
| "What will this job cost at the end?" | CPI, SPI and what remains to buy, explained. She has no final-cost forecast and should say so |

### Project manager

| Ask | What Ada should answer |
|---|---|
| "What should I do next on my strip duplex?" | The most urgent tips first, each with the tab to open |
| "Is my pad and strip duplex behind programme?" | SPI, tasks done out of total, overdue tasks and the planned finish |
| "Which tasks are late this month?" | Tasks due in the month and not finished, by name |
| "When was the last certificate, and what has been paid?" | Certificates in the range you give, their status, amounts certified and paid |
| "How many variations were raised and decided in September?" | Variations raised and decided in that range |
| "Give me a September report I can send the client." | A summary with a **Project report** card. **Open the report** gives you the PDF to check and send yourself |

### Estimator

| Ask | Where | What you should get |
|---|---|---|
| **Check my rates against the market** | **Work area** of any QUIV, HERON or SERVIQ sample | A verdict per line, with deviation, benchmark and reason |
| **Scan the bill for errors** | **Work area** of any sample | Duplicates, wrong units, odd quantities and rate outliers, each with a reason |
| Select a concrete line, then **Build up a rate for the selected line** | **Work area** of the 5-Bedroom Duplex - Raft Foundation sample | The rate built up from material, labour and plant, each part marked as looked up or estimated |
| "Build me a rate for 225mm hollow sandcrete blockwork in cement-sand mortar 1:6, South West." | Ada chat, anywhere | A build-up from the Rate Gen library for that zone |
| "Build a rate for a 600mm bored pile, per metre, in Lagos." | Ada chat, anywhere | A build-up with more estimated lines, as piling is thinner in the library. Check them |
| "Compare the concrete in my strip duplex and my raft duplex." | Ada chat, two of your projects | Concrete lines and totals from each bill, side by side |
| "How much rebar and how much concrete is in my raft duplex?" | Ada chat, your project | Rebar in kg and concrete in m³, each in its own unit. Divide for kg per m³ and check it against your norm |
| "Which lines in my pile duplex have no rate?" then "Price them." | Ada chat, your project | The unpriced lines, then a **Proposed rates** card to tick and apply |

> **Tip:** The HERON samples have the same bills as the QUIV ones with descriptions written out in full. Run a market check on the HERON and QUIV versions of the same duplex to see how wording affects matching.

## AI checks in ADLM Cloud (the Work area)

Every cloud project has a **Work area** tab ("Model, bill, schedule and Ada together"). Its **Ada** panel, headed **Answering from** your project, has five buttons and an **Ask about this project** box:

| Button | What it does | AI? |
|---|---|---|
| **Check duration, time, cost & material** | A health check worked out on the page | No |
| **Check my rates against the market** (or **Check N selected line(s)**) | Benchmarks priced lines against the Rate Gen library | Yes |
| **Scan the bill for errors** | Duplicates, wrong units, implausible quantities, rate outliers | Yes |
| **Build up a rate for the selected line** | One line's rate from material, labour and plant | Yes |
| **What is this project worth?** | Asks Ada | Yes |

1. Open a project and click **Work area**.
2. Tick lines in **Bill of Quantities** to check only those, or tick nothing to check all.
3. Click **Check my rates against the market**.
4. Read the result in the Ada panel; each line gets a chip in the **Check** column.

**How it works:** each priced line's description, unit, quantity and rate (up to 250 lines) is compared with the Rate Gen library for your zone. Verdicts are **above market**, **below market**, **in range** or **unit mismatch** (the unit disagrees with the benchmark, nothing more). No rate is ever changed. A market check costs 2 units; an error scan or build-up 1. Repeating the same check within a week costs nothing.

> **Note:** On a sample, **Ask about this project** can comment on the lines you have selected, which travel with your question, but cannot read the rest of the sample.

## Programme gang outputs in ADLM Cloud

A programme needs a daily output per trade (m² of blockwork a gang lays in a day, for example) to turn quantities into durations.

> **Note:** The programme page (**/work/programme**) is still being opened up to customers. If it does not open for you, it is not on your account yet.

1. Open a project's programme (**/work/programme**).
2. Under **Where the time comes from**, click **Estimate the outputs**. It also runs once by itself the first time.
3. Check and edit the **Output** column. **Estimate again** reruns it.

Your bill lines are grouped by trade and unit, and a few descriptions from each group go to the AI, which proposes an output per trade. The outputs are stored for the project, and your bill is not changed. At the limit, the screen says this month's allowance is spent and ordinary building figures stay editable.

## QUIV for Revit

QUIV 4.0 is the current release, and its new panel is what QUIV opens. The QUIV 3 **classic workspace** only returns on machines ADLM has set up for it. Where a feature lives depends on the workspace.

### AI Rate Check

**Availability:** The QUIV 3 classic workspace only. It is not in the QUIV 4.0 panel; in 4.0, use **Check my rates against the market** in the ADLM Cloud Work area instead.

1. Open **BoQ** in the QUIV sidebar.
2. Click **AI Rate Check**. It reads **Checking…** while it runs.
3. Read the **AI Rate Check** report: lines needing attention, worst first, or "Every checked rate sits within market range of its RateGen benchmark."

**How it works:** QUIV sends the priced lines (up to 250) through ADLM Cloud to the AI service, which benchmarks them against the Rate Gen library. No rate is changed; the report says so. At the limit you see "This account has used its AI allowance for the month. Contact ADLM support if you need it raised."

### Full handover and Auto take-off

**Availability:** On for everyone signed in. **✦ Run the whole takeoff** (Full Handover) arrived in QUIV 3.1.9; in QUIV 4.0 it is **Auto take-off**.

It measures every item on your take-off list, level by level and type by type, with QUIV's own measuring engines. Despite the "AI" wording on screen, a run **uses no AI model**. It is rationed because it walks every module over every level.

In QUIV 4.0:

1. Under **How to start**, choose **Auto take-off** ("AI measures, you review"), or click **Auto take-off with AI** on the take-off list.
2. Tick the items in the picker. Items QUIV cannot reach say "You pick this in Revit".
3. Click **Run auto take-off**. Revit stays usable. **Stop** ends the run.
4. Review the results. A result is "sure" when at least 85% of its planned measurements saved without failing; it is not a model's guess.
5. Click **Accept N** for the sure results, or open each item, check it and accept.

Nothing a run measured counts until you accept it. In the classic workspace, **✦ Run the whole takeoff** sits under the take-off list; QUIV asks permission once and lets you stop or undo the run.

**At the limit:** runs are counted per day. QUIV warns when two or fewer remain ("2 full handover runs left today") and shows the server's reason at the limit. If the server cannot be reached to count, the run goes ahead rather than block your work.

### QUIV AI Assistant, the AI prompt bar and AI Assist

**Availability:** Not in standard installs. The QUIV 3.1.6 notes announced the AI Assistant, but a normal install does not show it.

You type what you want measured, for example "beam and slab quantities for first floor". The AI picks the QUIV module and the real Revit level name from the lists QUIV sends (nothing else from the model leaves your computer), and QUIV measures it with its normal engines. The AI only routes the request; it never produces a quantity. It appears as **AI Assistant** in the sidebar (**QUIV AI Assistant**, with **✦ Run**), a prompt bar on module pages and an **AI Assist** pill. Prompts are counted per day.

### AI Match Labour and AI Match Materials

**Availability:** Not in standard installs.

On the budget page, these match rows still priced at zero to real rates: labour against your labour library and the labour part of your build-ups, materials against the Rate Gen materials library. The AI only picks from candidates QUIV sends, and units must agree. Matches at 75% confidence or more are filled in and marked **AI: …** in the status column for review. Check every one before you save.

## HERON for PlanSwift

### AI Review (AI Bill Review)

**Availability:** On for everyone signed in, in HERON 2.9 and HERON 3.0.

AI Review turns raw take-off names into proper bill descriptions, fixes units, finds duplicates, flags rates out of line with the job, and points out items a QS would expect (for example blockwork with no rendering). You can also ask questions about the bill.

1. Open the review sheet: **Review before saving** in HERON 3.0 (in HERON 2.9, click **Save to Cloud** to open the review table).
2. At its foot, click **AI Review**.
3. In **AI Bill Review**, tick **Descriptions**, **Rate sanity** and **Missing items** as needed.
4. Click **Run Review**.
5. Accept the findings you agree with and click **Apply Accepted**.
6. Check the review table and save as usual.

To ask a question, type in **Ask about this bill** (for example "why is substructure so large a share of this job?") and click **Ask**.

**How it works:**

- HERON sends the table's descriptions, units, quantities and rates, the project name, currency and pricing zone to ADLM's AI service on Amazon Bedrock.
- When you accept or reject suggestions, the service learns your house style (wording, units, section order, rejected phrases). That profile is kept for your account alone.
- Rate checks are benchmarks against the Rate Gen library.
- **Quantities are never altered.** "Suggestions only. Nothing changes in your bill until you accept a finding and press Apply." Saving to the cloud still needs your confirmation.

### Auto take-off in HERON

**Availability:** Beta channel only in HERON 2.9 (open **Settings**, choose **Beta**, tick **Join the beta programme**, then restart HERON). In HERON 3.0, **Auto take-off** sits under **BETA** in the sidebar but is switched off for everyone: "Auto take-off is in beta and is not available in this release."

### Match with AI (Fill a client's bill)

**Availability:** On for everyone signed in, in HERON 3.0.

On HERON's **Excel** screen, **Fill a client's bill** fills a client's own Excel bill with your HERON quantities. **Match with AI** proposes which HERON lines make up each of the client's lines, with a confidence and a reason in the cell note. The AI proposes; you tick; only ticked lines are written, to a copy of their file. It sends the client's descriptions and units and HERON's measured lines, never your drawings. It needs a sign-in and a connection.

HERON's description library and **Specifications** are not AI, though your specifications help AI Review write in your style.

## Rate Gen

### Build with AI

**Availability:** On for everyone signed in, in Rate Gen 3.0, build 3.0.2610.1, on by default.

Describe an item of work in one sentence and ADLM AI drafts a full build-up into the custom rate form, for you to check, edit and save.

1. Open a trade screen (for example **Block Works**) and click **+ Add Custom Rate**.
2. In **Build with AI**, type a request containing the words "rate" and "build", for example "Build a rate for 225mm blockwork in cement mortar (1:6)".
3. Click **Build with AI**.
4. Read the status, for example "AI draft ready (confidence 85%). Review every line before saving."
5. Check and edit every line, then save the rate yourself.

**How it works:** Rate Gen sends your sentence, your zone and the names of items in your library (your own first). Components found in your library are priced from **your** library at your rate; the AI's figure is discarded. Only components your library lacks keep an AI estimate, tagged **[AI]**. If the draft fails ADLM's checks, an amber block reads "This build-up did not pass ADLM's checks" and lists what to fix. Nothing saves itself: "An AI draft is an advisory estimate from the ADLM library and market data. It is not a professional opinion and not for contract use until you have checked every line."

**Carbon is not AI.** **Carbon & Others** works out upfront carbon (RICS A1-A5) from each rate's own build-up and published factors.

### Coming: Price a bill

**Availability:** Coming; built, not yet approved for release.

A **Price a bill** screen will open any client's bill (.xlsx or .xls) in its own layout. ADLM AI proposes one of your Rate Gen rates per item, with the unit as a hard rule, and nothing is priced until you **Accept** a line or **Accept the sure matches**. The client's file is never changed; the priced bill is saved as a copy. A QUIV tool that fills a client's own bill with QUIV quantities is also in development.

## SERVIQ for Revit MEP

**Availability:** Not in standard installs. A normal SERVIQ 2.0 install does not show the **AI Review** page or **BUILD WITH ADLM AI**.

On machines ADLM has set up, **ADLM AI Review** offers **Market check**, **Find errors**, **Clean up bill**, **Auto-price unpriced**, **Import supplier catalogue**, **ASK ABOUT THIS BILL** and **PLAN A TAKE-OFF**, with each finding offering **Apply** or **Dismiss**. "Nothing here changes the bill until you apply it." **BUILD WITH ADLM AI** in the rate composition window drafts a build-up with **Build rate**.

## The WhatsApp sales assistant

**Availability:** Rolling out on ADLM's WhatsApp line, +234 810 650 3524.

It answers questions about ADLM products, prices, trainings and the website, and sends the right page or video. It cannot see your account, licences or projects. It runs on Claude models and answers from a knowledge pack ADLM keeps; it never invents prices, features, dates or links, and will not offer a free trial (there is none). Ask for a person and it tells you how to reach the team. Conversations are kept so the team can follow up: the transcript for 90 days, its tags longer. Never send a password or card number on WhatsApp.

## AI allowances and what happens at the limit

There are two counters. Both reset on their own.

### The AI service allowance (cost tools)

Market checks, error scans, build-ups, bill reviews and Build with AI draw on a monthly allowance per account, in units: a rate build-up 1, a market check 2, an error scan 1, a HERON clean-up 2, a bill question 1, a QUIV take-off request 1, an AI Match batch 1, a supplier catalogue import 5. Telling the service what you accepted or rejected costs nothing, and so does the same request again within 7 days.

At the time of writing the standard allowance is 200 units a month, resetting at 01:00 WAT on the 1st. At the limit you see a plain message such as "Monthly AI quota reached", and the rest of the product keeps working. Ask [support](/support) if you need more.

When ADLM's own AI budget is tight, the error scan, supplier catalogue import and **Ask about this bill** pause first, with a message saying so. Market checks and build-ups stay up longest.

### The website allowance (Ada and QUIV actions)

- **Ada:** a monthly allowance per signed-in account ("This account has used its monthly AI allowance … It resets at the start of next month."). Guests share one monthly limit: "Our AI assistant has reached its limit for visitors this month. Sign in to keep using it, or reach us on WhatsApp."
- **QUIV prompts and handover runs:** counted per day (10 of each at the time of writing), resetting at 01:00 WAT.

## AI and your data

**What leaves your computer:** only what the feature needs: bill lines, a typed request, module and level names, or a sentence describing a rate. The Revit or PlanSwift model itself is never sent to the AI.

**Where it goes:** ADLM's servers and Amazon Bedrock in ADLM's own AWS account, running Anthropic's Claude models. Ada runs in AWS's Ireland (EU) region; the AI cost tools in AWS's US East region. Under AWS's terms your prompts are not used to train the models, and ADLM does not train anything on your rates or bills.

| What ADLM stores | Why | How long |
|---|---|---|
| A usage record per AI call (account, feature, product, tokens, estimated cost) | Allowances and spend | Kept |
| A short summary of each AI verdict, with the model and prompt version | So a verdict can be explained later | Kept, never edited |
| Cached results for the exact request | The same question costs nothing twice | 7 days |
| Your HERON house style | Descriptions in your wording | Kept, your account only |
| Ada conversations, with your account if signed in and your connection address | Improving Ada and following up enquiries | Kept |
| WhatsApp conversations | Following up enquiries | Transcript 90 days; tags kept |

ADLM never shows one firm's bills, rates or wording to another, never lets Ada read anyone's projects but yours, and never changes your bill, budget or library without your confirmation (QUIV AI Match, not in standard installs, marks every match for review). Every result is advisory: the QS reviews it, and the figures in a contract are the ones you accept.

## What's new in 2026.10

- **Ada as estimator and project manager:** project tips, period reports with a PDF card, and rate proposals you confirm with **Apply N rates**. She also knows which project page you are on.
- **Work area** on every cloud project, with Ada and the AI cost checks.
- **Programme gang outputs** estimated from the bill.
- **QUIV 4.0:** **Auto take-off** with confidence and **Accept N**.
- **HERON 3.0:** **AI Review** carried over; **Auto take-off** switched off.
- **Rate Gen 3.0, build 3.0.2610.1:** **Build with AI** on by default, prices from your library first and flags drafts that fail ADLM's checks.
- **All AI runs on Amazon Bedrock** in ADLM's AWS account.

## Troubleshooting

| What you see | What to do |
|---|---|
| "AI is not switched on for this account yet", with a note that model access is pending | A temporary server problem. The rest of the product works. Try later or contact [support](/support). |
| "The AI rate check needs an active ADLM subscription…" | Renew your licence at [/manage](/manage). |
| "Sign in to ADLM to use AI review." (HERON) | Sign in, then open **AI Review** again. |
| "Your session could not be verified…" (QUIV) | Sign out, sign in again and retry. |
| "Monthly AI quota reached" | Wait for the reset on the 1st, or ask [support](/support). |
| Ada asks "which project" on a sample | Use the **Work area** buttons, or ask about your own project. |
| Rate Gen asks for the words "rate" and "build" | Start with "Build a rate for…". |
| No QUIV AI Assistant, AI Match or SERVIQ AI Review | They are not in standard installs. |

## Frequently asked questions

**Is the AI always right?**
No. It can misread a description, pick the wrong benchmark or miss a local price. That is why every result shows its reason and source, and why you, the QS, check it.

**Does ADLM AI make up rates?**
Rate checks benchmark against the Rate Gen library, and build-ups price from your library first. Where the library has nothing, the AI estimates and marks the line (**[AI]** in Rate Gen). Check every marked line.

**Does AI cost extra?**
At the time of writing, any active ADLM licence includes the features marked on for everyone, within the allowances above.

**Which region are the benchmarks for?**
One of the Rate Gen library's six Nigerian zones. Tell Ada your region; the desktop products use your profile's zone.

**Is my data used to train AI?**
No. ADLM does not train on your data, and Amazon Bedrock does not use prompts to train the models.

**Where do I get help?**
Visit [support](/support), or see the [QUIV](/guides/quiv), [HERON](/guides/heron), [Rate Gen](/guides/rategen), [SERVIQ for Revit MEP](/guides/mep) and [ADLM Cloud](/guides/cloud) guides.

