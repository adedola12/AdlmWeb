# Organisation videos — what the course pipeline needs added

Organisation videos ride the course pipeline: master in `adlm-course-archive`,
HLS ladder in `adlm-course-delivery`, playback through CloudFront. Two things
the pipeline never needed before, and which the `adlm-course-pipeline` IAM
user and the archive bucket therefore do not have:

1. **The browser uploads the master itself** (the API runs on Lambda, which
   caps a request body at 10MB), so the archive bucket needs a CORS rule
   allowing `PUT` from the site.
2. **A deleted video removes its files**, so the pipeline user needs
   `DeleteObject` on the archive and `ListBucket` + `DeleteObject` on the
   delivery bucket. Without them a delete reports success while the master
   and the ladder stay behind, billed.

Both are one command each. Run them once from a shell with admin AWS
credentials.

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

Nothing else changes: MediaConvert, CloudFront signing and the archive's
existing read/write stay as they are.
