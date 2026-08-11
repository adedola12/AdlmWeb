---
slug: rategen
name: RateGen
tagline: Instant rate build-ups & market pricing for QS
category: Desktop App
accent: blue
icon: dollar
status: live
order: 5
summary: Defensible rate build-ups with location-based pricing and a cloud-synced rate library.
---

## 2.7.0 - August 2026 - New prices, MEP, steel and roof carpentry

The first full price refresh since RateGen launched. Cement moves from ₦4,300 to ₦11,500 a bag and reinforcement from ₦350,000 to ₦1,700,000 a tonne. The library gains a mechanical, electrical and plumbing section it never had, the roof section finally prices the timber holding the sheets up, structural steel is priced for the first time, and the category filter works again.

### ✨ New

- **Every price in the library has been refreshed.** The first full refresh since launch. We calibrated against three recently priced bills of quantities from two independent QS firms, 494 checked lines covering ₦5.31bn of work, then set the primary commodities from current market prices rather than from the bills, because a bill priced in February is already out of date. Cement ₦4,300 to ₦11,500 a bag, high tensile reinforcement ₦350,000 to ₦1,700,000 a tonne, granite ₦1,860 to ₦29,800/m³, sharp sand ₦842 to ₦16,170/m³, a labourer ₦1,800 to ₦5,400 a day. Expect your concrete rates to come out noticeably above what the same job would have been priced at earlier in the year. Aggregates in particular have moved a long way.
- **Mechanical, electrical and plumbing.** The library had no MEP items at all. It now has 98, and a new **MEP Works** tab computes 35 build-ups from them: lighting and power points, cable runs, sanitary fixtures, split units, detectors and more. Pipework, valves, storage and pumps are in the library as supply items but do not yet have installed build-ups of their own, so price your own labour against them for now. Cables run 4mm² to 70mm² including armoured and fibre.
- **Pipes, fittings and valves.** uPVC soil, waste and vent, PPR pressure pipe, rainwater goods, valves, water storage and pumps. These are **supply** prices, so add your own labour. Every MEP category now says which it is: `(supply)` means material only, `(installed)` means supply and fix, so do not add a fixing line on top of an installed rate.
- **Plumbers and electricians are in the labour library.** It had 15 trades and not one of them was a plumber, pipefitter or electrician, so the pipe prices could not be built into a rate. Added along with MEP foreman, wireman, PPR fusion welder, pipe threader and earth tester.
- **Roof carpentry.** The roof section priced the covering and nothing holding it up, and several of its own items said "laid on purlins, measured separately" while nothing measured them. Six build-ups added: wall plate, rafters at 600mm centres, purlins at 900mm centres, ceiling noggings, fascia board, and a complete roof carpentry rate. Spacing is an editable quantity, so if you work to different centres the timber quantity follows instead of you recalculating lengths.
- **Structural steelwork.** The steel section had three items and all three were surface preparation: the product could clean steel but could not price any. It now has nine more. Universal beam and universal column, each **per tonne and per kg**, plus rolled steel angle both ways, channel, plate for gussets and base plates, and a 6mm fillet weld per metre. Each is supply, fabricate and erect, with offcuts, connection plates and cleats, a welder, steelfixer, labourer and foreman gang, welding plant, gas and a mobile crane for erection. The per-kg rates are the per-tonne rate divided by 1000, not a second build-up, so the two can never disagree when you edit a quantity. Universal sections come out around ₦2,956,000 a tonne.
- **MEP rates in Carbon and Others, and these reach you without updating.** 16 rates: PPR pressure pipe in three sizes, uPVC soil and waste, rainwater downpipe, valves, water storage and pump, sanitary fittings, lighting and socket points, and an earth electrode. Pipework is built from the supply price plus plumber and pipefitter time; sanitary and electrical use the installed rows with no labour added, because those already include fixing. This section reads its rates from ADLM Cloud rather than from the app, so they arrive on your next sign-in whether or not you update.
- **You can see exactly what is in every MEP rate.** Each build-up lists its components as separate lines rather than one figure, so you can see what the rate covers and strike anything you have already billed elsewhere.

### 🔧 Improved

- **Your own prices survive the update.** If you edited a price in your library, that edit is kept. The refresh only touches rows still sitting at the original default, rows you deleted are restored, and your previous library file is backed up before anything is written.
- **Structural steel was priced at a ninth of what it costs.** The library carried one steel row at ₦150,000 a tonne, when reinforcement in the same library is ₦1,700,000 a tonne and section steel trades above bar. Universal sections, angle, channel and plate are now priced individually, each per tonne and per kg. These come from a Nigerian supplier's current listings rather than from a priced bill, so treat them as a working figure and replace them when you have a quotation.
- **If you price outside Lagos, your rates were wrong.** Three zones, South East, North East and North West, had most of the library carrying no price of their own, so those users were quietly served Lagos prices with no regional adjustment and nothing said so. All six zones are now priced properly.
- **We are telling you how confident we are.** Not every item is equally well supported. 197 are backed by evidence in those bills or by observed market prices. The remaining 438, mostly paints, ceilings, aluminium, glazing and timber, are not priced at supplier level in any of the bills, so they moved on a documented index instead. Treat those as a better starting point than what you had, not as a quotation. A supplier price list is being sourced to put them on the same footing.

### 🐛 Fixed

- **Filtering the library by category returned nothing.** The price sync was not sending the category with each row, so every item in your library ended up with a blank one while the dropdown still looked full. Both the material and labour filters work again, and the category list is now built from your own library, so anything in it, including your own Custom Rate items and the new MEP categories, can be filtered to. This had been broken since July for everyone who signed in.
- **Sorting by clicking a column header did nothing.** Sorting was switched off in both themes, and the name columns had no sort key even when it was on. Both fixed.
- **Door ironmongery was costing nothing.** The Windows and Doors ironmongery item looked up a material that was never in the library, and a missing name silently prices at zero, so that rate billed labour and no hinges, lock or door stop. Now priced as a set.
- **Two more components were silently costing nothing**, for the same reason: a formwork plywood used by blockwork and concrete whose name was missing a space, and a window with its dimensions transposed. Every material and labour lookup in every rate engine has now been checked against the library, and all 822 of them resolve.
- **Mixing labour was being charged at a full day rate against an hourly quantity.** Every concrete rate that mixes on site was carrying roughly eight times the mixing labour it should have. Concrete rates drop accordingly.
- **Fuel was priced from the labourer's day rate, not from diesel.** Thirty places in the costing engine worked out fuel cost from what a labourer earns, so the Diesel price sitting in your library affected nothing at all. Diesel is now the diesel price, at ₦1,215 a litre.
- **Granite and hardcore were measured in tonnes but costed per cubic metre.** The library said tonnes while every calculation used volume, so the figure on screen never matched the figure in the rate. Both now read m³.
- **Softwood and hardwood had collapsed into one grade.** Softwood was down to a single row, with sections that are softwood filed under hardwood. Both grades are restored, which matters for roof carpentry: local hardwood is the cheap framing timber and imported softwood is the dearer joinery grade.

## 2.6.2 — August 2026 — Saving a rate no longer risks your library

A library that holds two rows with the same name — which the shipped library does, by design — could lose rows when you saved a custom rate.

### 🐛 Fixed

- **Saving a custom rate could quietly drop library rows, or harvest nothing at all.** The library keeps items that share a name but differ by unit or category: the shipped list has 500 rows across 477 distinct names. Saving a rate rebuilt the library keyed on the name alone, so those duplicates either collapsed to one row each — silently discarding the others — or the save gave up and harvested nothing, with no message either way. Rows are now matched by name and updated in place, so duplicates survive, your file keeps its original order, and genuinely new items are added to the end.

## 2.6.1 — August 2026 — AI prices stay where the AI put them

An AI-built rate could save with every price at zero, and stay that way when you reopened it. That is fixed, and the AI now tells you when it is unsure.

### ✨ New

- **You are told when the AI is not confident in a rate.** When a build-up fails the service's own pro-rating or sanity checks, it is still returned — but RateGen used to show it exactly like a clean one. Those warnings now appear in an amber block on the form, listed separately from the ordinary status text, and are cleared when you build again or clear the form. A rate that is wrong but plausible is more dangerous than one that is obviously broken, so it should not read as normal progress.

### 🐛 Fixed

- **An AI-built rate could save with every price at 0.00.** The prices the AI returned were correct — RateGen was discarding them on the way to disk. Components come back tagged, like `Cement (Portland 42.5R) [AI]`, and the price lookup searched on that full text, so it never matched the library entry and cleared the price on every miss. Because saving reloads the library, that clearing ran on every line in the open form moments before it was written. Nothing was harvested into your library either, since harvesting skips lines priced at zero. The lookup now ignores the provenance tag, and an unrecognised item keeps its price unless you actively pick a different one.

## 2.6.0 — August 2026 — Your custom rates build your price library

Happy new month. Every material and labour line you price on a custom rate now joins your library automatically — and when the AI drafts a build-up, it prices from your library instead of guessing.

### ✨ New

- **Your custom rates now build up your price library.** Every material and labour line you price on a custom rate is added to your library when you save it. Type a material once and it is in the dropdown — with its rate and unit — for every rate you build afterwards. Prices you already have are never changed: if the library already knows an item, saving a rate that uses it at a different figure leaves your library price alone, and only items the library has never seen are added. New entries appear under the category **Custom Rate**, and the save confirmation tells you how many were added.
- **Build with AI now uses your prices.** When the AI drafts a rate build-up, any component that exists in your library is priced from your library, at your rate and your unit — the AI's own figure is discarded. Only components your library has never heard of keep the AI's estimate, and those stay tagged `[AI]` so you can see at a glance which lines still need your review. Previously the AI's price overrode your library on every line.

### 🔧 Improved

- **Organizations can buy RateGen for one user.** Organization licences start at two users across the rest of the range; RateGen is now the exception. Choose an organization licence on the purchase page and you can set seats to 1 — so a firm that needs RateGen for a single estimator buys it in the company's name, and under the company's billing details, without paying for a seat it won't use. Every other product still starts at two.
- **Press Enter to sign in.** Enter from either the email or the password field signs you in. Enter on "Forgot password?" and "Create account" still opens those pages.

### 🐛 Fixed

- **Overhead and Profit are readable again.** Both boxes were rendering their value clipped out of view, so they looked empty. They now show their percentage clearly, with the cash value each one adds shown underneath — and the totals block gained **Overhead**, **Profit** and a **Grand Total** line. The grand total was being calculated but never displayed.
- **A part-typed percentage no longer wipes the box.** Typing "1." into Overhead or Profit blanked the field mid-entry.
- **Reopening a saved rate no longer zeroes AI-priced labour.** Any labour line your library does not recognise — every line tagged `[AI]` — lost its price when the rate was loaded back.

## 2.5.1 — 31 July 2026 — Sign-in restored, Build with AI & one master price library

RateGen could not sign in after ADLM's servers moved. It now finds the service through your machine's settings rather than an address fixed when the app was built — and the same release brings AI-drafted build-ups and one shared price library.

### ✨ New

- **Build with AI.** A new AI section on the Custom Rate form takes a plain-English description and fills in the entry form for you — components, quantities and prices, with inferred lines tagged so you can see what came from the AI. It shows a confidence figure and an advisory note, and nothing is saved automatically: you review, edit and save through the normal flow, exactly as with a rate you built by hand.
- **Master price library sync.** "Sync from Cloud" — and every sign-in — now pulls the zone-priced master price library maintained by ADLM and merges it with your own rows, so RateGen, QUIV, HERON and ADLM MEP all price from the same single source of truth instead of drifting apart.

### 🔧 Improved

- **Your zone follows your account.** Refreshing your profile stores your account's pricing zone, so every sync prices against your real location. Signing in now refreshes prices silently even when your zone hasn't changed; the confirmation prompt is kept for an actual zone switch.
- **A server move no longer means a new download.** RateGen now reads `ADLM_API_BASE_URL` from your machine — the setting the ADLM Installer Hub already writes — so the service address can change without a new version being shipped to every customer.

### 🐛 Fixed

- **Sign-in failing after the server move.** RateGen had the retired server address built in as its fallback for both sign-in and licence checks, so an installed copy could not be redirected without shipping a new build. It now resolves the address from your machine's settings first, and an old setting still naming the retired server is ignored rather than obeyed — older RateGen installers wrote that address into your Windows environment, so on exactly the machines that were broken the stale value would otherwise have outranked the fix.

## 2.5.0 — July 2026 — Stable device binding

Sign-in stops treating the same computer as a new device every time your network changes.

### 🔧 Improved

- **Diagnosable upgrades.** Data-migration problems on startup are written to a timestamped log under your local app data instead of being discarded, so a support ticket can be resolved from the log. Migrations still never block RateGen from starting.

### 🐛 Fixed

- **Sign-in lockouts (DEVICE_MISMATCH) are gone.** Your licence seat was bound to a fingerprint derived from whichever network adapter was fastest and active at that moment — so a dock, a USB ethernet adapter, a VPN, or simply switching between Wi-Fi and cable made the same machine look new and the server rejected the login. RateGen now identifies the machine by its hardware, existing bindings are migrated in place at sign-in, and cached offline licences issued under the old scheme keep working.

## 1.3 — May 2026 — Multi-device cloud sync

Your rate library now follows you — sign in on any device and your custom rates are ready to go.

### New

- Multi-device cloud sync — your custom rates, materials and labour prices are now synced to the cloud and available on any device you sign into, so your library follows you.

## 1.2 — April 2026 — Security hardening & hub installer

A full security pass: RS256 licensing, encrypted credentials and a clean hub installer.

### New

- RS256 / JWKS licence validation — licences are now signed with industry-standard RS256 and validated via JWKS, replacing the previous scheme.
- Encrypted credential storage — the encryption key is registered as an environment variable at install time and never stored in plain text.
- Hub installer packaging — RateGen ships via a single hub installer that handles registration and environment setup automatically.

### Improved

- Device-bound licensing — a hardware fingerprint ties each licence to the activated device; hardcoded secrets have been removed from the build.

## 1.1 — November 2025 — Cloud rate library & zone pricing

Custom rates now live in the cloud and automatically flow into your takeoff plugins — no more manual syncing.

### New

- Save materials & labour to cloud — your custom material and labour prices are pushed to your ADLM account so they are available across HERON and QUIV automatically.
- Zone-based pricing — rates now reflect your selected regional pricing zone, with automatic conversion applied so figures are market-relevant wherever you are.
- Online sign-in — sign in with your ADLM credentials directly from within RateGen; the session stays active across restarts.

## 1.0 — May 2025 — RateGen launches

Build up rates in seconds with pricing tuned for the Nigerian construction market.

### New

- Instant rate build-ups for fast, accurate cost estimates across all major construction trades.
- Location-based pricing and vendor insights tuned for the Nigerian construction market.
- Cloud-synced Rate Library so your whole team works from the same numbers.
- Currency conversion — switch between NGN and other currencies with conversion applied live.
- Dark mode — a full dark theme that is easy on the eyes during long estimating sessions.
- Custom rates & global search — add your own rates to every trade category and search across the entire library in one keystroke.
