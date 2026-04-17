# setup-deployments.ps1
# ============================================================================
# One-shot configuration of ADLM product deployments.
#
# What it does:
#   1. Logs into the ADLM website as you (admin account)
#   2. For each product below, fetches the existing deployment record,
#      MERGES IN envVars + localRandomVars (keeps packageUri, operations,
#      version, etc. untouched)
#   3. PUTs the merged result back
#
# You run this ONCE. After that, every time the InstallerHub installs a
# product on a user's machine, the hub fetches these envVars over HTTPS
# and writes them to HKCU\Environment on that user's machine.
#
# BEFORE RUNNING:
#   * Set the $ApiBaseUrl to your Render URL (the default is likely right).
#   * Set $AdminEmail / the script will prompt for your admin password.
#   * Fill in the real secret values in $Shared below — these are the
#     production values your server's .env already uses.
#
# RE-RUN SAFETY:
#   * Running the script again just re-applies the same values (idempotent).
#   * Running with different values updates the deployments in-place;
#     users will pick up the new envVars on their next InstallerHub install.
# ============================================================================

param(
    [string] $ApiBaseUrl = "https://adlmweb.onrender.com",
    [string] $AdminEmail = ""
)

if (-not $AdminEmail) {
    $AdminEmail = Read-Host "Admin email / username"
}
$adminPwd = Read-Host "Admin password" -AsSecureString
$adminPwdPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminPwd))

# ----------------------------------------------------------------------------
# FILL IN THE SHARED SECRETS BELOW
#
# These are production secrets — never commit this file with real values.
# Get them from:
#   JWT_LICENSE_SECRET  -> server/.env  (already rotated; copy from Render)
#   JWT signing key     -> 32+ char random; can reuse JWT_ACCESS_SECRET
#   MongoDB URIs        -> MongoDB Atlas dashboards (after you rotated pwd)
#   Gmail app password  -> after revoking the old one and creating a new one
# ----------------------------------------------------------------------------
$Shared = @{
    # Must match the server's JWT_LICENSE_SECRET (server signs license JWTs,
    # plugins verify them with this value).
    LicenseSecret     = "a49db115e2ed9fc503143ea4a3fac6321c106ce90dfffa0e8568c93d6af1a0681962cb8c78eb0ff083c0db1c375da95c"

    # JWT signing key for Planswift's local token cache (32+ chars).
    # Can be any strong random value — does not have to match the server.
    JwtSigningKey     = "ce915b5096142015b1469b41db577ae7bf53e4d2242b7a80b9b38224262f76ca3140aabeb97ecb4576063e2c30e0fe04"

    # MongoDB connection strings
    MongoSrv          = "mongodb+srv://dolapo836:Hardeydol@adlmratedb.zeur8.mongodb.net/?retryWrites=true&w=majority&appName=ADLMRateDB"
    MongoSignin       = "mongodb+srv://USER:PASSWORD@revitpluginusers.xxx.mongodb.net/?retryWrites=true&w=majority"
    MongoSignup       = "mongodb+srv://USER:PASSWORD@revitcluster.xxx.mongodb.net/?retryWrites=true&w=majority"
    MongoAdmin        = "mongodb+srv://USER:PASSWORD@cluster0.xxx.mongodb.net/PlanswiftUser?retryWrites=true&w=majority"
    MongoPlanswift    = "mongodb+srv://adedolapo:Hardeydol@cluster0.jb4uj.mongodb.net/PlanswiftUser?retryWrites=true&w=majority"

    # New Gmail app password for admin@adlmstudio.net (after revoking old one)
    SmtpPassword      = "cdetoqfbjyrleoxf"
}

# ----------------------------------------------------------------------------
# Per-product configuration table. Edit product keys / var names here if you
# use different keys in your existing deployment records.
# ----------------------------------------------------------------------------
$Products = @(
    @{
        Key         = "mep"
        EnvVars     = @{
            "ADLM_MEP_LICENSE_SECRET" = $Shared.LicenseSecret
            "ADLM_API_BASE_URL"       = $ApiBaseUrl
        }
        LocalVars   = @("ADLM_MEP_ENCRYPTION_KEY")
    },
    @{
        Key         = "rategen"
        EnvVars     = @{
            "ADLM_RATEGEN_OFFLINE_LICENSE_SECRET" = $Shared.LicenseSecret
            "ADLM_RATEGEN_MONGO_SRV"              = $Shared.MongoSrv
            "ADLM_RATEGEN_API_BASE_URL"           = $ApiBaseUrl
            "ADLM_RATEGEN_PRODUCT_KEY"            = "rategen"
        }
        LocalVars   = @("ADLM_RATEGEN_LOCAL_JWT_SECRET", "ADLM_RATEGEN_ENCRYPTION_KEY")
    },
    # QUIV (Revit Plugin Arch). Admin product catalog uses the key "revit".
    @{
        Key         = "revit"
        EnvVars     = @{
            # Plugin no longer speaks to MongoDB directly — it signs in via
            # the ADLM website API, exactly like the MEP / RateGen / Planswift
            # plugins. So there are no SIGNIN/SIGNUP Mongo secrets here any
            # more; just the API base URL and product key are needed.
            "ADLM_API_BASE_URL"          = $ApiBaseUrl
            "ADLM_REVITARCH_PRODUCT_KEY" = "revit"
        }
        LocalVars   = @()
    },
    # HERON (Planswift plugin)
    @{
        Key         = "planswift"
        EnvVars     = @{
            "ADLM_MONGO_CONNECTION" = $Shared.MongoPlanswift
            "ADLM_JWT_SIGNING_KEY"  = $Shared.JwtSigningKey
            "ADLM_LICENSE_SECRET"   = $Shared.LicenseSecret
            "ADLM_API_BASE_URL"     = $ApiBaseUrl
        }
        LocalVars   = @("ADLM_ENCRYPTION_KEY")
    }

    # NOTE: planswift-admin is an internal tool, not a customer-facing
    # product in the catalog. It was accidentally added as a deployment
    # record by an earlier script run — delete that record (see the
    # DELETE section at the bottom of this file). The admin tool's env
    # vars should be configured on the admin machine directly, not via
    # a ProductDeployment record users could see.
)

# ============================================================================
# LOGIN
# ============================================================================
Write-Host ""
Write-Host "Signing in as $AdminEmail ..." -ForegroundColor Cyan
$loginBody = @{ identifier = $AdminEmail; password = $adminPwdPlain } | ConvertTo-Json
try {
    $loginResp = Invoke-RestMethod -Method Post `
        -Uri "$ApiBaseUrl/auth/login" `
        -ContentType "application/json" `
        -Body $loginBody
} catch {
    Write-Host "Login failed: $_" -ForegroundColor Red
    exit 1
}

$token = $loginResp.accessToken
if (-not $token) {
    Write-Host "Login returned no accessToken. Check credentials." -ForegroundColor Red
    exit 1
}
Write-Host "Signed in. Role: $($loginResp.user.role)" -ForegroundColor Green
if ($loginResp.user.role -ne "admin") {
    Write-Host "Warning: this account is not an admin. PUT /admin/deployments will 403." -ForegroundColor Yellow
}

$headers = @{ Authorization = "Bearer $token" }

# ============================================================================
# For each product: fetch current, merge envVars, PUT back
# ============================================================================
foreach ($p in $Products) {
    Write-Host ""
    Write-Host "=== $($p.Key) ===" -ForegroundColor Cyan

    # 1) Fetch existing deployment (unwrap { ok, item } envelope)
    $existing = $null
    try {
        $resp = Invoke-RestMethod -Method Get `
            -Uri "$ApiBaseUrl/admin/deployments/$($p.Key)" `
            -Headers $headers
        if ($resp.PSObject.Properties.Name -contains "item") {
            $existing = $resp.item
        } else {
            $existing = $resp
        }
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 404) {
            Write-Host "  No existing deployment. Will create a new one with just envVars." -ForegroundColor Yellow
        } else {
            Write-Host "  GET failed: $_" -ForegroundColor Red
            continue
        }
    }

    # 2) Build payload — start from existing (if any) so we don't overwrite
    #    packageUri, operations, version. Then overlay envVars/localRandomVars.
    $payload = @{
        productKey      = $p.Key
        envVars         = $p.EnvVars
        localRandomVars = $p.LocalVars
    }
    if ($existing) {
        foreach ($field in "displayName","packageUri","packageKind","version","installArguments","waitForExit","markInstalledAfterLaunch","requiresElevation","operations","enabled","notes","sha256") {
            if ($existing.PSObject.Properties.Name -contains $field) {
                $payload[$field] = $existing.$field
            }
        }
    }

    $payloadJson = $payload | ConvertTo-Json -Depth 8

    # 3) PUT it
    try {
        $saved = Invoke-RestMethod -Method Put `
            -Uri "$ApiBaseUrl/admin/deployments/$($p.Key)" `
            -Headers $headers `
            -ContentType "application/json" `
            -Body $payloadJson
        Write-Host "  OK. envVars keys: $(($p.EnvVars.Keys | Sort-Object) -join ', ')" -ForegroundColor Green
        Write-Host "  localRandomVars: $($p.LocalVars -join ', ')" -ForegroundColor Green
    } catch {
        Write-Host "  PUT failed: $_" -ForegroundColor Red
        if ($_.ErrorDetails) { Write-Host "  body: $($_.ErrorDetails.Message)" -ForegroundColor Red }
    }
}


# ============================================================================
# Cleanup: remove any bogus ProductDeployment records left over from earlier
# runs that used the wrong keys. Safe to run even if the record doesn't exist.
# ============================================================================
$CleanupKeys = @("revit-arch", "planswift-admin")
foreach ($key in $CleanupKeys) {
    try {
        Invoke-RestMethod -Method Delete `
            -Uri "$ApiBaseUrl/admin/deployments/$key" `
            -Headers $headers | Out-Null
        Write-Host "Deleted stray deployment record: $key" -ForegroundColor Yellow
    } catch {
        $status = $_.Exception.Response.StatusCode.value__
        if ($status -eq 404) {
            # Already gone — nothing to do.
        } else {
            Write-Host "Cleanup DELETE /$key failed: $_" -ForegroundColor DarkYellow
        }
    }
}

Write-Host ""
Write-Host "Done. The next time any user installs a product via the InstallerHub," -ForegroundColor Cyan
Write-Host "these env vars will be written to their HKCU\Environment automatically." -ForegroundColor Cyan
