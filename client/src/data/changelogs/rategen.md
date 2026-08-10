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

## 2.7.0 — August 2026 — New prices, and MEP arrives

The first full price refresh since RateGen launched, and the library finally covers mechanical, electrical and plumbing. Cement moves from ₦4,300 to ₦11,500 a bag, reinforcement from ₦350,000 to ₦1,700,000 a tonne, and 67 MEP items join the library with a new MEP tab to build rates from them.

### ✨ New

- **Every price in the library has been refreshed.** All 568 material and labour rates were repriced — the first full refresh since launch. We calibrated against three recently priced bills of quantities from two independent QS firms, 494 checked lines covering ₦5.31bn of work, then set the primary commodities from current market prices rather than from the bills, because a bill priced in February is already out of date. Cement ₦4,300 → ₦11,500 a bag, high tensile reinforcement ₦350,000 → ₦1,700,000 a tonne, granite ₦1,860 → ₦9,500/m³, sharp sand ₦842 → ₦6,500/m³, a labourer ₦1,800 → ₦5,400 a day. Expect your concrete rates to come out around 10% above what the same job would have been priced at earlier in the year.
- **Mechanical, electrical and plumbing.** The library had no MEP items at all. It now has 67: power cables from 4mm² to 70mm² including armoured and fibre, luminaires, switches and socket outlets, sanitary fittings, air conditioning and ventilation, fire protection, earthing and cable containment. A new **MEP Works** tab computes 37 build-ups from them — lighting and power points, cable runs, sanitary fixtures, split units, detectors and more. MEP rates are supply-and-install, so every MEP category is labelled "(supply & install)": do not add a fixing labour line on top of them.
- **You can see exactly what is in every MEP rate.** Each MEP build-up lists its components as separate lines rather than a single figure, so you can see what the rate covers and strike anything you have already billed elsewhere.

### 🔧 Improved

- **Your own prices survive the update.** If you edited a price in your library, that edit is kept. The refresh only touches rows still sitting at the original default, rows you deleted are restored, and your previous library file is backed up before anything is written.
- **We are telling you how confident we are.** Not every item is equally well supported. 197 are backed by evidence in those bills or by observed market prices. The remaining 438 — mostly paints, ceilings, aluminium, glazing and timber — are not priced at supplier level in any of the bills, so they moved on a documented index instead. Treat those as a better starting point than what you had, not as a quotation. A supplier price list is being sourced to put them on the same footing.
- **There are no pipes yet, and that is deliberate.** None of the bills we calibrated against carries a pipe price — every pipework line in them was a provisional sum. Rather than guess, we left pipes out. uPVC, PPR and GI pipe, fittings, conduit and small-gauge wiring are next.

### 🐛 Fixed

- **Mixing labour was being charged at a full day rate against an hourly quantity.** Every concrete rate that mixes on site was carrying roughly eight times the mixing labour it should have. Concrete rates drop accordingly.
- **Fuel was priced from the labourer's day rate, not from diesel.** Thirty places in the costing engine worked out fuel cost from what a labourer earns, so the Diesel price sitting in your library affected nothing at all. Diesel is now the diesel price, and it is in the library at ₦1,215 a litre.
- **Granite and hardcore were measured in tonnes but costed per cubic metre.** The library called them tonnes while every calculation used volume, so the figure on screen never matched the figure in the rate. Both now read m³, and both carry observed market prices.

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
