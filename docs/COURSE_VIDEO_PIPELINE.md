# Course video pipeline — setup runbook

Moving lecture recordings off Google Classroom and onto the platform.

```
Google Drive ──ingest──> S3 archive ──MediaConvert──> S3 delivery ──CloudFront──> player
  (masters)              (masters,              (HLS ladder)      (signed cookies)
                       canonical names)
```

Two buckets, deliberately. The **archive** holds the masters and is never
served to anyone; the **delivery** bucket holds only HLS output and is readable
solely by CloudFront. Re-encoding, adding a rung or turning on DRM later reads
from the archive, so Google Drive is touched exactly once.

---

## 1. Google service account (for reading Drive)

This is **Google Cloud Console, not the AWS console** — searching "Drive" in AWS
only turns up EBS volumes and CloudFormation articles.

1. <https://console.cloud.google.com> → create or pick a project.
2. **APIs & Services → Library** → enable **Google Drive API**.
3. **IAM & Admin → Service Accounts → Create service account**. Any name.
   No roles needed — access is granted by sharing the folder, not by IAM.
4. Open it → **Keys → Add key → Create new key → JSON** → download.
5. Copy the service account email (`something@project.iam.gserviceaccount.com`).
6. In Drive, open **BIM Training / Class video → Share** and add that email as
   **Viewer**.
7. `GOOGLE_SERVICE_ACCOUNT_KEY=/secure/path/key.json` (or paste the JSON itself).

---

## 1a. "This file cannot be downloaded by the user"

Sharing the folder is enough for recordings that live in a personal Drive. It is
often **not** enough for a course that ran on Google Classroom, where each video
carries its own download restriction:

```
capabilities: { canEdit: true, canDownload: false }
GET ?alt=media  ->  403 "This file cannot be downloaded by the user"
```

Editable but not downloadable, which reads like a bug and is not one. Two
separate things have to be true, and only fixing both clears it:

1. **The ingest account has to be an Editor**, not a Viewer. The restriction is
   "*viewers and commenters* cannot download", so it is escaped by role.
2. **Each file's own setting has to allow editors to download.** On the file:
   **⋮ → Share → the gear icon → People who can download, copy, and print →
   tick Editors**. Students keep their protection: viewers and commenters stay
   blocked. Clearing the equivalent setting on the *folder* does not reach files
   that already carry their own copy of the flag — Drive reports it per file as
   `copyRequiresWriterPermission`.

Step 2 is per file. Multi-select a whole week folder before opening Share, or
expect to repeat it once per recording.

`--check` proves the whole path in seconds by pulling a real kilobyte of
content, which is the only evidence that means anything here — metadata reads
succeed the entire time the bytes are refused.

> If a genuine Workspace policy ever blocks download domain-wide rather than
> per file, `COURSE_GOOGLE_IMPERSONATE_USER=someone@yourdomain` makes the
> service account act as that user instead. It needs the service account's
> numeric client id authorised for domain-wide delegation (admin console →
> Security → API controls) against the `drive.readonly` scope. That was not the
> cause here, and it is worth ruling out the per-file setting first.

---

## 2. S3 buckets

Region: **eu-west-1** is a sensible default. `af-south-1` (Cape Town) is
physically closer but has to be opted into and prices differently — and since
CloudFront serves from edge locations including Lagos, the origin region
matters far less than the edge does.

| Bucket | Purpose | Public access |
| --- | --- | --- |
| `adlm-course-archive` | masters from Drive | Block all — nothing reads this but you |
| `adlm-course-delivery` | HLS output | Block all — CloudFront reads it via OAC |

Leave **Block Public Access ON for both**. Neither bucket ever needs a public
policy; CloudFront gets in through Origin Access Control.

On the delivery bucket set a **CORS rule**, because the player fetches segments
from `video.adlmstudio.net` while the page is on `adlmstudio.net`:

```json
[{
  "AllowedOrigins": ["https://adlmstudio.net", "https://www.adlmstudio.net"],
  "AllowedMethods": ["GET", "HEAD"],
  "AllowedHeaders": ["*"],
  "ExposeHeaders": ["Content-Length", "Content-Range"],
  "MaxAgeSeconds": 3000
}]
```

---

## 3. MediaConvert

**Endpoint.** MediaConvert gives each account its own:

```bash
aws mediaconvert describe-endpoints --region eu-west-1
```

Put the returned URL in `AWS_MEDIACONVERT_ENDPOINT`.

**Service role.** Create an IAM role that MediaConvert assumes — trusted entity
`mediaconvert.amazonaws.com`, with permission to read the archive bucket and
write the delivery bucket:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["s3:GetObject"],
      "Resource": "arn:aws:s3:::adlm-course-archive/*" },
    { "Effect": "Allow", "Action": ["s3:PutObject"],
      "Resource": "arn:aws:s3:::adlm-course-delivery/*" }
  ]
}
```

Copy its ARN into `AWS_MEDIACONVERT_ROLE_ARN`.

---

## 4. IAM user for the app

Programmatic access only. Attach:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:ListBucket",
        "s3:AbortMultipartUpload",
        "s3:ListBucketMultipartUploads",
        "s3:ListMultipartUploadParts"
      ],
      "Resource": [
        "arn:aws:s3:::adlm-course-archive",
        "arn:aws:s3:::adlm-course-archive/*"
      ] },
    { "Effect": "Allow",
      "Action": ["mediaconvert:CreateJob", "mediaconvert:GetJob",
                 "mediaconvert:DescribeEndpoints"],
      "Resource": "*" },
    { "Effect": "Allow", "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::<ACCOUNT_ID>:role/<MediaConvertRoleName>" }
  ]
}
```

**`iam:PassRole` is the one everybody forgets.** Without it `CreateJob` fails
with an access-denied that says nothing about roles.

---

## 5. CloudFront

**Signing keypair** — generate locally:

```bash
openssl genrsa -out cf_private_key.pem 2048
openssl rsa -pubout -in cf_private_key.pem -out cf_public_key.pem
```

In CloudFront: **Key management → Public keys** → paste `cf_public_key.pem` →
then **Key groups** → create one containing it. Note the **public key ID**;
that is `AWS_CLOUDFRONT_KEY_PAIR_ID`. The private key goes in
`AWS_CLOUDFRONT_PRIVATE_KEY` (path or PEM) and nowhere else.

**Distribution:**

- Origin: `adlm-course-delivery` with **Origin Access Control** (create one; use
  the button that updates the bucket policy for you). Not legacy OAI.
- Viewer protocol policy: **Redirect HTTP to HTTPS**.
- **Restrict viewer access: Yes → Trusted key groups →** the group above.
  This is what makes the signed cookies mandatory.
- Response headers policy: enable **CORS with credentials** —
  `Access-Control-Allow-Origin: https://adlmstudio.net` and
  `Access-Control-Allow-Credentials: true`. A wildcard origin will not work
  once credentials are involved.
- Alternate domain name: `video.adlmstudio.net`.
- Certificate: request it in **ACM in us-east-1**. CloudFront only reads certs
  from us-east-1 no matter where the buckets live.

**DNS:** `CNAME video.adlmstudio.net → dxxxxxxxx.cloudfront.net`.

> The subdomain is not cosmetic. Playback is authorised by signed **cookies**
> (an HLS stream is a manifest plus hundreds of segments — signing each URL
> is not practical), and a cookie set by the app can only be read by the CDN if
> both live under the same parent domain. A raw `*.cloudfront.net` hostname
> cannot receive them. Set `COOKIE_DOMAIN=.adlmstudio.net`.

---

## 6. Environment

```bash
AWS_REGION=eu-west-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_VIDEO_ARCHIVE_BUCKET=adlm-course-archive
AWS_VIDEO_DELIVERY_BUCKET=adlm-course-delivery
AWS_MEDIACONVERT_ENDPOINT=https://xxxxxxxx.mediaconvert.eu-west-1.amazonaws.com
AWS_MEDIACONVERT_ROLE_ARN=arn:aws:iam::<ACCOUNT_ID>:role/MediaConvert_Default_Role
AWS_CLOUDFRONT_DOMAIN=video.adlmstudio.net
AWS_CLOUDFRONT_KEY_PAIR_ID=K...
AWS_CLOUDFRONT_PRIVATE_KEY=/secure/path/cf_private_key.pem
COOKIE_DOMAIN=.adlmstudio.net

GOOGLE_SERVICE_ACCOUNT_KEY=/secure/path/key.json
COURSE_MAX_CONCURRENT_STREAMS=2

# Optional: pin a playback grant to the IP that requested it. Strongest
# anti-sharing setting available, but it logs students out when they move
# between wifi and mobile data. Off unless you decide the trade is worth it.
AWS_CLOUDFRONT_PIN_IP=false
```

---

## 7. Running it

Run these **one at a time** from the `server` directory. Do not chain them:
the ingest moves 30 GB and takes hours, and you want to read its output before
starting the transcode. (PowerShell also has no `&&` — chain with `;` if you
must, but here you shouldn't.)

```powershell
cd C:\Users\ADLM\source\repos\ADLMWebsite\server
```

```powershell
node scripts/ingest-drive-videos.mjs
```

Dry run — prints every file, its new archive name and the total. Then:

```powershell
node scripts/ingest-drive-videos.mjs --apply
```

Once that finishes, plan and submit the transcodes:

```powershell
node scripts/transcode-course-videos.mjs
```

```powershell
node scripts/transcode-course-videos.mjs --apply
```

MediaConvert is asynchronous, so poll until the jobs land. This is the step
that records the playable manifest against each module:

```powershell
node scripts/transcode-course-videos.mjs --status --watch
```

Both scripts resume. The ingest checks S3 before transferring, and the
transcoder skips modules that already have an `hlsKey`, so an interrupted run
never re-pays for work already done.

Then open a lecture as an enrolled student. `/playback/start` claims the seat,
sets the cookies and returns the manifest URL; the player picks it up
automatically in place of the old embed.

---

## 7a. A second course

Nothing above is specific to the building-works cohort — the AWS side is shared,
and playback resolves per module. What each course needs of its own is a
**manifest**: which Drive file becomes which module.

One file per course, named after the sku, next to the original:

| Course | Manifest |
| --- | --- |
| `bim-bld-arch` | `scripts/drive-video-manifest.json` (unsuffixed, historical) |
| anything else | `scripts/drive-video-manifest.<SKU>.json` |

Share the course's Drive folder with the service account, then let the script
write the first draft rather than transcribing 18 file IDs by hand:

```powershell
node scripts/ingest-drive-videos.mjs --list <driveFolderId> --sku BIM-MEP-25
```

It walks the folder and its subfolders, drops "Copy of …" duplicates,
byte-identical twins and low-bitrate encodes, then matches what is left to the
course's modules — first by the week in the filename or its parent folder, then
by position within that week.

**The matching is a proposal.** Last cohort had a `Week 1 Day 1 Class 2.mp4`
that was actually day 2, and weeks 4–6 carried no week in the filename at all.
The draft flags anything whose parsed part number disagrees with its assigned
module (`note`), any module left without a file (`needsDecision`), and any file
left without a module (`unmatched`). Watch the first minute of anything flagged
and fix the `items` array before ingesting; clear `needsDecision` and
`unmatched` when you have.

Then the same two steps as above, told which course they are for:

```powershell
node scripts/ingest-drive-videos.mjs --sku BIM-MEP-25
```

```powershell
node scripts/ingest-drive-videos.mjs --sku BIM-MEP-25 --apply
```

```powershell
node scripts/transcode-course-videos.mjs --sku BIM-MEP-25 --cohort 2026
```

```powershell
node scripts/transcode-course-videos.mjs --sku BIM-MEP-25 --cohort 2026 --apply
```

```powershell
node scripts/transcode-course-videos.mjs --sku BIM-MEP-25 --cohort 2026 --status --watch
```

`--cohort` has to be the same on the plan, the apply and the status poll: it is
part of the S3 output prefix, and `--status` derives the manifest key from it
when a job completes. Omitted, it is `2025`.

`--verify` takes `--sku` too and audits just that course. `--abort-stale` is
bucket-wide by nature — abandoned uploads are not attributable to a course.

---

## 8. Costs

The one-time encode is roughly 30 hours of footage across four rungs, and
storage is about 30 GB of masters plus the HLS output — both modest against the
$25,000 of AWS Activate credit sitting unused until July 2028.

The recurring cost is **CloudFront egress**, which scales with how much your
students watch and is the most expensive part of this stack per gigabyte in
Africa. Worth setting a **budget alert** before the first cohort streams, so
consumption is visible while credits are absorbing it rather than after they
run out.

---

## 9. Known gotchas

| Symptom | Cause |
| --- | --- |
| `CreateJob` access denied | Missing `iam:PassRole` on the app user |
| 403 on every segment, manifest loads | Cookies not reaching the CDN — check `COOKIE_DOMAIN` and that CloudFront is on a subdomain of the site |
| 403 on everything including the manifest | Key group not attached to the behaviour, or the private key does not match the uploaded public key |
| CORS error in console | Response headers policy missing `Allow-Credentials`, or using a wildcard origin |
| Certificate not selectable | ACM cert issued outside us-east-1 |
| Manifest 404 after a COMPLETE job | Destination naming — the master lands at `<prefix>index.m3u8`; check the delivery bucket prefix matches |

---

## 10. Running the ingest from EC2 (when your uplink is the bottleneck)

Drive → your laptop → S3 is limited by your upload bandwidth. From an EC2
instance in the same region as the bucket it is cloud-to-cloud: inbound from
Google is free, EC2 → S3 in-region is free, and a `t3.small` costs about two
cents an hour. A transfer measured in hours locally usually finishes in well
under one.

Nothing is written to disk — the script streams — so the default 8 GB root
volume is plenty regardless of how large the lectures are.

### 1. IAM role for the instance

**IAM → Roles → Create role → AWS service → EC2**, attach the same
`adlm-course-archive-rw` policy the app user has, name it
`adlm-course-ingest-ec2`.

Using a role means no long-lived AWS key is ever copied onto the box. The
script omits explicit credentials when `COURSE_AWS_USE_INSTANCE_ROLE=true` and
lets the SDK read them from instance metadata.

### 2. Launch the instance

- AMI: **Amazon Linux 2023**
- Type: **t3.small** (t3.medium if you want more headroom)
- Region: **us-east-1** — must match the bucket, or you lose the free in-region transfer
- IAM instance profile: `adlm-course-ingest-ec2`
- Security group: **no inbound rules needed** — connect with **EC2 Instance
  Connect** from the console rather than opening port 22

### 3. Allow the instance to reach MongoDB

The script reads and writes the course record, so Atlas must accept the
instance's IP. Copy the instance's public IPv4, then in Atlas: **Network Access
→ Add IP Address**. Remove it again when you are done.

Skipping this produces a Mongo connection timeout that looks nothing like a
network-access problem.

### 4. Set it up on the box

```bash
sudo dnf install -y git
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
. ~/.nvm/nvm.sh && nvm install 22
```

Node 20+ is required — the script uses `fetch` with a streaming body and
`Readable.fromWeb`.

```bash
git clone https://github.com/adedola12/AdlmWeb.git
cd AdlmWeb/server && npm install
```

The repo is private, so the clone needs a GitHub token as the password (a
fine-grained PAT with read access to this repo is enough).

### 5. Credentials, without copying secret files

Base64 the service-account key **on your laptop**:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\key.json")) | Set-Clipboard
```

Then on the instance, write `server/.env`:

```bash
cat > .env <<'ENV'
MONGO_URI=<same value as your local .env>
AUTH_DB=adlmWeb
COURSE_AWS_REGION=us-east-1
COURSE_AWS_USE_INSTANCE_ROLE=true
AWS_VIDEO_ARCHIVE_BUCKET=adlm-course-archive
GOOGLE_SERVICE_ACCOUNT_KEY=<paste the base64 string>
ENV
```

No AWS key, and the Google credential never exists as a file.

### 6. Run it

```bash
node scripts/ingest-drive-videos.mjs --check
```

Both ticks green, then:

```bash
node scripts/ingest-drive-videos.mjs --apply
```

Use `screen` or `tmux` if you want to disconnect while it runs. Files already
archived are skipped, so anything your laptop finished stays finished.

### 7. Afterwards

- **Terminate the instance** — it has no further purpose and bills by the hour
- Remove the instance IP from the Atlas allowlist
- Set the Drive service account back to **Viewer**
