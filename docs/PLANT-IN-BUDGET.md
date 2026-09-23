# Plant is a resource class, not a slice of labour

Written 23 September 2026, from a full read of the pricing path. The owner (a QS) set the rule:

> "The Bill is usually higher than the Budget, as the Bill is the BoQ, while the Plant line is
> coming from RateGen. When a user uses a rate from Rate Gen in their Bill, the materials for
> that item's prices are filled from Rate Gen, and labour is now broken into Labour and Plant.
> The labour breakdown can be included in the project resources, but in the Budget a line
> carrying the total labour cost alone, and the total plant cost alone."

and then refined how the rows are built:

> "We already have a Material Constants library. **Budget item quantity is always from the Bill
> quantity.** The Bill rate can be typed by hand or taken from Rate Gen; when it comes from Rate
> Gen it sits in the right places in the Budget — just the prices, and material or labour or
> plant according to the breakdown it gets from Rate Gen."

So: **quantities come from the bill and the constants; prices and the resource class come from
the rate.** A rate never dictates how much cement a cubic metre needs; it says what cement costs
and which part of its build-up is plant.

## What is broken today

1. **A Rate Gen pick does not stick.** `ProjectBillTable.jsx` `pickRate()` reads only
   `candidate.totalCost` and writes one scalar; no budget row is created. On save,
   `deriveBillRatesFromBudget` (`server/util/deriveBillRates.js`, called unconditionally at
   `server/routes/projects.js:3925`) re-derives the line's rate from the Budget build-up — which
   never saw the rate — so the number reverts while the toast says "Saved". On a project with no
   build-up (`net = 0`) the pick is kept and the Budget knows nothing about the plant.
2. **The build-up cannot reach the client.** `POST /rategen-v2/library/rate-items/resolve`
   builds a pool carrying `composition`, `breakdown` and `rateId`, then projects away everything
   except `{description, unit, totalCost, netCost, sectionKey, sectionLabel, source, score}`
   (`server/routes/rategen.library.js:489-509`). It even parses the plant share to *demote*
   plant-heavy rates in the match score, then discards it.
3. **Plant is reported as profit.** `server/util/mlSchedule.js:789-801` back-solves margin as
   `bill / build-up - 1`. Plant is absent from the build-up and present in the bill rate, so it
   lands whole in `profitPercent`. On the owner's concrete rate, per 100 m³: the Budget says cost
   ₦900,000 and profit ₦360,000; the truth is cost ₦1,000,000 and profit ₦260,000.
4. **Plant cannot be authored on the website.** `UserCustomRateLineSchema.rateType` is an enum of
   exactly `["material", "labour"]` (`server/models/RateGenLibrary.js:57`), and
   `rategenUserRates.js:156` collapses every non-labour value to `material`.

## What is already built and waiting

Six of the seven layers are plant-aware: `BudgetItemSchema.componentKind` is documented
"Material | Labour | Plant | Consumable | Equipment"; `billBudgetExporter.js` has `BUCKET_PLANT`,
a `kindLabel` that prints Plant, and a whole **Plant & Equipment Schedule** sheet that currently
prints empty; `ProjectBudgetTab.jsx` has a Plant chip; `archicadCosting.js` computes
`compPlantCost` and throws it away. The two layers that are not plant-aware are the two that
carry the money: the door a rate walks through, and the engine that writes Budget rows.

## Decisions the owner took, 23 September

1. **Before the 28 Sep sign-off:** stop the silent revert, carry the build-up across the API,
   and the small leak fixes. The Budget-writing itself, the project resources store and the
   ArchiCAD Plant column come after launch.
2. **A pick wins over the derived rate**, and says what it replaced — it may replace rows it owns
   (generated or from a previous pick) and never rows the QS typed or a plugin sent.
3. **Quantities from the bill, prices and class from the rate** (the refinement above).
4. **Existing projects are left alone.** No migration re-classes a stored row from Labour to
   Plant: `componentKind` is part of every merge key (`projects.js:192`, `mlSchedule.js:728`), so
   re-classing orphans the QS's price and procurement edits, and `deriveBillRatesFromBudget` then
   pushes the lower net into the bill **on a GET**. The split appears only when an item is
   re-priced or its schedule re-generated.

## The plugin half — sequence matters

- **QUIV** folds plant, equipment and consumables into one Labour line on purpose
  (`TakeoffMaterialDeriver.cs:118,186,200`), so a 500 m³ pour reports six figures of plant hire as
  gang wages. `RateComponentKind.Plant` already exists and the website already sends
  `components[].kind === "plant"`; the classification arrives correctly and is discarded.
- **HERON** collapses harder: `CloudProjectService.cs:578` maps anything that is not labour to
  Material.
- **Rate Gen desktop** rebuilds a custom rate from its own material and labour lists on sync
  (`UserRatesCloudSync.cs:730`), so a plant line authored on the website is deleted and the rate
  comes back worth the plant amount less. A server-side guard is the only fix that does not need a
  plugin release.
- **The website must be able to receive a Plant row before any plugin starts sending one**, and a
  plugin release must not re-class rows on projects that already exist: a QUIV re-save replaces
  the whole `materialItems` array and the Budget is re-derived from it, so a changed
  `componentKind` would re-key every row on every project its user opens.

## Two read-only counts to run first

Local dev points at the production cluster, so these were not run:

- `db.rategenrates.countDocuments({ "breakdown.refKind": { $in: [null, ""] } })` — if zero, the
  master catalogue is already stamped and a classifier change will never reach it, because an
  explicit `refKind` outranks the name regex (`rategenUserRates.js:306`).
- a count of `budgetItems` rows anywhere with `componentKind` matching `/plant|equip/i` — if it is
  zero, the Plant sheet has never printed for a real customer, and this is far safer to change
  today than it will be in three months.

## Still to design (the dedicated session)

- How a picked rate writes Budget rows: bill quantity × constants for the material quantities,
  prices and class from the rate, one aggregated **Labour** row and one **Plant** row per item.
- The `sn` band and `rateSource` stamp for rategen-written rows, so `isGeneratedRow` can replace
  them on a re-pick but never touches a row the QS typed
  (`mlSchedule.js:694`, and the 800,000,000–899,999,999 band).
- A Plant branch in `mlSchedule`, fed from the rate's plant subtotal.
- The **project resources** store for the gang detail. It must be a new array that
  `deriveBillRates` and the budget heal never read — `deriveBillRates.js:46` sums every row under
  a `billIdentity`, so gang rows in `budgetItems` would double-count labour and raise the bill by
  ~20% on a plain read.
- Whether plant gets its own master price library and per-state override kind.
