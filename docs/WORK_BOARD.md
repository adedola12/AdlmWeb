# Work board

`/admin/work`. The board also appears on the release desk (`/admin/releases`) and on the
redesign review index (`/preview`).

## Why it exists

Adedolapo set this rule on 22 Sep 2026. From then on, **no new feature or button is added to
any ADLM product until the release approver (Richard Enoch) has approved it. The approval is
based on a written business case.** Richard designs while the code is written, so design and
build move together rather than one after the other.

The board has two jobs:

1. **Visibility.** It lists everything in flight across QUIV, HERON, RateGen, the MEP Suite,
   CIVIQ, Time Pro, ArchiCAD, the QS Takeoff app, the Installer Hub, mobile, the website, the
   AI service, ADLM Market and the WhatsApp bot. For each item it shows what is done, what is
   left and what the item is waiting on.
2. **Approval before build.** A new feature, button or improvement starts as a proposal. It
   cannot move to *approved*, *in design*, *building*, *testing*, *awaiting sign-off* or
   *shipped* until it is approved. The server enforces this in `server/util/workBoard.js`
   (`stageBlock`). The UI does not enforce it.

## What needs approval

| Kind | Needs approval | Why |
|---|---|---|
| feature, button, improvement | **Yes** | These are product decisions. |
| fix | No | A bug fix restores what was already agreed. |
| infra | No | It does not change what a customer sees. |
| release | No | Releases already have their own sign-off desk. |
| content, design | No | Shown for visibility. |

Changing a fix into a feature puts it back in front of the approver.

## The business case

A proposal cannot be filed unless the five required fields are filled in:

| Field | Required | Write |
|---|---|---|
| Problem it solves | ✔ | What hurts today, and for whom. |
| Who benefits | ✔ | Firms, individual QSs, students, institutions, staff. |
| Business value | ✔ | Revenue, retention, time saved, support load. Use numbers where you have them. |
| Cost and effort | ✔ | Build time, running cost, AI spend per use. |
| How we will know it worked | ✔ | One metric, and where we will read it. |
| Risks | | What it could break, and what it costs if it is wrong. |
| Alternatives | | Always include "do nothing". |

The **design track** records the screens, buttons and dialogs the change touches. It also
holds Richard's design status (needed, being designed, ready, adopted), a Figma or staged-page
link, and notes. When he marks a design **ready**, the owner and the proposer are emailed.

## Who decides

- **Richard** approves, asks for changes, or declines every proposal except his own. Asking
  for changes or declining needs a note.
- A proposal Richard wrote goes to the **owner** (a super-admin) instead. Nobody approves their
  own idea.
- If a proposal was sent back or declined, editing it puts it back in front of the approver.
  An approved item keeps its approval when it is edited.
- Each decision is emailed (through SES only) and written to the locked release-gate audit log
  as `release-gate.work.decision`.
- Richard holds Design Access. Like the release desk, this board is unmasked for him and only
  for him (`server/middleware/designMode.js`, `RELEASE_DESK`). Every other Design Access user
  sees placeholder data.

There is no delete. An idea that is dropped is declined or put on hold, so the record of what
was proposed, and why, stays readable.

## Work already in flight

Work that was already under way on 22 Sep 2026 is marked **"Started before the rule"**
(`grandfathered`). It can keep moving. Richard can still comment on it, change its design
track, or ask for a pause. Anything new that comes out of that work is a new proposal.

## From the command line (and for Claude sessions)

Run these from `server/`. Local dev shares the production Atlas cluster, so `--apply` writes
to production.

```
node scripts/work-board.mjs status
node scripts/work-board.mjs seed            # dry run: the in-flight list in scripts/work-board.seed.mjs
node scripts/work-board.mjs seed --apply
node scripts/work-board.mjs propose --file proposal.json [--apply]
node scripts/work-board.mjs check --key <key>   # exit 0 only if it is cleared to build
```

A re-seed refreshes only the summary, progress, pending, blocked-on and refs fields. It never
changes a stage, a decision, a design or a comment that someone set on the board.

**Claude sessions:** before you build a new feature or button in any ADLM product, file a
proposal with its business case. Then run `check`. Build only when `check` exits 0. A fix does
not need this.
