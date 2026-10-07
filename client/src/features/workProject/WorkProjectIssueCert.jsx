// Issuing an interim payment certificate.
//
// The highest-cadence money act a QS performs — monthly, on every live contract —
// and it could not be done in the new workspace at all. The Valuations tab's own
// empty state told them to "raise the first certificate in the classic
// workspace", without a link.
//
// IT IS A FORM, NOT A SCREEN
//
// Everything that could be got wrong with money is got right on the server
// already: computeValueToDate works out the cumulative position from the bill,
// the percentages come off valuationSettings, and the certificate number is
// max(existing) + 1 there — so two people issuing at once cannot both believe
// they issued IPC 4. The body is ignored for every figure unless the caller can
// see rates. So this asks the four things only a person knows, and sends nothing
// else. certificateDraft.js holds the rules; this is the markup and the states.
//
// WHY IT IS IN THE PANEL
//
// His layer L5: a thing that needs its own space opens OVER the tab (WORK.md
// §13), which is where the line panel, the collaborators and the exports go.
// It is built from .pn-sec / .pn-num / .pn-bad / .ds-btn — the panel's own
// classes — so there is no new CSS.

import React from "react";
import {
  blankCertDraft,
  certBodyFrom,
  certDraftProblem,
  retentionHeld,
} from "./certificateDraft.js";
import { money } from "./workProjectFormat.js";

export default function WorkProjectIssueCert({ project, onIssue, onDone }) {
  const [draft, setDraft] = React.useState(blankCertDraft);
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState("");

  const certs = Array.isArray(project?.certificates) ? project.certificates : [];
  const held = retentionHeld(certs);
  const nextNumber =
    certs.reduce((a, c) => Math.max(a, Number(c?.number) || 0), 0) + 1;
  // Said, not computed: the server works out what this certificate is worth, and
  // a second opinion here would disagree the first time a line moved.
  const problem = certDraftProblem(draft, { totalRetained: held });

  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  const submit = async () => {
    if (problem || busy) return;
    setBusy(true);
    setFailed("");
    try {
      await onIssue?.(certBodyFrom(draft));
      onDone?.();
    } catch (err) {
      // The server's own words. "Final account is finalized. Reopen it before
      // issuing new certificates." is an instruction, and it is the only one the
      // QS gets.
      setFailed(String(err?.message || "The certificate could not be issued."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="pn-sec">
        <span className="k">Interim certificate {nextNumber}</span>
        <p className="hint">
          What it is worth is worked out from the bill as it stands — the progress on
          each line, the approved variations, retention, VAT and withholding at the
          rates on this contract. These four are the things only you know.
        </p>
      </div>

      <div className="pn-sec">
        <span className="k">The period it covers</span>
        <label className="pn-num">
          <span>Period from</span>
          <input
            type="date"
            value={draft.periodStart}
            max={draft.periodEnd || undefined}
            disabled={busy}
            onChange={set("periodStart")}
          />
        </label>
        <label className="pn-num">
          <span>Period to</span>
          <input
            type="date"
            value={draft.periodEnd}
            min={draft.periodStart || undefined}
            disabled={busy}
            onChange={set("periodEnd")}
          />
        </label>
        <p className="hint">
          Leave these blank and the document can only show the day it was issued,
          which is not the same thing — and a certificate that cannot say what it
          certified is hard to defend.
        </p>
      </div>

      <div className="pn-sec">
        <span className="k">Retention</span>
        <label className="pn-num">
          <span>Release{held > 0 ? ` (${money(held)} held)` : ""}</span>
          <input
            type="number"
            min="0"
            max={held > 0 ? held : undefined}
            step="any"
            placeholder="0"
            value={draft.retentionReleased}
            disabled={busy}
            onChange={set("retentionReleased")}
          />
        </label>
        <p className="hint">
          Released retention is added back on this certificate and taxed with the
          rest. Leave it at nothing on an ordinary interim; half usually comes back
          at practical completion and the rest at the final account.
        </p>
      </div>

      <div className="pn-sec">
        <span className="k">Notes</span>
        <label className="pn-num">
          <span>Printed on the certificate</span>
          <input
            type="text"
            maxLength={2000}
            placeholder="Optional"
            value={draft.notes}
            disabled={busy}
            onChange={set("notes")}
          />
        </label>
      </div>

      {problem ? <p className="pn-bad">{problem}</p> : null}
      {failed ? <p className="pn-bad">{failed}</p> : null}

      <div className="pn-sec">
        <button
          type="button"
          className="ds-btn btn-p ds-btn-sm"
          disabled={busy || !!problem}
          onClick={submit}
        >
          {busy ? "Issuing…" : `Issue certificate ${nextNumber}`}
        </button>
        <p className="hint">
          It is issued as a draft. Approving it is a separate step, so a figure can
          be checked before anybody is told it is payable.
        </p>
      </div>
    </>
  );
}
