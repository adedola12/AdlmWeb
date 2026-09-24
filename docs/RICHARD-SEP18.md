# Richard's 17-18 September update, on our data

His prototype (`RichardEnoch/adlm-studio-site`, cloned beside this repo as `ADLMWebNewUI`)
gained eight commits on 17 and 18 September 2026, `eaf8bd5..596e9cb`. This file records what
came over, what did not, and why — the same way `PLAN.md` records his 16 September review.
His next ten commits, on 22 September, are almost entirely designs for the Windows products;
they have their own section at the foot of this file.

The port has two layers and they moved separately:

- **The look** was ported on 18 September in `d1839cb` ("P0.1b"), by re-running
  `client/scripts/port-ds-css.mjs` and `port-ds-html.mjs`. Re-running them today against his
  HEAD changes nothing, so the generated layer is current.
- **The behaviour** is this pass (22 September), hand-written onto our real data in the
  `Ds*.jsx` screens and `features/projects/*`. Commits are prefixed `S18-`.

## What his eight commits were

| Commit | His words |
|---|---|
| `c36d980` | Projects match what the preview can do, with less: summary, variations, final account, buy schedule |
| `363557b` | QUIV side one: the plugin in Revit, docked or full screen, saving to ADLM Cloud |
| `1cbd908` | WORK.md: QUIV side one and the RateGen Figma, written out properly |
| `6a85b22` | Theme swatches no longer collide with the account switcher |
| `aec41bd` | RateGen aligned to the original design: overhead and profit, plant, composition, price updates, one custom rate builder |
| `5f2867e` | Toasts move top right, one Work dashboard, AI auto take-off, and HERON on the QUIV engine |
| `686f0c6` | WORK.md: side one second pass and the overview rebuild |
| `596e9cb` | One summary of the whole project: what is built, what is left, and who can move it |

## Decisions the owner took, 22 September

These settle the places where his prototype and our live system disagree. They are not
Richard's preferences being overruled for their own sake: each one protects money that
customers have already seen, or a contract the desktop plugins rely on.

1. **Our totals formula wins everywhere.** His prototype and ours cascade preliminaries,
   contingency, variations and VAT in a different order. Every screen now reads one module,
   `client/src/features/projects/lib/projectTotals.js`.

   **The formula did not change; its input was wrong, and the Bill's estimated total therefore
   falls on some projects.** Before this branch, the Bill cascaded on `fullProjectTotal` — a
   figure that already contained the provisional and PC sums, the preliminaries and the
   variations — so those were counted twice and preliminaries were charged on the doubled
   block. Measured ₦120m with ₦18.5m of sums, 7.5% preliminaries, 5% contingency and 7.5% VAT
   read ₦203.1m; it now reads ₦168.1m, and a bill of preliminaries alone falls by 7%.

   Nothing anyone has signed moves. `lockContract()` on the server has always frozen the
   contract sum on the true measured base, so a locked contract, every issued certificate,
   every payment, the PM dashboard and the public project dashboard already carried the lower,
   correct figure. The change closes a gap between the Bill screen and the contract rather than
   opening one. The exposure is a quotation taken off the Bill screen without locking a
   contract: that quote was too high, and a re-quote comes in lower.
2. **Variations get an approval status**, `pending | approved | rejected`. Everything that
   exists today, and anything raised automatically, reads as approved, so no total moves.
   Only an approved variation counts anywhere.
3. **Website RateGen editing is customer-level only.** Master material, labour and rate prices
   are edited in Rate Gen desktop and published from there; the server still refuses master
   writes from the web (405 `MASTER_READ_ONLY`).
4. **We keep what his design drops**: the contract PIN, the quick-jump rail, the BoQ heatmap
   and the ribbon toolbar. The PIN in particular is a safety control.
5. **Our RateGen defaults stay** (10%/25% master, 10%/10% custom). His 0% is prototype-only.
6. **Copy describes what our system really does.** Where his wording promises behaviour ours
   does not have, ours says the true thing instead.

## What was built

### The Work overview, as one dashboard
His rebuild of 18 September, on real data: four headline tiles, "Needs a decision" as one
table, "Continue where you left off" (up to three remembered places plus the next lesson),
then Projects, Valuations and variations, Programme, RateGen and Learning. The Cards/Register
switch and the "by product" cards are gone, as in his design. One new read-only route,
`GET /me/work-overview`, does the aggregation.

Figures are honest or absent: a tile says what it actually sums, and a row whose data we do
not store (model drift, for one) is left out rather than invented.

### The project: summary, stages, variations, final account, buy schedule
- The Bill ends in his Summary box: measured work, preliminaries, **PC sums and provisional
  sums as separate named groups**, contingency, approved variations, VAT, estimated total.
  Read-only once the contract is locked.
- Six stages, read from real data rather than guessed from progress, including **Tendered**.
- The Valuation tab carries his switch: **Certificates · Variations · Final account** (our BIM
  models view stays reachable). Variations are raised pending and approved or rejected there.
- The final account shows both readings, each labelled: movement against the contract sum, and
  actual against planned.
- The buy schedule is his layout — four KPIs, dated rows with money — a material can be ticked
  as bought, and the lead time is saved per project.
- Programme: milestone diamonds, the critical dot, priority, and a "Bill not in any task" KPI
  with a link that plans them.
- Pricing a line now prices the matching unpriced lines, and the live-rate switch is his
  "Follow RateGen changes".

### RateGen
Four tabs (Item of works, Materials, Labour, Plant), his seven-column table with **net cost,
overhead, profit and total**, the rate composition card, a custom rate builder in one card,
the customer's own rates badged in the list, bulk price updates by category and percentage —
all customer-level — and honest empty states. A live bug went with it: every component amount
on `/work/rate/:id` showed ₦0, because the screen read a different field from the one the
route sends.

### Chrome, theme and search
- The theme swatch was broken on every page since the sheets were regenerated: he renamed the
  class and our hand-written menu still used the old one. Fixed, with a test on the class name.
- `client/scripts/verify-ds-port.mjs` now fails when a hand-written component uses a `.ds`
  class the generated CSS no longer defines — the same bug, caught automatically next time.
- Toasts (top right since his 17 September change) now clear our pre-launch countdown strip.
- His plugin reference pages render bare, as his build does, and the staff preview index lists
  them as design references.
- The signed-in app surfaces are out of search: `robots.txt` disallows them and both shells
  render `noindex`.

## What was deliberately not built

| | Why |
|---|---|
| Per-trade overhead and profit defaults | Changes figures the desktop plugins read. Needs Richard and the owner on the work board. |
| The plant costing library (per day from its parts, used by the hour) | A new store the plugins would have to read. Same. |
| "Open in QUIV / HERON" from a web project | Needs an Installer Hub protocol handler: desktop work. |
| AI auto take-off, and model-change (drift) alerts | Plugin features. The website stores no model versions. |
| A "Try QUIV in Revit (preview)" link from the tool pages | It opens a simulation whose AI confidence figures are written examples. |
| His plugin pages as working React | They simulate the Revit and PlanSwift add-ins, which are ours to build in C#. They stay staged as a design reference. |

## His 22 September update: the Windows products

He pushed ten more commits on 22 September 2026, `596e9cb..ca0e6c3`. Almost none of it is
website work.

| Commit | His words |
|---|---|
| `ff30edc` | HERON rebuilt on how it actually works: read the ADLM template, not the drawing |
| `dfb7080` | The Installer Hub as a desktop app, for review before Dolapo builds it |
| `bbcef4a` | Hub: splash and sign-in, and both apps scroll again |
| `f9e52ec` | Hub launch redrawn as a window; Hub gains account pages; HERON gains take-offs |
| `409c259` | Keep the Quiv prototype out of the deploy |
| `474585c` | Build the splash screens from Richard's designs |
| `95e5aa1` | Let the launch screens be replayed for review |
| `f6dfacf` | Rebuild the splash to the Figma frames, measured rather than estimated |
| `e66e977` | Ignore site/Quiv so a broad add stops picking it up |
| `ca0e6c3` | Splash fills its frame, loses the rings, and becomes the sign-in |

Five new pages — `hub`, `splash-quiv`, `splash-heron`, `splash-rategen`, `splash-hub` — plus
`assets/css/{hub,splash,plugin-heron}.css`, `assets/js/{hub,splash,plugin-heron}.js`
(replacing `plugin-heron-config.js`) and eight images.

### These are designs for Windows software, not features of this site

The Installer Hub is a desktop application that installs, updates and licenses every ADLM
product on a QS's PC. The four splash screens are the launch windows of QUIV, HERON, RateGen
and the Hub, and since `ca0e6c3` the splash **becomes** the sign-in rather than handing over
to another window. None of that runs in a browser. **The real work is a desktop job for the
owner**, in the same category as the plugin pages: his drawings say what to build, and what
gets built is C#/WPF, not React.

So they were staged exactly the way `d1839cb` staged `plugin-quiv` and `plugin-heron`: under
`/preview/<slug>`, staff-only, rendered bare, mapped to `null` in `client/src/lib/dsRoutes.js`
so none of them can ever become a customer route, and listed in the staff preview index under
"Windows products" with a `design reference` badge.

### What was staged, and what is deliberately thin

- **Both porters were re-run against his HEAD.** For every page we already had, the only real
  change was `plugin-heron`: PlanSwift now sits *behind* HERON rather than around it, because
  the take-off is finished by the time HERON opens. Every other generated file came out
  byte-identical. Its sheet moved from `plugin-quiv.css` to `splash.css` + `plugin-heron.css`,
  so the two plugin references no longer share one stylesheet.
- **Three sheets added** to `port-ds-css.mjs`: `ds-splash.css`, `ds-hub.css`,
  `ds-plugin-heron.css`. They are lazily imported by the `/preview` routes that need them, so
  no customer page downloads a byte of them.
- **The splash and Hub pages are near enough empty, on purpose.** His sources are a mount
  point and nothing else (`<div id="splash" data-product="quiv">`); the screens are drawn at
  runtime by `assets/js/splash.js` (129 lines) and `assets/js/hub.js` (838 lines), which are
  not ported. Staging records the design and fixes it as a non-route; it does not reproduce
  it. **Review the real thing in his own repo**, which renders it. The preview index says this
  in as many words so nobody files it as a broken page.
- **His splash photography is not copied.** `sp-*.jpg` and `wm-*.png` are 519 KB named only by
  his JavaScript, so `syncImages()` in `port-ds-html.mjs` now copies only what his markup or
  his stylesheets reference, and reports what it left behind. The day that screen is built
  here, the reference comes with it and the sync picks it up.

### Two porter defects his update exposed

- `hub.css` is the first sheet of his to carry a real `url("../img/…")`. Ported into
  `client/src/styles/` that path points at nothing, and Vite fails the **build** on it rather
  than warning. `port-ds-css.mjs` now rewrites it to `/ds/…` — the same rewrite
  `dsRoutes.resolveHref` already does for his markup — and exits non-zero if any relative url
  survives. `verify-ds-port.mjs` gained a matching check.
- A bare page was rendered inside a `React.Fragment`, so it carried no `.ds` scope, so **not
  one ported rule could match it**. His 32 staged `admin-*` screens and both plugin references
  have been rendering as unstyled markup. "Bare" means no nav, footer, promo band or Ada —
  his own build still loads the stylesheets. Fixed with a `.ds` wrapper, and `admin.css` is
  now loaded for the `admin-*` previews, which nothing was doing either.

### What was deliberately not built

| | Why |
|---|---|
| The Installer Hub itself | A Windows application. His `hub.js` is a drawing of one, not one. |
| The four splash/sign-in screens | Launch windows of the desktop products. Same. |
| `splash.js` / `hub.js` as React | They exist to make a desktop design reviewable in a browser. Reproducing them here would be building the wrong thing in the wrong language. |
| HERON's take-offs panel (`plugin-heron.js`, 1,124 lines) | Belongs in the C# add-in, like the rest of side one. |

His own open list is in `ADLMWebNewUI/PROJECT-SUMMARY.md` §7 — the Revit MEP rename (he
recommends SERVIQ), real unit prices and zone factors, product icons, the About photographs,
the BALLW font licence, and whether an unpaid account may download the Installer Hub. None of
those is code.

## How to check this pass

```
cd server && npm test
cd client && npx vitest run && node scripts/verify-ds-port.mjs && npm run build
```

Nothing here was run against the live database, no dev server was started and no mail was
sent: local dev shares the production Atlas cluster.
