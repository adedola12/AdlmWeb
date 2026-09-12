# Organisation videos — what the course pipeline needs added

Organisation videos ride the course pipeline: master in `adlm-course-archive`,
HLS ladder in `adlm-course-delivery`, playback through CloudFront. Three things
the pipeline never needed before, and which the `adlm-course-pipeline` IAM
user, the archive bucket and the distribution therefore do not have:

1. **The browser uploads the master itself** (the API runs on Lambda, which
   caps a request body at 10MB), so the archive bucket needs a CORS rule
   allowing `PUT` from the site.
2. **A deleted video removes its files**, so the pipeline user needs
   `DeleteObject` on the archive and `ListBucket` + `DeleteObject` on the
   delivery bucket. Without them a delete reports success while the master
   and the ladder stay behind, billed.
3. **hls.js fetches the stream cross-origin with credentials**, so CloudFront
   must return `Access-Control-Allow-Origin` and
   `Access-Control-Allow-Credentials`. It returns neither today, so every
   Chrome and Edge viewer gets "Failed to fetch" and a black player. iOS
   Safari is unaffected: assigning the playlist to `video.src` is not an XHR,
   which is why this went unnoticed. **This one affects the paid courses too,
   not just organisation videos** — they share the distribution and the player.

Run them once from a shell with admin AWS credentials, from the repository
root (not from `infra/`, or the `file://` paths resolve one level too deep).

## 1. CORS on the archive bucket

```bash
aws s3api put-bucket-cors --bucket adlm-course-archive --cors-configuration file://infra/policies/archive-cors.json
```

## 2. The pipeline user's policy

The attached policy is `adlm-course-archive-rw` (one statement for the archive,
one for MediaConvert, one PassRole). Add the statements in
`pipeline-policy-additions.json` to it — either edit the policy in the console
and paste the two statements into its `Statement` array, or attach them as an
inline policy:

```bash
aws iam put-user-policy --user-name adlm-course-pipeline --policy-name adlm-org-videos-delete --policy-document file://infra/policies/pipeline-policy-additions.json
```

## 3. CORS on the CloudFront distribution

Without this, nothing plays on Chrome or Edge. `fix-video-cors.mjs` creates a
response headers policy that adds the two CORS headers on every response and
attaches it to the distribution. It explains in its own header why a response
headers policy is the right shape here rather than bucket CORS, and it is safe
to run twice.

```bash
node infra/policies/fix-video-cors.mjs
```

```bash
node infra/policies/fix-video-cors.mjs --apply
```

The first is a dry run and prints exactly what the second will change. Allow a
few minutes for CloudFront to propagate before testing.

Nothing else changes: MediaConvert, CloudFront signing and the archive's
existing read/write stay as they are.
