# R2: trade margins and the plant library

Built 27 September 2026, locally, ahead of approval at the owner's request.
Two work-board items, built together because they touch the same rate build-up
code:

- `r2-overhead-profit-per-trade`: RateGen overhead and profit defaults set per trade
- `r2-plant-library-per-hour`: RateGen plant costing library, priced per day from its parts and used by the hour

**Not pushed.** Nothing ships until `node scripts/work-board.mjs check --key <key>`
exits 0 for each key.

---

## 1. Money rules, and how each one is held

| Rule | How |
|---|---|
| No existing total moves | Defaults only fill a percentage a rate **arrives without**. Order, per half: the figure on the payload, then the stored rate's own figure, then the trade default, then the built-in pair (10/25 master, 10/10 custom). Nothing is migrated. The read path (`mergeRatesWithUserData`) never consults the table. There is a test that snapshots totals before and after a table is set. |
| Budget quantity equals Bill quantity | Untouched. The schedule engine's Plant row still uses the bill's own quantity and unit. `plantFor` returns a figure per bill unit, and only when the rate's unit is the bill's unit. |
| Plant is its own resource class | A library machine becomes a breakdown line with `refKind: "plant"`, unit `hr` and a stored `lineTotal`. `buildRateComposition` classifies it as plant, and `compositionSubtotals().plantCost` carries it into the Budget's one Plant row (`rateToBudget.js`, unchanged). |
| A missing rate is never a silent zero | A machine with a quantity on a part but no price, or with no working hours, has `hourlyRate: null` and says why. `plantLine()` throws `PLANT_UNPRICED`. The pickers list it but will not let it be picked. The custom rate builder refuses a plant line with hours and no hourly price. |
| Rates need a RateGen licence | The customer routes (`/rategen-v2/library/trade-margins`, `/plant`) sit behind `requireEntitlement("rategen")`. The schedule engine's rate-plant lookup runs only for a user with a live RateGen entitlement (`hasActiveEntitlement`). |

**One deliberate behaviour change.** An edit that leaves a percentage out now
keeps the one the rate already holds. Before this, it reset to 10/25 (master,
override) or 10/10 (custom), which silently re-priced a stored rate. This
affects `PATCH /admin/rategen-v2/rates/:id` and a customer override or custom
rate re-sent without its percentages. Every current client sends both figures,
so no current flow changes.

## 2. Worked figures used in the tests

- **Mixer.** Hire ₦25,000, diesel 15 L × ₦1,000, operator ₦8,000, maintenance ₦2,000 and transport ₦4,000 come to a day cost of **₦54,000**. Over an 8-hour day that is **₦6,750/hr**. At 0.25 hr per m³ it adds **₦1,687.50** per m³. On a 10-hour day it would be ₦5,400/hr.
- **Poker vibrator.** ₦11,000 a day is **₦1,375/hr**, so 0.25 hr adds ₦343.75. Plant per m³ of concrete 1:2:4 is therefore **₦2,031.25**. The same mixer booked as "1 day per m³" would have put ₦54,000 on every m³.
- **Custom rate in Blockwork, customer default 10/20.** Net ₦8,000 plus ₦800 + ₦1,600 gives **₦10,400**. When the table later becomes 10/30, re-sending the rate without percentages still gives ₦10,400.
- **MEP custom rate, customer default 12/15.** Net ₦10,000 gives **₦12,700**. With no default it gives ₦12,000, as before.

## 3. What changed, by file

**Server**
- `util/tradeMargins.js` resolves margins (pure). `util/tradeMarginsView.js` builds the table as screens read it. `util/rategenSections.js` holds the canonical trades, moved out of the admin router.
- `models/RateGenTradeMargin.js` is ADLM's master table. `RateGenLibrary` gains `tradeMargins`, `plant` and their version numbers.
- `util/rategenUserRates.js` gains `normalizeCustomRateFor` / `normalizeRateOverrideFor`, used by every customer write path (single and bulk, `/rategen` and `/rategen-v2`).
- `services/rategen.computeEngine.js` + `routes/rates.compute.js` apply this order: a percentage on the call, then your trade default, then the item's default. The response gains `overheadSource` / `profitSource`.
- `routes/admin.rategen.rates.js`: create fills a missing percentage from ADLM's trade table. Update keeps the stored figure. It also serves `GET/PUT /admin/rategen-v2/trade-margins`.
- `util/plantCosting.js` covers day cost, hourly rate, the plant line and merging (pure). `models/RateGenPlant.js` is the new model.
- `routes/admin.rategen.plant.js` serves `GET/POST/PUT /admin/rategen-v2/plant`. There is no DELETE; a machine is disabled instead.
- `routes/rategen.library.js` serves `GET /library/plant`, `PUT/DELETE /library/plant/:key` and `GET/PUT /library/trade-margins`.
- `routes/admin.catalogue.js`: the rate builder's library gains priced `plant`.
- `util/plantAllowance.js` + `util/mlScheduleContext.js`: the `plantFor` hook finally has a caller. It is off for the price-from-rate path (`ratePlant: false`).
- `routes/rategen.js`: the legacy `/rategen/library` response strips the new fields, so Rate Gen desktop sees exactly the shape it was built against.

**Client** (all under `client/src/ds/`; nothing in `ds/pages` or `ds/chrome`)
- `rategen/customRateDraft.js`: `blankDefaults()` gives the trade default. Plant rides in `materials[]` with `rateType: "plant"`, and an unpriced plant line is refused.
- `rategen/CustomRateBuilder.jsx`: placeholders read "Trade: 12" / "Default: 10", and plant is picked from the library by the hour.
- `rategen/TradeMarginsEditor.jsx`, `rategen/PlantEditor.jsx`, `rategen/AdminPlantLibrary.jsx`, `rategen/plantMath.js`, `rategen/tradeMargins.js`
- `DsWorkLibrary.jsx`: the Plant tab is now the library, and the rates tab has a "Default margins by trade" bar.
- `DsAdminRateLibrary.jsx`: adds "Default margins by trade" and a Rate data → Plant library tab.
- `DsAdminRateBuilder.jsx`: adds a plant tab, and a new rate starts at ADLM's trade default. The "Labour and plant" subtotal now includes plant.

**Fixed on the way.** A website-built custom rate carried its plant line only in
`breakdown[]`. `preservePlantLines()` looks in `materials[]`, so a Rate Gen desktop
re-push (which rebuilds from its own two lists) would have dropped the plant line
and its money. Plant now rides in `materials[]` too, which is the schema's own
convention, and a test covers the re-push.

## 4. Plugin contract: what the desktop reads

No plugin route changed shape, and no field a plugin reads was renamed or removed.

| Product | Reads | Effect |
|---|---|---|
| QUIV | `overheadPercent` / `profitPercent` per rate. It has no hard-coded fallback (0 when none: `MaterialTakeoffViewModel.Display.cs:510`, `RateGen.cs:1434`, `MaterialDerivation.cs:1220`) | Trade defaults need **no QUIV change** |
| QUIV | `RateCompositionParser` classifies by `refKind` / `rateType`. It sums `TotalCost`, else qty × price, with no unit conversion | An `hr` plant line sums correctly. On QUIV `main`, a custom rate's `materials[]` + `labour[]` are merged and `breakdown[]` is ignored. Plant now rides in `materials[]` with `rateType: "plant"`, so `main` sees it. RevitPluginArch **PR #4** (`fix/custom-rate-plant-breakdown`, another session) makes `breakdown[]` authoritative as well. |
| QUIV / HERON Budget | Fold plant into labour (`DeriveLabourLine` uses `NetCost − MaterialCost`; HERON name signals) | Unchanged. The money is kept but classed as labour. The split is the job in `PLANT-IN-BUDGET-PLUGIN-HANDOVER.md` §2. |
| HERON | Line totals only (`totalCost`/`lineTotal`), never qty × price | Every plant line carries a stored `lineTotal` |
| Rate Gen desktop | Starts new rates at its own 10/25 (section screens) and 10/10 (custom rate) | Its pushes carry explicit figures, so server defaults never override them. Showing the customer's trade defaults there is an optional follow-up: read `GET /rategen-v2/library/trade-margins`. |

Release order is unchanged: **the website ships first.** No desktop release is
required for correctness.

## 5. Design surfaces (Richard)

Built on existing pieces (`wk-`, `rg-op`, `rg-build`, `rg-ln`, feedback cards) as
working versions. Final design is his:

1. RateGen: the "Default margins by trade" table, meaning trade, overhead %, profit %, reset, and ADLM's figure shown beside yours.
2. Custom rate builder: where each percentage came from ("Trade: 12" vs "Default: 10"), and the plant picker ("hours per unit").
3. RateGen Plant tab: machine, day cost, working day, per hour, and "used in".
4. Plant item card: the parts that build the day cost, plus "make my own version" and "go back to ADLM's".
5. Admin: the master per-trade table (Rate library), the plant library (Rate data), and the plant tab in the rate builder.
6. Desktop (C#): plant rows in the QUIV/HERON rate build-up and Budget.

## 6. Open, deliberately

- **Plant is not zoned.** One price per machine for now. Materials and labour are zoned; plant could follow the same state → zone → national pattern.
- **The library ships empty.** ADLM staff add the first machines at Rate data → Plant library.
- A stored rate does not re-price when a machine's price changes. Its line keeps the price it was built at, as materials do.
- **Release-day check.** Snapshot bill totals on a few real projects before and after the deploy. The code path cannot move them, and the snapshot proves it.
