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

## The two read-only counts — RUN, 23 September 2026

Both were run read-only against the production cluster before any code was
written. `countDocuments` / `aggregate` only, no writes, no app code loaded.

**1. Master rates with an unstamped breakdown — 1 line out of 204.**

`db.rategenrates.countDocuments({ "breakdown.refKind": { $in: [null, ""] } })`
returns **1**, across 130 rates. The `refKind` values present are `material`
(114) and `labour` (89) — **and no `plant` at all**: plant does not exist
anywhere in the master catalogue today.

So the doc's prediction holds: the catalogue is effectively fully stamped, an
explicit `refKind` outranks the name regex, and a classifier change is inert
there. That is what made it safe to replace the five private classifiers with
one shared vocabulary (`util/resourceKind.js`).

**2. Budget rows already classed as plant — NOT zero. 6 rows, 3 projects.**

This contradicts the assumption the doc was written on. The Plant sheet HAS a
real customer's data behind it:

| project | row | kind | sn | rate | qty |
|---|---|---|---|---|---|
| My Revit Takeoff | Concrete mixer 10/7 | Plant | 82, 89 | 0 | 0.3, 1.01 |
| New Takeoff | Concrete mixer 10/7 | Plant | 67, 74 | 0 | 0.3, 1.01 |
| New Demo | Concrete mixer 10/7 | Plant | 93, 100 | 0 | 0.3, 1.01 |

The `sn` values are small, so these are REAL plugin-sent rows, not generated
ones. They are priced at 0 — plant reached the Budget and was then invisible
to the costing engine, exactly as defect 3 describes.

Consequences, and they are now design constraints rather than observations:

- The componentKind spelling in the database is **capitalised** (`Material`,
  `Labour`, `Plant`, `Consumable`), while rate and component kinds are
  lowercase on the wire. The shared classifier keeps both and never rewrites a
  stored word, because `componentKind` is part of every merge key.
- `isRateGenRow` must not match these. It does not: they carry no
  `rateSource` and their `sn` is nowhere near the 700,000,000 band.
- A histogram of every `budgetItems.componentKind` in production:
  Material 12,395 · Labour 7,650 · Consumable 35 · Plant 6.

**A third count was run, because the design needed it.** The `sn` band
700,000,000–799,999,999 is **completely empty** across all 19,272 budget rows
(< 700M: 13,451 real rows · 800–899M: 814 ml-schedule · ≥ 900M: 5,821
coverage). That band is now the rategen-written band.

## Built, 23 September 2026 (the dedicated session)

All five on `claude/bold-goldberg-9d774d`, branched off this one. The plugin
half is untouched — see `PLANT-IN-BUDGET-PLUGIN-HANDOVER.md`.

- **A picked rate writes the Budget rows** — `util/rateToBudget.js`, and an
  additive `POST /:productKey/:id/bill/:code/price-from-rate`. Quantities from
  the bill and the constants, prices and class from the rate; material rows,
  ONE Labour row, ONE Plant row. Reproduction is by back-solved O&P, so the
  pick sticks to the kobo. Stamped `rateSource=rategen-rate` in the 700M band,
  so a re-pick replaces only its own rows.
- **A Plant branch in `mlSchedule`**, fed from the rate's plant subtotal
  (`opts.plantFor`) or from four new Plant constants that all ship at 0. The
  bill total does not move; the cost/profit split corrects.
- **The project resources store** — `resourceItems` on TakeoffProject, its own
  endpoint, stripped from `projectForClient`. Never read by `deriveBillRates`
  or the budget heal, asserted both ways.
- **A rate line can say plant**, with `preservePlantLines()` guarding against
  the desktop sync deleting one. The condition was checked against the C#
  source and holds: `RateType` is a plain string, never enum-parsed.
- **One shared resource classifier** — `util/resourceKind.js`, replacing five
  private re-implementations that disagreed on 73 of 1,709 real component
  names.

## Still to design

- Whether plant gets its own master price library and per-state override kind.
  Nothing in the master catalogue is classed plant today (count 1 above), so
  plant prices currently come only from a rate's own build-up.
- The **ArchiCAD Plant column** — `archicadCosting.js` computes `compPlantCost`
  and the costing path is plant-aware, but the column is not shown. Deferred by
  the owner to after launch.
- Whether the client's `ProjectBudgetTab.jsx` vocabulary should be unified with
  `util/resourceKind.js`. It is presentation-only and already correct, but it
  is a sixth copy; sharing it needs a Vite `fs.allow` and a CDK bundling
  change, which is not launch-week work.
- Whether the QS should see the gang reconciliation (what `summariseResources`
  computes) beside the Budget's Labour row, and what a mismatch should say.
