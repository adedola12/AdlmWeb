# Moving the mail to SES

Everything the studio sends — receipts, licence activations, password resets,
renewal notices, expiry warnings, campaigns, broadcasts, video announcements —
goes through `server/util/mailer.js`. This is the plan for having SES carry it,
and for taking Resend and the Gmail SMTP fallback out afterwards.

---

## Why this is a smaller change than it sounds

Resend already sends this domain's mail through SES. The DNS says so:

```
send.adlmstudio.net   TXT  "v=spf1 include:amazonses.com ~all"
send.adlmstudio.net   MX   10 feedback-smtp.eu-west-1.amazonses.com
```

That is SES in Ireland, wearing Resend's name. Going direct removes a reseller
and an API key — not a mail platform, and not a reputation that has to be
rebuilt from nothing.

What actually makes mail slow today is not Resend. It is that every mass sender
was written as a loop with a sleep in it, because a reseller's rate limit is
not something you can ask about. SES publishes its rate, so the sleep can go.

---

## Two things about the console setup that were wrong

**The region.** The API Lambda runs in `eu-west-1` (`infra/config.ts`). The
`adlmstudio.net` identity was created by hand in `us-east-1`. An SES identity
exists in exactly one region, and **sandbox status is granted per region** —
production access won in us-east-1 would leave these functions still capped at
200 messages a day. The identity is now created by CDK, in eu-west-1, as part
of `AdlmApi`.

**The pricing plan.** us-east-1 is on the **Pro** plan: **$105 per month**
before a single message is sent, plus $0.22/1,000. eu-west-1 is on Essentials:
no monthly fee, $0.16/1,000. Pro buys managed dedicated IPs and email
validation — worth having at roughly 1.7 million messages a month, not at
ADLM's volume. **Put us-east-1 back on Essentials** (SES console → Pricing
plan) once nothing depends on it.

---

## What the code does now

| File | What it does |
|---|---|
| `server/util/sesTransport.js` | SES v2 send, IAM-role credentials, reads the account's real send rate |
| `server/util/sendPool.js` | Runs N sends at once without exceeding R per second |
| `server/util/mailer.js` | SES → Resend → Gmail SMTP, in that order |
| `server/util/videoNotifier.js` | Batches now send in parallel |
| `server/routes/admin.campaigns.js` | Campaign send uses the pool |
| `server/routes/admin.broadcast.js` | Broadcast batch uses the pool |
| `infra/lib/adlm-api-stack.ts` | The eu-west-1 identity, DKIM outputs, IAM for all three mail-sending functions |

**There is no credential.** The Lambda's execution role is the credential, the
same way the Bedrock grant replaced an Anthropic API key. Nothing in SSM can
send as the studio if it leaks, because there is nothing in SSM.

### Environment

| Variable | Default | What it does |
|---|---|---|
| `MAIL_TRANSPORT` | unset | Set to `ses` to put SES first. Unset = today's behaviour exactly. |
| `MAIL_FALLBACK` | on | Set to `off` once you want an SES failure to be a failure, not a silent fall-through to Resend. |
| `SES_CONFIGURATION_SET` | unset | Attach once there is one, for bounce/complaint events. |
| `SES_REGION` | `AWS_REGION`, else `eu-west-1` | Only needed if SES ever lives somewhere other than the API. |
| `MAIL_SEND_RATE_PER_SEC` | unset | Overrides the rate read from the account. For pinning it below the quota. |
| `CAMPAIGN_CONCURRENCY`, `VIDEO_SEND_CONCURRENCY` | derived from the rate | How many in flight at once. |

`CAMPAIGN_GAP_MS` and `BROADCAST_RATE_PER_SEC` still work and still win where
they are set — they just stop being the only available answer.

### What this is worth

800 recipients, sequentially at one per second: **13 minutes**. The same 800
through the pool at the rate SES grants a new production account: **about a
minute**. Nothing about the messages changes; only the waiting does.

---

## The steps that are not code

### 1. Deploy, and read the DNS records off the stack

```bash
cd infra && npx cdk deploy AdlmApi
```

The identity is created PENDING. Four outputs tell you what to publish:
`MailDkim1`, `MailDkim2`, `MailDkim3` and `MailFromRecords`.

### 2. Publish them in Google Cloud DNS

Authoritative DNS for `adlmstudio.net` is Google (`ns-cloud-d1.googledomains.com`),
not Route 53, so CDK cannot write these — it can only tell you what they are.

- Three CNAMEs at `<token>._domainkey.adlmstudio.net`
- `mail.adlmstudio.net` MX → `feedback-smtp.eu-west-1.amazonses.com` (priority 10)
- `mail.adlmstudio.net` TXT → `v=spf1 include:amazonses.com ~all`

**The apex SPF, the Google Workspace MX records and everything Resend uses under
`send.adlmstudio.net` stay exactly as they are.** Nothing here touches inbound
mail, and Resend must keep working until the cutover is finished.

**This step is not optional.** `adlmstudio.net` publishes `v=DMARC1; p=reject`.
A message SES signs only as `amazonses.com` is not delivered-to-spam — it is
refused. Verifying a single address instead of the domain is not enough.

SES rechecks on its own; verification usually lands within the hour.

### 3. Request production access — in eu-west-1

The draft is below. Sandbox is 200 messages a day and 1 per second; production
starts at 50,000 a day.

### 4. Cut over

1. Set `MAIL_TRANSPORT=ses` in SSM under `/adlm/cloud/prod`.
2. Send yourself a campaign test (the admin Campaigns screen refuses to send to
   a list before you have sent yourself one anyway).
3. Watch `[mailer] SES OK:` in CloudWatch, and the `via` column on `EmailSend`.
4. After a week of clean sending: set `MAIL_FALLBACK=off`, delete
   `RESEND_API_KEY` from SSM, and delete the Gmail `SMTP_USER` / `SMTP_PASS`
   with it. An app password that can send as the studio is a credential nobody
   needs once the role can do the job.

**Rollback is one parameter.** Unset `MAIL_TRANSPORT` and the next cold start is
back on Resend.

---

## The production access request

SES console → **Account dashboard** → **Request production access**, with the
region switched to **eu-west-1**. Answers below; the three bracketed numbers are
yours to fill in.

**Mail type:** Transactional and Marketing

**Website URL:** `https://adlmstudio.net`

**Use case description:**

> ADLM Studio sells construction estimating and quantity-surveying software
> (QUIV, HERON, CIVIQ, ADLM Time Pro and related plugins) to firms and
> individual quantity surveyors, mainly in Nigeria. Email is part of the
> product, not an add-on to it.
>
> The great majority of our volume is transactional and is sent to a customer in
> response to something they just did: account verification and password resets,
> purchase receipts and proforma invoices, software licence activations and
> device bindings, subscription renewal notices and expiry warnings, project
> share invitations, and support ticket correspondence. These go only to the
> address on the account that triggered them.
>
> A smaller share is announcement mail to our own customers — a new tutorial
> video, a product release — sent only to accounts that have verified their
> email address and have not opted out.
>
> We currently send this mail through Resend, which itself delivers via Amazon
> SES in eu-west-1. We are moving to SES directly to remove the intermediary,
> to authenticate with an IAM role rather than a shared API key, and to use the
> account-level suppression list and bounce/complaint events, which we cannot
> reach through a reseller. The sending domain adlmstudio.net is verified in
> this region with Easy DKIM and a custom MAIL FROM subdomain, and publishes
> DMARC p=reject.

**How do you plan to build or acquire your mailing list?**

> We do not acquire lists and we never buy them. Every address belongs to
> someone who created an ADLM Studio account themselves, at adlmstudio.net or
> inside one of our desktop plugins, in order to use software they are paying
> for or evaluating. An address must be confirmed by clicking a verification
> link before it can receive anything other than that verification message —
> unverified addresses are excluded from every bulk send in code, not by
> convention.

**How do you plan to handle bounces and complaints?**

> We process bounce and complaint events programmatically. Our sending
> configuration set publishes both event types to an SNS topic, which invokes a
> dedicated function that applies them to the account record within seconds of
> the event arriving. A permanent bounce marks the address undeliverable and
> removes it from every bulk send immediately. A complaint is treated as an
> immediate and permanent opt-out from all non-essential mail. We distinguish
> transient bounces and do not act on them, so a temporary mailbox-full
> condition does not remove a legitimate customer, and we ignore "not-spam"
> complaint feedback, which indicates the opposite of a complaint.
>
> Alongside this we rely on the SES account-level suppression list, which is
> enabled for both bounces and complaints. Every event is also written to a
> 90-day log with the receiving server's own diagnostic, so a support query
> about non-delivery can be answered with what actually happened rather than a
> guess, and the rate can be reviewed on an admin screen.
>
> Hard failures are never retried: our send layer classifies errors and only
> retries throttling and transient 5xx responses, so a rejected or suppressed
> address is dropped on the first attempt rather than being attempted three
> times.

**How can recipients opt out of receiving email from you?**

> Every marketing or announcement email carries an unsubscribe link in its
> footer and a List-Unsubscribe header with one-click support, both pointing at
> a signed per-recipient URL that requires no login and works months later from
> any device. The opt-out is honoured immediately and is also a switch in the
> customer's own account settings. Announcement lists are unsubscribed
> separately from each other, so leaving the tutorial list does not silently
> stop a renewal notice the customer still needs. Transactional mail about a
> customer's own account and licences continues, as it is part of the service
> they have paid for.

**Additional contacts:** `[your support address, if you want AWS copied in]`

**Preferred contact language:** English

**Expected sending volume:**

- Peak: `[messages per day]`
- Monthly: `[messages per month]`

> Count the customer base for the monthly figure and add a campaign or two; the
> daily peak is whatever a full announcement send comes to. Under-asking is
> fine — the quota rises on request once you are sending cleanly. Do not
> inflate it.

---

---

## Bounce and complaint handling

SES → SNS → Lambda. There is no public webhook: an HTTPS subscription would
mean a URL anybody can POST to and signature verification we would have to get
right, whereas with SNS-to-Lambda only SNS can invoke the function and AWS
proves it.

| Piece | Where |
|---|---|
| Configuration set + event destination + SNS topic | `infra/lib/adlm-api-stack.ts` |
| `MailEventsFn` + its DLQ and depth alarm | same |
| Parsing and the decisions | `server/util/mailFeedback.js` |
| Lambda entry | `server/mailEvents.js` |
| The evidence log | `server/models/MailEvent.js` (90-day TTL) |
| The standing state | `User.emailUndeliverable` and friends |
| Read it back | `GET /admin/emails/bounces` |

The configuration set is attached to the **identity**, not just passed per
send, so it applies to every message from the domain including paths nobody
remembered to update. `SES_CONFIGURATION_SET` is also set on all three sending
functions; either alone would work.

### The three outcomes are not the same thing

| Event | What happens |
|---|---|
| **Permanent bounce** | Address marked undeliverable. Excluded from all bulk mail. Preferences untouched — see below. |
| **Transient bounce** | Recorded, nothing changed. A full mailbox on Tuesday says nothing about Wednesday — and the mailboxes that fill up are corporate ones, i.e. the customers. |
| **Complaint** | All non-essential mail off. **Not** marked undeliverable: the address works, the person is saying stop. Receipts continue. |
| **Complaint, `not-spam`** | Recorded, nothing changed. This record means somebody rescued the message *from* their spam folder. |

`emailUndeliverable` gates **bulk mail only**. Receipts, resets and licence mail
still attempt: if the flag is ever set wrongly, a customer who cannot receive a
password reset is locked out of software they paid for, whereas a receipt to a
dead address merely fails. SES's own account-level suppression list refuses
those at the API, which is the right place for it.

### A bounce never writes to a preference

`emailUndeliverable` records what the **server** can do. `emailPrefs.marketing`
and `emailPrefs.videoUpdates` record what the **person** wants. A bounce only
ever writes the first, and a complaint only ever writes the second.

Keeping them apart is what makes the un-mark button safe. If a bounce also
switched marketing off, then somebody who genuinely unsubscribed in March and
whose mailbox died in June would have their March decision overwritten — and
putting the address back would resubscribe them to mail they had already
refused. As built, an address put back still honours an unsubscribe made before
it broke.

### Putting an address back

**Emails → What came back → Start sending again**, on `/admin/emails`. The list
shows each stopped address with the receiving server's own diagnostic beside it,
so the decision is made while looking at what actually happened. It confirms
first, and it is audited (`email.undeliverable.clear`) — it is one admin
overruling a machine about a customer, and if the address really is dead it
costs reputation on every send that follows.

The event rows are deliberately **not** deleted when an address is put back. A
second bounce after a manual clear is a different conversation from a first one.

The only route back in is this button: the email address is the account
identity and cannot be changed by the customer or by an admin, so a stale flag
can never attach itself to a new address.

### Verifying it after deploy

SES has a mailbox simulator that produces real events without touching a real
recipient. Send to these from the Campaigns test box once the cutover is done:

```
bounce@simulator.amazonses.com      → a permanent bounce
complaint@simulator.amazonses.com   → a complaint
ooto@simulator.amazonses.com        → an out-of-office, which should change nothing
```

Then check `GET /admin/emails/bounces` and the `MailEventsFn` log group. The
simulator addresses work in the sandbox too, so this can be tested **before**
production access is granted.
