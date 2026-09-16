# Operations watch

What tells a person, every day, that something is wrong for a customer or with
AWS. Built in September 2026 after two things went unnoticed for weeks:

- **Y.S. Associates** (24 seats) could not use any ADLM desktop software from
  8 July. Their HERON ticket was marked resolved on 21 July while the software
  stayed dark. Their dashboard read "Failed to fetch" and the server logged
  nothing, because the requests never arrived. We found out by phoning them.
- **AWS Support** asked a question on our SES production access case on
  7 August. Nobody saw it, AWS closed the case on 17 August, and the account
  stayed in the SES sandbox for another month. In the same period the API's
  alarm topic had no subscribers, so every alarm went nowhere.

## The pieces

| What | Where | Tells whom |
|---|---|---|
| Daily report | `server/util/opsDigest.js`, run after the daily expiry job in `server/scheduled.js` | `OPS_DIGEST_TO` in SSM |
| Quiet paid software on the call desk | `server/util/silentCustomers.js`, reason `silent` in `server/util/followUps.js` | `/admin/follow-ups` |
| Browser failures the server never sees | `client/src/lib/netFailureBeacon.js` to `POST /diag/client-error`, stored in `ClientNetError` for 30 days | the daily report |
| AWS Support replies and AWS Health notices | `infra/lib/adlm-ops-alerts-stack.ts` (stacks `AdlmOpsAlerts`, `AdlmOpsAlertsEu`) | `opsAlertEmail` in `infra/config.ts` |
| Watchdog for the daily report | same stack, alarm `adlm-daily-ops-report-missing` | `opsAlertEmail` |
| API error alarms | `AdlmApi` alarm topic | subscribed by hand, see below |

### The daily report

Sent every morning, even when there is nothing to do, because its arrival is
the proof the job is alive. It lists:

1. **Customers whose software has gone quiet.** A live paid desktop licence with
   no sign-in (`devices[].lastSeenAt`) and no usage heartbeat
   (`UsageSession.lastPingAt`) for 14 days, or never used 7 days after it was
   granted. Staff accounts are excluded. Largest firms first; NEW marks those
   that crossed the line in the last two days.
2. **Fixes nobody has confirmed.** Tickets marked resolved 3 to 30 days ago
   where that product has not been used since.
3. **Tickets waiting on us.** Open for more than two days.
4. **Browsers that could not reach ADLM** in the last 24 hours.
5. **Whether SES can reach customers**, which it cannot while in the sandbox.

It goes out through SES directly, one send per recipient. While the account is
in the sandbox, SES only delivers to verified addresses, so a recipient must be
verified in SES (eu-west-1) to receive it until production access is granted.

Resend a report by invoking the scheduled function with `{ "job": "ops-digest" }`.

### Recipients

```
aws ssm put-parameter --region eu-west-1 --name /adlm/cloud/prod/OPS_DIGEST_TO --type SecureString --overwrite --value "a@x.com,b@y.com"
```

A new value takes effect when the scheduled function next starts cold.

## Confirmation emails: the step that failed before

Every email subscription to an SNS topic sends an **AWS Notifications**
confirmation email. If nobody clicks **Confirm subscription** within three days,
AWS deletes the subscription and alerts silently go nowhere. That is exactly how
the API alarm topic ended up with no subscribers.

Check any topic:

```
aws sns list-subscriptions-by-topic --region eu-west-1 --topic-arn <topic arn>
```

A subscription that shows `PendingConfirmation` has not been clicked yet.

## Deploying the AWS alert stacks

Separate from `AdlmApi` on purpose, so a deploy of that shared stack from the
wrong checkout can never delete alerting.

```
cd infra
npx cdk bootstrap aws://065634457992/us-east-1
npx cdk deploy AdlmOpsAlerts AdlmOpsAlertsEu
```

The bootstrap is needed once: US East had never been used with CDK. Support case
events and account-wide Health events are only emitted there. Then click the two
confirmation emails.

## Sender addresses

Everything used to go out as admin@adlmstudio.net, which is also a person's
inbox. `server/util/senders.js` now splits it:

| Mail | From | Reply-To |
|---|---|---|
| Receipts, codes, licence and seat notices, the daily report | `notifications@adlmstudio.net` | `admin@adlmstudio.net` |
| Anything tracked as a campaign or carrying an unsubscribe link | `news@adlmstudio.net` | `admin@adlmstudio.net` |

Overrides: `EMAIL_FROM_NOTIFY`, `EMAIL_FROM_NEWS`, `EMAIL_REPLY_TO` in SSM. The
old `EMAIL_FROM` is no longer read. No new mailbox is needed because replies
go to admin@. Optionally add `notifications@` and `news@` as free aliases on
the admin@ user in Google Workspace, so the odd reply sent to the From address
still lands.

## DMARC reports

`_dmarc.adlmstudio.net` publishes `p=reject`, and until September 2026 its
reports went only to `dmarcmanager@kudimail.net`, which nobody read. The
`AdlmOpsAlertsEu` stack now receives them too:

- SES receives mail for `reports.adlmstudio.net` (receipt rule set, activated
  by the stack) and stores each message in the `DmarcReports` bucket under
  `raw/`, kept 400 days.
- `infra/lambda/dmarc` reads each one, writes a summary under `parsed/<day>/`,
  and emails the ops topic when any message failed authentication.
- Tests: `node --test infra/lambda/dmarc/parse.test.mjs`.

DNS it needs, in Squarespace Domains (DNS -> Custom records; the zone moved there from Google Domains, which is why the nameservers are ns-cloud-*.googledomains.com):

| Name | Type | Value |
|---|---|---|
| `reports.adlmstudio.net.` | MX | `10 inbound-smtp.eu-west-1.amazonaws.com.` |
| `_dmarc.adlmstudio.net.` | TXT | `v=DMARC1; p=reject; pct=100; rua=mailto:dmarcmanager@kudimail.net,mailto:dmarc@reports.adlmstudio.net; ruf=mailto:dmarcmanager@kudimail.net` |

Kudimail stays in both the DMARC record and the apex SPF record for now.
Nobody knows whether anything still sends through it, and with `p=reject`
removing it could get real mail refused. After two weeks of reports, if no
passing source is a Kudimail server, remove it from both.

A failing source is either someone forging the domain or a real service that
is not set up for SPF or DKIM. Look up an unfamiliar IP before assuming either.

## Google Postmaster Tools

`postmaster.google.com` shows how Gmail rates adlmstudio.net: spam complaint
rate, domain reputation, authentication. Gmail starts filtering bulk senders
above a 0.3% complaint rate. Verifying the domain there adds one
`google-site-verification=` TXT value at the apex. Add it as a SECOND value in
the existing TXT record set; never replace the SPF value that is already there.

## AWS account contacts

The account's operations, security and billing alternate contacts were empty
until 16 September 2026, so AWS's account notices went only to the root
address. They now point to the founder's inbox. Check with:

```
aws account get-alternate-contact --alternate-contact-type OPERATIONS
```
