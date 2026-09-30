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

## Putting the gate on a repository

```
cd server
node scripts/release-gate.mjs protect                                   # dry run, every repo
node scripts/release-gate.mjs protect --confirm
node scripts/release-gate.mjs protect --repo owner/name --branch main --confirm
```

It invites the approver, writes `.github/CODEOWNERS` and turns on branch
protection with admins included, for every repository in `GATED_REPOS`
(`server/scripts/release-gate.mjs`). Private repositories need **GitHub Pro**;
on a free account GitHub answers 403 and the repo is reported as skipped, so
the command is safe to run before upgrading. Offboarding removes the leaver
from every repo in that list.

## How a release reaches customers (from 29 Sep 2026)

The approver is a designer and never opens GitHub. Nobody reviews pull
requests into `main` any more; a **batch** is tested and approved instead.

1. Finished work lands on `release`, which `preview.adlmstudio.net` serves.
2. Someone prepares the batch: `POST /admin/releases/batch` with a title, the
   test sheet link, the flows, and `headSha` = the exact commit on `release`.
3. The approver opens **Release sign-off**, tests each flow on preview and in
   his own Installer Hub, marks them, and presses **Approve**.
4. That approval is recorded against that commit (Mongo + the locked bucket)
   and emailed.
5. GitHub enforces it: `.github/workflows/batch-check.yml` is a **required
   check** on every pull request into `main`. It asks
   `GET /release-gate/batch-status?sha=<commit>` and fails unless that exact
   commit is approved. The merge itself is a button someone presses once the
   check is green.

The approval is pinned to the commit, so a push to `release` after he tested
invalidates it and the batch has to be tested again. A database problem, an
unreachable API or an unknown commit all answer **not approved**: the check
fails closed.

**Only user-facing UI needs the batch** (owner's rule, 29 Sep 2026). The
check first lists the pull request's changed files. If none is under
`client/` and none is a gate file, it is a code fix (server, infra, scripts,
tests) and the check passes without asking the release desk, so it ships as
soon as the other checks pass. The gate files always need the batch:

- `.github/` (every workflow, this check included)
- `docs/RELEASE_GATE.md`, `infra/lib/adlm-release-gate-stack.ts`
- `server/models/Release{Batch,Candidate,GateConfig}.js`
- `server/routes/{admin.batch,admin.releases,releaseGatePublic}.js`
- `server/scripts/release-gate.mjs`, `server/util/releaseGate*.js`
- `server/util/rbac.js` (the roles decide who can approve)

A renamed file counts under both names. When the list cannot be read for
certain (the API call fails, 3,000+ files, a manual run with no pull
request) the check asks for a batch as before.

To make it binding: Settings > Branches > main > Require status checks, add
**approved batch**, keep **Include administrators** ticked, and (only then)
drop the code-owner review requirement.
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

## Mail

All gate mail goes through SES (eu-west-1) and nothing else. The account has
production access (checked 21 Sep 2026: 50,000/day), so approvers need no
per-address verification. If that ever changes, a refused send is logged and
the action still completes; nothing is rerouted to another provider.
