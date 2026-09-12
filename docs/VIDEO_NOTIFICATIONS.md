# New-video announcements

When the channel publishes a video, everybody with a confirmed email address
who has not turned video updates off gets a message about it.

Two ways it happens:

- **The poller.** Every fifteen minutes it reads the channel's uploads playlist
  and compares it against the `videos` collection. Anything not in the
  collection is new.
- **The button.** `Admin → Videos` takes a URL off the clipboard and announces
  it immediately, for a launch that cannot wait fifteen minutes.

Both go through the same code path, and a video is announced **once**.

---

## SES, not Resend — see docs/SES_MIGRATION.md

This originally shipped on Resend, and the reasoning is worth keeping: adding a
second provider would have meant a second reputation to warm, a second set of
bounce handling, and two answers to "did this customer get it".

That decision was reversed in September 2026, once it turned out Resend was
itself delivering through SES in eu-west-1 — so going direct removes a reseller
rather than adding a provider. **`docs/SES_MIGRATION.md` is the plan**: what the
code does now, the DNS records that have to be published by hand, the
production-access request, and the cutover.

Nothing in the video feature knows what carries the message, so none of this
changed the announcement logic. What did change is the pacing: batches now send
in parallel up to the rate SES actually grants, instead of one message at a
time. Set `MAIL_TRANSPORT=ses` to turn it on; unset, everything behaves exactly
as it did.

---

## Setting it up

### 1. YouTube Data API key

1. <https://console.cloud.google.com> → **APIs & Services → Library**
2. Find **YouTube Data API v3** → **Enable**
3. **Credentials → Create credentials → API key**
4. Restrict the key: **API restrictions → YouTube Data API v3**. An
   unrestricted key that leaks is a key somebody else can spend your quota on.
5. Set it as `YOUTUBE_API_KEY`.

Quota: the default is 10,000 units a day. Each poll costs 2 units
(`playlistItems` plus a cached `channels` lookup), so 96 polls a day is under
200. There is a lot of headroom.

### 2. Channel id

`YOUTUBE_CHANNEL_ID` must be the `UC…` id, **not** the `@handle`. Signed in as
the channel, it is on <https://www.youtube.com/account_advanced>.

Getting this wrong fails loudly on the first run — the poller reports that no
channel was found rather than quietly returning nothing.

### 3. Sender

`EMAIL_FROM` should be `ADLM Studio <admin@adlmstudio.net>`. The domain has to
be verified in Resend (**Domains → Add domain**, then the DKIM and SPF records
on `adlmstudio.net`) or Resend refuses the send and `mailer.js` falls back to
the `onboarding@resend.dev` sender, which is fine for testing and wrong in
front of customers.

### 4. Everything else

The remaining variables have working defaults. See the block in
`server/.env.example` — batch size, pause, retries, poll interval and the two
safety flags below.

---

## The two things that stop a mistake being expensive

### The first run mails nobody

On an empty `videos` collection, *every* video on the channel is new.
Announcing a back catalogue to the whole customer base is the worst thing this
feature could do, so the first run **files what it finds and mails nobody**. The
first video anyone hears about is the next one published.

If you genuinely want the back catalogue announced, set
`VIDEO_ANNOUNCE_ON_FIRST_RUN=true`. Think about it first.

### DRY_RUN

`DRY_RUN=true` resolves the real audience, renders the real templates, runs the
real batch loop — and logs the recipients instead of mailing them. It swaps the
transport, not the code path, so a dry run proves the send rather than proving
that the dry-run branch works.

It writes **nothing** to the `videos` collection, so a dry run cannot leave a
video marked as announced and then have the real run skip it.

The admin Videos screen shows a banner while it is on, because a `DRY_RUN`
nobody knows about looks exactly like a send that silently reached nobody.

---

## How a double send is prevented

The video is **claimed** before a single message goes out — one atomic
`findOneAndUpdate` that only matches while `notifiedAt` is still null. Whoever
wins that write owns the send. A second poller, a retried Lambda invocation and
an admin pressing the button at the same moment all get `null` back and do
nothing.

The cost is that a run which dies mid-send leaves some people unmailed and the
video marked done. That is the right way round: some people missing one
announcement is a disappointment, everybody getting it twice is a complaint.
The addresses that failed are stored, and **Resend to failed** on the admin
screen closes the gap deliberately.

---

## Who gets it

| | |
|---|---|
| Included | Account not disabled, has an address, `emailVerified` is true, `emailPrefs.videoUpdates` is not `false` |
| Skipped, and counted | Opted out, or address unconfirmed |
| Excluded, not counted | Disabled accounts — a closed account is not somebody who opted out |

The opt-out check is `!== false`, not `=== true`. Every account created before
this field existed has no value at all, and `=== true` would have dropped the
entire existing customer base off the list without a word.

The skipped counts are shown on the admin screen next to the sent count,
because a video that reached 760 of 820 accounts is a fact about consent, not a
fault.

---

## Turning it off, per person

Two ways in, one place stored (`emailPrefs.videoUpdates`):

- **The unsubscribe link** in every announcement, at
  `GET /api/email/unsubscribe/:token`. The token is an HMAC with the topic
  inside the signed material, so a link out of a video announcement cannot be
  edited into a general unsubscribe.
- **The switch** on `Account settings → Notifications`.

The `GET` renders a page with a button; the `POST` behind it does the work.
This is deliberate and matches the existing marketing unsubscribe: mail clients
and corporate link scanners *fetch* the links in a message to check them, and a
`GET` that mutates means Outlook quietly opting people out of a list they never
asked to leave.

Turning video updates off stops video mail **only**. Receipts, licence
activations, renewal warnings, password resets and support replies ignore the
switch entirely.

---

## Where it runs

| | |
|---|---|
| Long-running server | node-cron in `server/index.js`, `VIDEO_CRON`, default `*/15 * * * *` |
| Lambda | `VideoPollSchedule` → `VideoPollFn` → `scheduled.js` with `{"job":"video-poll"}` |

`VideoPollFn` is a **separate** Lambda from `ScheduledFn`, pointing at the same
entry point. `ScheduledFn` is reserved-concurrency 1 so two runs of a job that
charges cards can never overlap; a fifteen-minutely poll whose send takes
minutes would eventually still be running at 08:00 and throttle the auto-renewal
into its dead-letter queue. One copy of the code, two concurrency budgets.

Its schedule retries where auto-renew's does not, and that is safe for the
reason auto-renew's is not: the claim above means a replayed invocation finds
the video already taken and sends nothing.

The `VideoPollErrorsAlarm` threshold is 2 in an hour, not 1. The poller fires 96
times a day against a third-party API, and alarming on a single blip trains
everybody to ignore the alarm. Two in an hour is an expired key or a spent
quota — which matter because a poller that cannot reach YouTube looks exactly
like a channel that has published nothing.

---

## Running it by hand

```bash
aws lambda invoke --function-name <VideoPollFn> \
  --payload '{"job":"video-poll"}' --cli-binary-format raw-in-base64-out /dev/stdout
```

---

## Files

| Path | What it is |
|---|---|
| `server/models/Video.js` | The collection, and `notifiedAt` |
| `server/util/youtubeFeed.js` | Fetch and shape; no database, no email |
| `server/util/videoEmail.js` | What the message says, HTML and plain text |
| `server/util/videoNotifier.js` | Claim, filter, batch, retry, and the poll |
| `server/routes/admin.videos.js` | The Videos screen's API |
| `server/routes/unsubscribe.js` | `videoUnsubscribeRouter` |
| `client/src/ds/DsAdminVideos.jsx` | The Videos screen |

## Testing it

**Unit tests** run with everything else — no database, no network:

```bash
cd server && npm test
```

**A dry run** resolves the real audience, renders the real template and runs the
real batch loop with only the transport swapped. `DRY_RUN` is forced on inside
the script, so this file cannot be turned into a real send:

```bash
cd server && node scripts/video-dry-run.mjs
```

**Integration tests** cover the part a unit test cannot reach — the atomic
claim that makes a double send impossible, the stats writes, and the resend
path. They need a database, so they skip unless asked for, and they refuse to
run against `adlmWeb`:

```bash
cd server
node scripts/video-integration-test.mjs
```

(The runner sets the variables itself. The bash-style `AUTH_DB=… VIDEO_IT=1 node …`
prefix that used to be documented here is a parse error in PowerShell 5.1, which
is what this machine runs — so the documented command simply did not work.)

The one that matters most is the race: two callers announce the same video
concurrently and exactly one of them sends. Asserted sequentially, a
check-then-write would pass; run concurrently, it does not.

---

## About Lexend

The template loads Lexend by `<link>` and by `@import`, and Apple Mail,
Thunderbird and most mobile clients honour one or the other. **Gmail and every
version of Outlook will not** — Gmail strips the head, Outlook renders with
Word's engine. Every rule names Lexend first and then a real fallback stack, and
the layout is built to look right in the fallback.

This is not a bug waiting to be fixed. There is no way to load a webfont Gmail
will use.
