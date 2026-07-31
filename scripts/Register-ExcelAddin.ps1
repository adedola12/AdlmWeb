# Register-ExcelAddin.ps1
# ============================================================================
# Registers (or removes) HERON's VSTO Excel add-in for the CURRENT USER.
#
# Ship this INSIDE the HERON package. InstallerHub runs it via a `runExe`
# operation after the files are copied — see docs/heron-operations.json.
#
#   Register-ExcelAddin.ps1                 # register, files beside this script
#   Register-ExcelAddin.ps1 -Unregister     # remove the registration
#   Register-ExcelAddin.ps1 -AddinDir "C:\..\HERON"
#
# WHY A SCRIPT AND NOT AN INSTALLER OPERATION
#   A VSTO add-in is not "installed" by copying files. Excel discovers it
#   only through registry values under
#       HKCU\Software\Microsoft\Office\Excel\Addins\<name>
#   and ProductDeployment.operations has no registry type — it supports
#   copyDirectory, copyFile, createShortcut, hideDirectory and runExe only.
#   So the copy steps place the files and this script does the registration.
#
# HKCU, NOT HKLM, DELIBERATELY
#   Per-user registration needs no elevation and no admin rights, and it
#   uninstalls cleanly. HKLM would register for every account on the machine
#   including ones that never bought HERON.
#
# EXIT CODES  0 success · 1 files missing · 2 registry write failed
#             3 VSTO runtime missing (add-in will not load)
# ============================================================================

[CmdletBinding()]
param(
    # Defaults to the folder this script sits in, which is where InstallerHub
    # will have just copied everything.
    [string] $AddinDir = $PSScriptRoot,

    # Must match what Excel shows in File > Options > Add-ins.
    [string] $AddinName = "ExcelAddin",
    [string] $FriendlyName = "ADLM HERON — Excel Takeoff Link",
    [string] $Description = "Links PlanSwift takeoff quantities and RateGen prices into Excel.",

    [switch] $Unregister,
    [switch] $Quiet
)

$ErrorActionPreference = "Stop"
function Say($m, $c = "Gray") { if (-not $Quiet) { Write-Host $m -ForegroundColor $c } }

$regPath = "HKCU:\Software\Microsoft\Office\Excel\Addins\$AddinName"

# ── Unregister ──────────────────────────────────────────────────────────────
if ($Unregister) {
    if (Test-Path $regPath) {
        Remove-Item -Path $regPath -Recurse -Force
        Say "Removed $regPath" "Green"
    } else {
        Say "Nothing to remove — $AddinName was not registered." "DarkGray"
    }
    exit 0
}

# ── 1. The files must actually be there ─────────────────────────────────────
if (-not $AddinDir) { $AddinDir = (Get-Location).Path }
$vsto = Join-Path $AddinDir "$AddinName.vsto"
$dll = Join-Path $AddinDir "$AddinName.dll"
$manifest = Join-Path $AddinDir "$AddinName.dll.manifest"

$missing = @()
foreach ($f in @($vsto, $dll, $manifest)) { if (-not (Test-Path -LiteralPath $f)) { $missing += (Split-Path $f -Leaf) } }
if ($missing.Count) {
    Say "" ; Say "Excel add-in files missing from $AddinDir :" "Red"
    $missing | ForEach-Object { Say "  - $_" "Red" }
    Say ""
    Say "All three ship together from the VSTO build. If they are absent the" "DarkGray"
    Say "package was built without the Excel add-in — HERON will still run," "DarkGray"
    Say "but the Excel Takeoff Link will not appear in Excel." "DarkGray"
    exit 1
}

# ── 2. VSTO runtime ─────────────────────────────────────────────────────────
# Without it Excel silently ignores the add-in: the registry keys are correct,
# nothing appears, and there is no error anywhere. Check so the failure is loud.
$vstoRuntime = @(
    "HKLM:\SOFTWARE\Microsoft\VSTO Runtime Setup\v4R",
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\VSTO Runtime Setup\v4R"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $vstoRuntime) {
    Say "" ; Say "Visual Studio 2010 Tools for Office Runtime is NOT installed." "Red"
    Say "Excel will ignore the add-in with no error message." "Red"
    Say "Install it from https://aka.ms/vstoruntime then re-run this script." "DarkGray"
    Say ""
    # Registration below is still written so a later runtime install works,
    # but the exit code tells the installer something is wrong.
    $runtimeMissing = $true
} else {
    Say "VSTO runtime found." "Green"
}

# ── 3. Write the registration ───────────────────────────────────────────────
# Manifest MUST be the full path to the .vsto with the |vstolocal suffix.
# Without |vstolocal, Excel treats it as a ClickOnce deployment and tries to
# copy into the ClickOnce cache, which fails for a file-copy install like this.
$manifestValue = "$vsto|vstolocal"

try {
    if (-not (Test-Path $regPath)) { New-Item -Path $regPath -Force | Out-Null }
    New-ItemProperty -Path $regPath -Name "Description"  -Value $Description  -PropertyType String -Force | Out-Null
    New-ItemProperty -Path $regPath -Name "FriendlyName" -Value $FriendlyName -PropertyType String -Force | Out-Null
    # 3 = load at startup, and keep loading after a crash-triggered demotion.
    New-ItemProperty -Path $regPath -Name "LoadBehavior" -Value 3 -PropertyType DWord -Force | Out-Null
    New-ItemProperty -Path $regPath -Name "Manifest"     -Value $manifestValue -PropertyType String -Force | Out-Null
} catch {
    Say "" ; Say "Could not write $regPath : $($_.Exception.Message)" "Red"
    exit 2
}

# ── 4. Read back ────────────────────────────────────────────────────────────
$w = Get-ItemProperty -Path $regPath
Say ""
Say "Registered $AddinName for $env:USERNAME" "Green"
Say "  FriendlyName : $($w.FriendlyName)"
Say "  LoadBehavior : $($w.LoadBehavior)"
Say "  Manifest     : $($w.Manifest)"

if ($w.LoadBehavior -ne 3) { Say "  LoadBehavior is not 3 — Excel will not auto-load the add-in." "Red"; exit 2 }

if ($runtimeMissing) { exit 3 }

Say ""
Say "Restart Excel. The add-in appears under File > Options > Add-ins." "DarkGray"
Say "If it is listed as Inactive, Excel disabled it after a previous crash:" "DarkGray"
Say "File > Options > Add-ins > Manage: Disabled Items > Enable." "DarkGray"
exit 0
