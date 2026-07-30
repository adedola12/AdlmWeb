# Phase 5 — DNS cutover runbook

## The headline: this cutover is purely additive

`api.adlmstudio.net` **does not exist today** (verified: `NXDOMAIN`). So this is
not a repoint — you are **creating** a record that nothing currently depends on.

That changes the risk profile completely:

- **No existing record is modified or deleted.** The website and email cannot
  break from this change.
- **No TTL-lowering dance is needed.** There is no old value to expire.
- **Rollback is deleting the record**, not restoring a remembered value.

Do not delegate nameservers. Do not touch anything except the two records in §3.

---

## 1. Zone facts (verified by live DNS query)

| | |
| --- | --- |
| Authoritative DNS | **Google Cloud DNS** — `ns-cloud-d{1,2,3,4}.googledomains.com` |
| Cloudflare | **Not in the path.** No record resolves to a Cloudflare proxy range. |
| SOA negative-cache TTL | **300s** — a brand-new record can take up to 5 min to be visible to a resolver that already cached the NXDOMAIN |

Current records that matter:

| Name | Type | Points at | Leave alone? |
| --- | --- | --- | --- |
| `adlmstudio.net` | A | `216.198.79.1` (Vercel) | **Yes** |
| `www.adlmstudio.net` | CNAME | `…vercel-dns-017.com` | **Yes** |
| `adlmstudio.net` | MX | `aspmx.l.google.com` + alts (**Google Workspace**) | **Yes — this is your email** |
| `adlmstudio.net` | TXT | `v=spf1 a mx include:_spf.google.com include:spf.mail.kudimail.net ~all` | **Yes** |
| `api.adlmstudio.net` | — | https://d3ay8iyy7zibie.cloudfront.net | this is what you create |

> **Your company email runs on this zone.** Google Workspace MX plus an SPF
> record covering Google and kudimail. Nothing in this runbook touches them —
> but it is the reason you must never delegate this zone to Route 53 in a hurry.
> A delegation with the MX records missed takes down email for everyone.

---

## 2. Before you start

- [ ] Access to the **Google Cloud project** holding the zone. If you don't know
      which project: sign in to <https://console.cloud.google.com/net-services/dns/zones>
      and switch projects until you find `adlmstudio.net`.
- [ ] `gcloud` installed and authenticated, **or** use the console (both below)
- [ ] The AWS deploy from Part 2 finished, with `DistributionDomain` to hand
- [ ] Part 3 and Part 4 of `GO_LIVE_CHECKLIST.md` passing

```bash
gcloud auth login
gcloud dns managed-zones list          # find the zone name
export ZONE=<zone-name-from-above>     # NOT the domain — the managed-zone name
gcloud dns record-sets list --zone=$ZONE
```

**PASS IF** the listing shows the MX, A and CNAME records from §1. If it doesn't,
you're in the wrong project or zone — stop.

> **Trailing dots are mandatory in Cloud DNS.** `api.adlmstudio.net.` and
> `d1234.cloudfront.net.` — omit the dot and the record silently means something
> else. This is the single most common mistake with this provider.

---

## 3. The two records to add

### 3a. ACM certificate validation (from checklist Part 2c)

Add this **first**, and leave it in place permanently — ACM re-validates at
renewal, and removing it eventually kills the certificate.

```bash
gcloud dns record-sets create "_<validation-name>.api.adlmstudio.net." \
  --zone=$ZONE --type=CNAME --ttl=300 \
  --rrdatas="_<validation-value>.acm-validations.aws."
```

Take both halves verbatim from:

```bash
aws acm describe-certificate --region us-east-1 --certificate-arn $CERT \
  --query 'Certificate.DomainValidationOptions[0].ResourceRecord'
```

Then:

```bash
aws acm wait certificate-validated --region us-east-1 --certificate-arn $CERT
```

**PASS IF** the wait returns cleanly. Usually a few minutes.

### 3b. The API record — this is the cutover

```bash
gcloud dns record-sets create "api.adlmstudio.net." \
  --zone=$ZONE --type=CNAME --ttl=60 \
  --rrdatas="<DistributionDomain>."
```

TTL 60 for the first days so a rollback propagates in a minute. Raise it to 300
once you're happy.

**Console equivalent:** Cloud DNS → your zone → **Add standard** → DNS name
`api`, Resource record type `CNAME`, TTL `60`, Canonical name
`<DistributionDomain>.`

> **It must be a CNAME, not an A record.** CloudFront has no fixed IPs. This is
> a subdomain, so a CNAME is fine — only a zone apex forbids one.

---

## 4. Verify

```bash
# Authoritative answer, bypassing every cache
dig +short CNAME api.adlmstudio.net @ns-cloud-d1.googledomains.com

# What the world sees (allow up to 300s for the NXDOMAIN negative cache)
dig +short api.adlmstudio.net

# End to end
curl -s https://api.adlmstudio.net/health
```

**PASS IF** `/health` returns `{"ok":true,"db":"connected",...}` over HTTPS with
no certificate warning.

Then re-run **Part 4** of `GO_LIVE_CHECKLIST.md` (the licence checks) against
`https://api.adlmstudio.net` rather than the Function URL.

If DNS resolves but TLS fails, the certificate isn't attached — check the
distribution's Alternate Domain Names include `api.adlmstudio.net`.

---

## 5. The rest of the cutover — not DNS

DNS alone does not restore service. These three are separate, and two of them
matter more than the DNS change.

### 5a. The website (this is what fixes your login screen)

Your live Vercel bundle has `https://adlmweb.onrender.com` compiled into it —
verified by reading the deployed JavaScript. Until this changes, the site keeps
failing regardless of DNS.

1. Vercel → project → **Settings → Environment Variables**
2. Set `VITE_API_BASE` = `https://api.adlmstudio.net`
3. **Redeploy** — it's a build-time variable, so a redeploy is required. Changing
   it without redeploying does nothing.

> You can do this **before** any DNS work by using the CloudFront domain
> directly as the value. CORS already allows `https://www.adlmstudio.net` and
> `https://adlmstudio.net`, so it works immediately with no certificate and no
> DNS wait. That is the fastest route to getting web users back.

### 5b. Paystack webhook

Paystack dashboard → Settings → API Keys & Webhooks → Webhook URL:

```
https://api.adlmstudio.net/webhooks/paystack
```

Until this is changed, **successful payments will not be credited.** The
endpoint verifies an HMAC over the raw body and is idempotent, so replayed
events are safe once it's pointed correctly.

### 5c. Plugins

Plugins read `ADLM_API_BASE_URL` (and `ADLM_RATEGEN_API_BASE_URL` for RateGen)
from `HKCU\Environment`, written at install time by the InstallerHub.

**Check what they actually hold** — on any machine with a plugin installed:

```powershell
[Environment]::GetEnvironmentVariable('ADLM_API_BASE_URL','User')
[Environment]::GetEnvironmentVariable('ADLM_RATEGEN_API_BASE_URL','User')
```

- **`api.adlmstudio.net`** → the CNAME above fixes every plugin. Nothing else to do.
- **`adlmweb.onrender.com`** → DNS cannot help. That is Render's domain. You must
  update the deployment records and have users reinstall or re-run the hub:
  ```powershell
  .\scripts\setup-deployments.ps1 -ApiBaseUrl "https://api.adlmstudio.net"
  ```
  Existing installs keep the old value in their registry until the hub rewrites
  it, so plan a comms message to customers.

This is the one open question that decides how hard plugin recovery is. Check it
before you promise anyone a timeline.

---

## 6. Rollback

Because nothing was overwritten, rollback is a delete:

```bash
gcloud dns record-sets delete "api.adlmstudio.net." --type=CNAME --zone=$ZONE
```

With TTL 60 that clears in about a minute, and the world returns to exactly the
state it's in today. The website and email are unaffected either way.

**Leave the ACM validation record in place** — deleting it serves no purpose and
breaks certificate renewal later.

If CloudFront is the problem but Lambda is healthy, point the CNAME at the
Function URL host instead as a stopgap (it stays reachable —
`functionUrlAuth: "NONE"`). You lose edge termination, not service.

---

## Appendix A — If you move DNS to Cloudflare

You aren't on Cloudflare today. If you move, these will bite, in this order:

1. **The ACM validation record must be DNS-only (grey cloud).** Cloudflare
   proxying rewrites the answer and ACM validation fails with no useful error.
2. **Decide proxy on/off for `api`.** DNS-only (grey) is what this runbook
   assumes and what I'd recommend — CloudFront already gives you edge
   termination in Lagos, and stacking two CDNs doubles the failure surface for
   no gain.
3. **If you do proxy it, SSL/TLS mode must be Full (strict).** CloudFront
   redirects HTTP→HTTPS; with Cloudflare's "Flexible" mode you get an infinite
   redirect loop.
4. **`app.set("trust proxy", 1)` becomes wrong.** That's in `server/index.js`
   and it trusts exactly one hop. Browser → Cloudflare → CloudFront → Lambda is
   two, so `express-rate-limit` would key on a proxy address instead of the real
   client — potentially rate-limiting *every* user as if they were one. If you
   proxy through Cloudflare, that value has to change to `2`.
5. **Free-plan upload cap is 100 MB.** Below Lambda's 6 MB limit it's moot, but
   it matters if uploads ever move to a different origin.

Moving the zone also means recreating the Google Workspace MX and the SPF TXT
record. Get those right *before* switching nameservers, not after.

## Appendix B — If you later delegate to Route 53

Set `useExternalDns: false` in `infra/config.ts` and the stack creates the zone
and alias records itself. Preview it first:

```bash
npx cdk diff --all -c useExternalDns=false
```

Do this calmly, never during an incident, and replicate **every** record from §1
into Route 53 before changing nameservers — the MX and SPF records above
especially. There is no operational reason to do this at all: Google Cloud DNS
works fine and costs you nothing extra, and staying put avoids the $0.50/month
hosted-zone charge.
