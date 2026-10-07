// Raising a variation, and deciding one.
//
// Both open over the Valuations tab in his side panel — layer L5 (WORK.md §13),
// the same place the line panel, the collaborators, the exports and the
// certificate form go — and both are built from .pn-sec / .pn-num / .pn-bad /
// .ds-btn, the panel's own classes. No new CSS.
//
// The fields and the wording are the classic form's, verbatim where it had them
// (ProjectContractPanel.jsx:606-663), so the two builds say the same thing about
// the same act. variationDraft.js holds the rules.

import React from "react";
import {
  blankVariationDraft,
  variationBodyFrom,
  variationDraftProblem,
} from "./variationDraft.js";
import { variationRows } from "./variationsModel.js";
import { money } from "./workProjectFormat.js";

/* ───────────────────────────── Raise one ───────────────────────────── */

export function WorkProjectRaiseVariation({ onRaise, onDone }) {
  const [draft, setDraft] = React.useState(blankVariationDraft);
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState("");

  const problem = variationDraftProblem(draft);
  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  const submit = async (e) => {
    e?.preventDefault?.();
    if (problem || busy) return;
    setBusy(true);
    setFailed("");
    try {
      await onRaise?.(variationBodyFrom(draft));
      onDone?.();
    } catch (err) {
      // The server's own sentence. A collaborator without RateGen is refused
      // outright here — a variation is a value, and this route is the one place a
      // new one is born, so there is no stored figure to fall back on
      // (RATES_MASKED, projects.js:5349).
      setFailed(String(err?.message || "The variation could not be raised."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <div className="pn-sec">
        <span className="k">What changed</span>
        <label className="pn-num">
          <span>The change</span>
          <input
            type="text"
            maxLength={500}
            placeholder="e.g. Additional windows to stair core"
            value={draft.description}
            disabled={busy}
            onChange={set("description")}
          />
        </label>
        <label className="pn-num">
          <span>Instruction reference</span>
          <input
            type="text"
            maxLength={120}
            placeholder="e.g. AI-012"
            value={draft.reference}
            disabled={busy}
            onChange={set("reference")}
          />
        </label>
        <p className="hint">
          From an architect&rsquo;s instruction, a site instruction or a client change.
          The reference is what you would quote in a letter about it.
        </p>
      </div>

      <div className="pn-sec">
        <span className="k">What it is worth</span>
        <label className="pn-num">
          <span>Adds or takes away</span>
          <select value={draft.kind} disabled={busy} onChange={set("kind")}>
            <option value="addition">Adds to the contract</option>
            <option value="omission">Takes away from it</option>
          </select>
        </label>
        <label className="pn-num">
          <span>Value</span>
          <input
            type="number"
            min="0"
            step="1000"
            value={draft.amount}
            disabled={busy}
            onChange={set("amount")}
          />
        </label>
        <p className="hint">
          A lump sum, typed as a positive figure either way &mdash; the choice above
          is what decides whether it adds or takes away. Rates are built in RateGen,
          so a variation is valued here rather than measured.
        </p>
      </div>

      {problem ? <p className="pn-bad">{problem}</p> : null}
      {failed ? (
        <p className="pn-bad" role="status">
          {failed}
        </p>
      ) : null}

      <div className="pn-sec">
        <button type="submit" className="ds-btn btn-p ds-btn-sm" disabled={busy || !!problem}>
          {busy ? "Raising…" : "Raise it"}
        </button>
        <p className="hint">
          It is raised as pending. It changes the contract value only once it is
          approved, and until then it counts toward nothing.
        </p>
      </div>
    </form>
  );
}

/* ──────────────────────────── Decide one ──────────────────────────── */

const DECIDED = {
  approved: "This variation has been approved.",
  rejected: "This variation has been rejected.",
};

export function WorkProjectDecideVariation({
  project,
  index,
  canEdit = false,
  estimatedTotal = 0,
  onDecide,
  onDone,
}) {
  const row = React.useMemo(
    () => variationRows(project).find((r) => r.index === index) || null,
    [project, index],
  );
  const [busy, setBusy] = React.useState("");
  const [failed, setFailed] = React.useState("");

  const decide = async (status) => {
    if (busy) return;
    setBusy(status);
    setFailed("");
    try {
      await onDecide?.(index, status);
      onDone?.();
    } catch (err) {
      // A 409 means somebody has already decided this one. The handler re-reads
      // the project on that, so by the time this message is read the row behind it
      // already shows its real status.
      setFailed(String(err?.message || "The decision could not be recorded."));
    } finally {
      setBusy("");
    }
  };

  if (!row) {
    return (
      <div className="pn-sec">
        <span className="k">Not here any more</span>
        <p className="hint">
          This variation is no longer on the contract &mdash; it may have been removed
          while this was open. Close this and the list will be right.
        </p>
      </div>
    );
  }

  const pending = row.status === "pending";

  return (
    <>
      <div className="pn-sec">
        <span className="k">
          V{row.no}
          {row.reference ? ` · ${row.reference}` : ""}
        </span>
        <div className="big sm">{row.title}</div>
        <p className="amt">
          <b>
            {row.amount < 0 ? "Takes away " : "Adds "}
            {money(Math.abs(row.amount))}
          </b>
        </p>
        <p className="hint">
          {pending
            ? "Pending, so it counts toward nothing yet."
            : DECIDED[row.status] || "This variation has been decided."}
        </p>
      </div>

      {pending && estimatedTotal > 0 ? (
        <div className="pn-sec">
          <span className="k">If it is approved</span>
          <div className="big">{money(estimatedTotal + row.amount)}</div>
          <p className="hint">
            The works would stand at this, against {money(estimatedTotal)} now.
          </p>
        </div>
      ) : null}

      {failed ? (
        <p className="pn-bad" role="status">
          {failed}
        </p>
      ) : null}

      {pending && canEdit ? (
        <div className="pn-sec">
          <span className="k">Decide it</span>
          <button
            type="button"
            className="ds-btn btn-p ds-btn-sm"
            disabled={!!busy}
            onClick={() => decide("approved")}
          >
            {busy === "approved" ? "Approving…" : "Approve it"}
          </button>
          <button
            type="button"
            className="ds-btn btn-o ds-btn-sm"
            disabled={!!busy}
            onClick={() => decide("rejected")}
          >
            {busy === "rejected" ? "Rejecting…" : "Reject it"}
          </button>
          {/* SAID BEFORE THE CLICK, NOT AFTER IT.
              The classic panel approves on one click with no warning at all, and
              the only hint of consequence is a figure in the card. The server's own
              comment is blunter: an approved variation counts toward the contract
              value, and un-approving it would move a total that certificates have
              already been issued against. */}
          <p className="hint">
            Approving changes the contract value, and certificates are issued against
            it &mdash; so it cannot be undone here afterwards. Rejecting can be left
            and revisited.
          </p>
        </div>
      ) : null}

      {pending && !canEdit ? (
        <p className="hint">
          You have view access to this project, so the decision is not yours to
          record.
        </p>
      ) : null}
    </>
  );
}

export default WorkProjectRaiseVariation;
