// Locking the contract.
//
// Once per job, and the gate everything else waits on: until it is locked there
// is one quantity and it IS the estimate, so there is nothing to value and
// nothing to certify. After it, progress on the bill is what gets valued and
// quantities move only through variations.
//
// WHAT THIS DOES NOT DO IS QUOTE A CONTRACT SUM
//
// The server takes the snapshot itself — measured plus provisional sums, then
// preliminaries, then contingency, then tax, at the rates stored on the contract
// (projects.js:4618-4648) — and it does so against the RESOLVED scope, which for
// a merged project means every discipline's bill. A figure computed here would be
// a second opinion about the number a contract is signed for, and it would differ:
// totalsFor includes approved variations and the lock snapshot does not. So this
// says what will be taken and lets the answer come back.
//
// THE PIN AND THE OTP ARE MUTUALLY EXCLUSIVE
//
// requireStepUp passes straight through for anybody who never opted in
// (middleware/auth.js:135), and the lock then requires a four-digit PIN. With
// step-up on, the OTP is the authorisation and no PIN is asked for
// (projects.js:4598). So exactly one of the two is ever on screen — which is also
// what keeps the OTP prompt out of trouble: it renders at z-index 120 and the side
// panel at 150, so a panel held open across it would hide it and look like a hang.
// The shell closes this panel before raising the prompt, and it can do that
// safely precisely because a step-up reader has no PIN field to lose.

import React from "react";
import { lockPinProblem } from "./contractWrite.js";
import { lockChecklist } from "./valuationsModel.js";
import { money } from "./workProjectFormat.js";
import { totalsFor } from "./overviewModel.js";

export default function WorkProjectLockContract({
  project,
  stepUpEnabled = false,
  onLock,
  onDone,
}) {
  const [pin, setPin] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState("");

  const checks = React.useMemo(() => lockChecklist(project), [project]);
  const blocking = checks.filter((c) => !c.ok);
  const t = React.useMemo(() => totalsFor(project), [project]);
  const settings = project?.contract || {};

  // The PIN is only asked for, and only checked, when there is no OTP.
  const problem = stepUpEnabled ? "" : lockPinProblem(pin);
  const ready = blocking.length === 0 && !problem;

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!ready || busy) return;
    setBusy(true);
    setFailed("");
    try {
      await onLock?.(stepUpEnabled ? "" : pin.trim());
      onDone?.();
    } catch (err) {
      // A cancelled OTP is a deliberate back-out, not a failure, and the shell
      // answers it with nothing. Anything else is the server explaining itself.
      if (err?.message !== "Verification cancelled") {
        setFailed(String(err?.message || "The contract could not be locked."));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <div className="pn-sec">
        <span className="k">Before it locks</span>
        {/* The same ticks and warnings his gate shows, so the two places cannot
            read as two different checks. .pn-checks is the list without the card. */}
        <ul className="pn-checks">
          {checks.map((c) => (
            <li key={c.key} className={c.ok ? "ok" : ""}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {c.ok ? (
                  <path d="m20 6-11 11-5-5" />
                ) : (
                  <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                )}
              </svg>
              {c.text}
            </li>
          ))}
        </ul>
        {blocking.length ? (
          <p className="hint">
            {blocking.length === 1 ? "That has to be true" : "Those have to be true"} before the
            estimate can become a contract sum.
          </p>
        ) : null}
      </div>

      <div className="pn-sec">
        <span className="k">What gets fixed</span>
        <div className="big">{money(t.measured + t.provisional)}</div>
        <p className="hint">
          The measured work and the provisional sums as they stand. Preliminaries at{" "}
          {Number(settings.preliminaryPercent) || 0}%, contingency at{" "}
          {Number(settings.contingencyPercent) || 0}% and tax at{" "}
          {Number(settings.taxPercent) || 0}% are applied on top, and the contract sum
          is worked out and stored when it locks &mdash; so the figure above is the
          base, not the sum.
        </p>
      </div>

      {stepUpEnabled ? (
        <div className="pn-sec">
          <span className="k">Authorising it</span>
          <p className="hint">
            You will be asked for the code emailed to you. This panel closes while
            that is on screen and the result comes back as a message.
          </p>
        </div>
      ) : (
        <div className="pn-sec">
          <span className="k">A PIN to unlock it again</span>
          <label className="pn-num">
            <span>Four digits</span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={pin}
              disabled={busy}
              onChange={(e) => setPin(e.target.value)}
            />
          </label>
          <p className="hint">
            Unlocking the contract later asks for this. Keep it somewhere you will
            find it &mdash; nobody here can read it back to you.
          </p>
        </div>
      )}

      {problem ? <p className="pn-bad">{problem}</p> : null}
      {failed ? (
        <p className="pn-bad" role="status">
          {failed}
        </p>
      ) : null}

      <div className="pn-sec">
        <button type="submit" className="ds-btn btn-p ds-btn-sm" disabled={busy || !ready}>
          {busy ? "Locking…" : "Lock the contract"}
        </button>
        <p className="hint">
          After this, the bill&rsquo;s quantities are the contract&rsquo;s. A change to
          them becomes a variation, and valuations are drawn against what was agreed.
        </p>
      </div>
    </form>
  );
}
