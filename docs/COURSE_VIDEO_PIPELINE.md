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
      "Action": ["s3:PutObject", "s3:GetObject", "s3:ListBucket"],
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
