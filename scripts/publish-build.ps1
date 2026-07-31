# publish-build.ps1
# ============================================================================
# Uploads a built package to ADLM cloud storage and points a product's
# InstallerHub deployment record at it, so every user gets the new version on
# their next InstallerHub run.
#
#   .\publish-build.ps1 -ProductKey planswift -Version 2.5.1 -PackagePath .\HERON-2.5.1.zip
#
# WHAT IT DOES, IN ORDER
#   1. Computes the SHA-256 of your local file BEFORE uploading.
#   2. Signs in as you (admin account) against the live API.
#   3. GETs the product's CURRENT deployment record.
#   4. Uploads the package, receiving a packageUri back.
#   5. PUTs the record back with ONLY version / packageUri / packageKind /
#      sha256 changed. Everything else is copied from step 3 verbatim.
#
# WHY STEP 3 IS NOT OPTIONAL
#   The server's PUT handler (normalizeDeployment in
#   server/routes/admin.deployments.js) rebuilds the record from the request
#   body. Fields you omit are RESET, not preserved:
#
#       operations        -> []      the copy/shortcut steps. Emptying this
#                                    gives users an install that downloads
#                                    the package and then does nothing.
#       displayName       -> ""
#       installArguments  -> ""
#       waitForExit       -> false
#       requiresElevation -> true
#       enabled           -> true
#       notes             -> ""
#
#   Only sha256, envVars and localRandomVars are left alone when omitted.
#   So a "quick" PUT of just {version, packageUri} silently breaks installs
#   for every user of that product. This script reads first, merges, writes.
#
# SAFETY
#   * -WhatIf shows the exact merged payload and uploads nothing.
#   * Refuses to publish a version string that already matches the live
#     record unless you pass -Force (catches re-running with a stale value).
#   * Prints the before/after of every field it changes.
#   * Never prints your password or the bearer token.
#
# AFTER RUNNING
#   Verify on ONE machine before telling anyone: delete the product's local
#   install, run InstallerHub, confirm it pulls the new version and the app
#   signs in. The sha256 means a corrupted or tampered download is refused
#   rather than installed.
# ============================================================================

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    # Must match ProductDeployment.productKey exactly:
    #   planswift (HERON) | revit (QUIV) | mep | civil3d (RoadTools)
    [Parameter(Mandatory = $true)][string] $ProductKey,

    # The version users will see, e.g. 2.5.1. Free text; no semver validation
    # server-side, but keep it consistent with the What's New page.
    [Parameter(Mandatory = $true)][string] $Version,

    # Path to the .zip or .exe you are shipping.
    [Parameter(Mandatory = $true)][string] $PackagePath,

    [string] $ApiBaseUrl = "https://api.adlmstudio.net",
    [string] $AdminEmail = "",

    # Publish even if the live record already carries this version.
    [switch] $Force
)

$ErrorActionPreference = "Stop"

# Windows PowerShell 5.1 still negotiates TLS 1.0 by default on some builds,
# which a modern API refuses. Harmless on PowerShell 7.
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { }

function Fail($msg) { Write-Host "`n  $msg`n" -ForegroundColor Red; exit 1 }
function Note($msg) { Write-Host "  $msg" -ForegroundColor DarkGray }
function Good($msg) { Write-Host "  $msg" -ForegroundColor Green }

# ── 1. Local file + hash ────────────────────────────────────────────────────
if (-not (Test-Path -LiteralPath $PackagePath)) { Fail "No such file: $PackagePath" }
$file = Get-Item -LiteralPath $PackagePath
if ($file.Length -eq 0) { Fail "$($file.Name) is empty." }

$sizeMb = [math]::Round($file.Length / 1MB, 2)
Write-Host "`nPackage : $($file.Name)  ($sizeMb MB)"

# Computed from the file on disk, before upload, so it certifies exactly what
# you built. InstallerHub re-hashes the download and refuses a mismatch.
$sha = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLower()
Write-Host "SHA-256 : $sha"

# The server routes >8 MB to Cloudflare R2 and smaller files to Cloudinary.
# If R2 is not configured the upload returns 503 with instructions.
if ($file.Length -gt 8MB) {
    Note "Over 8 MB - this goes to Cloudflare R2. If R2 is not configured on the"
    Note "server the upload will fail with a 503 telling you which vars to set."
}

$packageKind = if ($file.Extension -ieq ".zip") { "zip" } else { "file" }

# ── 2. Sign in ──────────────────────────────────────────────────────────────
if (-not $AdminEmail) { $AdminEmail = Read-Host "`nAdmin email / username" }

# Prompt by default. $env:ADLM_ADMIN_PASSWORD exists so this can run
# unattended without the password ever appearing in a command line (and so
# in your shell history) — set it in the session, run, then clear it.
if ($env:ADLM_ADMIN_PASSWORD) {
    $pwdPlain = $env:ADLM_ADMIN_PASSWORD
    Note "Using ADLM_ADMIN_PASSWORD from the environment."
} else {
    $pwdSecure = Read-Host "Admin password" -AsSecureString
    $pwdPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($pwdSecure))
}

try {
    $login = Invoke-RestMethod -Method Post -Uri "$ApiBaseUrl/auth/login" `
        -ContentType "application/json" `
        -Body (@{ identifier = $AdminEmail; password = $pwdPlain } | ConvertTo-Json)
} catch {
    Fail "Login failed: $($_.Exception.Message)"
} finally {
    $pwdPlain = $null
}

if (-not $login.accessToken) { Fail "Login returned no accessToken." }
$headers = @{ Authorization = "Bearer $($login.accessToken)" }
Good "Signed in as $AdminEmail"

# ── 3. Read the CURRENT record ──────────────────────────────────────────────
$key = $ProductKey.Trim().ToLower()
try {
    $current = (Invoke-RestMethod -Method Get -Uri "$ApiBaseUrl/admin/deployments/$key" `
        -Headers $headers).item
} catch {
    Fail @"
Could not read the deployment for '$key': $($_.Exception.Message)

If this is a 404 the product has no deployment record yet. Create it in the
admin UI first - this script updates an existing record on purpose, because
inventing the install `operations` from a script is how you ship an installer
that copies files to the wrong place.
"@
}

Write-Host "`nCurrent record"
Write-Host "  displayName : $($current.displayName)"
Write-Host "  version     : $($current.version)"
Write-Host "  packageUri  : $($current.packageUri)"
Write-Host "  operations  : $(@($current.operations).Count) step(s)"
Write-Host "  envVars     : $(@($current.envVars.PSObject.Properties).Count) set"
Write-Host "  enabled     : $($current.enabled)"

if (@($current.operations).Count -eq 0) {
    Note "WARNING: this record has no install operations. Users would download"
    Note "the package and nothing would be installed. Fix that before publishing."
}

if ($current.version -eq $Version -and -not $Force) {
    Fail "Live record is already version '$Version'. Pass -Force if you really mean to re-publish it."
}

# ── 4. Build the merged payload ─────────────────────────────────────────────
# Every field the server would otherwise reset is carried over from $current.
# envVars / localRandomVars are deliberately NOT sent: the server leaves them
# untouched when omitted, which is safer than round-tripping secrets through
# this script.
$payload = @{
    productKey              = $key
    displayName             = $current.displayName
    packageKind             = $packageKind
    version                 = $Version
    installArguments        = $current.installArguments
    waitForExit             = [bool]$current.waitForExit
    markInstalledAfterLaunch = [bool]$current.markInstalledAfterLaunch
    requiresElevation       = [bool]$current.requiresElevation
    operations              = @($current.operations)
    enabled                 = [bool]$current.enabled
    notes                   = $current.notes
    sha256                  = $sha
}

Write-Host "`nChanges"
Write-Host "  version     : $($current.version)  ->  $Version"
Write-Host "  sha256      : $(if ($current.sha256) { $current.sha256.Substring(0,12) + '...' } else { '(none)' })  ->  $($sha.Substring(0,12))..."
Write-Host "  packageKind : $($current.packageKind)  ->  $packageKind"
Write-Host "  packageUri  : set after upload"
Write-Host "  everything else carried over unchanged"

if ($WhatIfPreference) {
    Write-Host "`n-WhatIf: nothing uploaded, nothing changed. Payload that would be sent:`n" -ForegroundColor Yellow
    ($payload + @{ packageUri = "<from upload>" }) | ConvertTo-Json -Depth 6 | Write-Host
    exit 0
}

if (-not $PSCmdlet.ShouldProcess("$key -> $Version", "publish to InstallerHub")) { exit 0 }

# ── 5. Upload, then point the record at it ──────────────────────────────────
Write-Host "`nUploading..."

# Built by hand rather than with -Form, which is PowerShell 7 only. Windows
# ships 5.1 by default and that is what this will usually run under.
# The body is assembled in a MemoryStream so the file's bytes are copied
# verbatim — building it as a string corrupts binary content unless you go
# through a byte-preserving encoding, and a silently corrupted upload would
# only surface later as a hash mismatch on a user's machine.
$boundary = [Guid]::NewGuid().ToString()
$LF = "`r`n"
$ms = New-Object System.IO.MemoryStream
$sw = New-Object System.IO.StreamWriter($ms, [System.Text.Encoding]::ASCII)
$sw.Write("--$boundary$LF")
$sw.Write("Content-Disposition: form-data; name=`"file`"; filename=`"$($file.Name)`"$LF")
$sw.Write("Content-Type: application/octet-stream$LF$LF")
$sw.Flush()
$fileBytes = [System.IO.File]::ReadAllBytes($file.FullName)
$ms.Write($fileBytes, 0, $fileBytes.Length)
$sw.Write("$LF--$boundary--$LF")
$sw.Flush()
$bodyBytes = $ms.ToArray()
$sw.Dispose(); $ms.Dispose()

try {
    $upload = Invoke-RestMethod -Method Post -Uri "$ApiBaseUrl/admin/deployments/upload-package" `
        -Headers $headers -ContentType "multipart/form-data; boundary=$boundary" -Body $bodyBytes
} catch {
    $detail = ""
    try { $detail = ($_.ErrorDetails.Message | ConvertFrom-Json).error } catch { }
    Fail "Upload failed: $(if ($detail) { $detail } else { $_.Exception.Message })"
}

if (-not $upload.packageUri) { Fail "Upload returned no packageUri." }
Good "Uploaded to $($upload.storageProvider): $($upload.packageUri)"

$payload.packageUri = $upload.packageUri

try {
    $saved = (Invoke-RestMethod -Method Put -Uri "$ApiBaseUrl/admin/deployments/$key" `
        -Headers $headers -ContentType "application/json" `
        -Body ($payload | ConvertTo-Json -Depth 6)).item
} catch {
    Fail @"
Upload succeeded but the record update FAILED: $($_.Exception.Message)

The package is in storage but the deployment still points at the old one, so
users are unaffected. Re-run this script - it is safe to repeat.
"@
}

# ── 6. Read back and confirm ────────────────────────────────────────────────
Write-Host "`nSaved record"
Write-Host "  version     : $($saved.version)"
Write-Host "  packageUri  : $($saved.packageUri)"
Write-Host "  sha256      : $($saved.sha256)"
Write-Host "  operations  : $(@($saved.operations).Count) step(s)"
Write-Host "  envVars     : $(@($saved.envVars.PSObject.Properties).Count) set"

$problems = @()
if ($saved.version -ne $Version) { $problems += "version did not stick" }
if ($saved.sha256 -ne $sha) { $problems += "sha256 did not stick" }
if (@($saved.operations).Count -ne @($current.operations).Count) { $problems += "operations count changed - install steps were lost" }
if (@($saved.envVars.PSObject.Properties).Count -lt @($current.envVars.PSObject.Properties).Count) { $problems += "envVars were lost - ADLM_API_BASE_URL may be gone" }

if ($problems.Count) {
    Write-Host ""
    foreach ($p in $problems) { Write-Host "  PROBLEM: $p" -ForegroundColor Red }
    Fail "Published, but the record is not what was intended. Fix it in the admin UI before anyone installs."
}

Good "`n$key is live on $Version."
Write-Host @"

  Next: verify on ONE machine before announcing.
    1. Uninstall / remove the local copy of this product
    2. Run InstallerHub and let it install
    3. Launch the app and sign in
    4. reg query "HKCU\Environment" /v ADLM_API_BASE_URL

  If InstallerHub reports a hash mismatch, the upload was corrupted -
  re-run this script rather than clearing the sha256.

"@
