# ADLM plugin release checklist — post-AWS migration

Every C# plugin now resolves its API host from the `ADLM_API_BASE_URL`
environment variable, falling back to `https://api.adlmstudio.net`. Before the
migration each one had `https://adlmweb.onrender.com` compiled into the DLL,
which is why a suspended Render account took the desktop products down and no
configuration on a customer's machine could rescue them.

**None of the C# changes have been compiled.** They were written in an
environment with no .NET SDK. Everything below assumes you build first.

---

## 0. Before you touch any plugin

Confirm the API is healthy, so a plugin failure means the plugin.

```powershell
curl.exe https://api.adlmstudio.net/health
# expect: {"ok":true,"db":"connected","uptime":<n>}
```

`db` may briefly read `disconnected` on an idle container — that is the pool
draining, not an outage. Make any authenticated call and it reconnects. Judge
health on `ok`, not on `db`.

```powershell
curl.exe https://api.adlmstudio.net/.well-known/jwks.json   # 200, licence keys
```

Set the variable on your own machine so you are testing the same path a
customer gets:

```powershell
[Environment]::SetEnvironmentVariable('ADLM_API_BASE_URL','https://api.adlmstudio.net','User')
```

Then **restart the host application** — Revit, Civil 3D, PlanSwift read the
environment at process start, so a running instance keeps the old value.

---

## 1. Per-plugin build and test

Branch is `claude/api-base-url-from-env` in every repo except TimeMgt, which is
`claude/timemgt-sync-via-api`.

### The five, and what specifically to watch in each

| Plugin | Repo | What changed | The thing most likely to break |
|---|---|---|---|
| HERON | `adlmplanswiftapp` | 9 call sites, `const` → `static readonly` | Largest diff of the five |
| QUIV | `revitpluginarch` | 3 fallback defaults only | Should be a no-op — it already read the env var |
| MEP | `adlmrvtmepplugin` | new `ADLM.Auth/ApiEndpoint.cs`, `AdlmConfig.ApiBaseUrl` now a property | It was a `const`; anything consuming it in a constant context won't compile |
| RoadTools | `adlm-c3d-roadtools` | `AdlmConfig.ApiBaseUrl` now a property; sign-up hyperlink repointed | Had no env var support at all — biggest behaviour change |
| TimeMgt | `timemanagementapp` | `MongoDbService` replaced by `TaskApiService` | Sync moved from direct Mongo to `/api/tasks` |

### Build

```powershell
git fetch origin
git checkout claude/api-base-url-from-env   # or claude/timemgt-sync-via-api
dotnet build -c Release
```

A compile error here is expected to be one of two kinds and both are quick:
a `const`-context use of `ApiBaseUrl`, or a missing `using System;`. Send me
the error rather than working around it.

### Smoke test — every plugin, in this order

1. **Launch the host app** (Revit / Civil 3D / PlanSwift / standalone).
2. **Sign in** with a real account that has the right entitlement.
   - Expect success within a few seconds.
   - "Server is temporarily unavailable" now means a genuine API problem, not
     a stale URL — that message was the Render symptom.
3. **Sign out, sign back in.** Catches token/refresh handling.
4. **Exercise the one feature that talks to the cloud** (table below).
5. **Kill the network, relaunch, sign in.** Should fall back to the cached
   offline licence, not hang for 30s.
6. **Restore the network** and confirm it recovers without a reinstall.

### The cloud feature to exercise, per plugin

| Plugin | Do this |
|---|---|
| HERON | Load rates (Material/Labour), then save and reload a cloud project |
| QUIV | Sign in, confirm entitlement gate opens the paid commands |
| MEP | Run a takeoff, save to cloud, reopen it |
| RoadTools | Load the Rate-Gen library; save a Civil 3D takeoff and list it back |
| TimeMgt | Add a task, confirm it appears in `adlmWeb.timemgtTasks` in Atlas |

### Redirect test — proves the whole point of the change

For one plugin, prove the URL is no longer welded in:

```powershell
[Environment]::SetEnvironmentVariable('ADLM_API_BASE_URL','https://httpstat.us/503','User')
# restart the host app, attempt sign-in -> must fail with a server error
[Environment]::SetEnvironmentVariable('ADLM_API_BASE_URL','https://api.adlmstudio.net','User')
# restart, sign in -> must succeed
```

If sign-in **succeeds** while pointed at the bogus host, the build is still
using a compiled-in URL and the fix did not take. That is the single most
important check on this list.

---

## 2. TimeMgt only — extra checks

Sync moved off a shared MongoDB credential onto the authenticated API, so
verify ownership actually scopes:

```powershell
node server/scripts/verify-timemgt-sync.mjs you@example.com
```

Six checks, all must pass. Then, in the app:

- Add a task offline → confirm it queues in `pending-actions.json`
- Reconnect → confirm it syncs and the queue empties
- Sign in as a **different** account → confirm you do **not** see the first
  account's tasks

That last one is the whole reason the migration happened. Tasks previously had
no `ownerKey`.

---

## 3. Installer

The InstallerHub already writes `ADLM_API_BASE_URL` to `HKCU\Environment`.
Confirm it writes `https://api.adlmstudio.net` and not the Render host, or
every fresh install re-creates the outage on a machine that would otherwise
have been fine.

```powershell
reg query "HKCU\Environment" /v ADLM_API_BASE_URL
```

---

## 4. Ship

- [ ] All five build clean in Release
- [ ] All five sign in against the live API
- [ ] Redirect test passes on at least one
- [ ] TimeMgt cross-account isolation confirmed
- [ ] InstallerHub writes the correct URL
- [ ] Merge each `claude/*` branch
- [ ] Cut installers, bump versions

Then, and only then, rotate the `timemgt` Atlas password — it is in git history
in the deleted `MongoDbService.cs`. Nothing reads it any more, so rotating
should break nothing, but do it after the builds are confirmed rather than
during.
