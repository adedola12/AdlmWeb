# ADLM Cloud — AWS deploy runbook

Emergency restore of the ADLM Cloud API (`adlmstudio.net`) onto AWS Lambda,
after the Render suspension took it offline.

**You run every command in this file. Nothing here has been executed.** The
stacks synthesize cleanly and the Lambda bundle builds, but nothing has ever
been deployed — this session has no credentials for ADLM's AWS account.

---

## 0. Correct the assumptions first

Everything questionable lives in one file: **`infra/config.ts`**. Nothing else
hardcodes a value you might need to change. Check these five before deploying:

| Setting | Assumed | How to check |
| --- | --- | --- |
| `apiHostname` | `api.adlmstudio.net` | **Most important.** Must match what the shipped QUIV/HERON binaries already call. A plugin pointed elsewhere is not rescued by this stack, however correct the stack is. |
| `atlasConnectionLimit` | `1500` (M10) | Atlas → Cluster → Limits. M0/M2/M5 = 500, M10 = 1500, M20/M30 = 3000, M40 = 6000. |
| `atlasBudgetShare` | `0.25` | Share of Atlas connections this Lambda may consume. The rest is headroom for the WPF desktop app, Compass, admin scripts, and the old Render service during a parallel run. |
| `alarmEmail` | `admin@adlmstudio.net` | You must click the SNS confirmation email or no alarm ever reaches anyone. |
| `timeoutSeconds` | `60` | Deviation from the plan's 30s, because the AI agent path allows 45s and has a measured 22.8s uncached call. Drop to 30 once `/agent/*` moves off this function. |

`reservedConcurrency` is **derived**, not set by hand:

```
floor(atlasConnectionLimit × atlasBudgetShare ÷ mongoMaxPool)
floor(1500 × 0.25 ÷ 5) = 75 containers → at most 375 of 1500 Atlas connections
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
TIMEMGT_MONGO_URI  TIMEMGT_DB  RATEGEN_MONGO_URI
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

## 3. Deploy

```bash
npx cdk diff --all        # read this before every deploy
npx cdk deploy --all
```

CDK deploys `AdlmEdge` (us-east-1) before `AdlmApi` (eu-west-1) because the
CloudFront distribution needs the certificate.

The certificate validates automatically — the validation record is written into
the hosted zone this stack creates. It does **not** require the domain to be
live on Route 53 yet.

Deploy outputs you need:

- `FunctionUrl` — verify here first
- `DistributionDomain` — verify TLS and routing here second
- `NameServers` — for the delegation, **later**

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

The DNS runbook is **Phase 5 and is not written yet** — it needs the current
zone contents, which are held by whichever provider serves `adlmstudio.net`
today. Do not improvise it. The order that matters:

1. Export every existing record from the current DNS provider
2. Replicate them **all** into the Route 53 zone — Vercel's records included,
   since the frontend stays on Vercel
3. Drop TTLs to 60s and wait at least an hour
4. Only then delegate nameservers
5. Update the Paystack webhook URL and any OAuth redirect URIs

Nameserver delegation is the slowest-propagating step and the hardest to undo.
Anything missing from step 2 goes dark while it propagates.

---

## 7. What this stack does NOT do

- **The two cron jobs do not run.** `ENABLE_EXPIRY_CRON` and
  `ENABLE_RENEWAL_CRON` are both forced to `false`, because on Lambda every warm
  container would schedule its own copy and **auto-renew charges real cards**.
  They move to EventBridge Scheduler in Phase 7. Until then nothing sends
  expiry warnings and nothing auto-renews. Renewals will need doing by hand, or
  Phase 7 needs bringing forward.
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

## 8. Rollback

Nothing here is destructive until DNS is delegated, so rollback before that
point is "stop using it".

- **Before delegation:** no action. Live traffic never touched AWS.
- **After delegation, API misbehaving:** repoint the `api` record at the old
  host. This is why TTLs go to 60s first.
- **Full teardown:** `npx cdk destroy --all`. The hosted zone and the log group
  are `RETAIN` on purpose — deleting a zone issues **new** nameservers, which
  means another full delegation wait.

---

## 9. Cost

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
| Route 53 hosted zone | none | **$0.50** |
| **Total** | | **~$0.50/month** |

At roughly ₦800/USD that is about **₦400/month**, which is the point of this
architecture: it survives the credit expiring. The figures that would break
that are an ALB (~$16/mo) or App Runner for the MPXJ converter (~$5–25/mo) —
both still open decisions, neither on the emergency path.
