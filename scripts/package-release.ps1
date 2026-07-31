# package-release.ps1
# ============================================================================
# Turns a Release build output folder into a zip ready for publish-build.ps1,
# and refuses to package a build that would fail in the field.
#
#   .\scripts\package-release.ps1 -ProductKey planswift -Version 2.5.1 `
#       -BuildDir "C:\...\ADLMPlanswiftApp\bin\Release\net8.0-windows"
#
# WHAT IT CHECKS BEFORE ZIPPING
#   1. No compiled reference to adlmweb.onrender.com survives in ANY assembly.
#      This is the whole point of the release. A build made from a stale
#      checkout looks identical on disk and fails for every user; the only
#      way to see it is to read the binary, which is what this does.
#   2. api.adlmstudio.net IS present, so the new default actually shipped.
#   3. ADLM_API_BASE_URL is present, so the value is overridable at runtime.
#   4. Product-specific required files exist (HERON: the Excel add-in).
#   5. Authenticode signature present — warns loudly if not.
#
# It excludes build litter (*.pdb, obj/, *.xml doc files) so the package is
# what users need and nothing else. Pass -IncludePdb to keep symbols.
#
# OUTPUT
#   <OutDir>\<PRODUCT>-<Version>.zip  plus its SHA-256, which is the value
#   publish-build.ps1 will compute independently and send to the hub.
# ============================================================================

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidateSet("planswift", "revit", "mep", "civil3d", "timemgt")]
    [string] $ProductKey,

    [Parameter(Mandatory = $true)][string] $Version,
    [Parameter(Mandatory = $true)][string] $BuildDir,

    [string] $OutDir = ".\dist",
    [switch] $IncludePdb,

    # Package even if a check fails. Prints what you are overriding.
    [switch] $Force
)

$ErrorActionPreference = "Stop"

function Fail($m) { Write-Host "`n  FAIL: $m`n" -ForegroundColor Red; exit 1 }
function Warn($m) { Write-Host "  WARN: $m" -ForegroundColor Yellow }
function Good($m) { Write-Host "  OK  : $m" -ForegroundColor Green }
function Note($m) { Write-Host "        $m" -ForegroundColor DarkGray }

$PRODUCTS = @{
    planswift = @{ Name = "HERON"; MainDll = "ADLMPlanswiftApp.dll"
                   Required = @("ADLMPlanswiftApp.exe", "ExcelAddin.dll", "ExcelAddin.vsto", "ExcelAddin.dll.manifest") }
    revit     = @{ Name = "QUIV";      MainDll = "RevitPluginArch.dll";  Required = @("RevitPluginArch.dll") }
    mep       = @{ Name = "ADLM-MEP";  MainDll = "ADLMRvtMEPPlugin.dll"; Required = @("ADLMRvtMEPPlugin.dll") }
    civil3d   = @{ Name = "RoadTools"; MainDll = "ADLM C3D RoadTools.dll"; Required = @() }
    timemgt   = @{ Name = "TimeMgt";   MainDll = "TimeManagementApp.dll"; Required = @("TimeManagementApp.exe") }
}
$p = $PRODUCTS[$ProductKey]

if (-not (Test-Path -LiteralPath $BuildDir)) { Fail "No such folder: $BuildDir" }
$BuildDir = (Resolve-Path -LiteralPath $BuildDir).Path

Write-Host "`nProduct  : $($p.Name)  ($ProductKey)"
Write-Host "Version  : $Version"
Write-Host "BuildDir : $BuildDir`n"

$problems = 0
function Problem($m) { $script:problems++; Write-Host "  FAIL: $m" -ForegroundColor Red }

# ── 1. Required files ───────────────────────────────────────────────────────
foreach ($f in @($p.Required)) {
    if (Test-Path -LiteralPath (Join-Path $BuildDir $f)) { Good "present: $f" }
    else {
        Problem "missing: $f"
        if ($f -like "ExcelAddin*") {
            Note "The Excel add-in is a VSTO project. It only builds in Visual Studio"
            Note "with the Office/SharePoint workload — 'dotnet build' cannot produce"
            Note "it. Build ExcelAddinBridge\ExcelAddin.csproj in VS and copy its"
            Note "output next to HERON's before packaging, or the Excel Takeoff Link"
            Note "will be missing for every user."
        }
    }
}

# ── 2. Read the binaries ────────────────────────────────────────────────────
# A build from a stale checkout is byte-plausible and completely broken. The
# only honest check is to look for the string inside the assembly.
$dlls = Get-ChildItem -LiteralPath $BuildDir -Recurse -Include *.dll, *.exe -File |
        Where-Object { $_.Name -notlike "System.*" -and $_.Name -notlike "Microsoft.*" }

$stale = @(); $hasNew = $false; $hasEnvVar = $false
foreach ($d in $dlls) {
    $bytes = [System.IO.File]::ReadAllBytes($d.FullName)
    # .NET string literals are UTF-16LE in the metadata heap; check both.
    $u16 = [System.Text.Encoding]::Unicode.GetString($bytes)
    $u8 = [System.Text.Encoding]::UTF8.GetString($bytes)
    if ($u16 -match "adlmweb\.onrender\.com" -or $u8 -match "adlmweb\.onrender\.com") { $stale += $d.Name }
    if ($u16 -match "api\.adlmstudio\.net" -or $u8 -match "api\.adlmstudio\.net") { $hasNew = $true }
    if ($u16 -match "ADLM_API_BASE_URL" -or $u8 -match "ADLM_API_BASE_URL") { $hasEnvVar = $true }
}

Write-Host ""
if ($stale.Count) {
    Problem "adlmweb.onrender.com is still compiled into: $($stale -join ', ')"
    Note "That host is offline. Every user of this build would fail to sign in."
    Note "You have built from a checkout that predates the API change — check"
    Note "you are on the right branch and rebuild."
} else { Good "no adlmweb.onrender.com in any assembly" }

if ($hasNew) { Good "api.adlmstudio.net is present" }
else { Problem "api.adlmstudio.net not found in any assembly — the new default did not ship" }

if ($hasEnvVar) { Good "ADLM_API_BASE_URL is present (host is overridable without a rebuild)" }
else { Problem "ADLM_API_BASE_URL not found — the host is hardcoded again" }

# ── 3. Signature ────────────────────────────────────────────────────────────
$main = Join-Path $BuildDir $p.MainDll
if (-not (Get-Command Get-AuthenticodeSignature -ErrorAction SilentlyContinue)) {
    # Windows-only cmdlet. Packaging is expected to run on Windows, but do not
    # take the whole script down over a check that is advisory anyway.
    Warn "signature check skipped — not running on Windows"
} elseif (Test-Path -LiteralPath $main) {
    $sig = Get-AuthenticodeSignature -LiteralPath $main
    if ($sig.Status -eq "Valid") { Good "signed: $($sig.SignerCertificate.Subject)" }
    else {
        Warn "not code-signed (status: $($sig.Status))"
        Note "Windows SmartScreen will warn users on first run. Not fatal, but"
        Note "sign before a wide rollout if you have a certificate."
    }
} else { Warn "main assembly not found for signature check: $($p.MainDll)" }

if ($problems -and -not $Force) {
    Write-Host ""
    Fail "$problems check(s) failed. Fix them, or pass -Force if you know better."
}
if ($problems -and $Force) { Warn "`n-Force: packaging despite $problems failed check(s)." }

# ── 4. Zip ──────────────────────────────────────────────────────────────────
if (-not (Test-Path -LiteralPath $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }
$OutDir = (Resolve-Path -LiteralPath $OutDir).Path
$zip = Join-Path $OutDir "$($p.Name)-$Version.zip"
if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }

$staging = Join-Path ([System.IO.Path]::GetTempPath()) "adlm-pkg-$([Guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $staging | Out-Null
try {
    $exclude = @("*.pdb", "*.xml")
    if ($IncludePdb) { $exclude = @("*.xml") }

    Get-ChildItem -LiteralPath $BuildDir -Recurse -File | ForEach-Object {
        $skip = $false
        foreach ($x in $exclude) { if ($_.Name -like $x) { $skip = $true; break } }
        # keep .config and .manifest XML — only doc XML is noise
        if ($_.Name -like "*.xml" -and (Test-Path -LiteralPath ($_.FullName -replace '\.xml$', '.dll'))) { $skip = $true }
        elseif ($_.Name -like "*.xml") { $skip = $false }
        if (-not $skip) {
            $rel = $_.FullName.Substring($BuildDir.Length).TrimStart('\', '/')
            $dest = Join-Path $staging $rel
            $dir = Split-Path $dest -Parent
            if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
            Copy-Item -LiteralPath $_.FullName -Destination $dest
        }
    }

    $count = (Get-ChildItem -LiteralPath $staging -Recurse -File).Count
    Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $zip -CompressionLevel Optimal
} finally {
    Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
}

$zipItem = Get-Item -LiteralPath $zip
$sha = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLower()

Write-Host "`nPackaged"
Write-Host "  file    : $zip"
Write-Host "  files   : $count"
Write-Host "  size    : $([math]::Round($zipItem.Length / 1MB, 2)) MB"
Write-Host "  sha256  : $sha"

if ($zipItem.Length -gt 8MB) {
    Note "`n  Over 8 MB, so the upload goes to Cloudflare R2. If R2 is not configured"
    Note "  on the server the upload returns 503 listing the vars to set."
}

Write-Host @"

  Next:
    .\scripts\publish-build.ps1 -ProductKey $ProductKey -Version $Version ``
        -PackagePath "$zip" -WhatIf

  Drop -WhatIf once the payload looks right.

"@
