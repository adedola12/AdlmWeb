# Release gate: nothing reaches customers without the approver's sign-off

Standing rule from 21 Sep 2026: **every update is signed off by the release
approver before users get it.** The first approver is Richard Enoch
(enochrichard6@gmail.com, GitHub `RichardEnoch`).

## What is gated, and where

| What ships | How it is gated | Who can pass it |
|---|---|---|
| Website (www.adlmstudio.net, Vercel builds `main`) | Branch protection on `main`: pull request required, code-owner review (`.github/CODEOWNERS` = the approver), **admins included** | The approver approves the PR |
| API (api.adlmstudio.net, `deploy-api.yml`) | Same `main` protection, plus the `production` environment requires the approver's approval; admins cannot bypass; nobody can approve their own run | The approver clicks Approve on the run |
| Plugins (HERON, QUIV, RateGen, MEP, Planswift, Civil 3D...) | `PUT /admin/deployments/:key` that changes what customers download is **staged**, not applied (`server/util/releaseGate.js`) | The approver on `/admin/releases` |

Switching a product **off** is never gated: that is the safety action.

## Previews for the approver

- **Website:** `preview.adlmstudio.net` serves the `release` branch. It shows
  only sign-in screens until someone signs in with a staff role or as the
  approver (`client/src/components/PreviewHostGate.jsx`). Open a PR
  `release` → `main` and the approver reviews the live preview before approving.
- **Plugins:** while a plugin release is pending, the approver's own Installer
  Hub is offered the pending build (`GET /me/deployments` overlays it for the
  approver only), so they install and test exactly the bytes they approve.

## The emergency override (visible, not secret)

There is **no hidden bypass**, and none should ever be added. A secret way
round the gate would defeat the reason it exists. The owner holds admin
rights on GitHub, AWS and Vercel and can always switch a rule off, so the
design makes every bypass **visible and permanent** instead:

- **Plugins:** a super-admin can press *Emergency release* on `/admin/releases`
  with a written reason. It is refused unless the locked audit record is
  written first; the approver is emailed at once; it stays flagged until the
  approver upholds or objects (24h review window).
- **Website/API:** the only way round is to loosen branch protection or the
  environment rule on GitHub. `.github/workflows/release-watch.yml` fires on
  any branch-protection change and emails the approver instantly. The
  `AdlmReleaseGate` watcher Lambda checks hourly, from AWS and GitHub's public
  API, that `main` is protected, was not force-pushed, and that every commit on
  it came through a PR the approver approved. Disabling Actions does not stop it.

## The locked audit trail

Stack `AdlmReleaseGate` (eu-west-1) owns an S3 bucket with **Object Lock in
COMPLIANCE mode, 3-year retention**. Records land under `web/` (API),
`github/` (workflow) and `watcher/` (Lambda). In compliance mode no one, not
the owner and not the AWS account root, can delete or alter a record before
its retention ends. The same events are also in Mongo `AuditLog`
(`action` starts with `release-gate.`).

## Changing the approver: only by script

There is no web route for it on purpose.

```
cd server
node scripts/release-gate.mjs status
node scripts/release-gate.mjs set-approver --email <e> --name "<n>" --github <login>            # dry run
node scripts/release-gate.mjs set-approver --email <e> --name "<n>" --github <login> --confirm
```

The approver must have an ADLM account, must not be a super-admin, and must
not be the owner. Their role becomes `release_approver`, which opens the
Release sign-off page and the preview and nothing else.

## Offboarding (e.g. "Richard has left ADLM")

```
node scripts/release-gate.mjs offboard --reason "Left ADLM on <date>"                 # dry run first
node scripts/release-gate.mjs offboard --reason "Left ADLM on <date>" --confirm
# with a successor in one go:
node scripts/release-gate.mjs offboard --reason "..." --successor-email x@y \
     --successor-name "Name" --successor-github login --confirm
```

It demotes the leaver's website role to `user` and signs out their sessions,
clears the approver, removes them from the GitHub repo and the `production`
environment reviewers, updates the watcher's SSM parameters, and emails them
**"You are no longer an ADLM Studio team member"** through SES (SES only; if SES
refuses, it says so and sends nothing else). Every step is recorded.

With no successor, releases stay **blocked**: the gate never opens because
nobody is approving. The visible emergency path still works for real outages.

## Customer release email

Approving a plugin release (or forcing it with *Emergency release*) makes it
live and records the customers' "new version is ready" notice
(`server/util/releaseGateFlow.js` `applyCandidate`). Nothing is emailed to
customers at that moment: the notice waits for the **weekly release digest**
(`server/util/releaseDigest.js`, Monday 09:00 Lagos time by default), which
sends each customer one email listing every update for the software they
hold. The approve and emergency responses carry `releaseNotice.nextDigestLagos`
with that date, as the deployment PUT does. The emergency send-now for the
digest (`POST /admin/release-notifications/digest/send-now`) is admin-only and
separate from this gate.

## Mail

All gate mail goes through SES (eu-west-1) and nothing else. The account has
production access (checked 21 Sep 2026: 50,000/day), so approvers need no
per-address verification. If that ever changes, a refused send is logged and
the action still completes; nothing is rerouted to another provider.
