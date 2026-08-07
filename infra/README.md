# ADLM Cloud — AWS deploy runbook

> **Routine deploys are automated.** `.github/workflows/deploy-api.yml` runs
> `cdk deploy` whenever `server/**` or `infra/**` lands on `main`, so a server
> change no longer waits for someone to remember. It needs a one-time IAM/OIDC
> setup, documented at the top of that file, and it is inert until then.
>
> This runbook remains the reference for anything the workflow does not do:
> first deploys, certificate and DNS changes, and recovering a stack by hand.
> Run `npx cdk deploy` locally from `infra/` for those.



Emergency restore of the ADLM Cloud API (`adlmstudio.net`) onto AWS Lambda,
after the Render suspension took it offline.

**You run every command in this file. Nothing here has been executed.** The
stacks synthesize cleanly and the Lambda bundle builds, but nothing has ever
been deployed — this session has no credentials for ADLM's AWS account.

---

## 0. Correct the assumptions first

Everything questionable lives in one file: **`infra/config.ts`**. Nothing else
hardcodes a value you might need to change.

**Confirmed against reality — no longer open questions:**

| Setting | Value | |
| --- | --- | --- |
| `apiHostname` | `api.adlmstudio.net` | A domain ADLM controls, so repointing DNS does rescue the locked-out plugins. |
| `atlasConnectionLimit` | `1500` | M10. |
| `alarmEmail` | `admin@adlmstudio.net` | **You must click the SNS confirmation email on first deploy** or no alarm ever reaches anyone. |

**Chosen, with reasoning — revisit as real traffic data arrives:**

| Setting | Value | Why |
| --- | --- | --- |
| `atlasBudgetShare` | `0.25` | Share of Atlas connections this Lambda may consume. The rest is headroom for the WPF desktop app, Compass, admin scripts, and the old Render service during a parallel run. Raise only if Atlas shows connection headroom. |
| `timeoutSeconds` | `60` | Deviation from the plan's 30s, because the AI agent path allows 45s and has a measured 22.8s uncached call. Drop to 30 once `/agent/*` moves off this function. |
| `mongoMaxPool` | `5` | A Lambda container serves one request at a time, so a large pool buys nothing. Must stay equal to the `MONGO_MAX_POOL` env var — the stack sets both from this value. |
| `functionUrlAuth` | `NONE` | Needed for the verify-before-DNS step and as a fallback hostname mid-outage. Switch to `AWS_IAM` after the soak. |

`reservedConcurrency` is **derived**, not set by hand:

```
floor(atlasConnectionLimit × atlasBudgetShare ÷ mongoMaxPool)
floor(1500 × 0.25 ÷ 5) = 75 containers → 375 Atlas connections,
plus 5 for the scheduled-jobs function = 380 of 1500
```

Fix the tier number and the concurrency corrects itself. `mongoMaxPool` must
stay equal to `MONGO_MAX_POOL` in the Lambda environment — the stack sets both
from the same value, so change it only in `config.ts`.

---

## 1. Prerequisites

```bash
aws sts get-caller-identity                     # confirm the right account
cd infra && npm install

npx cdk bootstrap aws://<ACCOUNT_ID>/eu-west-1  # regional resources
npx cdk bootstrap aws://<ACCOUNT_ID>/us-east-1  # CloudFront cert + hosted zone
```

Both regions are required: the certificate can only live in `us-east-1`, and
everything else lives in `eu-west-1`.

---

## 2. Load the secrets into SSM

The function reads **every parameter directly under `/adlm/cloud/prod`** at cold
start and exports it into `process.env` under its leaf name. So
`/adlm/cloud/prod/MONGO_URI` becomes `process.env.MONGO_URI`, and the
application code needs no changes at all.

Standard parameters are free. **Do not create advanced parameters** — they bill
$0.05 each per month.

```bash
put() {   # put <NAME> — prompts, so the value never lands in shell history
  read -rsp "$1: " v && echo
  aws ssm put-parameter --region eu-west-1 --type SecureString \
    --name "/adlm/cloud/prod/$1" --value "$v" --overwrite
}
```

**Required — the function exits on cold start without these:**

```
MONGO_URI  JWT_ACCESS_SECRET  JWT_REFRESH_SECRET
```

**Licence-critical — get these wrong and plugins fail silently, see §5:**

```
JWT_LICENSE_SECRET  ADLM_LICENSE_SIGNING_ALGO  JWT_LICENSE_PRIVATE_KEY
```

**Everything else, for full functionality** (copy the live values from the
Render dashboard — `server/.env.example` documents what each one is):

```
PAYSTACK_SECRET_KEY  PUBLIC_WEB_URL  COOKIE_DOMAIN
CLOUDINARY_CLOUD_NAME  CLOUDINARY_API_KEY  CLOUDINARY_API_SECRET
R2_ACCOUNT_ID  R2_ACCESS_KEY_ID  R2_SECRET_ACCESS_KEY  R2_BUCKET
R2_S3_ENDPOINT  R2_PUBLIC_BASE_URL
BUNNY_STREAM_API_KEY  BUNNY_STREAM_LIB_ID
AWS_VIDEO_ARCHIVE_BUCKET  AWS_VIDEO_DELIVERY_BUCKET
AWS_MEDIACONVERT_ENDPOINT  AWS_MEDIACONVERT_ROLE_ARN
AWS_CLOUDFRONT_DOMAIN  AWS_CLOUDFRONT_KEY_PAIR_ID  AWS_CLOUDFRONT_PRIVATE_KEY
SMTP_HOST  SMTP_PORT  SMTP_USER  SMTP_PASS  RESEND_API_KEY  EMAIL_FROM
OPENAI_API_KEY  ANTHROPIC_API_KEY  AGENT_PROVIDER  AGENT_MODEL
NOTION_API_KEY  NOTION_CRM_DB_ID
RATEGEN_MONGO_URI
ADMIN_API_KEY  GOD_ACCOUNT_EMAILS  SUPPORT_WHATSAPP
MPXJ_API_URL  MPXJ_API_KEY
```

> **`AWS_CLOUDFRONT_PRIVATE_KEY` changes meaning.** On Render it was a *path* to
> a PEM on disk. Lambda has no persistent disk. Store the **key material
> itself** in this parameter. The signer in `server/utils/` reads it as a path
> today, so course-video signed URLs stay broken until that is changed — it is
> not licence-critical, so it is not on the emergency path.

> **`MPXJ_API_URL` still points at Render** and that service is down too. `.mpp`
> import will fail with the existing friendly error telling users to export XML
> instead. Acceptable for now; see D4 in the migration plan.

---

## 3. DNS strategy — pick one

Set by `useExternalDns` in `config.ts`. **Defaults to `true`.**

| | `true` — external DNS (default) | `false` — Route 53 |
| --- | --- | --- |
| Stacks | `AdlmApi` only | `AdlmEdge` + `AdlmApi` |
| DNS change | one CNAME at your current provider | delegate nameservers |
| Certificate | you issue it first (§3a) | CDK issues and validates it |
| Vercel records | never touched | must be replicated first |
| Rollback | edit one CNAME back | wait for nameserver propagation |

Use `true` for the emergency restore: it moves one record and leaves the
frontend's DNS completely alone. Move to `false` later, calmly, when nothing is
on fire — preview it first with `npx cdk diff --all -c useExternalDns=false`.

### 3a. External DNS: issue the certificate first

Deliberately out of band. If the certificate were created inside the stack with
no hosted zone to validate against, the deploy would stall on a pending
validation and could roll back — the last thing you want mid-outage. This way
each step is independently verifiable and nothing hangs.

```bash
# 1. Request it. MUST be us-east-1 — CloudFront accepts no other region.
aws acm request-certificate --region us-east-1 \
  --domain-name api.adlmstudio.net \
  --validation-method DNS \
  --query CertificateArn --output text
# → arn:aws:acm:us-east-1:<ACCOUNT>:certificate/<ID>

# 2. Read the CNAME it wants.
aws acm describe-certificate --region us-east-1 \
  --certificate-arn <ARN> \
  --query 'Certificate.DomainValidationOptions[0].ResourceRecord'

# 3. Add that Name → Value as a CNAME at your current DNS provider.
#    This record is unrelated to any live record; adding it is safe.

# 4. Wait for ISSUED (usually minutes).
aws acm wait certificate-validated --region us-east-1 --certificate-arn <ARN>
```

Leave that validation CNAME in place permanently — ACM re-validates on renewal,
and removing it eventually breaks the certificate.

### 3b. Deploy

```bash
CERT=arn:aws:acm:us-east-1:<ACCOUNT>:certificate/<ID>

npx cdk diff  -c certificateArn=$CERT    # read this before every deploy
npx cdk deploy -c certificateArn=$CERT
```

Or set `certificateArn` in `config.ts` and drop the flag. Synth fails with an
actionable message if `useExternalDns` is true and no ARN is supplied.

**Route 53 path instead:** set `useExternalDns: false`, then `npx cdk deploy
--all`. CDK orders `AdlmEdge` before `AdlmApi`, creates the zone, and validates
the certificate itself — no manual step, but you must then delegate
nameservers, and §6 applies.

Deploy outputs you need:

- `FunctionUrl` — verify here first
- `DistributionDomain` — verify second, then the CNAME target
- `NameServers` — Route 53 path only, for the delegation, **later**

---

## 4. Verify before touching DNS

Creating the hosted zone changes nothing while `adlmstudio.net` is still served
by its current provider. Nothing below affects live traffic.

**Against the Function URL** (bypasses CloudFront — isolates the function):

```bash
FU=<FunctionUrl from outputs>

curl -s "$FU/health"                       # {"ok":true,"db":"connected",...}
curl -s "$FU/.well-known/jwks.json"        # see §5 — this one matters most
curl -s -o /dev/null -w '%{http_code}\n' "$FU/products"
curl -s -o /dev/null -w '%{http_code}\n' "$FU/nope"    # expect 404
```

Cold vs warm, measured separately — the plan asks for both, and plugins feel
cold starts directly:

```bash
curl -s -o /dev/null -w 'cold %{time_total}s\n' "$FU/health"   # after a pause
for i in 1 2 3 4 5; do
  curl -s -o /dev/null -w "warm %{time_total}s\n" "$FU/health"
done
```

**Against CloudFront, before DNS** — override the Host header so the
distribution serves the aliased hostname without a DNS record existing:

```bash
CF=<DistributionDomain from outputs>
curl -s --resolve "api.adlmstudio.net:443:$(dig +short "$CF" | head -1)" \
     https://api.adlmstudio.net/health
```

Confirm in CloudWatch that the log group exists, retention reads 30 days, and
there are no cold-start exceptions.

---

## 5. The licence check that must not be skipped

```bash
curl -s "$FU/.well-known/jwks.json"
```

If this returns **`{"keys":[]}`**, `JWT_LICENSE_PRIVATE_KEY` is missing from
SSM. Per the comments in `server/routes/wellKnown.js`, **plugins fall back to
HS256 when the keyset is empty.** That will not error, will not alarm, and will
not look broken — it silently changes how every licence token is verified.

Before any traffic moves, confirm against the Render configuration that:

1. `ADLM_LICENSE_SIGNING_ALGO` is byte-identical
2. `JWT_LICENSE_SECRET` is byte-identical
3. `JWT_LICENSE_PRIVATE_KEY` is either set in both or absent in both

Then activate a device on a real plugin against the Function URL before
delegating DNS.

---

## 6. Cutover

### External DNS (default) — one record

1. Lower the TTL on the existing `api.adlmstudio.net` record to 60s. **Wait for
   the old TTL to expire** before step 3, or resolvers will keep serving the
   dead Render address for however long the old TTL says.
2. Verify against `DistributionDomain` with a Host-header override (§4).
3. Repoint `api.adlmstudio.net` at the CloudFront domain:
   `CNAME api.adlmstudio.net → dXXXXXXXX.cloudfront.net`
4. Watch resolution: `dig +short api.adlmstudio.net`
5. Run the §4 checks against the real hostname, then §5's licence check.
6. Update the **Paystack webhook URL** and any OAuth redirect URIs that point at
   the old host.

Nothing else moves. Vercel's records are untouched, so the frontend cannot go
dark from a missed record. **Rollback is putting the old value back on that one
record** — which is why step 1's TTL reduction matters.

> If the current record is an `A` record rather than a `CNAME`, replace it with
> a CNAME. CloudFront has no fixed IPs, so an A record cannot point at it.
> Fine on a subdomain; only a zone apex forbids CNAMEs.

### Route 53 path — full delegation

Only if `useExternalDns: false`. Slower and much harder to undo, so not the
emergency path. The order that matters:

1. Export every existing record from the current DNS provider
2. Replicate them **all** into the Route 53 zone — Vercel's records included,
   since the frontend stays on Vercel
3. Drop TTLs to 60s and wait at least an hour
4. Only then delegate nameservers
5. Update the Paystack webhook URL and any OAuth redirect URIs

Nameserver delegation is the slowest-propagating step and the hardest to undo.
Anything missing from step 2 goes dark while it propagates, which is exactly the
risk the external-DNS path avoids.

---

## 7. Scheduled jobs

The two jobs that node-cron ran inside the Render process now run on
EventBridge Scheduler against a **separate** Lambda (`ScheduledFn`), with
reserved concurrency 1 and a 10-minute timeout.

| Job | Schedule | Retries | Payload |
| --- | --- | --- | --- |
| `auto-renew` | `cron(0 8 * * ? *)` `Africa/Lagos` | **0** | `{"job":"auto-renew"}` |
| `expiry-notifier` | `cron(0 9 * * ? *)` `Africa/Lagos` | 2 | `{"job":"expiry-notifier"}` |

Scheduler is used rather than an EventBridge Rule because rules are UTC-only.
Africa/Lagos is UTC+1 with no daylight saving so the two are equivalent today,
but naming the zone means these stay at 08:00/09:00 Lagos regardless.

**Auto-renew does not retry, on purpose.** Scheduler is at-least-once and this
job charges real cards. The renewal engine creates its Purchase record before
charging and caps attempts to one per day, so a retry is *probably* safe — but
"probably" is the wrong standard for taking money from customers. A failure
dead-letters and alarms instead; recover by invoking it by hand:

```bash
aws lambda invoke --region eu-west-1 \
  --function-name <ScheduledFunctionName output> \
  --payload '{"job":"auto-renew"}' /dev/stdout
```

`runAutoRenewals` also accepts `{ dryRun: true }` internally if you want to
check what it *would* charge before letting it run for real.

**Timeout is 10 minutes, under the 15-minute Mongo job-lock TTL.** That
ordering matters: a timed-out run is killed without releasing its lock, so the
TTL must be able to expire only after the process is definitely gone.

Two alarms cover this: any error from `ScheduledFn`, and DLQ depth > 0. A
dead-lettered job **did not run** — decide what happened before re-invoking.

> A run that logs `SKIPPED: lock-held` is normally healthy (an overlapping run
> held the lock). If it persists across days, check the `job_locks` collection
> for a stale document.

---

## 8. What this stack does NOT do

- **Large uploads fail.** Lambda caps request payloads at 6 MB; the installer
  and APK admin routes accept up to 500 MB. Those routes will 413 until uploads
  move to presigned S3.
- **`express.json` is set to 16 MB.** If real Revit/BOQ payloads exceed 6 MB,
  those routes fail too. This is open question D5 and it decides whether the
  end state needs an ALB (~$16/month, the first thing in the plan that fails
  the post-2028 cash test).
- **No WAF, no edge rate limiting.** The app's own `express-rate-limit` still
  applies. Note that `app.set("trust proxy", 1)` assumes one proxy hop;
  CloudFront in front of a Function URL may present two, which can affect how
  the rate limiter keys clients. Worth checking under load.
- **The Function URL is publicly reachable** (`functionUrlAuth: "NONE"`). This
  is deliberate: it is required for the verification above and leaves a working
  fallback hostname mid-outage. It is the same exposure `adlmweb.onrender.com`
  has today, and every protected route still enforces its own JWT auth. Switch
  to `"AWS_IAM"` after the soak to lock the function behind CloudFront.

---

## 9. Rollback

Nothing here is destructive until DNS is delegated, so rollback before that
point is "stop using it".

- **Before delegation:** no action. Live traffic never touched AWS.
- **After delegation, API misbehaving:** repoint the `api` record at the old
  host. This is why TTLs go to 60s first.
- **Full teardown:** `npx cdk destroy --all`. The hosted zone and the log group
  are `RETAIN` on purpose — deleting a zone issues **new** nameservers, which
  means another full delegation wait.

---

## 10. Cost

Recurring cost after the Activate credit expires on 31 July 2028:

| Resource | Free tier | Cost |
| --- | --- | --- |
| Lambda | 1M requests + 400k GB-s/month, permanent | $0.00 |
| Function URL | no charge | $0.00 |
| CloudFront | 1TB egress + 10M requests/month, permanent | $0.00 |
| ACM | public certificates are free | $0.00 |
| SSM Parameter Store | standard parameters are free | $0.00 |
| CloudWatch Logs | 5GB/month; 30-day retention caps growth | ~$0.00 |
| SNS | first 1,000 email notifications free | $0.00 |
| EventBridge Scheduler | 14M invocations/month free | $0.00 |
| SQS (schedule DLQ) | 1M requests/month free | $0.00 |
| Route 53 hosted zone | none — **not created on the default path** | $0.00 / $0.50 |
| **Total** | | **$0.00–$0.50/month** |

On the default external-DNS path there is no hosted zone, so the recurring cost
is effectively **nil** — DNS stays wherever you already pay for it. Adopting
Route 53 later adds $0.50/month.

At roughly ₦800/USD that is under **₦400/month** either way, which is the point
of this architecture: it survives the credit expiring. The figures that would break
that are an ALB (~$16/mo) or App Runner for the MPXJ converter (~$5–25/mo) —
both still open decisions, neither on the emergency path.
