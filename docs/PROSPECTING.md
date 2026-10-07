# Outbound prospecting

Finds Nigerian firms that match ADLM's ideal customer profiles, researches
them, finds the right person, and drafts a short personal email plus two
follow-ups for a person to approve. **Phase 1 sends nothing.** Approved drafts
wait for the phase 2 sender.

Work board item: `outbound-prospecting` (Richard Enoch approves).

## How it works

```
07:00 Lagos, daily  (EventBridge Scheduler, stack AdlmProspecting)
   │
   ▼
server/prospectingJob.js ── PROSPECTING_ENABLED != "true"?  stop, spend nothing
   │
   ├─ finder   for each active profile, its fair share of today's cap (20):
   │           Claude (Anthropic API, web search) finds firms   research.js
   │           → keep only firms whose sources a search returned
   │           → dedupe by domain, refuse suppressed, cap by Lagos day
   │           → Hunter.io finds people at each firm             hunter.js
   │           → keep personal addresses, title match, ≥70% confidence
   │
   └─ writer   for each new firm with a contact, if its product brief is ready:
               Claude (Bedrock) writes day 0, 3 and 7 emails      writer.js
               → rules checked in code, one rewrite, else nothing saved
               → sign-off and opt-out line appended by code
               → saved as pending_review
   │
   ▼
/admin/prospecting   a reviewer approves, edits then approves, rejects, or
                     marks a bad fit. Nothing is sent.
```

| Piece | File |
|---|---|
| Models | `server/models/IdealCustomerProfile.js`, `Prospect.js`, `ProspectContact.js`, `OutreachDraft.js`, `Suppression.js` |
| Dedupe, suppression, daily cap | `server/util/prospecting/normalise.js`, `guards.js`, `store.js` |
| Finder | `server/util/prospecting/research.js`, `hunter.js`, `finder.js` |
| Writer | `server/util/prospecting/writer.js`, `drafter.js`, `server/config/products.md` |
| Review API | `server/util/prospecting/review.js`, `server/routes/admin.prospecting.js` |
| Dashboard | `client/src/ds/DsAdminProspecting.jsx` |
| Daily job | `server/prospectingJob.js` |
| Infrastructure | `infra/lib/adlm-prospecting-stack.ts` |
| Phase 2 and 3 seams | `server/util/prospecting/sender.js`, `replyHandler.js` |

## Setup

### 1. Install and test locally

```powershell
Set-Location C:\Users\ADLM\source\repos\ADLMWebsite\server
npm ci
npm test
```

The prospecting tests run on in-memory models and recorded sample responses.
They need no key and never touch Atlas.

### 2. Try it with no keys and no spend

```powershell
Set-Location C:\Users\ADLM\source\repos\ADLMWebsite\server
node scripts/prospect-finder.mjs --sample
```

This runs the whole finder on invented `.example` firms with an in-memory
store. Nothing is written. `--sample --apply` is refused on purpose.

To see the email writer's tone on those sample firms (real Bedrock calls,
about a cent each, nothing saved):

```powershell
node scripts/draft-writer.mjs --preview
```

### 3. Write the product briefs

Edit `server/config/products.md`. Each product section starts as
`Status: draft`, copied from the website catalogue. Fill in the `TODO:` lines
(a real result, what you would show in the call, what to never say), then
change the line to `Status: ready`. **The daily run only drafts emails for
products marked ready.** The briefs are bundled with the Lambda, so an edit
goes live with the next `cdk deploy AdlmProspecting`.

### 4. Seed the three starting profiles

Local dev shares the production Atlas cluster, so `--apply` writes to
production. Dry run first:

```powershell
Set-Location C:\Users\ADLM\source\repos\ADLMWebsite\server
node scripts/seed-prospecting-profiles.mjs
node scripts/seed-prospecting-profiles.mjs --apply
```

The seed only adds missing profiles. It never overwrites one edited in the
admin.

### 5. Give people access

In **Admin → Roles**:

- **Reviewer:** give a role the `Prospecting review` area. It can use the
  queue, the prospect table, the stats, and record replies and bookings.
- **Admin:** `Prospecting admin` cannot be granted. Super-admins hold it. It
  covers editing profiles, the suppression list and delete-on-request.

## Environment variables

Locally these go in `server/.env` (see `server/.env.example`). In production
they are SSM parameters under `/adlm/cloud/prod/`, loaded at cold start. The
Lambda never has a secret in its own configuration.

| Name | Where | Required | What it does |
|---|---|---|---|
| `PROSPECTING_ENABLED` | SSM String | yes | The switch. The daily run does nothing unless this is `true`. |
| `ANTHROPIC_API_KEY` | SSM SecureString | yes | Web search for the finder. Must be **funded**. An empty balance fails every profile and fires the alarm. |
| `HUNTER_API_KEY` | SSM SecureString | yes | Hunter.io domain search. Sent in a header, never in a URL. |
| `MONGO_URI` | SSM SecureString | yes | Already there for the API. |
| `PROSPECT_DAILY_CAP` | SSM String | no | New firms per Lagos day, shared by all profiles. Default 20. `0` pauses finding. A bad value falls back to 20, never to unlimited. |
| `PROSPECT_MIN_CONFIDENCE` | SSM String | no | Hunter confidence floor, 0 to 100. Default 70. |
| `PROSPECT_RESEARCH_MODEL` | SSM String | no | Default `claude-opus-5`. |
| `PROSPECT_MAX_SEARCHES` | SSM String | no | Web searches per profile per day, 1 to 20. Default 8. |
| `PROSPECT_RESEARCH_TIMEOUT_MS` | SSM String | no | Per API call. Default 240000. |
| `AGENT_PROVIDER` | stack | set by CDK | The writer's provider (`bedrock`). Set on the function, not in SSM, because SSM still holds a stale value. |
| `PROSPECT_BRIEFS_PATH` | stack | set by CDK | Where the bundled `products.md` is. |
| `OUTREACH_SENDER` | none | no | Phase 2. Anything but unset or `disabled` is refused today. |

Setting a SecureString. Use the AWS console (Systems Manager → Parameter
Store) for secret values, so the key never lands in your shell history. For
the plain settings:

```powershell
aws ssm put-parameter --region eu-west-1 --name /adlm/cloud/prod/PROSPECT_DAILY_CAP --type String --value 20 --overwrite
```

## Deploy

The stack is `AdlmProspecting`, separate from `AdlmApi`. It references
nothing in `AdlmApi`, so deploying either can never remove the other.
**Deploying does not switch it on.**

The review API and dashboard are part of the website: they ship with the
normal release (the API through `cdk deploy AdlmApi`, the client through
Vercel), after the pull request is approved.

```powershell
Set-Location C:\Users\ADLM\source\repos\ADLMWebsite\infra
npm ci
npx cdk synth AdlmProspecting --strict
npx cdk diff AdlmProspecting
```

Read the diff. The first deploy should show only additions. Then:

```powershell
npx cdk deploy AdlmProspecting
```

After the first deploy:

1. **Confirm the alarm email.** AWS emails `admin@adlmstudio.net` a
   subscription link. Until it is clicked, the alarms fire into nothing.
2. **Run it once by hand, switched off.** It should answer `disabled`:

   ```powershell
   $fn = aws cloudformation describe-stacks --region eu-west-1 --stack-name AdlmProspecting --query "Stacks[0].Outputs[?OutputKey=='ProspectingFunctionName'].OutputValue" --output text
   aws lambda invoke --region eu-west-1 --function-name $fn --cli-binary-format raw-in-base64-out --payload '{\"job\":\"prospecting-daily\"}' out.json
   Get-Content out.json
   ```

3. **Switch it on** when the keys are in, the briefs are ready and the
   profiles are seeded:

   ```powershell
   aws ssm put-parameter --region eu-west-1 --name /adlm/cloud/prod/PROSPECTING_ENABLED --type String --value true --overwrite
   ```

   The next 07:00 run picks it up. To run straight away, invoke it as in step
   2. It takes a few minutes. The log group is the stack's
   `ProspectingLogGroup` output.

4. **Switch it off** at any time, with no deploy:

   ```powershell
   aws ssm put-parameter --region eu-west-1 --name /adlm/cloud/prod/PROSPECTING_ENABLED --type String --value false --overwrite
   ```

A new container reads SSM at cold start. A warm container keeps its value
until it is recycled, usually within minutes of idle time; for an immediate
stop, also set the cap to `0` the same way.

## What it costs

- **Research:** Claude Opus 5 with web search, one call per profile per day.
  Tokens at $5/$25 per million plus $10 per 1,000 searches. Expect roughly
  $0.30 per profile per day. Billed to the Anthropic account and shown on the
  AI Usage screen as "Prospect research".
- **Drafts:** Claude Haiku 4.5 on Bedrock, about a cent per prospect including
  rewrites. AWS credit. Shown as "Prospect email drafts".
- **Hunter.io:** one domain search per new firm, on your Hunter plan.
- **AWS:** one Lambda run a day, a schedule, a queue and two alarms. Close to
  zero.

## Compliance (Nigeria Data Protection Act 2023)

- **Source of every contact.** A firm cannot be saved without at least one
  source URL, and only URLs its own searches returned are kept. Each person
  keeps the public pages Hunter found them on.
- **Data minimisation.** Only people whose title matches the profile are
  stored. If nobody matches, only the single most likely person is kept.
- **Opt-outs are permanent.** The suppression list stores a SHA-256 of the
  address, never the address, and has no delete. A suppressed person or
  domain is refused at every step: finding, drafting, approving and (phase 2)
  sending.
- **Delete on request.** Admin only, from the prospect drawer. It needs a note
  of where the request came from, then suppresses and erases the firm, its
  people and its drafts. It is written to the audit log.
- **Demo and Design Access roles** never see real prospect data. The router
  sits behind the same masking as every admin screen.

## Phase 2 and 3 (designed, not built)

Each needs its own approval on the work board.

**Phase 2, sending** (`server/util/prospecting/sender.js`):

- Gmail API from a separate outreach domain on Google Workspace. Never SES and
  never adlmstudio.net. This is the one exception to the SES-only mail rule.
- At most 20 sends per inbox per day, at random times inside working hours,
  Africa/Lagos.
- Follow-ups on day 3 and day 7 in the same thread. Any reply cancels them.
- Suppression is checked again at the moment of sending.
- Before phase 2: buy the domain, set up Workspace inboxes with SPF, DKIM and
  DMARC, and warm the inboxes for 2 to 4 weeks.

**Phase 3, replies** (`server/util/prospecting/replyHandler.js`):

- Claude classifies each reply as interested, not now, wrong person or
  opt-out. Any reply stops the follow-ups before classification runs.
- Opt-outs go to the permanent suppression list.
- Interested replies get a booking link or proposed slots from Google
  Calendar, only after an admin approves.
