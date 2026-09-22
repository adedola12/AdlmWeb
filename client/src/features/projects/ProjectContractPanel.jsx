import React from "react";
import { FaCube, FaDownload, FaFileInvoiceDollar, FaPlus, FaTrashAlt, FaUpload } from "../../components/icons.jsx";
import { deriveItemDiscipline } from "../../lib/boqCategory.js";
import WkModal from "../../ds/WkModal.jsx";
import { useFeedback } from "../../ds/feedback/feedbackContext.js";
import {
  variationKpis,
  variationRowsNewestFirst,
  variationStatusLabel,
  variationStatusClass,
} from "../../lib/variations.js";

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function money(v) {
  return safeNum(v).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function naira(v) {
  return "₦" + money(v);
}

// A variation reads as +value or -value, and as an en dash when the viewer
// may not see money at all.
function signedMoney(v, canSeeRates = true) {
  if (!canSeeRates) return "–";
  const n = safeNum(v);
  if (n === 0) return naira(0);
  return (n > 0 ? "+" : "−") + naira(Math.abs(n));
}

function formatDate(v) {
  const d = v ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) return "–";
  return d.toLocaleDateString();
}

function bytes(n) {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// His palettes for chips and tones.
function tone(pal) {
  return {
    background: `var(--pal-${pal}-wash)`,
    color: `var(--pal-${pal}-key)`,
    borderColor: `var(--pal-${pal}-line)`,
  };
}
const NO_MB = { marginBottom: 0 };
const STACK = { display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" };
const NOTE_WARN = { background: "var(--pal-orange-wash)", color: "var(--pal-orange-key)" };
const ICON_BTN = { padding: "4px 8px" };

// A section head inside the panel: his group title and a note, actions right.
function SectionHead({ title, sub, children }) {
  return (
    <div
      className="wk-bar"
      style={{ marginBottom: 0, justifyContent: "space-between", alignItems: "flex-start" }}
    >
      <div style={{ minWidth: 0, flex: "1 1 260px" }}>
        <p className="wk-grp" style={{ padding: 0, margin: 0 }}>
          {title}
        </p>
        <div className="wk-locnote" style={{ marginTop: 4 }}>
          {sub}
        </div>
      </div>
      {children}
    </div>
  );
}

function CertificatesSection({
  certificates = [],
  onIssue,
  onUpdate,
  onDelete,
  onDownload,
  busy,
  disabled,
  note,
}) {
  const sorted = [...certificates].sort(
    (a, b) => Number(a.number) - Number(b.number),
  );

  const totalCertified = sorted.reduce(
    (acc, c) => acc + safeNum(c.thisCertificate),
    0,
  );
  const totalRetained = sorted.reduce(
    (acc, c) => acc + safeNum(c.retentionAmount) - safeNum(c.retentionReleased),
    0,
  );

  return (
    <div style={STACK}>
      <SectionHead
        title="Interim payment certificates"
        sub="Each certificate is numbered and carries its own cumulative, less-previous, retention, VAT and WHT values: ready for Architect / QS / Client sign-off."
      >
        <button
          type="button"
          className="ds-btn ds-btn-sm btn-p"
          onClick={() => onIssue?.()}
          disabled={busy || disabled}
          title={
            disabled
              ? "Finalize is active. Reopen to issue new certificates."
              : "Issue a new interim certificate"
          }
        >
          <FaPlus size={12} />
          {busy ? "Issuing..." : "Issue certificate"}
        </button>
      </SectionHead>

      {note ? (
        <p className="mk-note" style={{ margin: 0, ...NOTE_WARN }}>
          {note}
        </p>
      ) : null}

      {sorted.length === 0 ? (
        <div className="wk-panel wk-empty" style={NO_MB}>
          No certificates issued yet. Click “Issue certificate” to generate
          IPC #01 against the current value-to-date.
        </div>
      ) : (
        <div className="wk-panel" style={{ marginBottom: 0, overflowX: "auto" }}>
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-2 py-2 w-16">No.</th>
                <th className="px-2 py-2 w-24">Date</th>
                <th className="px-2 py-2 text-right">Cumulative</th>
                <th className="px-2 py-2 text-right">Less prev.</th>
                <th className="px-2 py-2 text-right">This cert</th>
                <th className="px-2 py-2 text-right">Retention</th>
                <th className="px-2 py-2 text-right">VAT</th>
                <th className="px-2 py-2 text-right">WHT</th>
                <th className="px-2 py-2 text-right font-semibold text-adlm-blue-700">Net payable</th>
                <th className="px-2 py-2 w-20">Status</th>
                <th className="px-2 py-2 w-20 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c, i) => {
                const isLast = i === sorted.length - 1;
                return (
                  <tr key={c.number} className="border-t">
                    <td className="px-2 py-2 font-medium text-slate-800">
                      IPC {String(c.number).padStart(2, "0")}
                    </td>
                    <td className="px-2 py-2 text-slate-600">{formatDate(c.date)}</td>
                    <td className="px-2 py-2 text-right">{money(c.cumulativeValue)}</td>
                    <td className="px-2 py-2 text-right text-slate-500">
                      {money(c.lessPrevious)}
                    </td>
                    <td className="px-2 py-2 text-right font-medium">
                      {money(c.thisCertificate)}
                    </td>
                    <td className="px-2 py-2 text-right text-slate-600">
                      {money(c.retentionAmount)}
                    </td>
                    <td className="px-2 py-2 text-right text-slate-600">
                      {money(c.vatAmount)}
                    </td>
                    <td className="px-2 py-2 text-right text-slate-600">
                      ({money(c.whtAmount)})
                    </td>
                    <td className="px-2 py-2 text-right font-semibold text-adlm-blue-700">
                      {money(c.netPayable)}
                    </td>
                    <td className="px-2 py-2">
                      <select
                        className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[11px]"
                        value={c.status || "draft"}
                        disabled={disabled}
                        onChange={(e) =>
                          onUpdate?.(c.number, { status: e.target.value })
                        }
                      >
                        <option value="draft">Draft</option>
                        <option value="approved">Approved</option>
                        <option value="paid">Paid</option>
                      </select>
                    </td>
                    <td className="px-1 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => onDownload?.(c.number)}
                          className="ds-btn ds-btn-sm btn-o"
                          style={ICON_BTN}
                          aria-label="Download certificate"
                          title="Download .xlsx"
                        >
                          <FaDownload size={13} />
                        </button>
                        {isLast ? (
                          <button
                            type="button"
                            onClick={() => onDelete?.(c.number)}
                            disabled={disabled}
                            className="ds-btn ds-btn-sm btn-o"
                            style={ICON_BTN}
                            aria-label="Delete certificate"
                            title="Delete (latest cert only)"
                          >
                            <FaTrashAlt size={13} />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-50 text-xs font-semibold text-slate-900">
              <tr className="border-t">
                <td colSpan={4} className="px-2 py-2 text-right">
                  Totals
                </td>
                <td className="px-2 py-2 text-right">{money(totalCertified)}</td>
                <td className="px-2 py-2 text-right">{money(totalRetained)}</td>
                <td colSpan={5} className="px-2 py-2 text-right text-slate-500">
                  Net retention held
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Variations (S18) ──────────────────────────────────────────────────────
// His .pj-kpi.c4 + .pj-vars list. A variation is raised pending and only
// moves the project total once someone with edit access approves it.
function VariationsSection({
  rows = [],
  onAdd,
  onDecide,
  canEdit = false,
  canSeeRates = true,
  disabled = false,
  estimatedTotal = 0,
}) {
  const fb = useFeedback();
  const [adding, setAdding] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [form, setForm] = React.useState({
    description: "",
    reference: "",
    kind: "addition",
    amount: "",
  });

  const kpis = React.useMemo(() => variationKpis(rows), [rows]);
  const list = React.useMemo(() => variationRowsNewestFirst(rows), [rows]);

  function resetForm() {
    setForm({ description: "", reference: "", kind: "addition", amount: "" });
  }

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const description = form.description.trim();
    if (!description) {
      fb.toast({ tone: "error", title: "Say what changed" });
      return;
    }
    const amount = Math.abs(Number(form.amount));
    if (!Number.isFinite(amount) || amount === 0) {
      fb.toast({ tone: "error", title: "Enter the value of the variation" });
      return;
    }
    setBusy(true);
    try {
      const result = await onAdd?.({
        description,
        reference: form.reference.trim(),
        kind: form.kind,
        amount,
      });
      if (result) {
        setAdding(false);
        resetForm();
        fb.toast({
          tone: "success",
          title: `V${Number(result.index ?? 0) + 1} added, pending approval`,
          msg: "It counts once it is approved.",
        });
      }
    } finally {
      setBusy(false);
    }
  }

  async function openRow(row) {
    const rows2 = [
      ["Value", signedMoney(row.amount, canSeeRates)],
      ["Status", variationStatusLabel(row.status)],
    ];
    // What the project total becomes if this one is approved. For a decided
    // variation the total already reflects it, so we say so plainly rather
    // than showing a figure that would not change.
    if (canSeeRates) {
      rows2.push([
        row.status === "pending" ? "Estimated total if approved" : "Estimated total",
        naira(row.status === "pending" ? estimatedTotal + row.amount : estimatedTotal),
      ]);
    }
    const canDecide = canEdit && !disabled && row.status === "pending";
    const answer = await fb.card({
      tone: "info",
      noIcon: true,
      title: `V${row.no} · ${row.description || "Variation"}`,
      msg: [row.reference, formatDate(row.issuedAt)].filter(Boolean).join(" · "),
      rows: rows2,
      secondary: canDecide ? "Reject" : null,
      primary: canDecide ? "Approve" : "Close",
    });
    if (!canDecide || !answer) return;
    const status = answer === "primary" ? "approved" : "rejected";
    const ok = await onDecide?.(row.index, status);
    if (ok) {
      fb.toast({
        tone: status === "approved" ? "success" : "info",
        title: `V${row.no} ${status === "approved" ? "approved" : "rejected"}`,
        msg:
          status === "approved"
            ? "It now counts toward the project total and the final account."
            : "It stays on record and is not counted.",
      });
    }
  }

  return (
    <div style={STACK}>
      <div className="pj-tb" style={NO_MB}>
        <span className="wk-locnote" style={{ flex: "1 1 240px" }}>
          Architect’s instructions, site instructions and client changes.
          Only an approved variation moves the project total.
        </span>
        {canEdit ? (
          <div className="pj-acts">
            <button
              type="button"
              className="ds-btn ds-btn-sm btn-p"
              onClick={() => setAdding(true)}
              disabled={disabled}
              title={
                disabled
                  ? "The final account is closed. Reopen it to raise a variation."
                  : "Raise a variation against this contract"
              }
            >
              <FaPlus size={12} /> Add variation
            </button>
          </div>
        ) : null}
      </div>

      <div className="pj-kpi c4">
        <div>
          <span>Approved, net</span>
          <b>{canSeeRates ? naira(kpis.approvedNet) : "–"}</b>
          <em>Moves the project total</em>
        </div>
        <div>
          <span>Additions</span>
          <b>{canSeeRates ? naira(kpis.additions) : "–"}</b>
          <em>
            {kpis.additionsCount} approved
          </em>
        </div>
        <div>
          <span>Omissions</span>
          <b>{canSeeRates ? naira(kpis.omissions) : "–"}</b>
          <em>{kpis.omissionsCount} approved</em>
        </div>
        <div className={kpis.pendingCount ? "warn" : ""}>
          <span>Waiting for approval</span>
          <b>{kpis.pendingCount}</b>
          <em>
            {kpis.pendingCount
              ? canSeeRates
                ? `${naira(kpis.pendingNet)} not counted yet`
                : "Not counted yet"
              : "None"}
          </em>
        </div>
      </div>

      {list.length ? (
        <div className="pj-vars">
          {list.map((row) => (
            <button
              type="button"
              key={`${row.index}-${row.no}`}
              className="vr"
              onClick={() => openRow(row)}
            >
              <span className="no">V{row.no}</span>
              <span className="ds">
                <b>{row.description || "Variation"}</b>
                <em>
                  {[row.reference || "No reference", formatDate(row.issuedAt)].join(" · ")}
                </em>
              </span>
              <span className={`n ${row.amount < 0 ? "om" : "ad"}`}>
                <b>{signedMoney(row.amount, canSeeRates)}</b>
              </span>
              <span className={`pj-stage ${variationStatusClass(row.status)}`}>
                {variationStatusLabel(row.status)}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="pj-empty">
          <b>No variations yet</b>
          <p>
            Log architect’s instructions, site instructions and client changes
            here. An approved variation changes the project total and the final
            account; a pending one changes nothing until it is approved.
          </p>
        </div>
      )}

      <p className="pj-foot" style={NO_MB}>
        New lines added to the bill after the contract was locked are raised
        here automatically, already approved, so the contract keeps its record
        of the change.
      </p>

      <WkModal
        open={adding}
        title="Add a variation"
        sub="From an architect’s instruction, a site instruction or a client change."
        busy={busy}
        onClose={() => {
          setAdding(false);
          resetForm();
        }}
      >
        <form onSubmit={submit}>
          <label className="wk-f">
            <span>What changed</span>
            <input
              type="text"
              value={form.description}
              autoFocus
              maxLength={500}
              placeholder="e.g. Additional windows to stair core"
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
            />
          </label>
          <label className="wk-f half">
            <span>Instruction reference</span>
            <input
              type="text"
              value={form.reference}
              maxLength={120}
              placeholder="e.g. AI-012"
              onChange={(e) =>
                setForm((f) => ({ ...f, reference: e.target.value }))
              }
            />
          </label>
          <label className="wk-f half">
            <span>Type</span>
            <select
              value={form.kind}
              onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
            >
              <option value="addition">Addition</option>
              <option value="omission">Omission</option>
            </select>
          </label>
          <label className="wk-f half">
            <span>Value (₦)</span>
            <input
              type="number"
              min="0"
              step="1000"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            />
          </label>
          <button type="submit" className="wk-modal-go" disabled={busy}>
            {busy ? "Adding…" : "Add variation"}
          </button>
        </form>
      </WkModal>
    </div>
  );
}

function FinalAccountSection({
  finalAccount,
  onFinalize,
  onReopen,
  onDownload,
  contractSum,
  contractLocked = false,
  measured,
  provisional,
  preliminary,
  variations,
  // Contingency / tax — full QS grand-summary cascade (Sub-total
  // → +Contingency → +VAT → Planned). Default 0 so older callers
  // that haven't passed them in still produce sensible output.
  contingency = 0,
  tax = 0,
  contingencyPercent = 0,
  taxPercent = 0,
  // Actual spent so far — used for true over-run calculation
  // (spend exceeds planned), NOT for live BoQ drift.
  actualSpent = 0,
  // S18 valuations: what the approved and paid certificates add up to.
  certifiedToDate = 0,
  disabledFinalize,
}) {
  const isFinalized = Boolean(finalAccount?.finalized);
  // Planned total now follows the full QS cascade — Sub-total +
  // Contingency + Tax + Variations. Without contingency/tax the
  // formula collapses to the old "measured + PC + prelim + var".
  const subtotal = measured + provisional + preliminary;
  const plannedTotal = subtotal + contingency + tax;
  const currentValue = plannedTotal + variations;

  // Over-run / Savings semantics — driven by ACTUAL SPEND, not by
  // live BoQ drift.
  //
  //   over-run = max(0, actualSpent - plannedTotal)
  //   savings  = max(0, plannedTotal - actualSpent)  [only after final]
  //
  // Pre-lock: nothing to compare against → both zero.
  // Locked, no actuals: actualSpent = 0 → over-run = 0 (correct;
  //   the previous "compare contractSum vs live measured+PC+prelim"
  //   produced phantom over-runs whenever the BoQ was edited after
  //   lock without any actual money being spent).
  // Locked with actuals: over-run only ticks up when spend exceeds
  //   the planned baseline.
  let overRun = 0;
  let savings = 0;
  let savingsLabel = "Over-run";
  let savingsTone = "neutral";
  let savingsValue = 0;
  if (isFinalized) {
    savings = finalAccount.savings || 0;
    savingsValue = Math.abs(savings);
    if (savings > 0) {
      savingsLabel = "Under-run (savings)";
      savingsTone = "positive";
    } else if (savings < 0) {
      savingsLabel = "Over-run";
      savingsTone = "negative";
    } else {
      savingsLabel = "On budget";
      savingsTone = "neutral";
    }
  } else if (!contractLocked) {
    savingsLabel = "Pending contract lock";
    savingsTone = "neutral";
  } else {
    // Compare ACTUAL EXPENDITURE to PLANNED + VARIATIONS. Variations
    // legitimately expand the planned budget, so spending up to
    // (planned + variations) is not an over-run.
    const budget = plannedTotal + variations;
    if (actualSpent > budget) {
      overRun = actualSpent - budget;
      savings = -overRun;
      savingsLabel = "Over-run";
      savingsTone = "negative";
      savingsValue = overRun;
    } else if (actualSpent > 0 && actualSpent < budget) {
      savings = budget - actualSpent;
      savingsLabel = "Forecast savings vs budget";
      savingsTone = "positive";
      savingsValue = savings;
    } else {
      // No actuals yet — show "no spend recorded" instead of a
      // misleading zero.
      savingsLabel = "Over-run";
      savingsTone = "neutral";
      savingsValue = 0;
    }
  }

  const livePreview = {
    measuredWorkFinal: measured,
    provisionalFinal: provisional,
    preliminaryFinal: preliminary,
    variationsFinal: variations,
    contingencyFinal: contingency,
    taxFinal: tax,
    agreedContractSum: contractSum,
    plannedTotal,
    currentValue,
    actualSpent,
    finalContractValue: currentValue, // legacy alias
    savings,
    savingsLabel,
    savingsTone,
    savingsValue,
  };

  const view = isFinalized
    ? { ...finalAccount, savingsLabel, savingsTone, savingsValue }
    : livePreview;

  // Movement against the contract sum — a different question from the
  // over-run above, and both are worth an answer, so both are shown and
  // labelled. This one asks "has the contract VALUE moved since signing?";
  // the over-run asks "is the SPEND ahead of the plan?". Neither changes a
  // figure: they read the same totals the rest of the tab uses.
  const finalTotal = safeNum(view.currentValue ?? view.finalContractValue);
  const movement = contractLocked || isFinalized ? finalTotal - safeNum(contractSum) : 0;
  const movementPct =
    safeNum(contractSum) > 0 ? (movement / safeNum(contractSum)) * 100 : 0;
  const certifiedPct = finalTotal > 0 ? (certifiedToDate / finalTotal) * 100 : 0;

  return (
    <div style={STACK}>
      <SectionHead
        title="Final account"
        sub={
          isFinalized
            ? `Closed on ${formatDate(finalAccount.finalizedAt)}. Items, variations and certificates are frozen.`
            : contractLocked
              ? "The closing settlement as it stands today. Nothing is frozen until you close it."
              : "Pre-lock preview. Movement and over-run only start tracking once the contract is locked."
        }
      >
        {isFinalized ? (
          <div className="wk-acts">
            <button type="button" className="ds-btn ds-btn-sm btn-o" onClick={onDownload}>
              <FaDownload size={12} /> Download
            </button>
            <button
              type="button"
              className="ds-btn ds-btn-sm btn-o"
              onClick={onReopen}
              title="Reopen the final account to make adjustments"
            >
              Reopen
            </button>
          </div>
        ) : null}
      </SectionHead>

      <div className="pj-final">
        <section className="pj-card2">
          <h3>Final account{isFinalized ? " · closed" : " · live"}</h3>
          <dl className="brk">
            <div>
              <dt>Measured work</dt>
              <dd>{naira(view.measuredWorkFinal)}</dd>
            </div>
            <div>
              <dt>Preliminaries</dt>
              <dd>{naira(view.preliminaryFinal)}</dd>
            </div>
            <div>
              <dt>Provisional and PC sums</dt>
              <dd>{naira(view.provisionalFinal)}</dd>
            </div>
            <div>
              <dt>
                Contingency
                {contingencyPercent ? ` (${Number(contingencyPercent).toFixed(1)}%)` : ""}
              </dt>
              <dd>{naira(view.contingencyFinal)}</dd>
            </div>
            <div>
              <dt>Approved variations</dt>
              <dd>{naira(view.variationsFinal)}</dd>
            </div>
            <div>
              <dt>VAT{taxPercent ? ` (${Number(taxPercent).toFixed(1)}%)` : ""}</dt>
              <dd>{naira(view.taxFinal)}</dd>
            </div>
            <div className="t">
              <dt>{contractLocked || isFinalized ? "Final account" : "Live project total"}</dt>
              <dd>{naira(finalTotal)}</dd>
            </div>
          </dl>
          <p className="pj-foot">
            Only approved variations are in this total. Anything still waiting
            for approval is on the Variations view and counts for nothing here.
          </p>
        </section>

        <section className="pj-card2 cmp2">
          <h3>Against the contract</h3>

          <div className="big2">
            <span>Contract sum</span>
            <b>{contractLocked || isFinalized ? naira(contractSum) : "–"}</b>
            <em>
              {contractLocked || isFinalized
                ? "Fixed when the contract was locked"
                : "Lock the contract to fix it"}
            </em>
          </div>

          <div className={`big2${movement > 0 ? " over" : movement < 0 ? " under" : ""}`}>
            <span>
              {movement > 0 ? "Over-run" : movement < 0 ? "Saving" : "On the contract sum"}
            </span>
            <b>{contractLocked || isFinalized ? (movement ? naira(Math.abs(movement)) : "–") : "–"}</b>
            <em>
              {contractLocked || isFinalized
                ? `Contract value movement${
                    safeNum(contractSum) > 0
                      ? `, ${movementPct.toFixed(1)}% of the contract`
                      : ""
                  }`
                : "Movement against the contract sum"}
            </em>
          </div>

          <div
            className={`big2${
              view.savingsTone === "negative"
                ? " over"
                : view.savingsTone === "positive"
                  ? " under"
                  : ""
            }`}
          >
            <span>{view.savingsLabel || "Actual against planned"}</span>
            <b>
              {!contractLocked && !isFinalized ? "–" : naira(safeNum(view.savingsValue))}
            </b>
            <em>
              {!contractLocked && !isFinalized
                ? "Lock the contract to start tracking"
                : safeNum(view.actualSpent) === 0
                  ? "No spend recorded yet"
                  : `Spent ${naira(view.actualSpent)} of ${naira(view.plannedTotal + view.variationsFinal)} planned`}
            </em>
          </div>

          <div className="big2">
            <span>Certified so far</span>
            <b>{naira(certifiedToDate)}</b>
            <em>
              {finalTotal > 0
                ? `${Math.round(certifiedPct)}% of the final account`
                : "Nothing certified yet"}
            </em>
          </div>

          {!isFinalized ? (
            <button
              type="button"
              className="ds-btn ds-btn-sm btn-p"
              onClick={() => onFinalize?.("")}
              disabled={disabledFinalize}
              title={
                disabledFinalize
                  ? "Lock the contract first."
                  : "Freeze the final account and compute the settlement"
              }
            >
              <FaFileInvoiceDollar size={12} /> Close the final account
            </button>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function ModelStatus({ discipline, model, busy, onUpload, onDelete, disabled, allowManualUpload }) {
  const inputRef = React.useRef(null);
  const label =
    discipline === "architectural"
      ? "Architectural"
      : discipline === "structural"
      ? "Structural"
      : "MEP";
  const attached = Boolean(model?.url);

  return (
    <div
      className="wk-panel"
      style={{
        marginBottom: 0,
        padding: 14,
        ...(attached ? { borderColor: "var(--pal-light-line)" } : null),
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
          <FaCube size={14} className={attached ? "text-emerald-600" : "text-slate-400"} />
          {label}
        </div>
        <span className="wk-src sm" style={attached ? tone("light") : undefined}>
          {attached ? "Attached" : "Not attached"}
        </span>
      </div>

      {attached ? (
        <div className="mt-2 text-[11px] text-slate-600">
          <div className="truncate font-medium text-slate-800" title={model.sourceFile}>
            {model.sourceFile}
          </div>
          <div className="text-slate-500">
            {bytes(model.sizeBytes)} · {model.format?.toUpperCase() || "IFC"}
            {model.uploadedAt ? ` · ${formatDate(model.uploadedAt)}` : ""}
          </div>
          {model.validation?.status ? (
            <div className="mt-1">
              {(() => {
                const v = model.validation || {};
                const map = {
                  valid: [
                    tone("light"),
                    `✓ Verified, ${v.matchedCount}/${v.requiredCount} quantity elements found`,
                  ],
                  "no-quantities": [
                    undefined,
                    "No quantities to verify against",
                  ],
                  unchecked: [
                    tone("deep"),
                    "Not Element-ID checked",
                  ],
                  invalid: [
                    tone("orange"),
                    `⚠ ${v.missingCount} of ${v.requiredCount} elements missing`,
                  ],
                };
                const [chipTone, text] = map[v.status] || map.unchecked;
                return (
                  <span
                    className="wk-src sm"
                    style={chipTone}
                    title={
                      v.ifcElementCount
                        ? `${v.ifcElementCount.toLocaleString()} elements in the IFC`
                        : undefined
                    }
                  >
                    {text}
                  </span>
                );
              })()}
            </div>
          ) : null}
          <div className="mt-1 flex items-center gap-2">
            <a
              href={model.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-adlm-blue-700 hover:underline"
            >
              Open file →
            </a>
            {!disabled ? (
              <button
                type="button"
                onClick={() => onDelete?.(discipline)}
                className="text-red-600 hover:underline"
                title={`Detach ${label} model`}
              >
                Detach
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-2 text-[11px] text-slate-500">
          Pushed automatically from QUIV during save.
        </div>
      )}

      {allowManualUpload ? (
        <>
          <input
            ref={inputRef}
            type="file"
            accept=".ifc,.ifczip,.frag"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload?.(discipline, f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className="mt-2 inline-flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-700 hover:underline"
            onClick={() => inputRef.current?.click()}
            disabled={busy || disabled}
            title="Fallback: upload manually if the plugin wasn't used"
          >
            <FaUpload size={11} />
            {busy ? "Uploading..." : attached ? "Replace manually" : "Upload manually"}
          </button>
        </>
      ) : null}
    </div>
  );
}

function ModelsPanel({
  projectModels,
  modelUploadBusy,
  onUploadModel,
  onDeleteModel,
  disabled,
  items = [],
  productKey = "",
}) {
  const [showManual, setShowManual] = React.useState(false);
  const attached = Object.entries(projectModels || {}).filter(
    ([, m]) => m?.url,
  );

  // Element IDs whose BoQ line can't be classified into a discipline fall
  // outside every per-discipline required set, so the validation gate can't
  // check them. Surface the count until the plugin supplies an explicit
  // discipline (which removes the guesswork entirely).
  const unclassified = React.useMemo(() => {
    const ids = new Set();
    let lines = 0;
    for (const it of items || []) {
      const eids = (it?.elementIds || [])
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (!eids.length) continue;
      if (deriveItemDiscipline(it, productKey) === "unknown") {
        lines += 1;
        eids.forEach((id) => ids.add(id));
      }
    }
    return { elements: ids.size, lines };
  }, [items, productKey]);
  return (
    <div style={STACK}>
      <p className="mk-note" style={{ margin: 0 }}>
        <b>Auto-attached from Revit.</b> When you save a project from the
        QUIV, the model is exported to IFC (compressed to stay under
        100 MB) and pushed here automatically. For large models the plugin
        asks first since saving takes longer. No manual upload needed.
      </p>

      {unclassified.elements > 0 ? (
        <p className="mk-note" style={{ margin: 0, ...NOTE_WARN }}>
          <b>
            {unclassified.elements.toLocaleString()} element
            {unclassified.elements === 1 ? "" : "s"}
          </b>{" "}
          across {unclassified.lines} BoQ line
          {unclassified.lines === 1 ? "" : "s"} aren’t classified into a
          discipline, so they’re <b>not covered</b> by model validation. Re-save
          the project from the updated QUIV to tag them automatically.
        </p>
      ) : null}

      {attached.length ? (
        <div
          style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}
        >
          {["architectural", "structural", "mep"].map((d) => (
            <ModelStatus
              key={d}
              discipline={d}
              model={projectModels?.[d]}
              busy={modelUploadBusy?.[d]}
              onUpload={onUploadModel}
              onDelete={onDeleteModel}
              disabled={disabled}
              allowManualUpload={showManual}
            />
          ))}
        </div>
      ) : (
        <div className="wk-panel wk-empty" style={NO_MB}>
          No BIM models attached yet. Save the project from QUIV
          to push the models automatically.
        </div>
      )}

      <div className="wk-bar" style={{ marginBottom: 0, justifyContent: "space-between" }}>
        <button
          type="button"
          onClick={() => setShowManual((v) => !v)}
          className="ds-btn ds-btn-sm btn-o"
          title="Rarely needed, the plugin auto-pushes. Use if you have an IFC from elsewhere."
        >
          {showManual ? "Hide manual upload" : "Advanced: manual upload"}
        </button>
        <span className="wk-locnote">
          Open the <b>3D Model</b> tab to view &amp;
          verify.
        </span>
      </div>

      {showManual ? (
        <div
          style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}
        >
          {["architectural", "structural", "mep"].map((d) => (
            <ModelStatus
              key={`manual-${d}`}
              discipline={d}
              model={projectModels?.[d]}
              busy={modelUploadBusy?.[d]}
              onUpload={onUploadModel}
              onDelete={onDeleteModel}
              disabled={disabled}
              allowManualUpload
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function ProjectContractPanel({
  certificates = [],
  certBusy,
  onIssueCertificate,
  onUpdateCertificate,
  onDeleteCertificate,
  onDownloadCertificate,
  finalAccount,
  onFinalizeAccount,
  onReopenFinalAccount,
  onDownloadFinalAccount,
  projectModels,
  modelUploadBusy,
  onUploadModel,
  onDeleteModel,
  items = [],
  productKey = "",
  // BoQ-imported projects have no BIM model behind them — hide the models
  // sub-tab entirely (the server also rejects uploads for that origin).
  hideModels = false,
  contractLocked,
  contractSum,
  measured,
  provisional,
  preliminary,
  variations,
  // Full QS cascade values + actual spend, fed through to FinalAccount.
  contingency = 0,
  tax = 0,
  contingencyPercent = 0,
  taxPercent = 0,
  actualSpent = 0,
  // S18 valuations: the variation rows themselves, plus who may act on them.
  variationRows = [],
  onRaiseVariation,
  onDecideVariation,
  canEditProject = false,
  canSeeRates = true,
}) {
  const [tab, setTab] = React.useState("certificates");

  const hasAnyFeature =
    onIssueCertificate || onFinalizeAccount || onUploadModel;
  if (!hasAnyFeature) return null;

  const modelCount = Object.values(projectModels || {}).filter(Boolean).length;
  const isFinalized = Boolean(finalAccount?.finalized);
  // Certified so far: what the approved and paid certificates add up to.
  // Drafts are not money yet, so they are not in this figure.
  const certifiedToDate = (certificates || []).reduce(
    (acc, c) =>
      c?.status === "approved" || c?.status === "paid"
        ? acc + safeNum(c.thisCertificate)
        : acc,
    0,
  );
  // The project total the Variations card quotes, on the same cascade the
  // Bill and the Final account use.
  const estimatedTotal =
    safeNum(measured) +
    safeNum(provisional) +
    safeNum(preliminary) +
    safeNum(contingency) +
    safeNum(tax) +
    safeNum(variations);

  const views = [
    { id: "certificates", label: "Certificates", count: certificates.length },
    { id: "variations", label: "Variations", count: variationRows.length },
    { id: "final", label: "Final account", count: null },
    ...(hideModels
      ? []
      : [{ id: "models", label: "BIM models", count: modelCount }]),
  ];

  return (
    <section className="wk-panel" style={NO_MB}>
      <div className="wk-ph" style={{ flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: "1 1 260px" }}>
          <h2>Contract administration</h2>
          <div className="wk-locnote" style={{ marginTop: 4 }}>
            Certificates, variations and the final account: everything a QS
            needs after contract award.
          </div>
        </div>
      </div>

      <div id="contract-admin-body" style={{ ...STACK, padding: "16px 20px 20px" }}>
        <div
          className="pj-seg"
          role="group"
          aria-label="Contract administration"
          style={{ maxWidth: "100%", overflowX: "auto", justifySelf: "start" }}
        >
          {views.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={tab === v.id}
              onClick={() => setTab(v.id)}
            >
              {v.label}
              {typeof v.count === "number" && v.count > 0 ? <em>{v.count}</em> : null}
            </button>
          ))}
        </div>

        {tab === "certificates" ? (
          <CertificatesSection
            certificates={certificates}
            onIssue={onIssueCertificate}
            onUpdate={onUpdateCertificate}
            onDelete={onDeleteCertificate}
            onDownload={onDownloadCertificate}
            busy={certBusy}
            disabled={isFinalized}
            note={
              !contractLocked
                ? "Tip: lock the contract first so each certificate has a stable baseline to measure against."
                : null
            }
          />
        ) : null}

        {tab === "variations" ? (
          <VariationsSection
            rows={variationRows}
            onAdd={onRaiseVariation}
            onDecide={onDecideVariation}
            canEdit={canEditProject && typeof onRaiseVariation === "function"}
            canSeeRates={canSeeRates}
            disabled={isFinalized}
            estimatedTotal={estimatedTotal}
          />
        ) : null}

        {tab === "final" ? (
          <FinalAccountSection
            finalAccount={finalAccount}
            onFinalize={onFinalizeAccount}
            onReopen={onReopenFinalAccount}
            onDownload={onDownloadFinalAccount}
            contractSum={contractSum}
            // Pass contractLocked so the section can suppress the
            // misleading "Over-run" reading before the contract is
            // signed — pre-lock there's no agreement to over-run.
            contractLocked={contractLocked}
            measured={measured}
            provisional={provisional}
            preliminary={preliminary}
            variations={variations}
            contingency={contingency}
            tax={tax}
            contingencyPercent={contingencyPercent}
            taxPercent={taxPercent}
            actualSpent={actualSpent}
            certifiedToDate={certifiedToDate}
            disabledFinalize={!contractLocked}
          />
        ) : null}

        {!hideModels && tab === "models" ? (
          <ModelsPanel
            projectModels={projectModels}
            modelUploadBusy={modelUploadBusy}
            onUploadModel={onUploadModel}
            onDeleteModel={onDeleteModel}
            items={items}
            productKey={productKey}
            disabled={isFinalized}
          />
        ) : null}
      </div>
    </section>
  );
}
