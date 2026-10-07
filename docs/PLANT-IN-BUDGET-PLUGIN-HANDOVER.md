# Plant in the Budget — the plugin half

Written 23 September 2026, after the website half was built. **Nothing in the
C# repos was changed.** This is the note for whoever picks up the desktop side.

The sequencing rule from `PLANT-IN-BUDGET.md` is unchanged and is the reason
this document exists rather than a branch:

> The website must be able to receive a Plant row before any plugin starts
> sending one, and a plugin release must not re-class rows on projects that
> already exist.

The website can now receive one. The plugins may now be changed. **They must
not be changed before this website work is on `main`.**

---

## 1. What the website now does, that a plugin can rely on

| Thing | Where | Status |
|---|---|---|
| One resource classifier (material / labour / plant / consumable / equipment) | `server/util/resourceKind.js` | live |
| A rate line may be `rateType: "plant"` | `RateGenLibrary.UserCustomRateLineSchema` | live |
| A plant line survives a Rate Gen desktop push | `preservePlantLines()` | live |
| `composition.components[].kind === "plant"` reaches the plugins | `buildRateComposition()` | was already live |
| A picked rate writes material rows + ONE Labour row + ONE Plant row | `server/util/rateToBudget.js` | live |
| The schedule engine can emit a Plant row | `generateMlSchedule`, `opts.plantFor` | live |
| Gang detail has a home that does not inflate the bill | `resourceItems` + `/resources` | live |

**No plugin route changed shape.** `resourceItems` is deleted from
`projectForClient` and served only by `GET/PUT /:productKey/:id/resources`,
which no plugin calls. The new pricing route
`POST /:productKey/:id/bill/:code/price-from-rate` is additive.

---

## 2. The three plugin defects, and what each needs

### QUIV — folds plant, equipment and consumables into one Labour line

`TakeoffMaterialDeriver.cs:118,186,200`. `DeriveLabourLine` sets the labour
unit to `NetCost − MaterialCost`, so a 500 m³ pour reports six figures of
plant hire as gang wages. `RateComponentKind.Plant` already exists and the
website already sends `components[].kind === "plant"` — the classification
arrives correctly and is thrown away.

**Change:** split `NetCost − MaterialCost` into a Labour line (`LabourCost`)
and a Plant line (`PlantCost`), with anything left over staying on Labour so
no money is lost. `RateCompositionDto` already computes `PlantCost`.

**The trap.** A QUIV re-save replaces the whole `materialItems` array and the
website re-derives the Budget from it. `componentKind` is part of every merge
key (`projects.js` `moneyFreeKey`, `mlSchedule` `editKey`), so a row that
comes back as Plant where it went out as Labour is a NEW row: the QS's price
and procurement edits are orphaned, the old Labour row is gone, and
`deriveBillRatesFromBudget` pushes the changed net into the bill **on a GET**.

**So: only ever emit a Plant line for a bill line that has no stored rows
yet, or behind an explicit per-project opt-in the QS turns on.** Never
re-class on load. This is the same rule the website follows — the split
appears when an item is re-priced or its schedule re-generated, never by
migration.

### HERON — collapses harder

`CloudProjectService.cs:578` maps anything that is not labour to Material, so
plant arrives as material. Same change, same trap, same rule.

### Rate Gen desktop — deletes a plant line on sync

`UserRatesCloudSync.cs:730` `BuildCustomRatePayload` rebuilds the push from
its own `MaterialItems` and `LabourItems`, so a plant line authored on the
website is absent from the next push.

**Already handled server-side** — `preservePlantLines()` keeps it and re-nets
the rate. No release is required for correctness.

**When a release does happen:** add a plant list, send those lines with
`rateType: "plant"`, and put `supportsPlant: true` on the
`PUT /rategen-v2/library/custom-rates/:id` body. The server then treats the
push as authoritative, including a deliberate deletion, with no server change.

Confirmed while writing this, from the C# source: `CustomRateLinePayload.RateType`
is a plain `string`, never enum-parsed, and `PullUserEditsAsync` reads only a
rate override's breakdown `ComponentName` and `Quantity`. An unknown value
like `"plant"` cannot fault the current build. That was the stated condition
for widening the enum, and it holds.

---

## 3. The one hook still waiting for a caller

`generateMlSchedule(items, budgetItems, K, { plantFor })`.

`opts.plantFor(item, kind)` returns a per-bill-unit plant allowance and beats
the Plant constants. It exists so a caller that can resolve a bill line's Rate
Gen rate can hand over that rate's plant subtotal rather than a generic
constant. Nothing resolves rates per line on the import path today, so the
live path is the constants — which all ship at 0.

The natural caller is the launch-week work on `feat/richard-sep18-update`,
which carries the build-up across the API: once a resolved rate is available
per line, pass its plant subtotal here.

---

## 4. The client call the launch-week branch should make

`pickRate()` in `ProjectBillTable.jsx` currently writes one scalar. Once it
stops the silent revert, the pick should also call:

```
POST /projects/:productKey/:id/bill/:code/price-from-rate
{ rateId, description, unit, unitCost }
```

`unitCost` is the rate **already converted to the bill item's unit** — only
the client knows the conversion it showed the QS. The body says *which* rate,
never what it costs: the server re-resolves it from that user's own merged
library, so a client cannot post a price into a project.

It returns the saved project plus `_rateWarnings`. Call it **after** the bill
save completes, not during an edit — the endpoint saves the project, so an
unsaved bill edit in the client would be overwritten on the refresh.

Responses worth handling: `422 RATE_HAS_NO_BUILDUP` (the rate carries no
build-up to split — fall back to writing the rate alone) and `404
RATE_NOT_FOUND`.

---

## 5. What was deliberately NOT done

- **No migration.** No stored row is re-classed from Labour to Plant. The
  production count on 23 Sep found 6 Plant rows across 3 projects, all sent by
  a plugin, all at rate 0 — they are left exactly as they are.
- **The Plant constants ship at 0.** A plant figure nobody set is a figure
  nobody can defend, and a non-zero default would move the cost/profit split on
  every project that regenerates its schedule.
- **`ProjectBudgetTab.jsx` was left alone.** Its `kindMeta` / `kindRank` are
  presentation only and already handle plant, equipment and consumable
  correctly. It is a sixth copy of the vocabulary, but the client cannot import
  from `server/` without a Vite and CDK bundling change, which is not something
  to do in launch week. Worth unifying behind a shared package later.
- **The ArchiCAD Plant column.** Deferred by the owner to after launch.
- **Whether plant gets its own master price library and per-state override
  kind.** Still open — see `PLANT-IN-BUDGET.md`.
