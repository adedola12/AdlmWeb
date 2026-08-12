# Go-live checklist — ADLM Cloud API on AWS

Follow this top to bottom. Each part ends with **PASS IF** — do not move on until
it's true. Everything before Part 5 is safe: no live traffic touches AWS until
you change the CNAME.

**Plugin name map** (from `scripts/setup-deployments.ps1`):

| Product key | Plugin | Talks to Atlas directly? |
| --- | --- | --- |
| `revit` | **QUIV** (Revit Plugin Arch) | No — API only |
| `planswift` | **HERON** (Planswift plugin) | **Yes** (`ADLM_MONGO_CONNECTION`) |
| `mep` | MEP plugin | No — API only |
| `rategen` | RateGen | **Yes** (`ADLM_RATEGEN_MONGO_SRV`) |
| `archicad` | ArchiCAD | No — API only |
| — | TimeMgt (WPF) | **Yes** (separate TimeMgt cluster) |

Two consequences worth knowing before you start:

1. **RateGen and HERON hold their own Atlas connections.** They are not fully
   dead right now, and they consume connections outside the Lambda budget.
2. **RateGen reads a different variable**: `ADLM_RATEGEN_API_BASE_URL`, not
   `ADLM_API_BASE_URL`. Both point at `api.adlmstudio.net`, so the CNAME fixes
   every plugin at once — but if you ever repoint by env var instead, you must
   set both.

---

## Part 0 — Before you start

Have ready:

- [ ] AWS credentials for the account holding Activate credit `10064320205`
- [ ] The **live env values from Render** (the dashboard is readable while
      suspended — Environment tab per service). You need these for Part 2.
- [ ] Access to whoever hosts `adlmstudio.net` DNS today
- [ ] Atlas access (to watch connection count)
- [ ] One test account with a **real, non-expired entitlement** on each product
- [ ] A Windows machine with at least QUIV and HERON installed

Set up your shell:

```bash
export AWS_PROFILE=adlm          # or whatever your profile is
export AWS_REGION=eu-west-1
aws sts get-caller-identity      # confirm the account ID before anything else
```

**PASS IF** the account ID is ADLM's own, not a third party's.

---

## Part 1 — Verify the build locally (no AWS needed)

Prove the thing works before paying attention to infrastructure. All of this
runs on your laptop.

```bash
cd server && npm install
```

**1a. The app still runs the old way.** This is the regression that would hurt
most, so check it first.

```bash
npm start          # needs your local .env
# → "[mongo] connected to ..." then "Server running on :4000"
curl -s localhost:4000/health
```

**PASS IF** you get `{"ok":true,"db":"connected",...}`. Ctrl-C when done.

**1b. Importing the app has no side effects.** This is what makes Lambda
possible: no port bound, no DB connection, no cron started.

```bash
cat > /tmp/t.mjs <<'EOF'
const m = await import("./index.js");
console.log("app:", typeof m.app, "bootstrap:", typeof m.bootstrap);
const mongoose = (await import("mongoose")).default;
console.log("readyState (want 0):", mongoose.connection.readyState);
setTimeout(() => console.log("loop drained — no listener, no cron"), 300).unref();
EOF
cp /tmp/t.mjs ./_t.mjs && node ./_t.mjs; rm ./_t.mjs
```

**PASS IF** `readyState` is `0` and you see "loop drained". If the process
hangs, something is still starting a listener or a cron.

**1c. The Lambda bundle builds.**

```bash
cd ../infra && npm install
npx tsc --noEmit
CDK_DEFAULT_ACCOUNT=111111111111 npx cdk synth --quiet \
  -c certificateArn=arn:aws:acm:us-east-1:111111111111:certificate/fake
```

**PASS IF** `tsc` is silent and synth reports two bundles (~8.0mb API,
~2.6mb scheduled) and "Successfully synthesized". The fake ARN is fine — synth
never contacts AWS.

**1d. Tests.**

```bash
cd ../server && npm test
```

**PASS IF** every test passes — 84 of 84 at the time of writing, and the
count only goes up.

The one failure this step used to tell you to ignore is gone. It was
`scripts/test-real-boq-parse.mjs`, an ad-hoc CLI tool needing an `.xlsx`
argument, which `node --test` was running because its name matched the
`test-*` glob. It is now `scripts/parse-real-boq.mjs` and is not collected.
A red suite here means something is actually wrong.

---

## Part 2 — Deploy

### 2a. Bootstrap

```bash
ACCT=$(aws sts get-caller-identity --query Account --output text)
npx cdk bootstrap aws://$ACCT/eu-west-1
npx cdk bootstrap aws://$ACCT/us-east-1
```

**PASS IF** both report success. A failure here is likely an SCP restriction —
stop and report it rather than working around it.

### 2b. Load secrets into SSM

The function reads every parameter under `/adlm/cloud/prod` at cold start and
puts it in `process.env` under its leaf name. Copy values **from Render**.

```bash
put() {                      # prompts, so nothing lands in shell history
  read -rsp "$1: " v && echo
  aws ssm put-parameter --region eu-west-1 --type SecureString \
    --name "/adlm/cloud/prod/$1" --value "$v" --overwrite >/dev/null
  echo "  stored $1"
}

# Required — cold start fails without these
put MONGO_URI; put JWT_ACCESS_SECRET; put JWT_REFRESH_SECRET

# Licence-critical — see Part 4
put JWT_LICENSE_SECRET
put ADLM_LICENSE_SIGNING_ALGO      # copy Render's value EXACTLY (likely HS256)
```

Then the rest, from `infra/README.md` §2. Verify the count:

```bash
aws ssm get-parameters-by-path --region eu-west-1 \
  --path /adlm/cloud/prod --query 'Parameters[].Name' --output text | tr '\t' '\n' | wc -l
```

> **`AWS_CLOUDFRONT_PRIVATE_KEY` is different.** On Render it was a *file path*.
> Lambda has no disk — store the **key material itself**. Course-video signed
> URLs stay broken until the signer is changed to accept inline PEM; that is not
> licence-critical, so don't let it block you.

**PASS IF** every parameter you set reads back with `--with-decryption`.

### 2c. Issue the certificate

Out of band on purpose, so a pending validation can never stall or roll back
the deploy.

```bash
CERT=$(aws acm request-certificate --region us-east-1 \
  --domain-name api.adlmstudio.net --validation-method DNS \
  --query CertificateArn --output text) && echo $CERT

aws acm describe-certificate --region us-east-1 --certificate-arn $CERT \
  --query 'Certificate.DomainValidationOptions[0].ResourceRecord'
```

Add that `Name` → `Value` as a **CNAME** at your current DNS provider. It's
unrelated to any live record, so adding it is safe. Then:

```bash
aws acm wait certificate-validated --region us-east-1 --certificate-arn $CERT
```

**PASS IF** the wait returns cleanly (usually a few minutes). **Leave that
validation CNAME in place forever** — ACM re-validates at renewal.

### 2d. Deploy

```bash
cd infra
npx cdk diff  -c certificateArn=$CERT     # read it
npx cdk deploy -c certificateArn=$CERT
```

Save the outputs: `FunctionUrl`, `DistributionDomain`, `ScheduledFunctionName`,
`ScheduleDlqUrl`.

**Then check your email and click the SNS confirmation.** Until you do, no
alarm reaches anyone and everything still looks healthy.

**PASS IF** the stack completes and you've confirmed the subscription.

---

## Part 3 — Verify on AWS, before any DNS change

Nothing here affects live traffic.

```bash
FU=<FunctionUrl>

curl -s "$FU/health"                                   # db must say "connected"
curl -s -o /dev/null -w '%{http_code}\n' "$FU/products"    # 200
curl -s -o /dev/null -w '%{http_code}\n' "$FU/nope"        # 404
```

Cold vs warm — plugins feel cold starts directly:

```bash
sleep 120
curl -s -o /dev/null -w 'cold %{time_total}s\n' "$FU/health"
for i in 1 2 3; do curl -s -o /dev/null -w "warm %{time_total}s\n" "$FU/health"; done
```

Expect cold in the low seconds, warm well under 500ms. If cold exceeds ~8s,
say so before going further.

Now through CloudFront, with a Host override so no DNS record is needed:

```bash
CF=<DistributionDomain>
curl -s --resolve "api.adlmstudio.net:443:$(dig +short $CF | head -1)" \
     https://api.adlmstudio.net/health
```

**PASS IF** both the Function URL and the CloudFront path return healthy JSON
with `"db":"connected"`, and CloudWatch shows no cold-start exceptions.

---

## Part 4 — The licence check (the one that matters)

This is where a silent failure would cost you paying customers. Do it before
touching DNS.

The live signer is `signLicenseToken` in `server/routes/auth.js:306`. It signs
with `JWT_LICENSE_SECRET` using **HS256** by default, or RS256 if
`ADLM_LICENSE_SIGNING_ALGO=RS256` **and** a usable `JWT_LICENSE_PRIVATE_KEY` is
present. If RS256 is requested but the key is unusable it **silently falls back
to HS256** and only logs.

**4a. Log in as a test user with a real entitlement:**

```bash
curl -s -X POST "$FU/auth/login" -H 'content-type: application/json' \
  -d '{"identifier":"you@example.com","password":"..."}' > /tmp/login.json

python3 -c "
import json;d=json.load(open('/tmp/login.json'))
print('accessToken:', bool(d.get('accessToken')))
print('licenseToken:', bool(d.get('licenseToken')))
print('entitlements:', [e['productKey'] for e in d.get('user',{}).get('entitlements',[])])"
```

**PASS IF** `licenseToken` is `True`. If it's `False` or `null`,
`JWT_LICENSE_SECRET` is missing — look for
`JWT_LICENSE_SECRET is missing; plugin license token signing is unavailable`
in CloudWatch. **Stop and fix before going further.**

**4b. Confirm the algorithm matches Render.** Decode the JWT header:

```bash
python3 -c "
import json,base64
t=json.load(open('/tmp/login.json'))['licenseToken']
h=t.split('.')[0]; h+='='*(-len(h)%4)
print(json.loads(base64.urlsafe_b64decode(h)))"
```

- `{"alg":"HS256","typ":"JWT"}` → HS256 mode
- `{"alg":"RS256","typ":"JWT","kid":"..."}` → RS256 mode

**PASS IF** this matches what Render was issuing. A plugin built for one and
served the other will reject the licence. If you set
`ADLM_LICENSE_SIGNING_ALGO=RS256` but see `HS256` here, the key didn't load —
check CloudWatch for the fallback message.

**4c. JWKS** (only meaningful in RS256 mode):

```bash
curl -s "$FU/.well-known/jwks.json"
```

In HS256 mode `{"keys":[]}` is expected and correct. In RS256 mode an empty
keyset means plugins cannot verify anything — fix it now.

**4d. Device binding:**

```bash
TOKEN=$(python3 -c "import json;print(json.load(open('/tmp/login.json'))['accessToken'])")
curl -s -X POST "$FU/api/entitlements/activate" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"productKey":"revit","deviceFingerprint":"golive-test-001","deviceName":"go-live check"}'
curl -s "$FU/api/entitlements" -H "authorization: Bearer $TOKEN"
```

**PASS IF** activate succeeds and the device appears in the list. Clean up with
`/api/entitlements/deactivate` afterwards so you don't burn a seat.

---

## Part 5 — Go live (one CNAME)

> **Full detail: `docs/PHASE5_DNS_RUNBOOK.md`.** DNS is edited at **Squarespace
> Domains**, not Cloudflare and not Google Cloud DNS — the `ns-cloud-*`
> nameservers are inherited from Google Domains and mislead you into GCP, where
> no zone exists. `api.adlmstudio.net` does not exist yet, so this is an ADD,
> not a repoint. Google Workspace email lives on this zone; touch only the `api`
> record, and remember Squarespace's NAME field takes the subdomain only.

Only after Parts 3 and 4 pass.

1. **Lower the TTL** on the existing `api.adlmstudio.net` record to 60s.
   **Wait for the OLD TTL to fully expire** before step 3 — otherwise resolvers
   keep serving the dead Render address for however long the old TTL said.
2. Note the current value somewhere, so rollback is copy-paste.
3. Repoint: `CNAME api.adlmstudio.net → <DistributionDomain>`
   - If it's currently an **A record**, replace it with a CNAME. CloudFront has
     no fixed IPs. Fine on a subdomain.
4. Watch it flip: `watch -n5 'dig +short api.adlmstudio.net'`
5. Re-run Part 3 and Part 4 against the real hostname.
6. **Update the Paystack webhook URL** to
   `https://api.adlmstudio.net/webhooks/paystack`, plus any OAuth redirect URIs.
7. Set `VITE_API_BASE=https://api.adlmstudio.net` in Vercel and redeploy the
   frontend.

**PASS IF** `https://api.adlmstudio.net/health` returns healthy from a machine
you haven't been overriding DNS on (try mobile data).

---

## Part 6 — Plugin test matrix

Every plugin reaches the API by hostname, so the CNAME fixes all of them with
no plugin update. Test each anyway.

### 6a. Every plugin, same four steps

On a real Windows machine, per plugin:

| # | Step | PASS IF |
| --- | --- | --- |
| 1 | Launch the host app (Revit / Planswift / Excel / ArchiCAD) and open the ADLM panel | Panel loads, no connection error |
| 2 | Sign out fully, then sign in | Sign-in succeeds — this forces a **fresh** licence token from AWS, not a cached one |
| 3 | Use one licensed feature end to end | Works, no "licence invalid" or "cannot reach server" |
| 4 | Close and reopen the host app | Still signed in; licence still valid |

Step 2 is the important one. A plugin holding a cached offline token will look
fine even if the endpoint is broken — signing out is what proves AWS is
actually serving licences.

### 6b. Per-plugin specifics

**QUIV (`revit`) — highest priority.** API-only, so it is fully dependent on
this migration. Test: sign in → take off a small model → confirm quantities.

**HERON (`planswift`).** Also holds `ADLM_MONGO_CONNECTION`, so it may appear to
work even with the API down — don't be reassured by that. Test: sign in →
open a project → run a takeoff.

**MEP (`mep`).** API-only. Test: sign in → run an MEP takeoff.

**RateGen (`rategen`).** Reads `ADLM_RATEGEN_API_BASE_URL` and holds its own
Atlas connection. Test: sign in → build a rate → confirm library loads.

**ArchiCAD (`archicad`).** Test: sign in → run a BoQ export.

**TimeMgt (WPF).** Synced via `/api/tasks` into the main database
(`adlmWeb.timemgtTasks`) — no separate cluster, and no `TIMEMGT_MONGO_URI`.
Test: create a task locally → confirm it syncs → confirm it appears on the web
dashboard.

### 6c. Confirm the server saw it

After testing, from the API side:

```bash
# Heartbeats prove plugins reached AWS
aws logs filter-log-events --region eu-west-1 \
  --log-group-name /aws/lambda/<ApiFn name> \
  --start-time $(( ($(date +%s) - 3600) * 1000 )) \
  --filter-pattern '"/usage/heartbeat"' \
  --query 'events[].message' --output text
```

Or check **Admin → Usage** in the web UI: each tested product should show a
recent "last seen".

**PASS IF** every product you tested shows a fresh heartbeat, and
**Admin → Users → devices** shows the expected bindings.

### 6d. Web app

- [ ] Sign in / sign out
- [ ] A page that loads data (products, trainings)
- [ ] A Paystack purchase in **test mode** → confirm the webhook credits it
- [ ] Course video playback (expect this to fail if
      `AWS_CLOUDFRONT_PRIVATE_KEY` is still path-based — known, not a blocker)

---

## Part 7 — First 24 hours

**Scheduled jobs.** These have not run since Render went down. First fire is
08:00 (auto-renew) and 09:00 (expiry notifier) Africa/Lagos.

Rather than discovering a problem with real money, dry-run auto-renew first:

```bash
aws lambda invoke --region eu-west-1 \
  --function-name <ScheduledFunctionName> \
  --payload '{"job":"expiry-notifier"}' /dev/stdout
```

Start with `expiry-notifier` — it only sends email. Watch the log, confirm the
summary looks sane, and only then let 08:00 arrive.

> **Entitlements may have lapsed while Render was down.** Nothing auto-renewed
> during the outage. Check for entitlements that expired in that window before
> the first auto-renew run, so it doesn't charge or skip unexpectedly.

**Watch daily:**

```bash
# Errors
aws logs filter-log-events --region eu-west-1 \
  --log-group-name /aws/lambda/<ApiFn name> \
  --start-time $(( ($(date +%s) - 86400) * 1000 )) \
  --filter-pattern 'ERROR' --query 'events[].message' --output text

# DLQ must stay empty
aws sqs get-queue-attributes --region eu-west-1 --queue-url <ScheduleDlqUrl> \
  --attribute-names ApproximateNumberOfMessages

# Spend against credit
# Cost Explorer is a us-east-1-only API, regardless of where resources live.
aws ce get-cost-and-usage --region us-east-1 \
  --time-period Start=$(date -d '7 days ago' +%F),End=$(date +%F) \
  --granularity DAILY --metrics '"UnblendedCost"' \
  --query 'ResultsByTime[].{d:TimePeriod.Start,usd:Total.UnblendedCost.Amount}'
```

Also watch **Atlas → Metrics → Connections**. Budget is 380 of 1500 from
Lambda; RateGen, HERON and TimeMgt add more on top. If it climbs past ~1000,
lower `atlasBudgetShare` in `infra/config.ts` and redeploy.

**PASS IF** after 7 days: no new error classes, DLQ empty, both jobs ran, spend
is pennies, Atlas connections stable.

---

## Part 8 — Rollback

**Before the CNAME change:** nothing to do. Live traffic never touched AWS.

**After, API misbehaving:** put the old value back on the `api` record. This is
why Part 5 step 1 lowers the TTL first — recovery is ~60 seconds, not hours.

**If CloudFront specifically is the problem** but Lambda is fine, point the
CNAME at the Function URL host as a stopgap (it stays reachable —
`functionUrlAuth: "NONE"`). You lose edge termination, not service.

**Full teardown:** `npx cdk destroy`. The log groups are `RETAIN` on purpose.

---

## Quick reference

| Thing | Where |
| --- | --- |
| Tunables | `infra/config.ts` |
| Deploy detail | `infra/README.md` |
| Licence signer | `server/routes/auth.js:306` |
| Lambda entry | `server/lambda.js` |
| Scheduled jobs | `server/scheduled.js` |
| Plugin env vars | `scripts/setup-deployments.ps1` |
