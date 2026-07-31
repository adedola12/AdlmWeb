# Prompt: rebuild and relink all ADLM desktop software to the new API

Paste everything below the line into a Claude Code session started on the
Windows machine that has the .NET SDK and all five plugin repos checked out
(`C:\Users\ADLM\source\repos`). Do not run it from the web session — that
environment has no .NET SDK and cannot compile, which is why the code changes
so far are unverified.

---

## Context

ADLM Studio's backend moved off Render (the account was suspended and the
service went offline) onto AWS. The API now lives at
**`https://api.adlmstudio.net`** — Express on Lambda behind CloudFront, in
eu-west-1. MongoDB was not migrated; it is still the same Atlas cluster, same
`adlmWeb` database. No API routes, request shapes or response shapes changed.

Every C# product had `https://adlmweb.onrender.com` compiled into the DLL. When
Render went down there was no way to redirect any of them without shipping a
new build to every customer. That is the defect being fixed: the host must come
from configuration, not from a constant.

QUIV was the only product that kept working, because it reads
`ADLM_API_BASE_URL` from the environment and the machine's value won. That is
the pattern every product now follows.

## The five codebases and their state

| Product | Path under `C:\Users\ADLM\source\repos` | Branch | Change |
|---|---|---|---|
| HERON | `ADLMPlanswiftApp` | `claude/api-base-url-from-env` | 9 call sites; new `Services/AdlmApiConfig.cs`; `const` → `static readonly` |
| QUIV | `nw\RevitPluginArch-20250527T074434Z-1-001\RevitPluginArch` | `claude/api-base-url-from-env` | 3 fallback defaults only |
| MEP | `ADLMRvtMEPPlugin` | `claude/api-base-url-from-env` | new `ADLM.Auth/ApiEndpoint.cs`; `AdlmConfig.ApiBaseUrl` const → property |
| RoadTools / CIVIQ | `ADLM.C3D.RoadTools` | `claude/api-base-url-from-env` | `AdlmConfig.ApiBaseUrl` const → property; sign-up hyperlink repointed |
| TimeMgt | `TimeManagementApp` | `claude/timemgt-sync-via-api` | `MongoDbService` replaced by `TaskApiService`; sync moved to `/api/tasks` |

**These branches have never been compiled.** They were written in an
environment with no .NET SDK. Assume there are build errors and expect to fix
them. The two most likely are a `const`-context use of `ApiBaseUrl` (it is a
property now, so it cannot initialise another `const`, appear in an attribute
argument, or be a `case` label) and a missing `using System;`.

## Your task

Work through the products one at a time, in this order: **MEP, RoadTools,
TimeMgt, QUIV, HERON.** HERON is last because it is the largest diff and the
only one currently broken in production, so it benefits from everything learned
on the others.

For each product:

1. `git fetch` and check out the branch above. If the remote is not named
   `origin`, use whatever `git remote -v` reports.
2. `dotnet build -c Release`. Fix any compile error in the smallest way that
   preserves intent — do not restructure, do not upgrade packages, do not
   change frameworks.
3. Confirm no live reference to `onrender` survives outside comments:
   `git grep -n onrender -- "*.cs" "*.xaml" "*.json" "*.config"`
4. Launch the host application and sign in with a real account that holds the
   relevant entitlement. Then sign out and back in.
5. Exercise the one cloud-backed feature: HERON → load rates, save and reopen a
   cloud project. QUIV → confirm the entitlement gate opens paid commands. MEP
   → save a takeoff to cloud and reopen it. RoadTools → load the Rate-Gen
   library and save a Civil 3D takeoff. TimeMgt → add a task and confirm it
   lands in `adlmWeb.timemgtTasks`.
6. Disconnect the network, relaunch, sign in — it must fall back to the cached
   offline licence rather than hanging.

### The one test that actually proves the fix

For **each** product, after it builds and signs in:

```powershell
[Environment]::SetEnvironmentVariable('ADLM_API_BASE_URL','https://httpstat.us/503','User')
# restart the host app, attempt sign-in  ->  MUST FAIL with a server error
[Environment]::SetEnvironmentVariable('ADLM_API_BASE_URL','https://api.adlmstudio.net','User')
# restart, sign in  ->  MUST SUCCEED
```

If sign-in **succeeds** while pointed at the bogus host, that build is still
using a compiled-in URL and the fix did not take in that product. Every other
check can pass while the real defect survives. Do not mark a product done
without this.

## Linking the products up

All five must agree on three things. Verify, do not assume:

1. **Base URL** — `https://api.adlmstudio.net`, read from `ADLM_API_BASE_URL`,
   trailing slash trimmed.
2. **Product key** — the value sent to `/auth/login` and `/me/entitlements`. It
   must match the `ProductDeployment.productKey` in the admin catalogue:
   `planswift` (HERON), `revit` (QUIV), `mep`, `civil3d` (RoadTools). A
   mismatch signs in fine and then reports no entitlement, which reads to a
   user as "my subscription vanished".
3. **Device fingerprint** — all products should be on the shared v2 hardware
   identity. MEP 1.8.2 moved to it; confirm the others match, because a
   fingerprint that varies by network adapter causes `DEVICE_MISMATCH`
   lockouts when a user docks or starts a VPN.

Also confirm each product's JWKS fetch resolves against the new host, since
licence tokens are RS256-signed and validated against
`https://api.adlmstudio.net/.well-known/jwks.json`.

## InstallerHub

The InstallerHub writes environment variables to `HKCU\Environment` from the
`envVars` map on each `ProductDeployment` record. Check what it currently
writes for `ADLM_API_BASE_URL`:

```powershell
reg query "HKCU\Environment" /v ADLM_API_BASE_URL
```

If any deployment record still carries the Render host, every fresh install
recreates the outage on a machine that would otherwise be fine. Fix it in the
admin catalogue before publishing anything.

## Publishing — do this last, and deliberately

Only after all five build, sign in, and pass the redirect test:

1. Bump versions: HERON 2.5 → 2.5.1, QUIV 3.1.6 → 3.1.7, MEP 1.8.2 → 1.8.3.
2. Package, upload, and update each `ProductDeployment` with the new
   `version`, `packageUri` and `sha256`. The hash is what makes InstallerHub
   refuse a tampered package — do not leave it blank.
3. **Roll out to yourself first**, then a small group, then everyone. A forced
   update that fails leaves users worse off than the current state, where four
   of five products still work.
4. Merge each `claude/*` branch only after its build is confirmed good.

## Constraints

- Do not migrate any database. MongoDB stays on Atlas.
- Do not rewrite applications. No framework changes, no TypeScript conversion,
  no dependency upgrades beyond what the build strictly requires. Minimum
  viable change.
- Do not commit secrets. If you find secrets in git history, stop and report
  before doing anything else. (One is already known: a `timemgt` Atlas password
  in the deleted `MongoDbService.cs`. It is scheduled for rotation after these
  builds are confirmed — do not rotate it mid-build.)
- Do not touch ADLM Cloud, licence validation logic, or the NIQS site.
- Report honestly. If a product does not build or a test fails, say so with the
  error rather than working around it. A green report on an untested build is
  worse than no report.
