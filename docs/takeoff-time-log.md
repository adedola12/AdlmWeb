# Takeoff Time Log

Records how long each takeoff or quantity-extraction session takes when done
with HERON or QUIV, estimates what the same work would have taken by hand, and
reports the time saved per user, firm, product and period on the admin
**Time saved** page (`/admin/time-saved`, sidebar entry under AI usage).

The numbers are meant to be quoted publicly, so the design rule throughout is:
**every figure is traceable to a stored session and a named baseline version,
and every figure is computed on the server.** The plugins send identity,
timings and counts. Nothing else.

## Data model

Collection `takeoffsessions` (`server/models/TakeoffSession.js`), one document
per session:

| Field | Set by | Meaning |
| --- | --- | --- |
| `sessionId` | plugin | UUID generated when the session starts. Unique; a retried upload is dropped, not doubled. |
| `userId`, `email` | server | From the access token / account. |
| `seatId` | plugin | The bound device's fingerprint hash. There is no seat entity on the platform (seats are a count on the entitlement), so the device is the seat. |
| `firmId`, `firmName` | server | The entitlement's `organizationName` for the product (else the profile's `firmName`), slugged. `null` for a personal licence. |
| `product` | plugin | `HERON`, `QUIV` or `RATEGEN`. `productKey` (`planswift`, `revit`...) is kept alongside. |
| `productVersion`, `mode`, `clientTimezone` | plugin | Version string; `auto` or `assisted`. |
| `projectRef` | plugin | A label the user typed or a hash. Anything that looks like a path or a file name is blanked by the server. |
| `startedAt`, `endedAt`, `wallSeconds` | plugin | Wall time is clamped to the timestamps plus 5 min slack, and to 24 h. |
| `activeSeconds` | plugin | Wall time minus idle gaps longer than 120 s. Clamped to `wallSeconds`. |
| `counts` | plugin | `sheets`, `items`, `elementTypes`, `boqLines`, optional `itemsByKind {area, linear, count}` (HERON). Non-negative integers; unknown keys are dropped. |
| `baseline` | server | `method` (`admin_rate_table` or `user_calibration`), `version` of the rate table, `calibrationId` and `scale` when calibrated, and `estimatedManualSeconds`. |
| `savedSeconds` | server | `max(0, estimatedManualSeconds - activeSeconds)`. Always 0 when cancelled. |
| `cancelled` | plugin | The run was cancelled. Stored, but excluded from all totals. |
| `seeded` | seed script | Demo data. Excluded from all totals unless the page asks for it. |
| `schemaVersion` | server | Currently 1. |

Indexes: `sessionId` (unique), `userId + startedAt`, `firmId + startedAt`,
`product + startedAt`, `seeded + cancelled + startedAt`.

### Privacy rule

**Counts only.** No drawing content, file names, element names, quantities or
prices are ever sent or stored. The route rebuilds each record from a field
whitelist (`buildSessionRecord`), so an extra field sent by a client never
reaches Mongo. The integration test in
`server/routes/telemetry.takeoff.test.js` asserts this.

## How the manual estimate is computed

The weak point of any "time saved" claim is the manual baseline, so it is
explicit, versioned and adjustable.

### Admin rate table (`admin_rate_table`)

`server/models/TakeoffBaseline.js` holds versioned rate tables: minutes a QS is
assumed to spend on each unit of work by hand. Exactly one version is active.
Versions are **append-only**: create a new one, activate it, never edit an
old one. Every session records the version it was estimated with.

```
estimatedManualSeconds = 60 x calibrationScale x (
    sheets        x sheetSetupMinutes
  + area items    x areaItemMinutes
  + linear items  x linearItemMinutes
  + count items   x countItemMinutes
  + unsplit items x mixedItemMinutes      (HERON, when no per-kind split)
                  or revitElementMinutes  (QUIV)
  + elementTypes  x elementTypeMinutes
  + boqLines      x boqLineMinutes )

savedSeconds = max(0, estimatedManualSeconds - activeSeconds)
```

The shipped defaults (`server/config/takeoffBaselineDefaults.js`, version
`2026.09-assumed`) are **ADLM's working assumptions, not measurements**, and
the file says so. They are written to the database as the first version the
first time the feature is used. Replace them with timed manual takeoffs as soon
as ADLM has them.

### User calibration (`user_calibration`)

After a user's first completed session the plugin asks once: "Roughly how long
does a takeoff of this size take you by hand?" with a Skip option. The answer
is stored in `takeoffcalibrations` with the counts of that session and becomes
a multiplier on the rate table:

```
scale = (their minutes x 60) / estimateFromRateTable(their session's counts)
```

clamped to [0.25, 4]. It applies to that user's sessions received from then on,
and each such session records `baseline.method = user_calibration`, the
`calibrationId` and the `scale`. Already-stored sessions keep the figures they
were stored with; they are the audit trail. A skip is also stored so the
plugin never asks again.

### Active time

`activeSeconds` is the sum of gaps between consecutive activity ticks (session
start, every user input, every measurement event, session end) that are no
longer than **120 s**. Longer gaps are idle and contribute nothing. The
reference implementation is `activeSecondsFromTicks` in
`server/util/takeoffTime.js`; the plugins implement the same rule in C#
(`TakeoffSessionClock`) and both are unit-tested against the same worked
examples.

## API

Plugin side, authenticated with the plugin's normal access token
(`requireAuth`), mounted at `/telemetry` and `/api/telemetry`:

- `POST /telemetry/takeoff-sessions` with `{ productKey, sessions: [...] }`
  (up to 100). Returns `accepted`, `duplicates`, `rejected[]`, and `results[]`
  with the server's `estimatedManualSeconds`, `savedSeconds`, baseline version
  and ready-made labels (`"14 min"`, `"2 h 10 min"`) for the plugin's line.
  Also `calibration.asked` so the plugin knows whether to ask the question.
- `GET /telemetry/takeoff-calibration?product=HERON`
- `POST /telemetry/takeoff-calibration` with `{ product, skipped: true }` or
  `{ product, manualMinutes, referenceCounts, referenceSessionId }`.

Admin side (`requirePermission("adminhub")`):

- `GET /admin/takeoff/summary` and, as the brief names it,
  `GET /telemetry/takeoff-summary`. Filters: `from`, `to` (or `days`),
  `product`, `firmId`, `userId`, `groupBy` (`day`, `week`, `month`, `user`,
  `firm`, `product`), `includeSeeded=1`, `includeCancelled=1`. Returns
  `totals` (sessions, active, estimated manual, saved, medians, users),
  `groups[]`, `baselineVersions[]` involved, `activeBaseline` and a
  `methodology` block.
- `GET /admin/takeoff/sessions` drill-down, `GET /admin/takeoff/firms`.
- `GET /admin/takeoff/baselines`, `POST /admin/takeoff/baselines`
  (`{ version, rates, notes, activate }`; notes are required and should say
  where the numbers came from), `POST /admin/takeoff/baselines/:version/activate`.

## Changing the rate table

1. Open **Time saved** in the admin, scroll to **Methodology and baseline**.
2. Fill in the new minutes per unit, give the version a name (for example
   `2026.11-timed-12-jobs`) and write in the notes how the numbers were
   obtained. Tick **Activate**.
3. New sessions use it immediately (the server caches the active version for
   one minute). Old sessions keep their version; the summary lists every
   version involved in the period you are looking at, so a public figure can
   always say which assumptions it rests on.

## Plugins

Both plugins share the same shape (`Services/TakeoffTelemetry/` in HERON,
`Infrastructure/TakeoffTelemetry/` in QUIV):

- `TakeoffSessionClock` keeps the ticks and applies the idle rule.
- `TakeoffTelemetryService` starts and ends sessions, appends completed
  records to an append-only JSON-lines outbox in the user's local app data,
  and a background loop posts them in batches with exponential backoff.
  Nothing on the UI thread waits for the network, and an export never waits
  for telemetry.
- After a completed session the plugin shows one dismissible line:
  *"This takeoff took 14 min. Estimated manual time: 2 h 10 min."* The
  estimate comes from the server's response; offline, only the first half is
  shown.
- Opt-out: a **Share takeoff timings with ADLM** setting, on by default with a
  one-time notice. Neither installer ships an EULA; the website privacy page
  already states that aggregate usage data is used, and the usage heartbeat is
  on by default, so this follows the existing practice. The privacy page
  should mention timing counts explicitly; a draft sentence is in the PR notes.

## What each plugin counts

| Count | HERON (PlanSwift) | QUIV (Revit) |
| --- | --- | --- |
| `sheets` | Auto Take Off: sheets captured with a usable transform. Assisted (template) takeoff: 0, the plugin cannot see which pages were measured. | 0 for now. |
| `items` | Measured items across the exported folders, split by kind from the unit string (`TakeoffCountClassifier`). | **Stored results** (one per level and type the estimator computed). Conservative on purpose: the tools do not yet report how many element instances each result covered. Adding that count raises the estimate, never lowers it. |
| `elementTypes` | Takeoff folders exported. | Distinct `ElementType` values among the results (Walls, Beams...). |
| `boqLines` | Summary rows written to the workbook, or cloud bill items. | Lettered lines written to the Complete BOQ CSV. |

Sessions: HERON starts an *assisted* session when a job's folders load and ends
it on Export, Export all or Save to Cloud; an *auto* session runs from Build
scope or Capture to Finish (Scope another cancels). QUIV starts on the first
stored result and ends on the Complete BOQ export (Clear All cancels); the
Model Items export is recorded as its own small session. Both cancel an open
session on sign-out and on exit, and the record is still queued, flagged.

## Seed data for review

```
cd server
node scripts/seed-takeoff-sessions.mjs            # dry run against the live DB's active baseline
node scripts/seed-takeoff-sessions.mjs --offline  # dry run with no database, shipped defaults
node scripts/seed-takeoff-sessions.mjs --write    # insert 200 sessions, 3 firms, 2 products
node scripts/seed-takeoff-sessions.mjs --wipe --write
```

Note that local dev and production share one Atlas cluster, so `--write` puts
seed data into production (flagged, and excluded from totals). The offline dry
run of the shipped defaults gives roughly 76 h active against 1,480 h estimated
manual for 185 sessions, a ratio of about 19x. That ratio is a property of the
assumed rates, which is exactly why they are versioned and must be replaced
with measured values before a figure is quoted.

Seeded records carry `seeded: true`, are excluded from every total by default,
and the page shows a banner when they are included.

## Tests

```
cd server
node --test util/takeoffTime.test.js routes/telemetry.takeoff.test.js
```

Unit tests cover the idle rule and the baseline arithmetic with hand-checkable
examples; the integration test posts a batch over HTTP with a real token and
reads the summary back with Mongo stubbed.
