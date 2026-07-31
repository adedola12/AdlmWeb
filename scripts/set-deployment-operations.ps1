# set-deployment-operations.ps1
# ============================================================================
# Replaces the install `operations` on a product's InstallerHub deployment
# record, leaving every other field exactly as it was.
#
#   .\scripts\set-deployment-operations.ps1 -ProductKey planswift `
#       -OperationsFile .\docs\heron-operations.json -WhatIf
#
# Same read-merge-write discipline as publish-build.ps1, and for the same
# reason: the server's PUT rebuilds the record from the body, so any field
# you omit is RESET. Here that would mean losing packageUri and version —
# i.e. pointing every user at an empty download while "just" editing the
# install steps.
#
# The operations file may be either a bare JSON array of operations, or an
# object with an "operations" key (so docs/heron-operations.json, which also
# carries explanatory keys, works as-is).
#
# ALWAYS RUN WITH -WhatIf FIRST. It prints the operations the server would
# store AFTER its own normalisation, which is what actually matters: an
# operation with an empty `target` is silently dropped by
# normalizeOperation(), so a typo costs you a step with no error anywhere.
# ============================================================================

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)][string] $ProductKey,
    [Parameter(Mandatory = $true)][string] $OperationsFile,
    [string] $ApiBaseUrl = "https://api.adlmstudio.net",
    [string] $AdminEmail = ""
)

$ErrorActionPreference = "Stop"
function Fail($m) { Write-Host "`n  $m`n" -ForegroundColor Red; exit 1 }
function Good($m) { Write-Host "  $m" -ForegroundColor Green }
function Note($m) { Write-Host "  $m" -ForegroundColor DarkGray }

# ── Load and sanity-check the operations ────────────────────────────────────
if (-not (Test-Path -LiteralPath $OperationsFile)) { Fail "No such file: $OperationsFile" }
try { $doc = Get-Content -LiteralPath $OperationsFile -Raw | ConvertFrom-Json }
catch { Fail "$OperationsFile is not valid JSON: $($_.Exception.Message)" }

$ops =
    if ($doc -is [array]) { $doc }
    elseif ($null -ne $doc.operations) { $doc.operations }
    # ConvertFrom-Json unwraps a single-element array, so a file containing
    # exactly one bare operation arrives here as a lone object, not an array.
    # Treat anything carrying a 'target' as one operation.
    elseif ($doc.PSObject.Properties.Name -contains 'target') { @($doc) }
    else { $null }

if (-not $ops) { Fail "No operations found. Provide a JSON array, or an object with an 'operations' key." }
$ops = @($ops)

# The server drops any operation whose target is blank, without complaining.
# Catch that here instead of discovering it from a user whose install did
# half of what it should have.
$bad = @($ops | Where-Object { -not $_.target -or -not "$($_.target)".Trim() })
if ($bad.Count) {
    Fail "$($bad.Count) operation(s) have an empty 'target'. The server would DROP them silently. Fix the file."
}

$validTypes = @("copyDirectory", "copyFile", "createShortcut", "hideDirectory", "runExe")
foreach ($o in $ops) {
    if ($o.type -and $o.type -notin $validTypes) {
        Fail "Unknown operation type '$($o.type)'. Allowed: $($validTypes -join ', '). Anything else is coerced to copyDirectory by the server, which would copy files somewhere you did not intend."
    }
}

Write-Host "`nOperations to apply ($($ops.Count)):"
$i = 0
foreach ($o in $ops) {
    $i++
    Write-Host "  $i. $($o.type)"
    Write-Host "     source : $($o.source)"
    Write-Host "     target : $($o.target)"
    if ($o.preservePatterns -and @($o.preservePatterns).Count) {
        Write-Host "     preserve: $(@($o.preservePatterns) -join ', ')"
    }
    if ($o.cleanTargetOnUpdate) { Note "     cleanTargetOnUpdate=true — the target folder is EMPTIED on update" }
}

# ── Sign in ─────────────────────────────────────────────────────────────────
if (-not $AdminEmail) { $AdminEmail = Read-Host "`nAdmin email / username" }
if ($env:ADLM_ADMIN_PASSWORD) {
    $pwdPlain = $env:ADLM_ADMIN_PASSWORD
    Note "Using ADLM_ADMIN_PASSWORD from the environment."
} else {
    $sec = Read-Host "Admin password" -AsSecureString
    $pwdPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
}

try {
    $login = Invoke-RestMethod -Method Post -Uri "$ApiBaseUrl/auth/login" -ContentType "application/json" `
        -Body (@{ identifier = $AdminEmail; password = $pwdPlain } | ConvertTo-Json)
} catch { Fail "Login failed: $($_.Exception.Message)" } finally { $pwdPlain = $null }

if (-not $login.accessToken) { Fail "Login returned no accessToken." }
$headers = @{ Authorization = "Bearer $($login.accessToken)" }
Good "Signed in as $AdminEmail"

# ── Read current ────────────────────────────────────────────────────────────
$key = $ProductKey.Trim().ToLower()
try { $current = (Invoke-RestMethod -Method Get -Uri "$ApiBaseUrl/admin/deployments/$key" -Headers $headers).item }
catch { Fail "Could not read deployment '$key': $($_.Exception.Message)" }

Write-Host "`nCurrent record"
Write-Host "  version    : $($current.version)"
Write-Host "  packageUri : $($current.packageUri)"
Write-Host "  operations : $(@($current.operations).Count) step(s)  ->  will become $($ops.Count)"
Write-Host "  envVars    : $(@($current.envVars.PSObject.Properties).Count) set  (not sent; server preserves)"

# ── Merge: only `operations` changes ────────────────────────────────────────
$payload = @{
    productKey              = $key
    displayName             = $current.displayName
    packageUri              = $current.packageUri
    packageKind             = $current.packageKind
    version                 = $current.version
    installArguments        = $current.installArguments
    waitForExit             = [bool]$current.waitForExit
    markInstalledAfterLaunch = [bool]$current.markInstalledAfterLaunch
    requiresElevation       = [bool]$current.requiresElevation
    operations              = $ops
    enabled                 = [bool]$current.enabled
    notes                   = $current.notes
}

if (-not $current.packageUri) {
    Note "`n  This record has no packageUri. Applying operations is fine, but there is"
    Note "  nothing to install until publish-build.ps1 has uploaded a package."
}

if ($WhatIfPreference) {
    Write-Host "`n-WhatIf: nothing changed. Payload:`n" -ForegroundColor Yellow
    $payload | ConvertTo-Json -Depth 8 | Write-Host
    exit 0
}
if (-not $PSCmdlet.ShouldProcess("$key", "replace $(@($current.operations).Count) operation(s) with $($ops.Count)")) { exit 0 }

try {
    $saved = (Invoke-RestMethod -Method Put -Uri "$ApiBaseUrl/admin/deployments/$key" -Headers $headers `
        -ContentType "application/json" -Body ($payload | ConvertTo-Json -Depth 8)).item
} catch { Fail "Update failed: $($_.Exception.Message)" }

# ── Verify what the server actually stored ──────────────────────────────────
Write-Host "`nStored by the server ($(@($saved.operations).Count) step(s)):"
foreach ($o in @($saved.operations)) { Write-Host "  $($o.type)  $($o.source)  ->  $($o.target)" }

$problems = @()
if (@($saved.operations).Count -ne $ops.Count) {
    $problems += "server stored $(@($saved.operations).Count) of $($ops.Count) operations — the rest were dropped as invalid"
}
if ($saved.packageUri -ne $current.packageUri) { $problems += "packageUri changed — it should not have" }
if ($saved.version -ne $current.version) { $problems += "version changed — it should not have" }
if (@($saved.envVars.PSObject.Properties).Count -lt @($current.envVars.PSObject.Properties).Count) {
    $problems += "envVars were lost — ADLM_API_BASE_URL may be gone"
}

if ($problems.Count) {
    Write-Host ""
    $problems | ForEach-Object { Write-Host "  PROBLEM: $_" -ForegroundColor Red }
    Fail "Record is not what was intended. Fix it in the admin UI before anyone installs."
}

Good "`n$key operations updated."
Write-Host @"

  Verify on ONE machine:
    1. Remove the local install, run InstallerHub
    2. reg query "HKCU\Software\Microsoft\Office\Excel\Addins\ExcelAddin"
       -> four values means the runExe step ran
       -> nothing means it did not; see the runExe note in the operations file
    3. Open Excel and confirm the Takeoff Link tab appears

"@
