# Auto take-off: the agreed scope for QUIV, and the decision on HERON

Work-board item `r2-ai-auto-takeoff` · written 27 Sep 2026 · for Adedolapo and Richard Enoch · **status: waiting for Richard's approval, nothing pushed**

This page settles what "auto take-off" means in each product. It does not replace the work already in flight:
**QUIV auto take-off speed** (in testing), **QUIV 4.0 take-off timing** (AdlmWeb#33, #43, #46 merged) and **HERON AI auto take-off (beta)** (grandfathered). It builds on them.

## What exists today (checked in the code, 27 Sep)

| | QUIV (Revit) | HERON (PlanSwift) |
|---|---|---|
| What "auto take-off" is | The **handover**: it runs every ticked module on every level, one step per module × level × type, through the same engines as a manual take-off. | Beta only. It captures the sheet, finds the building outline from the drawing's ink, squares it, and proposes values for the ADLM template's inputs. |
| Does a model measure anything? | **No.** The run is deterministic. The AI prompt (`quiv-prompt`) only turns a sentence into a module and level list; the plugin still does the measuring. | **No, in practice.** The default detector is local pixel work. The optional "checked by the ADLM AI Service" source calls `/ai/plan-detect` and `/ai/plan-refine`, and **neither endpoint exists** on the website or in the AI service, so that path can only return 404. |
| Confidence figures | **None computed.** Richard's design shows "AI 96%" tags, and those are hard-coded example numbers in `plugin-quiv.js`. | An outline score (how much the building shape dominates the sheet), and a pre-tick at 0.8 or above. "Error %" exists only against a figure the estimator types in by hand. |
| Accept / reject | Only the whole run can be undone. | Per proposal, with nothing written until Write. |
| Metering | `quiv-handover` (runs a day, no tokens) and `quiv-prompt` (10 a day each, `/ai/quiv/allowance`). | None, and none needed while no model is called. |
| Channel | The handover is in the public build. The Beta Programme is an opt-in for log upload. | Beta channel only (`beta.txt` / `ADLM_BETA`). HERON 3 (`feat/heron-3`, c1ab5e9) switches it off for everyone. |

## QUIV: what auto take-off does

1. **It stays the handover.** You pick modules and levels, see the step plan, then watch progress with the time so far and an estimate, and can stop, keep or undo. The speed work (`quiv-takeoff-speed`) lands first and is not touched here.
2. **New: review each step before keeping it (Beta Programme users first).** When a run finishes, every step that saved shows how many Bill lines it added or replaced. You can **reject a single step** (for example "Walls, First Floor") and keep the rest. Rejecting a step replays the kept steps over the saved state from before the run, so the Bill and the Budget always agree. A step whose lines cannot be told apart is not offered for rejection; the whole-run undo still covers it. Values written onto Revit elements stay, as with today's undo.
3. **New: the run reports how many steps were kept and how many rejected** to the website (`POST /ai/quiv/handover-review`), only for runs where the review was offered, so the figure is not flattered. This number is the success metric, and it appears on `/admin/ai-usage`.
4. **Metering is unchanged.** One `quiv-handover` run is charged at the start. The review adds no charge and no model call.

## QUIV: what auto take-off does not do

- **No "AI confidence %" on take-off lines.** No part of the engine computes one, and the owner's rule is that copy describes what the system really does. Each step shows real evidence instead: lines saved, the time the step took, and the engine's own warnings. If a real per-line score is ever computed, it can be shown then.
- It does not call it "AI" measuring. The words are "auto take-off" and "QUIV measured".
- No pick-only modules (Oversite, Strip, Pad, Pile cap, Raft, Roof). They stay listed for the user, as they are today.
- It does not revert values written onto Revit elements. Those sit on Revit's own undo, the same as today's undo.
- It does not publish to the cloud. Publishing stays a separate click in the Bill.

## Accuracy bar (QUIV)

- **Same answer as by hand.** A handover step must give exactly the quantities of the same module, level and type run by hand, with 0 difference, on the two reference models (the house and the tower).
- **Completion.** On the reference models, 95% or more of the planned steps finish Saved or Skipped (nothing to measure), and none Failed.
- **Honest review.** Rejecting any one step leaves the Bill and Budget identical to a run that never had that step (checked by test).
- **Time.** Measured by the take-off time log (auto against assisted), against the 12 Sep baseline of 551 steps in 21 minutes.
- **Leaving beta:** when the reference runs pass all of the above, and beta users have kept at least 90% of saved steps over 20 runs.

## HERON: recommendation

**Retire the drawing-reading "AI auto take-off" from HERON's direction (option a). Do not build `/ai/plan-detect`.**

- Richard's HERON redesign (ff30edc) reads the ADLM template and **never measures the drawing**. HERON 3 already switches auto take-off off.
- The "AI" part has never run in the field, because its endpoints do not exist. What works is a local outline finder, and the estimator's own PlanSwift measuring already does that job.
- The valuable part is **template-driven**: filling the template's input fields (`TemplateInputService`). It belongs to the HERON 3 take-off screen as part of that redesign, not as an AI feature.
- **What changes now (2.9.x, beta only):** the beta keeps the local outline finder, and the "checked by the ADLM AI Service" and "ADLM AI Service" sources are removed from beta builds, because they can only fail. Developer builds keep every source for testing. The public build is unchanged (hidden, as today).
- **No HERON metered feature** is added to `/admin/ai-usage`, because HERON calls no model. If an optional "from drawing" assist (option b) is ever wanted after HERON 3 ships, it comes back as its own proposal, with a cost per take-off quoted first.
- Board: `heron-auto-takeoff` moves to **on hold, superseded by HERON 3**, with its versions corrected (2.9.6 everywhere; 3.0.0 was reverted in bebfa7f).

## What was built locally (branches only, nothing pushed)

| Repo | Branch | What |
|---|---|---|
| AdlmWeb | `feat/r2-ai-auto-takeoff` | This page; `POST /ai/quiv/handover-review` and the kept/rejected figures on `/admin/ai-usage`; board seed notes |
| RevitPluginArch | `feat/r2-auto-takeoff-review` (from `origin/main`) | Per-step reject in the handover, Beta Programme only; reports the review |
| ADLMPlanswiftApp | `feat/r2-heron-autotakeoff-local-only` (from `master`) | Beta builds offer only the local outline source |

**What Richard decides:** (1) the QUIV scope above; (2) HERON option a (recommended) or b; (3) the design of the QUIV review list inside the handover panel. It uses the existing panel for now, and his plugin-quiv panel replaces it in QUIV 4.0.
