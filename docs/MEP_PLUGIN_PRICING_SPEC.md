# MEP Plugin — In‑Revit Pricing Spec (parity with QUIV/HERON)

**Repo:** `C:\Users\ADLM\source\repos\ADLMRvtMEPPlugin`
**Goal:** the MEP plugin fetches material + labour prices from ADLM RateGen, builds up rates (with user‑added rates + profit/overhead tracking), shows the priced build‑up **inside Revit**, and saves a **priced** services project — i.e. parity with QUIV/HERON.

This is a **build/test‑in‑Visual‑Studio** task (a Revit add‑in can't be compiled or run from the website repo). The website side it depends on is **already shipped** (on `main`).

---

## Architecture decision (from the council — do NOT skip)

**Do not re‑implement the rate/build‑up math in C#.** QUIV and HERON each carry their own copy of the rate stack; a third copy in MEP would diverge (a fix in one never reaches the others, and linked totals between projects would disagree).

Instead, the **build‑up math lives once, server‑side**, in the already‑shipped engine (`server/util/serviceCompute.js`) behind **`POST /rategen-v2/services/compute`**. The plugin becomes a **thin client**:

```
MEP plugin (Revit)
  1. measure quantities (already does this)
  2. POST quantities → /rategen-v2/services/compute   ← server resolves RateGen rates
                                                          + applies the user's Constants
                                                          + runs the shared engine
  3. show the returned build-up in the QTO grid; let the QS set overhead/profit
  4. POST priced items → /projects/mep/full           ← saves bill + budget, linked
```

The QS still sees live priced build‑ups **in Revit** (true parity), but there is **one** source of truth for the numbers.

> If you later want offline pricing, extract a shared **`ADLM.RateEngine`** NuGet (AuthClient + RateGenService + a C# port of `serviceCompute`) consumed by QUIV/HERON/MEP — never a 4th copy‑paste. Out of scope for this pass.

---

## Website endpoints to call (already live on `main`)

All require `Authorization: Bearer <accessToken>` (the plugin already attaches this).

### 1. `POST /rategen-v2/services/compute` — price quantities
Request:
```jsonc
{
  "items": [
    {
      "type": "pipe",              // pipe | duct | cable | conduit | tray | fixture | equipment
      "description": "25mm GI Pipe",
      "qty": 50,                    // metres (length types) or count (fixture/equipment)
      "unit": "m",
      "materialName": "25mm GI Pipe",   // optional; defaults to description for resolution
      "labourName": "Pipe installation",// optional
      "connectorName": "GI coupling",   // optional; resolved as a material
      "fittings": [                      // optional discrete fittings (mix-of-both #1)
        { "name": "GI Elbow 25mm", "count": 8 }
      ],
      "overheadPercent": 10,
      "profitPercent": 15,
      // Optional explicit overrides — if the plugin resolves its own rates,
      // pass them and server resolution is skipped:
      "materialRate": null, "labourRate": null, "connectorRate": null
    }
  ]
}
```
Response:
```jsonc
{
  "ok": true,
  "items": [
    {
      "type": "pipe",
      "description": "25mm GI Pipe",
      "qty": 50,
      "resolved": { "materialRate": 1200, "labourRate": 300, "connectorRate": 150 },
      "buildup": {
        "lines": [
          { "componentKind": "Material", "description": "25mm GI Pipe", "qty": 9, "unit": "Nr", "rate": 7200 },
          { "componentKind": "Material", "description": "Connectors",    "qty": 8, "unit": "Nr", "rate": 150 },
          { "componentKind": "Labour",   "description": "Installation",  "qty": 50, "unit": "m", "rate": 300 }
        ],
        "net": 80000, "sticks": 9, "connectors": 8, "rate": 1840.0
      }
    }
  ],
  "totals": { "net": 80000, "amount": 92000 }
}
```
- `buildup.rate` is the **derived unit rate** (incl. overhead + profit) to display next to the bill line.
- `buildup.lines` are the **material/labour breakdown** to show in a build‑up popover and to send back as `materialItems` on save (below).

### 2. `GET /rategen-v2/services/constants` — (optional) show standard lengths in‑plugin
Returns `{ ok, unitSystem, types: { pipe:{ standardLength, connectorRule, ... }, ... } }`. The QS edits these on the **web** (Profile → RateGen → Services Constants); the plugin only needs to *read* them if you want to display "9 sticks of 6 m" in the UI. The server already applies them in `/services/compute`, so reading is optional.

### 3. `POST /projects/mep/full` — save a priced services project
Mirror QUIV/HERON's `/full` save. Request:
```jsonc
{
  "name": "Tower B — Services",
  "clientProjectKey": "<stable Revit model key>",
  "modelFingerprint": "<fingerprint>",
  "takeoffItems": [                 // the BILL lines (one per measured services item)
    {
      "sn": 1,
      "code": "MEP-PIPE-25GI",      // STABLE per-line code — REQUIRED for budget linkage
      "description": "25mm GI Pipe",
      "qty": 50, "unit": "m",
      "rate": 1840.0,               // = buildup.rate from /services/compute
      "discipline": "mep",
      "category": "Pipework"
    }
  ],
  "materialItems": [                // the BUILD-UP lines (material + labour), per bill line
    {
      "sn": 1,
      "sourceTakeoffCode": "MEP-PIPE-25GI",   // = takeoffItem.code  (links budget→bill)
      "code": "MEP-PIPE-25GI",
      "componentKind": "Material",            // "Material" | "Labour"
      "materialName": "25mm GI Pipe",
      "description": "25mm GI Pipe",
      "qty": 9, "unit": "Nr",
      "rate": 7200, "netUnitCost": 7200,
      "overheadPercent": 10, "profitPercent": 15,
      "derived": true
    },
    { "sn": 1, "sourceTakeoffCode": "MEP-PIPE-25GI", "componentKind": "Labour",
      "description": "Installation", "qty": 50, "unit": "m", "rate": 300,
      "netUnitCost": 300, "overheadPercent": 10, "profitPercent": 15, "derived": true }
  ]
}
```
Response: `{ ok, takeoffProjectId, materialsProjectId, takeoff:{...}, materials:{...}, margins:{...} }`.

The server consolidates `materialItems` into `budgetItems`, runs `deriveBillRatesFromBudget` + reconcile, and stores bill + budget on one document — exactly like QUIV/HERON. The bill rate it derives will match `buildup.rate`.

> **`code` is load‑bearing.** Budget→bill linkage keys on `takeoffItem.code` == `materialItem.sourceTakeoffCode`. Emit a stable per‑line code (e.g. `MEP-<discipline>-<type>-<size>`). Lines without a code won't get a derived rate.

---

## C# changes, by file

### `Storage/CloudSaveService.cs`
1. Add `SaveFullAsync(project)` that POSTs to **`/projects/mep/full`** with `{ takeoffItems, materialItems, name, clientProjectKey, modelFingerprint }`.
   - Keep the existing `POST /projects/mep` path as a fallback so an un‑priced save still works (backward compatible).
2. The current `ToBackendItem` sends `rate: 0`. Add a second mapper `ToBuildupItems(result)` that turns each `/services/compute` `buildup.lines[]` into `materialItems` (set `sourceTakeoffCode = code`, `componentKind`, `qty`, `rate`, `overheadPercent`, `profitPercent`, `derived:true`).
3. Emit a **stable `code`** per QTO row (see note above).

### New: `Services/ServicesPricingClient.cs`
- `Task<ServicesComputeResult> ComputeAsync(IEnumerable<ServiceInput> items)` → POST `/rategen-v2/services/compute`, deserialize the response shape above.
- Reuse the existing `AuthClient`/HTTP wrapper (Bearer + 401‑refresh). **Do not** add a new auth stack.
- DTOs: `ServiceInput { Type, Description, Qty, Unit, MaterialName, LabourName, ConnectorName, Fittings[], OverheadPercent, ProfitPercent }`, `ServiceBuildup { Lines[], Net, Sticks, Connectors, Rate }`, `ServiceLine { ComponentKind, Description, Qty, Unit, Rate }`.

### `ViewModel/.../QuantityTakeOffViewModel.cs`
1. Map each QTO result → `ServiceInput`:
   - `Type` via the mapping table below (Pipework→pipe, Duct Work→duct, Cable/Cable Tray→cable/tray, Conduit→conduit, terminals/fixtures/equipment→fixture/equipment).
   - `Description` = the element's material descriptor (what RateGen prices by, e.g. "25mm GI Pipe").
   - `Qty`/`Unit` = the measured length (m) or count (Nr).
   - `Fittings` = counted fitting rows (DuctFitting, pipeFittingQty, CableFittingQuantity).
2. Add a **"Price from RateGen"** command → `ServicesPricingClient.ComputeAsync` → bind `buildup.rate` into a new **Rate** column and the `buildup.lines` into a per‑row **build‑up popover** (Material/Labour split), matching HERON's review UI.
3. Add **Overhead %** and **Profit %** inputs (global + per‑row override); pass them in the request; show the resulting margin.
4. On **Save**, call `CloudSaveService.SaveFullAsync` with the priced `takeoffItems` + `materialItems`.

### Type mapping (Revit category → service type)
| MEP result type | service `type` | measure |
|---|---|---|
| Pipework | `pipe` | length |
| Duct Work | `duct` | length |
| Cable Works | `cable` | length |
| Cable Tray | `tray` | length |
| Conduit | `conduit` | length |
| Pipe/Duct/Cable Fitting | (fitting on parent run, or) `fixture` | count |
| Air Terminal, Plumbing/Light/Power Fixture, HVAC Equipment | `fixture` / `equipment` | count |

---

## Fix the "Delete all → Failed 23" bug while you're here

Root cause: the website returns **HTTP 428 `STEP_UP_REQUIRED`** on `DELETE` when the user has step‑up enabled, and the plugin's HTTP layer (`AuthClient`) handles 401/403/404/400 but **not 428**, so every delete fails generically.

In `AuthClient` response handling, detect **428** and surface a clear message: *"Email verification is on for destructive actions. Turn it off in your web Profile, or verify on the web, then retry."* (A full in‑plugin OTP flow is optional/later.) Until shipped, the immediate user workaround is Profile → turn off "Require an email code for destructive actions."

---

## Backward compatibility & rollout

- Old MEP builds keep working: they POST `/projects/mep` with `rate:0`; the server saves a bill with no budget (no retroactive changes). Mixed plugin versions are safe.
- New build switches saves to `/projects/mep/full`.
- No website changes needed — the endpoints are live on `main`.

## Test checklist (Visual Studio + Revit)
1. Sign in; measure a small model (a few pipe runs + fittings + a fixture).
2. "Price from RateGen" → verify rates appear, build‑up popover shows Material/Labour, sticks/connectors match your Constants (e.g. 50 m @ 6 m = 9 sticks, 8 connectors).
3. Change Overhead/Profit → rate updates.
4. Save → confirm on the website the MEP project shows the same rates, and the **linked MEP total** on the architectural project shows the money.
5. Token‑expiry: leave it idle past token expiry, then Price/Save → confirm 401‑refresh works (or surface a clear re‑login prompt).
6. Delete a project with step‑up ON → confirm the new 428 message appears (not a silent fail).
